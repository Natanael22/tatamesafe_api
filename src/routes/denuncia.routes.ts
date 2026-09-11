import { Router } from 'express';
import { Queue } from 'bullmq';
import multer from 'multer';
import supabase from '../lib/supabase';
import { supabaseVault } from '../lib/supabase';
import { denunciaLimiter } from '../middlewares/rateLimiter';
import { requireAuth } from '../middlewares/auth.middleware';
import { StorageService } from '../lib/storage';
import { CryptoService } from '../services/crypto.service';
import redisClient from '../lib/redis';
import {
  SLA_HORAS,
  type DenunciaStatus,
  type DenunciaTipo,
  type Urgencia,
  type EncaminhamentoTipo,
} from '../types/database.types';
import logger from '../lib/logger';
import pushService from '../services/push.service';

const router = Router();
const denunciaQueue = new Queue('denuncia-queue', { connection: redisClient });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // Limite de 10MB
});

// ---------------------------------------------------------------------------
// Auxiliar: verifica se o usuário tem permissões administrativas (ADMIN ou OPERADOR)
// ---------------------------------------------------------------------------
async function verificarAdmin(reqUser: any) {
  if (!reqUser) return null;

  // Otimização: Se o JWT já contiver tipo e local_id, evitar query ao banco (reduz tempo de resposta)
  if (reqUser.tipo && reqUser.local_id) {
    if (!['ADMIN', 'OPERADOR'].includes(reqUser.tipo)) return null;
    return { id: reqUser.local_id, tipo: reqUser.tipo, email: reqUser.email };
  }

  // Fallback se o JWT for antigo e não tiver essas propriedades
  const { data: user } = await supabase
    .from('User')
    .select('id, tipo, nome')
    .eq('auth_id', reqUser.sub)
    .maybeSingle();

  // Permite acesso tanto para ADMIN quanto para OPERADOR
  if (!user || !['ADMIN', 'OPERADOR'].includes(user.tipo)) return null;
  return user;
}

// ---------------------------------------------------------------------------
// Auxiliar: gera URLs assinadas para evidências de uma denúncia
// ---------------------------------------------------------------------------
async function enriquecerEvidencias(evidencias: any[]): Promise<any[]> {
  return Promise.all(
    (evidencias || []).map(async (ev: any) => {
      try {
        const url = await StorageService.createSignedUrl('denuncias', ev.s3_key);
        return { ...ev, url };
      } catch (err) {
        logger.error(err, `Erro ao gerar URL assinada para evidência ${ev.id}`);
        return { ...ev, url: null };
      }
    })
  );
}

// ---------------------------------------------------------------------------
// Auxiliar: calcula status SLA de uma denúncia
// ---------------------------------------------------------------------------
function calcularStatusSla(denuncia: any): {
  sla_status: 'OK' | 'ATENCAO' | 'VIOLADO' | 'ENCERRADA';
  horas_em_aberto: number;
  horas_restantes: number | null;
} {
  const horasEmAberto = Math.floor(
    (Date.now() - new Date(denuncia.criado_em).getTime()) / (1000 * 60 * 60)
  );

  if (['ENCERRADA'].includes(denuncia.status)) {
    return { sla_status: 'ENCERRADA', horas_em_aberto: horasEmAberto, horas_restantes: null };
  }

  const slaHoras = SLA_HORAS[denuncia.urgencia as Urgencia] ?? 24;
  const horasRestantes = slaHoras - horasEmAberto;

  let sla_status: 'OK' | 'ATENCAO' | 'VIOLADO';
  if (horasRestantes < 0) sla_status = 'VIOLADO';
  else if (horasRestantes <= slaHoras * 0.25) sla_status = 'ATENCAO'; // Menos de 25% do tempo restante
  else sla_status = 'OK';

  return { sla_status, horas_em_aberto: horasEmAberto, horas_restantes: horasRestantes };
}

// ===========================================================================
// ROTAS PÚBLICAS
// ===========================================================================

// ---------------------------------------------------------------------------
// POST / — Registrar denúncia anônima
// ---------------------------------------------------------------------------
router.post('/', upload.single('evidencia'), denunciaLimiter, async (req, res) => {
  try {
    const { tipo, descricao_enc, academia_ref, urgencia, envolve_menor } = req.body;

    if (!tipo || !descricao_enc) {
      return res.status(400).json({ error: 'Campos obrigatórios: tipo, descricao_enc' });
    }

    const bufferDesc = Buffer.from(descricao_enc, 'base64');

    // Validação de segurança: Impede payloads gigantes que exaurem o banco (limite 50KB)
    if (bufferDesc.length > 50 * 1024) {
      return res.status(400).json({ error: 'O texto da denúncia excede o limite máximo permitido (50KB)' });
    }

    const { data, error } = await supabase.rpc('inserir_denuncia', {
      p_tipo: tipo,
      // O Supabase (Postgres) exige o prefixo \x para reconhecer a string como hexadecimal binário em colunas bytea.
      // Sem o prefixo \x, ele armazenará a string literal como ASCII (dobrando o tamanho).
      p_descricao_enc: '\\x' + bufferDesc.toString('hex'),
      p_academia_ref: academia_ref || null,
      p_urgencia: urgencia || 'MEDIA',
      p_envolve_menor: envolve_menor === 'true' || envolve_menor === true,
    });

    if (error) throw error;

    const protocolo = data as string;
    if (!protocolo) throw new Error('Falha ao gerar protocolo');

    // Upload de evidência opcional
    if (req.file) {
      const file = req.file;

      const { data: denuncia, error: findError } = await supabaseVault
        .from('Denuncia')
        .select('id')
        .eq('protocolo', protocolo)
        .single();

      if (findError || !denuncia) {
        logger.error(findError, `Erro ao buscar ID da denúncia para evidência (${protocolo})`);
      } else {
        const fileExt = file.originalname.split('.').pop() || '';
        const filePath = `${denuncia.id}/${Date.now()}_evidencia.${fileExt}`;

        await StorageService.uploadFile('denuncias', filePath, file.buffer, file.mimetype);

        const { error: evidenceError } = await supabaseVault
          .from('DenunciaEvidencia')
          .insert({
            denuncia_id: denuncia.id,
            s3_key: filePath,
            tipo_mime: file.mimetype,
            tamanho_kb: Math.round(file.size / 1024),
          });

        if (evidenceError) {
          logger.error(evidenceError, `Erro ao registrar evidência para denúncia ${denuncia.id}`);
        }
      }
    }

    // Publica na fila BullMQ
    await denunciaQueue.add('denuncia.nova', {
      protocolo,
      urgencia: urgencia || 'MEDIA',
      envolve_menor: envolve_menor === 'true' || envolve_menor === true,
      tipo,
    });

    res.status(201).json({ protocolo });
  } catch (error: any) {
    logger.error(error, 'Erro ao registrar denúncia');
    res.status(500).json({ error: 'Erro interno ao registrar denúncia' });
  }
});

// ---------------------------------------------------------------------------
// GET /status/:protocolo — Consultar status por protocolo (público)
// ---------------------------------------------------------------------------
router.get('/status/:protocolo', async (req, res) => {
  try {
    const { protocolo } = req.params;

    // Busca denúncia + histórico público (nunca expõe nota_interna nem operador_id)
    const { data: denuncia, error } = await supabaseVault
      .from('Denuncia')
      .select('status, urgencia, criado_em, atualizado_em, historico:DenunciaHistorico(status_de, status_para, nota_publica, criado_em)')
      .eq('protocolo', protocolo)
      .order('criado_em', { referencedTable: 'DenunciaHistorico', ascending: true })
      .maybeSingle();

    if (error) throw error;
    if (!denuncia) {
      return res.status(404).json({ error: 'Protocolo não encontrado' });
    }

    const mensagensGenericas: Record<DenunciaStatus, string> = {
      RECEBIDA: 'Denúncia recebida e aguardando triagem.',
      TRIAGEM: 'Denúncia em triagem pela equipe responsável.',
      EM_APURACAO: 'Denúncia em apuração pelas autoridades competentes.',
      ENCERRADA: 'Caso encerrado.',
    };

    const rotuloPorStatus: Record<string, string> = {
      RECEBIDA:    'Recebida',
      TRIAGEM:     'Em Triagem',
      EM_APURACAO: 'Em Apuração',
      ENCERRADA:   'Encerrada',
    };

    // Primeira entrada sempre é a criação (RECEBIDA)
    const historicoPublico = [
      {
        status: 'RECEBIDA',
        rotulo: 'Recebida',
        // Mensagem padrão de criação — operador não pode alterar este ponto
        mensagem: 'Sua denúncia foi registrada com segurança. Você receberá atualizações aqui conforme o caso avançar.',
        nota_da_equipe: null as string | null,
        data: denuncia.criado_em,
      },
      ...(denuncia.historico || []).map((h: any) => ({
        status: h.status_para,
        rotulo: rotuloPorStatus[h.status_para] ?? h.status_para,
        // Mensagem genérica descritiva da etapa
        mensagem: mensagensGenericas[h.status_para as DenunciaStatus] ?? 'Status atualizado.',
        // nota_da_equipe: mensagem personalizada deixada pelo operador — pode ser null
        nota_da_equipe: h.nota_publica ?? null,
        data: h.criado_em,
      })),
    ];

    res.json({
      protocolo,
      status: denuncia.status,
      atualizado_em: denuncia.atualizado_em,
      mensagem_atual: mensagensGenericas[denuncia.status as DenunciaStatus] || 'Em processamento.',
      historico: historicoPublico,
    });
  } catch (error) {
    logger.error(error, 'Erro ao consultar status da denúncia');
    res.status(500).json({ error: 'Erro interno ao consultar status' });
  }
});


// ---------------------------------------------------------------------------
// POST /status/:protocolo/notificacoes — Inscrever aparelho para receber push
// ---------------------------------------------------------------------------
router.post('/status/:protocolo/notificacoes', async (req, res) => {
  try {
    const { protocolo } = req.params;
    const { push_token } = req.body;

    if (!push_token) {
      return res.status(400).json({ error: 'O push_token é obrigatório' });
    }

    // Acha a denúncia pelo protocolo (para pegar o ID)
    const { data: denuncia, error: errBusca } = await supabaseVault
      .from('Denuncia')
      .select('id')
      .eq('protocolo', protocolo)
      .maybeSingle();

    if (errBusca) throw errBusca;
    if (!denuncia) return res.status(404).json({ error: 'Protocolo não encontrado' });

    // Salva o token na nova tabela
    const { error: errInsert } = await supabaseVault
      .from('DenunciaPushToken')
      .insert({
        denuncia_id: denuncia.id,
        push_token,
      });

    // Ignora erro de chave duplicada (se o aparelho já se inscreveu)
    if (errInsert && errInsert.code !== '23505') {
      throw errInsert;
    }

    res.json({ message: 'Token registrado com sucesso' });
  } catch (error) {
    logger.error(error, 'Erro ao registrar token de notificação');
    res.status(500).json({ error: 'Erro interno ao registrar notificação' });
  }
});

// ===========================================================================
// ROTAS ADMINISTRATIVAS (requer ADMIN)
// ===========================================================================

// ---------------------------------------------------------------------------
// Auxiliar: disparar push notifications para a denúncia
// ---------------------------------------------------------------------------
async function notificarDenunciante(denunciaId: string, status: DenunciaStatus) {
  try {
    const { data: tokensInfo } = await supabaseVault
      .from('DenunciaPushToken')
      .select('push_token')
      .eq('denuncia_id', denunciaId);

    if (!tokensInfo || tokensInfo.length === 0) return;

    const tokens = tokensInfo.map((t) => t.push_token);

    const rotuloPorStatus: Record<string, string> = {
      RECEBIDA:    'Recebida',
      TRIAGEM:     'Em Triagem',
      EM_APURACAO: 'Em Apuração',
      ENCERRADA:   'Encerrada',
    };

    const statusRotulo = rotuloPorStatus[status] || status;

    // Dispara a notificação de forma assíncrona (sem bloquear a requisição atual)
    pushService.enviarNotificacaoStatus(tokens, statusRotulo).catch((err) => {
      logger.error(err, `Falha no PushService para denúncia ${denunciaId}`);
    });
  } catch (err) {
    logger.error(err, `Falha ao buscar tokens para a denúncia ${denunciaId}`);
  }
}


// ---------------------------------------------------------------------------
// GET /admin/stats — Estatísticas do painel de administração
// ---------------------------------------------------------------------------
router.get('/admin/stats', requireAuth, async (req, res) => {
  try {
    const user = await verificarAdmin(req.user);
    if (!user) return res.status(403).json({ error: 'Acesso negado: Requer privilégios de administrador' });

    const { data: denuncias, error } = await supabaseVault
      .from('Denuncia')
      .select('id, status, urgencia, envolve_menor, criado_em, sla_prazo');

    if (error) throw error;

    const lista = denuncias || [];
    const agora = Date.now();

    const stats = {
      total: lista.length,
      por_status: { RECEBIDA: 0, TRIAGEM: 0, EM_APURACAO: 0, ENCERRADA: 0 } as Record<string, number>,
      por_urgencia: { BAIXA: 0, MEDIA: 0, ALTA: 0, CRITICA: 0 } as Record<string, number>,
      sla_violacoes: 0,
      envolve_menor: 0,
      pendentes_triagem: 0, // RECEBIDA há mais de 1h
    };

    for (const d of lista) {
      // Por status
      if (stats.por_status[d.status] !== undefined) stats.por_status[d.status]++;

      // Por urgência
      if (stats.por_urgencia[d.urgencia] !== undefined) stats.por_urgencia[d.urgencia]++;

      // Envolve menor
      if (d.envolve_menor) stats.envolve_menor++;

      // SLA violado
      if (d.sla_prazo && !['ENCERRADA'].includes(d.status)) {
        const prazo = new Date(d.sla_prazo).getTime();
        if (agora > prazo) stats.sla_violacoes++;
      }

      // Pendentes triagem (RECEBIDA há mais de 1h)
      if (d.status === 'RECEBIDA') {
        const criado = new Date(d.criado_em).getTime();
        const horasEmAberto = (agora - criado) / (1000 * 60 * 60);
        if (horasEmAberto > 1) stats.pendentes_triagem++;
      }
    }

    res.json(stats);
  } catch (error) {
    logger.error(error, 'Erro ao buscar estatísticas de denúncias');
    res.status(500).json({ error: 'Erro interno ao buscar estatísticas' });
  }
});

// ---------------------------------------------------------------------------
// GET /admin/sla — Denúncias com status de SLA
// ---------------------------------------------------------------------------
router.get('/admin/sla', requireAuth, async (req, res) => {
  try {
    const user = await verificarAdmin(req.user);
    if (!user) return res.status(403).json({ error: 'Acesso negado' });

    const { apenas_violacoes } = req.query;

    const { data: denuncias, error } = await supabaseVault
      .from('Denuncia')
      .select('id, protocolo, tipo, status, urgencia, envolve_menor, criado_em, sla_prazo, operador_id')
      .not('status', 'eq', 'ENCERRADA')
      .order('urgencia', { ascending: false })
      .order('criado_em', { ascending: true });

    if (error) throw error;

    const resultado = (denuncias || []).map((d: any) => ({
      ...d,
      ...calcularStatusSla(d),
      sla_limite_horas: SLA_HORAS[d.urgencia as Urgencia],
    }));

    const filtrado = apenas_violacoes === 'true'
      ? resultado.filter((d) => d.sla_status === 'VIOLADO')
      : resultado;

    res.json(filtrado);
  } catch (error) {
    logger.error(error, 'Erro ao buscar denúncias com SLA');
    res.status(500).json({ error: 'Erro interno ao buscar SLA' });
  }
});

// ---------------------------------------------------------------------------
// GET /admin — Listar denúncias com filtros
// ---------------------------------------------------------------------------
router.get('/admin', requireAuth, async (req, res) => {
  try {
    const user = await verificarAdmin(req.user);
    if (!user) return res.status(403).json({ error: 'Acesso negado' });

    const {
      status,
      urgencia,
      envolve_menor,
      data_inicio,
      data_fim,
      academia_ref,
      sem_operador,
      limit = '50',
      offset = '0',
    } = req.query;

    let query = supabaseVault
      .from('Denuncia')
      .select('*, historico:DenunciaHistorico(*), evidencias:DenunciaEvidencia(*)', { count: 'exact' });

    // Filtros opcionais
    if (status) query = query.eq('status', status as string);
    if (urgencia) query = query.eq('urgencia', urgencia as string);
    if (envolve_menor !== undefined) query = query.eq('envolve_menor', envolve_menor === 'true');
    if (academia_ref) query = query.eq('academia_ref', academia_ref as string);
    if (data_inicio) query = query.gte('criado_em', data_inicio as string);
    if (data_fim) query = query.lte('criado_em', data_fim as string);
    if (sem_operador === 'true') query = query.is('operador_id', null);

    const { data: denuncias, error, count } = await query
      .order('urgencia', { ascending: false })
      .order('criado_em', { ascending: true })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (error) throw error;

    // Enriquecer com URLs assinadas para evidências
    const denunciasEnriquecidas = await Promise.all(
      (denuncias || []).map(async (d: any) => ({
        ...d,
        ...calcularStatusSla(d),
        sla_limite_horas: SLA_HORAS[d.urgencia as Urgencia],
        evidencias: await enriquecerEvidencias(d.evidencias || []),
      }))
    );

    res.json({
      data: denunciasEnriquecidas,
      total: count ?? denunciasEnriquecidas.length,
      limit: Number(limit),
      offset: Number(offset),
    });
  } catch (error) {
    logger.error(error, 'Erro ao listar denúncias');
    res.status(500).json({ error: 'Erro interno ao listar denúncias' });
  }
});

// ---------------------------------------------------------------------------
// GET /admin/:id — Detalhe completo de uma denúncia
// ---------------------------------------------------------------------------
router.get('/admin/:id', requireAuth, async (req, res) => {
  try {
    const user = await verificarAdmin(req.user);
    if (!user) return res.status(403).json({ error: 'Acesso negado' });

    const { id } = req.params;

    const { data: denuncia, error } = await supabaseVault
      .from('Denuncia')
      .select('*, historico:DenunciaHistorico(*), evidencias:DenunciaEvidencia(*), triagem:DenunciaTriagem(*)')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!denuncia) return res.status(404).json({ error: 'Denúncia não encontrada' });

    const evidenciasComUrl = await enriquecerEvidencias(denuncia.evidencias || []);

    // Descriptografa a descrição para exibição no painel
    const descricao = denuncia.descricao_enc ? CryptoService.decrypt(denuncia.descricao_enc) : null;

    res.json({
      ...denuncia,
      descricao,
      ...calcularStatusSla(denuncia),
      sla_limite_horas: SLA_HORAS[denuncia.urgencia as Urgencia],
      evidencias: evidenciasComUrl,
    });
  } catch (error) {
    logger.error(error, 'Erro ao buscar detalhe da denúncia');
    res.status(500).json({ error: 'Erro interno ao buscar denúncia' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /admin/:id/status — Atualizar status da denúncia
// ---------------------------------------------------------------------------
router.patch('/admin/:id/status', requireAuth, async (req, res) => {
  try {
    const user = await verificarAdmin(req.user);
    if (!user) return res.status(403).json({ error: 'Acesso negado' });

    const id = req.params.id as string;
    const { status, nota_interna, nota_publica } = req.body;

    if (!status) return res.status(400).json({ error: 'O novo status é obrigatório' });

    const statusValidos: DenunciaStatus[] = ['RECEBIDA', 'TRIAGEM', 'EM_APURACAO', 'ENCERRADA'];
    if (!statusValidos.includes(status)) {
      return res.status(400).json({
        error: `Status inválido. Permitidos: ${statusValidos.join(', ')}`,
      });
    }

    const { data: denuncia } = await supabaseVault
      .from('Denuncia')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();

    if (!denuncia) return res.status(404).json({ error: 'Denúncia não encontrada' });

    // Atualiza status e registra no histórico via função SQL atômica
    // nota_publica: mensagem que será visível ao denunciante no endpoint público
    const { data: result, error } = await supabase.rpc('atualizar_status_denuncia', {
      p_id: id,
      p_status: status,
      p_operador_id: user.id,
      p_nota_interna: nota_interna || null,
      p_nota_publica: nota_publica || null,
    });


    if (error) throw error;

    // Atribui operador se ainda não tiver
    await supabaseVault
      .from('Denuncia')
      .update({ operador_id: user.id })
      .eq('id', id)
      .is('operador_id', null);

    logger.info(`Denúncia ${id} teve status atualizado para ${status} pelo operador ${user.id}`);
    notificarDenunciante(id, status);
    res.json(result);
  } catch (error) {
    logger.error(error, 'Erro ao atualizar status da denúncia');
    res.status(500).json({ error: 'Erro interno ao atualizar status' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /admin/:id/triagem — Realizar triagem formal
//
// Registra a triagem com: categoria confirmada, urgência confirmada, notas
// e atualiza o status para TRIAGEM automaticamente.
// ---------------------------------------------------------------------------
router.patch('/admin/:id/triagem', requireAuth, async (req, res) => {
  try {
    const user = await verificarAdmin(req.user);
    if (!user) return res.status(403).json({ error: 'Acesso negado' });

    const id = req.params.id as string;
    const { categoria_confirmada, urgencia_confirmada, notas, nota_publica } = req.body;

    if (!categoria_confirmada || !urgencia_confirmada) {
      return res.status(400).json({
        error: 'Campos obrigatórios: categoria_confirmada, urgencia_confirmada',
      });
    }

    const categoriasValidas: DenunciaTipo[] = ['ASSEDIO_SEXUAL', 'ASSEDIO_MORAL', 'VIOLENCIA', 'OUTRO'];
    const urgenciasValidas: Urgencia[] = ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'];

    if (!categoriasValidas.includes(categoria_confirmada)) {
      return res.status(400).json({ error: `Categoria inválida. Permitidas: ${categoriasValidas.join(', ')}` });
    }
    if (!urgenciasValidas.includes(urgencia_confirmada)) {
      return res.status(400).json({ error: `Urgência inválida. Permitidas: ${urgenciasValidas.join(', ')}` });
    }

    // Verifica se denúncia existe
    const { data: denuncia } = await supabaseVault
      .from('Denuncia')
      .select('id, status, urgencia')
      .eq('id', id)
      .maybeSingle();

    if (!denuncia) return res.status(404).json({ error: 'Denúncia não encontrada' });

    // Verifica se já foi triada
    const { data: triagemExistente } = await supabaseVault
      .from('DenunciaTriagem')
      .select('id')
      .eq('denuncia_id', id)
      .maybeSingle();

    if (triagemExistente) {
      return res.status(409).json({ error: 'Esta denúncia já possui triagem registrada. Use PATCH /admin/:id/status para atualizações.' });
    }

    // 1. Registrar triagem formal
    const { data: triagem, error: triagemError } = await supabaseVault
      .from('DenunciaTriagem')
      .insert({
        denuncia_id: id,
        operador_id: user.id,
        categoria_confirmada,
        urgencia_confirmada,
        notas: notas || null,
      })
      .select()
      .single();

    if (triagemError) throw triagemError;

    // 2. Atualizar urgência e operador na denúncia se mudou
    const updates: Record<string, any> = {
      operador_id: user.id,
      // O status é atualizado de forma atômica pela RPC abaixo.
    };
    if (urgencia_confirmada !== denuncia.urgencia) {
      updates.urgencia = urgencia_confirmada;
      // Recalcular SLA com nova urgência
      const novoSla = new Date();
      novoSla.setHours(novoSla.getHours() + SLA_HORAS[urgencia_confirmada as Urgencia]);
      updates.sla_prazo = novoSla.toISOString();
    }

    await supabaseVault.from('Denuncia').update(updates).eq('id', id);

    // 3. Registrar no histórico com nota pública opcional ao denunciante
    await supabase.rpc('atualizar_status_denuncia', {
      p_id: id,
      p_status: 'TRIAGEM',
      p_operador_id: user.id,
      p_nota_interna: `Triagem realizada. Categoria: ${categoria_confirmada}, Urgência: ${urgencia_confirmada}. ${notas || ''}`.trim(),
      p_nota_publica: nota_publica || null,
    });

    logger.info(`Triagem da denúncia ${id} realizada pelo operador ${user.id}`);
    notificarDenunciante(id, 'TRIAGEM');

    res.json({
      message: 'Triagem realizada com sucesso',
      triagem,
      status_atualizado: 'TRIAGEM',
    });
  } catch (error) {
    logger.error(error, 'Erro ao realizar triagem da denúncia');
    res.status(500).json({ error: 'Erro interno ao realizar triagem' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /admin/:id/encaminhar — Encaminhar denúncia para entidade externa
//
// Registra para onde foi encaminhada e adiciona notas.
// Atualiza status para EM_APURACAO.
// ---------------------------------------------------------------------------
router.patch('/admin/:id/encaminhar', requireAuth, async (req, res) => {
  try {
    const user = await verificarAdmin(req.user);
    if (!user) return res.status(403).json({ error: 'Acesso negado' });

    const id = req.params.id as string;
    const { encaminhamento, notas, nota_publica } = req.body;


    if (!encaminhamento) {
      return res.status(400).json({ error: 'Campo obrigatório: encaminhamento' });
    }

    const encaminhamentosValidos: EncaminhamentoTipo[] = [
      'CONSELHO_TUTELAR', 'DELEGACIA', 'PSICOLOGO', 'MINISTERIO_PUBLICO', 'OUTRO',
    ];

    if (!encaminhamentosValidos.includes(encaminhamento)) {
      return res.status(400).json({
        error: `Encaminhamento inválido. Permitidos: ${encaminhamentosValidos.join(', ')}`,
      });
    }

    const { data: denuncia } = await supabaseVault
      .from('Denuncia')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();

    if (!denuncia) return res.status(404).json({ error: 'Denúncia não encontrada' });

    if (denuncia.status === 'ENCERRADA') {
      return res.status(400).json({ error: 'Não é possível encaminhar uma denúncia encerrada' });
    }

    // 1. Atualizar denúncia com encaminhamento
    const { data: atualizada, error: updateError } = await supabaseVault
      .from('Denuncia')
      .update({
        encaminhamento,
        encaminhamento_notas: notas || null,
        operador_id: user.id,
        status: 'EM_APURACAO',
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    // 2. Registrar no histórico com nota pública opcional ao denunciante
    await supabase.rpc('atualizar_status_denuncia', {
      p_id: id,
      p_status: 'EM_APURACAO',
      p_operador_id: user.id,
      p_nota_interna: `Encaminhado para: ${encaminhamento}. ${notas || ''}`.trim(),
      p_nota_publica: nota_publica || null,
    });

    const nomeEncaminhamento: Record<EncaminhamentoTipo, string> = {
      CONSELHO_TUTELAR: 'Conselho Tutelar',
      DELEGACIA: 'Delegacia',
      PSICOLOGO: 'Psicólogo',
      MINISTERIO_PUBLICO: 'Ministério Público',
      OUTRO: 'Outro órgão',
    };

    logger.info(`Denúncia ${id} encaminhada para ${encaminhamento} pelo operador ${user.id}`);
    notificarDenunciante(id, 'EM_APURACAO');

    res.json({
      message: `Denúncia encaminhada para ${nomeEncaminhamento[encaminhamento as EncaminhamentoTipo]} com sucesso`,
      denuncia: atualizada,
      status_atualizado: 'EM_APURACAO',
    });
  } catch (error) {
    logger.error(error, 'Erro ao encaminhar denúncia');
    res.status(500).json({ error: 'Erro interno ao encaminhar denúncia' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /admin/:id/operador — Atribuir operador responsável
// ---------------------------------------------------------------------------
router.patch('/admin/:id/operador', requireAuth, async (req, res) => {
  try {
    const user = await verificarAdmin(req.user?.sub);
    if (!user) return res.status(403).json({ error: 'Acesso negado' });

    const { id } = req.params;

    const { data: denuncia } = await supabaseVault
      .from('Denuncia')
      .select('id, operador_id')
      .eq('id', id)
      .maybeSingle();

    if (!denuncia) return res.status(404).json({ error: 'Denúncia não encontrada' });

    const { data: atualizada, error } = await supabaseVault
      .from('Denuncia')
      .update({ operador_id: user.id })
      .eq('id', id)
      .select('id, protocolo, status, urgencia, operador_id')
      .single();

    if (error) throw error;

    logger.info(`Operador ${user.id} assumiu a denúncia ${id}`);

    res.json({
      message: 'Denúncia atribuída com sucesso',
      denuncia: atualizada,
    });
  } catch (error) {
    logger.error(error, 'Erro ao atribuir operador');
    res.status(500).json({ error: 'Erro interno ao atribuir operador' });
  }
});

export default router;
