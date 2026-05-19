import { Router } from 'express';
import prisma from '../lib/prisma';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

// Privada - Retorna o perfil do usuário logado (cria se não existir)
router.get('/me', requireAuth, async (req, res) => {
  try {
    const auth_id = req.user?.sub;
    if (!auth_id) return res.status(400).json({ error: 'Token inválido' });

    let user = await prisma.user.findUnique({ 
      where: { auth_id },
      include: {
        academia: true // Traz os dados da academia associada se houver
      }
    });

    // Se o usuário não existir na nossa base local, criamos automaticamente
    if (!user) {
      user = await prisma.user.create({
        data: {
          auth_id,
          tipo: 'ALUNO', // Tipo padrão inicial
          email: req.user?.email || null,
        },
        include: {
          academia: true
        }
      });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno ao buscar perfil' });
  }
});

// Privada - Atualiza o perfil do usuário logado
router.patch('/me', requireAuth, async (req, res) => {
  try {
    const auth_id = req.user?.sub;
    
    const user = await prisma.user.findUnique({ where: { auth_id } });
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const { nome, telefone, tipo } = req.body;

    // Apenas atualiza campos permitidos (não deixa mudar id, auth_id, email, etc.)
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        nome,
        telefone,
        tipo // opcional, dependendo da regra de negócio pode ser restrito
      }
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno ao atualizar perfil' });
  }
});

export default router;
