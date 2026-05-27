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
// Pública - Listar avaliações (opcionalmente filtrado por academia)
router.get('/', async (req, res) => {
    try {
        const { academia_id } = req.query;
        let query = supabase_1.default
            .from('Avaliacao')
            .select('*, user:User(nome)')
            .order('criado_em', { ascending: false });
        if (academia_id) {
            query = query.eq('academia_id', String(academia_id));
        }
        const { data, error } = await query;
        if (error)
            throw error;
        const formatadas = (data || []).map((a) => {
            const categorias = a.categorias || {};
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
    }
    catch (error) {
        logger_1.default.error(error, 'Erro interno ao buscar avaliações');
        res.status(500).json({ error: 'Erro interno ao buscar avaliações' });
    }
});
// Privada - Criar ou atualizar avaliação
router.post('/', auth_middleware_1.requireAuth, async (req, res) => {
    try {
        const auth_id = req.user?.sub;
        if (!auth_id)
            return res.status(400).json({ error: 'Token inválido' });
        // Busca ou cria usuário
        let { data: user } = await supabase_1.default
            .from('User')
            .select('id')
            .eq('auth_id', auth_id)
            .maybeSingle();
        if (!user) {
            const { data: created, error: createErr } = await supabase_1.default
                .from('User')
                .insert({ auth_id, tipo: 'ALUNO', email: req.user?.email || null })
                .select('id')
                .single();
            if (createErr)
                throw createErr;
            user = created;
        }
        const { academia_id, nota, comentario, anonima, categorias } = req.body;
        if (!academia_id || nota === undefined) {
            return res.status(400).json({ error: 'academia_id e nota são obrigatórios' });
        }
        if (nota < 1 || nota > 5) {
            return res.status(400).json({ error: 'Nota deve ser entre 1 e 5' });
        }
        const jsonCategorias = { ...(categorias || {}), anonima: anonima || false };
        // Verifica se já existe avaliação (1 por usuário por academia)
        const { data: existing } = await supabase_1.default
            .from('Avaliacao')
            .select('id')
            .eq('user_id', user.id)
            .eq('academia_id', String(academia_id))
            .maybeSingle();
        let avaliacao;
        if (existing) {
            const { data: updated, error } = await supabase_1.default
                .from('Avaliacao')
                .update({ nota, comentario, categorias: jsonCategorias })
                .eq('id', existing.id)
                .select()
                .single();
            if (error)
                throw error;
            avaliacao = updated;
        }
        else {
            const { data: created, error } = await supabase_1.default
                .from('Avaliacao')
                .insert({
                user_id: user.id,
                academia_id: String(academia_id),
                nota,
                comentario,
                categorias: jsonCategorias,
            })
                .select()
                .single();
            if (error)
                throw error;
            avaliacao = created;
        }
        res.status(201).json(avaliacao);
    }
    catch (error) {
        logger_1.default.error(error, 'Erro ao processar criação ou atualização de avaliação');
        res.status(500).json({ error: 'Erro ao processar avaliação' });
    }
});
exports.default = router;
