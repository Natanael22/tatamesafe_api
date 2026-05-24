import { Router } from 'express';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import prisma from '../lib/prisma';
import { denunciaLimiter } from '../middlewares/rateLimiter';
import { requireAuth } from '../middlewares/auth.middleware';
import logger from '../lib/logger';

const router = Router();
const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const denunciaQueue = new Queue('denuncia-queue', { connection });


router.post('/', denunciaLimiter, async (req, res) => {
  try {
    const { tipo, descricao_enc, academia_ref, urgencia, envolve_menor } = req.body;

    // Converte de base64 para Buffer
    const bufferDesc = Buffer.from(descricao_enc, 'base64');

    // Chama a função PostgreSQL via raw query, pois não usamos prisma.vault_Denuncia diretamente na API pra insert,
    // mas sim a procedure SECURITY DEFINER
    const result: any = await prisma.$queryRaw`
      SELECT tatame.inserir_denuncia(
        ${tipo},
        ${bufferDesc},
        ${academia_ref},
        ${urgencia},
        ${envolve_menor}
      ) as protocolo;
    `;

    const protocolo = result[0]?.protocolo;

    if (!protocolo) {
      throw new Error('Falha ao gerar protocolo');
    }

    // Adiciona job na fila BullMQ
    await denunciaQueue.add('denuncia.nova', {
      protocolo,
      urgencia,
      envolve_menor,
    });

    res.status(201).json({ protocolo });
  } catch (error: any) {
    logger.error(error, 'Erro ao registrar denúncia');
    res.status(500).json({ error: 'Erro interno ao registrar denúncia' });
  }
});

// Privada (Admin) - Listagem de denúncias
router.get('/admin', requireAuth, async (req, res) => {
  try {
    const auth_id = req.user?.sub;
    const user = await prisma.user.findUnique({ where: { auth_id } });

    if (!user || user.tipo !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado: Requer privilégios de administrador' });
    }

    const denuncias = await prisma.denuncia.findMany({
      orderBy: [
        { urgencia: 'desc' },
        { criado_em: 'desc' }
      ],
      include: {
        historico: {
          orderBy: { criado_em: 'desc' }
        }
      }
    });

    res.json(denuncias);
  } catch (error) {
    logger.error(error, 'Erro interno ao listar denúncias');
    res.status(500).json({ error: 'Erro interno ao listar denúncias' });
  }
});

// Privada (Admin) - Atualização de status da denúncia
router.patch('/admin/:id/status', requireAuth, async (req, res) => {
  try {
    const auth_id = req.user?.sub;
    const user = await prisma.user.findUnique({ where: { auth_id } });

    if (!user || user.tipo !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado: Requer privilégios de administrador' });
    }

    const { id } = req.params;
    const { status, nota_interna } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'O novo status é obrigatório' });
    }

    const denuncia = await prisma.denuncia.findUnique({ where: { id: String(id) } });
    if (!denuncia) {
      return res.status(404).json({ error: 'Denúncia não encontrada' });
    }

    const status_de = denuncia.status;
    
    // Atualiza status e registra no histórico usando transação
    const [updatedDenuncia, historico] = await prisma.$transaction([
      prisma.denuncia.update({
        where: { id: String(id) },
        data: { status }
      }),
      prisma.denunciaHistorico.create({
        data: {
          denuncia_id: String(id),
          status_de,
          status_para: status,
          nota_interna,
          operador_id: user.id
        }
      })
    ]);

    res.json({ denuncia: updatedDenuncia, historico });
  } catch (error) {
    logger.error(error, 'Erro interno ao atualizar status da denúncia');
    res.status(500).json({ error: 'Erro interno ao atualizar status da denúncia' });
  }
});

router.get('/status/:protocolo', async (req, res) => {
  try {
    const { protocolo } = req.params;

    // Busca status no banco de dados (Acesso restrito a ler certas colunas no vault é permitido dependendo da role,
    // mas para API podemos expor um select básico se tiver permissão de leitura, 
    // ou outra function SECURITY DEFINER)
    // Para simplificar no Node.js usando o Prisma Service Role, o Prisma lê direto
    const denuncia = await prisma.denuncia.findUnique({
      where: { protocolo },
      select: {
        status: true,
        atualizado_em: true,
      },
    });

    if (!denuncia) {
      return res.status(404).json({ error: 'Protocolo não encontrado' });
    }

    res.json({
      status: denuncia.status,
      atualizado_em: denuncia.atualizado_em,
      mensagem_publica: 'Denúncia recebida e em processamento', // Pode variar por status
    });
  } catch (error) {
    logger.error(error, 'Erro interno ao consultar status da denúncia');
    res.status(500).json({ error: 'Erro interno ao consultar status' });
  }
});

export default router;
