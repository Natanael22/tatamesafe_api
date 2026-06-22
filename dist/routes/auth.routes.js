"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = __importDefault(require("../lib/supabase"));
const logger_1 = __importDefault(require("../lib/logger"));
const router = (0, express_1.Router)();
// Auxiliar para buscar usuário pelo auth_id
async function findUserByAuthId(auth_id) {
    const { data, error } = await supabase_1.default
        .from('User')
        .select('*, academia:Academia(*)')
        .eq('auth_id', auth_id)
        .maybeSingle();
    if (error)
        throw error;
    return data;
}
// POST /signup/aluno - Cadastro de Aluno
router.post('/signup/aluno', async (req, res) => {
    try {
        const { email, password, nome, telefone } = req.body;
        if (!email || !password || !nome) {
            return res.status(400).json({ error: 'Campos obrigatórios: email, password, nome' });
        }
        // 1. Cadastra o usuário no Supabase Auth
        const { data: authData, error: authError } = await supabase_1.default.auth.signUp({
            email,
            password,
        });
        if (authError || !authData.user) {
            logger_1.default.error(authError, 'Erro ao criar usuário no Supabase Auth (Aluno)');
            return res.status(400).json({ error: authError?.message || 'Falha no cadastro do usuário' });
        }
        const auth_id = authData.user.id;
        // 2. Insere na tabela User local
        const { data: userRecord, error: userError } = await supabase_1.default
            .from('User')
            .insert({
            auth_id,
            tipo: 'ALUNO',
            nome,
            email,
            telefone: telefone || null,
        })
            .select()
            .single();
        if (userError) {
            // Rollback manual do usuário criado no auth (opcional)
            await supabase_1.default.auth.admin.deleteUser(auth_id);
            logger_1.default.error(userError, 'Erro ao salvar perfil do usuário local (Aluno)');
            return res.status(500).json({ error: 'Erro ao salvar o perfil do usuário' });
        }
        res.status(201).json({
            message: 'Cadastro de aluno realizado com sucesso',
            user: userRecord,
            session: authData.session,
        });
    }
    catch (error) {
        logger_1.default.error(error, 'Erro interno no cadastro de aluno');
        res.status(500).json({ error: 'Erro interno ao processar cadastro' });
    }
});
// POST /signup/academia - Cadastro de Academia
router.post('/signup/academia', async (req, res) => {
    try {
        const { email, password, nome, telefone, cnpj, endereco, instagram, descricao, foto_url, } = req.body;
        if (!email || !password || !nome) {
            return res.status(400).json({ error: 'Campos obrigatórios: email, password, nome da academia' });
        }
        // 1. Cadastra o usuário no Supabase Auth
        const { data: authData, error: authError } = await supabase_1.default.auth.signUp({
            email,
            password,
        });
        if (authError || !authData.user) {
            logger_1.default.error(authError, 'Erro ao criar usuário no Supabase Auth (Academia)');
            return res.status(400).json({ error: authError?.message || 'Falha no cadastro do usuário' });
        }
        const auth_id = authData.user.id;
        // 2. Insere na tabela User local
        const { data: userRecord, error: userError } = await supabase_1.default
            .from('User')
            .insert({
            auth_id,
            tipo: 'ACADEMIA',
            nome,
            email,
            telefone: telefone || null,
        })
            .select()
            .single();
        if (userError) {
            await supabase_1.default.auth.admin.deleteUser(auth_id);
            logger_1.default.error(userError, 'Erro ao salvar perfil do usuário local (Academia)');
            return res.status(500).json({ error: 'Erro ao salvar o perfil do usuário' });
        }
        // 3. Insere o registro de Academia
        const { data: academiaRecord, error: academiaError } = await supabase_1.default
            .from('Academia')
            .insert({
            user_id: userRecord.id,
            nome,
            cnpj: cnpj || null,
            endereco: endereco || {},
            telefone: telefone || null,
            instagram: instagram || null,
            descricao: descricao || null,
            foto_url: foto_url || null,
            nivel_selo: 'NENHUM',
            verificada: false,
            ativa: true,
        })
            .select()
            .single();
        if (academiaError) {
            await supabase_1.default.from('User').delete().eq('id', userRecord.id);
            await supabase_1.default.auth.admin.deleteUser(auth_id);
            logger_1.default.error(academiaError, 'Erro ao salvar detalhes da academia local');
            return res.status(500).json({ error: 'Erro ao salvar os detalhes da academia' });
        }
        res.status(201).json({
            message: 'Cadastro de academia realizado com sucesso',
            user: userRecord,
            academia: academiaRecord,
            session: authData.session,
        });
    }
    catch (error) {
        logger_1.default.error(error, 'Erro interno no cadastro de academia');
        res.status(500).json({ error: 'Erro interno ao processar cadastro' });
    }
});
// POST /signin - Login
router.post('/signin', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
        }
        const { data: authData, error: authError } = await supabase_1.default.auth.signInWithPassword({
            email,
            password,
        });
        if (authError || !authData.session) {
            logger_1.default.error(authError, 'Erro de autenticação de login');
            return res.status(401).json({ error: 'E-mail ou senha inválidos' });
        }
        // Busca dados adicionais do usuário
        const userLocal = await findUserByAuthId(authData.user.id);
        res.json({
            message: 'Autenticado com sucesso',
            session: authData.session,
            user: userLocal,
        });
    }
    catch (error) {
        logger_1.default.error(error, 'Erro interno no login');
        res.status(500).json({ error: 'Erro interno ao processar login' });
    }
});
// POST /signout - Logout
router.post('/signout', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(400).json({ error: 'Token de autorização não fornecido' });
        }
        const token = authHeader.split(' ')[1];
        // Invalida a sessão no Supabase Auth
        const { error: authError } = await supabase_1.default.auth.admin.signOut(token);
        if (authError) {
            logger_1.default.error(authError, 'Erro ao invalidar sessão no logout');
            return res.status(400).json({ error: 'Erro ao deslogar' });
        }
        res.json({ message: 'Sessão encerrada com sucesso' });
    }
    catch (error) {
        logger_1.default.error(error, 'Erro interno no logout');
        res.status(500).json({ error: 'Erro interno ao processar logout' });
    }
});
exports.default = router;
