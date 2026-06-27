import { Router } from 'express';
import multer from 'multer';
import supabase from '../lib/supabase';
import { requireAuth } from '../middlewares/auth.middleware';
import { StorageService } from '../lib/storage';
import { fetchEnderecoByCep } from '../lib/viacep';
import { ATIVIDADES_VALIDAS, type Atividade } from '../types/database.types';
import logger from '../lib/logger';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // Limite de 5MB para fotos
});

// ---------------------------------------------------------------------------
// Auxiliar: valida e normaliza array de atividades
// ---------------------------------------------------------------------------
function parseAtividades(raw: unknown): Atividade[] {
  if (!raw) return [];

  let lista: string[] = [];

  if (typeof raw === 'string') {
    try {
      // Tenta como JSON array: '["JIU_JITSU","BOXE"]'
      const parsed = JSON.parse(raw);
      lista = Array.isArray(parsed) ? parsed : [raw];
    } catch {
      // Tenta como string separada por vírgula: "JIU_JITSU,BOXE"
      lista = raw.split(',').map((s) => s.trim());
    }
  } else if (Array.isArray(raw)) {
    lista = raw.map(String);
  }

  const invalidas = lista.filter((a) => !ATIVIDADES_VALIDAS.includes(a as Atividade));
  if (invalidas.length > 0) {
    throw new Error(`Atividades inválidas: ${invalidas.join(', ')}. Permitidas: ${ATIVIDADES_VALIDAS.join(', ')}`);
  }

  return lista as Atividade[];
}

// ---------------------------------------------------------------------------
// Auxiliar: busca ou cria usuário local a partir do auth_id do token
// ---------------------------------------------------------------------------
async function findOrCreateUser(auth_id: string, email?: string, tipo = 'ALUNO') {
  const { data: existing } = await supabase
    .from('User')
    .select('*')
    .eq('auth_id', auth_id)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await supabase
    .from('User')
    .insert({ auth_id, tipo, email: email || null })
    .select()
    .single();

  if (error) throw error;
  return created;
}

// ---------------------------------------------------------------------------
// Pública — Consulta de endereço por CEP (ViaCEP)
// GET /academias/cep/:cep
// ---------------------------------------------------------------------------
router.get('/cep/:cep', async (req, res) => {
  try {
    const { cep } = req.params;
    const endereco = await fetchEnderecoByCep(cep);
    res.json(endereco);
  } catch (error: any) {
    const isCepInvalido = error.message?.includes('inválido') || error.message?.includes('não encontrado');
    res.status(isCepInvalido ? 400 : 502).json({ error: error.message || 'Erro ao consultar CEP' });
  }
});

// ---------------------------------------------------------------------------
// Pública — Lista academias ativas
// GET /academias
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('Academia')
      .select('id, nome, endereco, nivel_selo, foto_url, verificada, atividades')
      .eq('ativa', true);

    if (error) throw error;
    res.json(data);
  } catch (error) {
    logger.error(error, 'Erro interno ao buscar academias');
    res.status(500).json({ error: 'Erro interno ao buscar academias' });
  }
});

// ---------------------------------------------------------------------------
// Pública — Perfil completo de uma academia
// GET /academias/:id
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('Academia')
      .select('*, certificados:Certificado(*), avaliacoes:Avaliacao(*)')
      .eq('id', String(req.params.id))
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Academia não encontrada' });
    res.json(data);
  } catch (error) {
    logger.error(error, 'Erro interno ao buscar academia específica');
    res.status(500).json({ error: 'Erro interno ao buscar academia' });
  }
});

// ---------------------------------------------------------------------------
// Privada (Academia) — Cadastro com upload de foto, endereço via ViaCEP e atividades
// POST /academias
// ---------------------------------------------------------------------------
router.post('/', upload.single('foto'), requireAuth, async (req, res) => {
  try {
    const auth_id = req.user?.sub;
    if (!auth_id) return res.status(400).json({ error: 'Token inválido: sub ausente' });

    const { nome, cnpj, endereco, cep, telefone, instagram, descricao, foto_url } = req.body;
    if (!nome) return res.status(400).json({ error: 'O nome da academia é obrigatório' });

    // Validar atividades
    let atividades: Atividade[] = [];
    try {
      atividades = parseAtividades(req.body.atividades);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }

    const user = await findOrCreateUser(auth_id, req.user?.email, 'ACADEMIA');

    // Verificar se já possui academia cadastrada
    const { data: existing } = await supabase
      .from('Academia')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ error: 'Usuário já possui uma academia cadastrada' });
    }

    // Montar endereço: se vier cep e campos incompletos, consulta ViaCEP
    let parsedEndereco: Record<string, any> = {};
    if (typeof endereco === 'string') {
      try { parsedEndereco = JSON.parse(endereco); } catch { parsedEndereco = {}; }
    } else if (endereco && typeof endereco === 'object') {
      parsedEndereco = endereco;
    }

    // Se veio CEP (isolado ou dentro do endereço), busca o restante automaticamente
    const cepFinal = cep || parsedEndereco.cep;
    if (cepFinal && !parsedEndereco.cidade) {
      try {
        const dadosCep = await fetchEnderecoByCep(cepFinal);
        parsedEndereco = {
          ...dadosCep,
          numero: parsedEndereco.numero || null,
          complemento: parsedEndereco.complemento || dadosCep.complemento || null,
        };
      } catch (err: any) {
        return res.status(400).json({ error: `CEP inválido: ${err.message}` });
      }
    }

    // Upload da foto de perfil para o bucket público 'academias'
    let finalFotoUrl = foto_url || null;
    if (req.file) {
      const file = req.file;
      const fileExt = file.originalname.split('.').pop() || '';
      const filePath = `${user.id}/${Date.now()}_profile.${fileExt}`;
      await StorageService.uploadFile('academias', filePath, file.buffer, file.mimetype);
      finalFotoUrl = StorageService.getPublicUrl('academias', filePath);
    }

    const { data: academia, error } = await supabase
      .from('Academia')
      .insert({
        user_id: user.id,
        nome,
        cnpj: cnpj || null,
        endereco: parsedEndereco,
        telefone: telefone || null,
        instagram: instagram || null,
        descricao: descricao || null,
        foto_url: finalFotoUrl,
        atividades,
        nivel_selo: 'NENHUM',
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(academia);
  } catch (error: any) {
    logger.error(error, 'Erro interno ao criar academia');
    res.status(500).json({ error: 'Erro interno ao criar academia' });
  }
});

// ---------------------------------------------------------------------------
// Privada (Academia) — Atualização com upload de foto, endereço e atividades
// PATCH /academias/:id
// ---------------------------------------------------------------------------
router.patch('/:id', upload.single('foto'), requireAuth, async (req, res) => {
  try {
    const auth_id = req.user?.sub;
    const id = String(req.params.id);

    const { data: user } = await supabase
      .from('User')
      .select('id')
      .eq('auth_id', auth_id)
      .maybeSingle();

    if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });

    const { data: academia } = await supabase
      .from('Academia')
      .select('user_id, foto_url, endereco, atividades')
      .eq('id', id)
      .maybeSingle();

    if (!academia || academia.user_id !== user.id) {
      return res.status(403).json({ error: 'Acesso negado ou academia não encontrada' });
    }

    const { nome, cnpj, endereco, cep, telefone, instagram, descricao, foto_url } = req.body;

    // Montar endereço atualizado
    let parsedEndereco: Record<string, any> | undefined = undefined;
    if (endereco !== undefined || cep !== undefined) {
      if (typeof endereco === 'string') {
        try { parsedEndereco = JSON.parse(endereco); } catch { parsedEndereco = {}; }
      } else if (endereco && typeof endereco === 'object') {
        parsedEndereco = endereco;
      } else {
        parsedEndereco = { ...(academia.endereco || {}) };
      }

      // Se veio novo cep, busca endereço completo
      const cepFinal = cep || parsedEndereco?.cep;
      if (cepFinal && (!parsedEndereco?.cidade || cep)) {
        try {
          const dadosCep = await fetchEnderecoByCep(cepFinal);
          parsedEndereco = {
            ...dadosCep,
            numero: parsedEndereco?.numero || null,
            complemento: parsedEndereco?.complemento || dadosCep.complemento || null,
          };
        } catch (err: any) {
          return res.status(400).json({ error: `CEP inválido: ${err.message}` });
        }
      }
    }

    // Atividades: só atualiza se enviado
    let atividadesUpdate: Atividade[] | undefined = undefined;
    if (req.body.atividades !== undefined) {
      try {
        atividadesUpdate = parseAtividades(req.body.atividades);
      } catch (err: any) {
        return res.status(400).json({ error: err.message });
      }
    }

    // Upload de nova foto de perfil
    let finalFotoUrl = foto_url !== undefined ? foto_url : academia.foto_url;
    if (req.file) {
      const file = req.file;
      const fileExt = file.originalname.split('.').pop() || '';
      const filePath = `${user.id}/${Date.now()}_profile.${fileExt}`;
      await StorageService.uploadFile('academias', filePath, file.buffer, file.mimetype);
      finalFotoUrl = StorageService.getPublicUrl('academias', filePath);
    }

    // Montar objeto de atualização (apenas campos enviados)
    const updatePayload: Record<string, any> = {
      foto_url: finalFotoUrl,
    };
    if (nome !== undefined) updatePayload.nome = nome;
    if (cnpj !== undefined) updatePayload.cnpj = cnpj;
    if (telefone !== undefined) updatePayload.telefone = telefone;
    if (instagram !== undefined) updatePayload.instagram = instagram;
    if (descricao !== undefined) updatePayload.descricao = descricao;
    if (parsedEndereco !== undefined) updatePayload.endereco = parsedEndereco;
    if (atividadesUpdate !== undefined) updatePayload.atividades = atividadesUpdate;

    const { data: updated, error } = await supabase
      .from('Academia')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(updated);
  } catch (error) {
    logger.error(error, 'Erro interno ao atualizar academia');
    res.status(500).json({ error: 'Erro interno ao atualizar academia' });
  }
});

// ---------------------------------------------------------------------------
// Privada (Admin) — Verificação/Selo da academia
// POST /academias/:id/verificar
// ---------------------------------------------------------------------------
router.post('/:id/verificar', requireAuth, async (req, res) => {
  try {
    const auth_id = req.user?.sub;
    const { id } = req.params;

    const { data: user } = await supabase
      .from('User')
      .select('tipo')
      .eq('auth_id', auth_id)
      .maybeSingle();

    if (!user || user.tipo !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado: Requer privilégios de administrador' });
    }

    const { verificada, nivel_selo } = req.body;

    const { data: academia } = await supabase
      .from('Academia')
      .select('verificada, nivel_selo')
      .eq('id', String(id))
      .maybeSingle();

    if (!academia) {
      return res.status(404).json({ error: 'Academia não encontrada' });
    }

    const { data: updated, error } = await supabase
      .from('Academia')
      .update({
        verificada: typeof verificada === 'boolean' ? verificada : academia.verificada,
        nivel_selo: nivel_selo || academia.nivel_selo,
      })
      .eq('id', String(id))
      .select()
      .single();

    if (error) throw error;
    res.json({ message: 'Status de certificação da academia atualizado com sucesso', academia: updated });
  } catch (error) {
    logger.error(error, 'Erro interno ao verificar academia pelo administrador');
    res.status(500).json({ error: 'Erro interno ao verificar academia' });
  }
});

export default router;
