import { Router } from 'express';
import supabase from '../lib/supabase';
import { requireAuth } from '../middlewares/auth.middleware';
import logger from '../lib/logger';

const router = Router();

// Privada - Retorna o perfil do usuário logado (cria se não existir)
router.get('/me', requireAuth, async (req, res) => {
  try {
    const auth_id = req.user?.sub;
    if (!auth_id) return res.status(400).json({ error: 'Token inválido' });

    let { data: user } = await supabase
      .from('User')
      .select('*, academia:Academia(*)')
      .eq('auth_id', auth_id)
      .maybeSingle();

    // Se o usuário não existir na nossa base local, criamos automaticamente
    if (!user) {
      const { data: created, error } = await supabase
        .from('User')
        .insert({
          auth_id,
          tipo: 'ALUNO',
          email: req.user?.email || null,
        })
        .select('*, academia:Academia(*)')
        .single();

      if (error) throw error;
      user = created;
    }

    res.json(user);
  } catch (error) {
    logger.error(error, 'Erro interno ao buscar perfil do usuário');
    res.status(500).json({ error: 'Erro interno ao buscar perfil' });
  }
});

// Privada - Atualiza o perfil do usuário logado
router.patch('/me', requireAuth, async (req, res) => {
  try {
    const auth_id = req.user?.sub;

    const { data: user } = await supabase
      .from('User')
      .select('id')
      .eq('auth_id', auth_id)
      .maybeSingle();

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const { nome, telefone, tipo } = req.body;

    // Apenas atualiza campos permitidos (não deixa mudar id, auth_id, email, etc.)
    const { data: updated, error } = await supabase
      .from('User')
      .update({ nome, telefone, tipo })
      .eq('id', user.id)
      .select()
      .single();

    if (error) throw error;
    res.json(updated);
  } catch (error) {
    logger.error(error, 'Erro interno ao atualizar perfil do usuário');
    res.status(500).json({ error: 'Erro interno ao atualizar perfil' });
  }
});

export default router;
