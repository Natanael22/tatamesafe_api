"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = __importDefault(require("../lib/supabase"));
const auth_middleware_1 = require("../middlewares/auth.middleware");
const logger_1 = __importDefault(require("../lib/logger"));
const router = (0, express_1.Router)();
// Privada - Retorna o perfil do usuário logado (cria se não existir)
router.get('/me', auth_middleware_1.requireAuth, async (req, res) => {
    try {
        const auth_id = req.user?.sub;
        if (!auth_id)
            return res.status(400).json({ error: 'Token inválido' });
        let { data: user } = await supabase_1.default
            .from('User')
            .select('*, academia:Academia(*)')
            .eq('auth_id', auth_id)
            .maybeSingle();
        // Se o usuário não existir na nossa base local, criamos automaticamente
        if (!user) {
            const { data: created, error } = await supabase_1.default
                .from('User')
                .insert({
                auth_id,
                tipo: 'ALUNO',
                email: req.user?.email || null,
            })
                .select('*, academia:Academia(*)')
                .single();
            if (error)
                throw error;
            user = created;
        }
        res.json(user);
    }
    catch (error) {
        logger_1.default.error(error, 'Erro interno ao buscar perfil do usuário');
        res.status(500).json({ error: 'Erro interno ao buscar perfil' });
    }
});
// Privada - Atualiza o perfil do usuário logado
router.patch('/me', auth_middleware_1.requireAuth, async (req, res) => {
    try {
        const auth_id = req.user?.sub;
        const { data: user } = await supabase_1.default
            .from('User')
            .select('id')
            .eq('auth_id', auth_id)
            .maybeSingle();
        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        const { nome, telefone, tipo } = req.body;
        // Apenas atualiza campos permitidos (não deixa mudar id, auth_id, email, etc.)
        const { data: updated, error } = await supabase_1.default
            .from('User')
            .update({ nome, telefone, tipo })
            .eq('id', user.id)
            .select()
            .single();
        if (error)
            throw error;
        res.json(updated);
    }
    catch (error) {
        logger_1.default.error(error, 'Erro interno ao atualizar perfil do usuário');
        res.status(500).json({ error: 'Erro interno ao atualizar perfil' });
    }
});
exports.default = router;
