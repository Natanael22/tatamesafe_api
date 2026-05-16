import { Router } from 'express';
import prisma from '../lib/prisma';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

// Pública - Lista academias certificadas
router.get('/', async (req, res) => {
  try {
    const academias = await prisma.academia.findMany({
      where: { ativa: true, verificada: true },
      select: { id: true, nome: true, endereco: true, nivel_selo: true, foto_url: true }
    });
    res.json(academias);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno ao buscar academias' });
  }
});

// Pública - Perfil da academia
router.get('/:id', async (req, res) => {
  try {
    const academia = await prisma.academia.findUnique({
      where: { id: String(req.params.id) },
      include: { certificados: true, avaliacoes: true }
    });
    if (!academia) return res.status(404).json({ error: 'Academia não encontrada' });
    res.json(academia);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno ao buscar academia' });
  }
});

// Privada (Academia) - Cadastro
router.post('/', requireAuth, async (req, res) => {
  try {
    const auth_id = req.user?.sub;
    if (!auth_id) return res.status(400).json({ error: 'Token inválido: sub ausente' });

    const { nome, cnpj, endereco, telefone, instagram, descricao, foto_url } = req.body;
    if (!nome) return res.status(400).json({ error: 'O nome da academia é obrigatório' });

    // Buscar ou criar usuário local sincronizado com Supabase Auth
    let user = await prisma.user.findUnique({ where: { auth_id } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          auth_id,
          tipo: 'ACADEMIA',
          email: req.user?.email || null,
        }
      });
    }

    // Verificar se já possui academia
    const existing = await prisma.academia.findUnique({ where: { user_id: user.id } });
    if (existing) {
      return res.status(400).json({ error: 'Usuário já possui uma academia cadastrada' });
    }

    const academia = await prisma.academia.create({
      data: {
        user_id: user.id,
        nome,
        cnpj,
        endereco: endereco || {},
        telefone,
        instagram,
        descricao,
        foto_url,
        nivel_selo: 'NENHUM',
      }
    });

    res.status(201).json(academia);
  } catch (error: any) {
    res.status(500).json({ error: 'Erro interno ao criar academia' });
  }
});

// Privada (Academia) - Atualização
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const auth_id = req.user?.sub;
    const id = String(req.params.id);
    
    const user = await prisma.user.findUnique({ where: { auth_id } });
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });

    const academia = await prisma.academia.findUnique({ where: { id } });
    if (!academia || academia.user_id !== user.id) {
      return res.status(403).json({ error: 'Acesso negado ou academia não encontrada' });
    }

    const { nome, cnpj, endereco, telefone, instagram, descricao, foto_url } = req.body;

    const updated = await prisma.academia.update({
      where: { id },
      data: { nome, cnpj, endereco, telefone, instagram, descricao, foto_url }
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno ao atualizar academia' });
  }
});

// Privada (Admin) - Verificação/Selo da academia
router.post('/:id/verificar', requireAuth, async (req, res) => {
  try {
    const auth_id = req.user?.sub;
    const { id } = req.params;
    
    // Validar se o usuário que faz a requisição é ADMIN
    const user = await prisma.user.findUnique({ where: { auth_id } });
    if (!user || user.tipo !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado: Requer privilégios de administrador' });
    }

    const { verificada, nivel_selo } = req.body;

    const academia = await prisma.academia.findUnique({ where: { id: String(id) } });
    if (!academia) {
      return res.status(404).json({ error: 'Academia não encontrada' });
    }

    const updated = await prisma.academia.update({
      where: { id: String(id) },
      data: {
        verificada: typeof verificada === 'boolean' ? verificada : academia.verificada,
        nivel_selo: nivel_selo || academia.nivel_selo
      }
    });

    res.json({ message: 'Status de certificação da academia atualizado com sucesso', academia: updated });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno ao verificar academia' });
  }
});

export default router;
