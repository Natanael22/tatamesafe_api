import { Router } from 'express';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import prisma from '../lib/prisma';
import { denunciaLimiter } from '../middlewares/rateLimiter';

const router = Router();
const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const denunciaQueue = new Queue('denuncia-queue', { connection });

router.use(denunciaLimiter);

router.post('/', async (req, res) => {
  try {
    const { tipo, descricao_enc, academia_ref, urgencia, envolve_menor } = req.body;

    // Converte de base64 para Buffer
    const bufferDesc = Buffer.from(descricao_enc, 'base64');

    // Chama a função PostgreSQL via raw query, pois não usamos prisma.vault_Denuncia diretamente na API pra insert,
    // mas sim a procedure SECURITY DEFINER
    const result: any = await prisma.$queryRaw`
      SELECT public.inserir_denuncia(
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
    console.error('Erro ao registrar denúncia:', error);
    res.status(500).json({ error: 'Erro interno ao registrar denúncia' });
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
    res.status(500).json({ error: 'Erro interno ao consultar status' });
  }
});

export default router;
