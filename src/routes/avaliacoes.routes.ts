import { Router } from 'express';
import prisma from '../lib/prisma';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

// Pública - Listar avaliações (opcionalmente filtrado por academia)
router.get('/', async (req, res) => {
  try {
    const { academia_id } = req.query;
    
    const whereClause = academia_id ? { academia_id: String(academia_id) } : {};

    const avaliacoes = await prisma.avaliacao.findMany({
      where: whereClause,
      include: {
        user: {
          select: { nome: true }
        }
      },
      orderBy: { criado_em: 'desc' }
    });

    const formatadas = avaliacoes.map(a => {
      const categorias: any = a.categorias || {};
      const isAnonima = categorias.anonima === true;
      return {
        id: a.id,
        academia_id: a.academia_id,
        nota: a.nota,
        comentario: a.comentario,
        criado_em: a.criado_em,
        categorias: a.categorias,
        autor: isAnonima ? 'Anônimo' : a.user?.nome || 'Usuário',
      };
    });

    res.json(formatadas);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno ao buscar avaliações' });
  }
});

// Privada - Criar ou atualizar avaliação
router.post('/', requireAuth, async (req, res) => {
  try {
    const auth_id = req.user?.sub;
    if (!auth_id) return res.status(400).json({ error: 'Token inválido' });

    let user = await prisma.user.findUnique({ where: { auth_id } });
    if (!user) {
      user = await prisma.user.create({
        data: { auth_id, tipo: 'ALUNO', email: req.user?.email || null }
      });
    }

    const { academia_id, nota, comentario, anonima, categorias } = req.body;

    if (!academia_id || nota === undefined) {
      return res.status(400).json({ error: 'academia_id e nota são obrigatórios' });
    }

    if (nota < 1 || nota > 5) {
      return res.status(400).json({ error: 'Nota deve ser entre 1 e 5' });
    }

    const jsonCategorias = { ...(categorias || {}), anonima: anonima || false };

    // Verifica se já existe avaliação
    const existing = await prisma.avaliacao.findFirst({
      where: { user_id: user.id, academia_id: String(academia_id) }
    });

    let avaliacao;
    if (existing) {
      avaliacao = await prisma.avaliacao.update({
        where: { id: existing.id },
        data: { nota, comentario, categorias: jsonCategorias }
      });
    } else {
      avaliacao = await prisma.avaliacao.create({
        data: {
          user_id: user.id,
          academia_id: String(academia_id),
          nota,
          comentario,
          categorias: jsonCategorias
        }
      });
    }

    res.status(201).json(avaliacao);
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao processar avaliação' });
  }
});

export default router;
