import { Router } from 'express';
import prisma from '../lib/prisma';
import { requireAuth } from '../middlewares/auth.middleware';
import logger from '../lib/logger';

const router = Router();

// Pública - Listar certificados (opcionalmente filtrado por academia)
router.get('/', async (req, res) => {
  try {
    const { academia_id } = req.query;
    
    const whereClause = academia_id ? { academia_id: String(academia_id) } : {};

    const certificados = await prisma.certificado.findMany({
      where: whereClause,
      include: {
        academia: {
          select: { nome: true }
        }
      },
      orderBy: { emitido_em: 'desc' }
    });

    res.json(certificados);
  } catch (error) {
    logger.error(error, 'Erro interno ao buscar certificados');
    res.status(500).json({ error: 'Erro interno ao buscar certificados' });
  }
});

// Pública - Validação/Consulta de um certificado específico
router.get('/:id', async (req, res) => {
  try {
    const certificado = await prisma.certificado.findUnique({
      where: { id: String(req.params.id) },
      include: {
        academia: {
          select: { nome: true, cnpj: true }
        }
      }
    });

    if (!certificado) {
      return res.status(404).json({ error: 'Certificado não encontrado' });
    }

    res.json(certificado);
  } catch (error) {
    logger.error(error, 'Erro interno ao consultar certificado específico');
    res.status(500).json({ error: 'Erro interno ao consultar certificado' });
  }
});

// Privada (Admin) - Emissão de novo certificado
router.post('/', requireAuth, async (req, res) => {
  try {
    const auth_id = req.user?.sub;
    
    // Apenas ADMIN pode emitir certificados oficiais
    const user = await prisma.user.findUnique({ where: { auth_id } });
    if (!user || user.tipo !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado: Requer privilégios de administrador' });
    }

    const { academia_id, tipo, instrutor, validade_em, url_pdf } = req.body;

    if (!academia_id || !tipo || !instrutor || !validade_em) {
      return res.status(400).json({ error: 'Campos obrigatórios: academia_id, tipo, instrutor, validade_em' });
    }

    // Verificar se a academia existe
    const academia = await prisma.academia.findUnique({ where: { id: String(academia_id) } });
    if (!academia) {
      return res.status(404).json({ error: 'Academia não encontrada' });
    }

    const certificado = await prisma.certificado.create({
      data: {
        academia_id: String(academia_id),
        tipo,
        instrutor,
        validade_em: new Date(validade_em),
        url_pdf
      }
    });

    res.status(201).json(certificado);
  } catch (error: any) {
    logger.error(error, 'Erro ao emitir novo certificado');
    res.status(500).json({ error: 'Erro ao emitir certificado' });
  }
});

export default router;
