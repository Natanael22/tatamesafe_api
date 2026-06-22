"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const supabase_1 = __importDefault(require("../lib/supabase"));
const auth_middleware_1 = require("../middlewares/auth.middleware");
const storage_1 = require("../lib/storage");
const logger_1 = __importDefault(require("../lib/logger"));
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // Limite de 5MB para fotos
});
// Helper para buscar ou criar usuário local a partir do auth_id do token
async function findOrCreateUser(auth_id, email, tipo = 'ALUNO') {
    const { data: existing } = await supabase_1.default
        .from('User')
        .select('*')
        .eq('auth_id', auth_id)
        .maybeSingle();
    if (existing)
        return existing;
    const { data: created, error } = await supabase_1.default
        .from('User')
        .insert({ auth_id, tipo, email: email || null })
        .select()
        .single();
    if (error)
        throw error;
    return created;
}
// Pública - Lista academias (ativas)
router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabase_1.default
            .from('Academia')
            .select('id, nome, endereco, nivel_selo, foto_url, verificada')
            .eq('ativa', true);
        if (error)
            throw error;
        res.json(data);
    }
    catch (error) {
        logger_1.default.error(error, 'Erro interno ao buscar academias');
        res.status(500).json({ error: 'Erro interno ao buscar academias' });
    }
});
// Pública - Perfil da academia
router.get('/:id', async (req, res) => {
    try {
        const { data, error } = await supabase_1.default
            .from('Academia')
            .select('*, certificados:Certificado(*), avaliacoes:Avaliacao(*)')
            .eq('id', String(req.params.id))
            .maybeSingle();
        if (error)
            throw error;
        if (!data)
            return res.status(404).json({ error: 'Academia não encontrada' });
        res.json(data);
    }
    catch (error) {
        logger_1.default.error(error, 'Erro interno ao buscar academia específica');
        res.status(500).json({ error: 'Erro interno ao buscar academia' });
    }
});
// Privada (Academia) - Cadastro (com upload opcional de foto de perfil)
router.post('/', upload.single('foto'), auth_middleware_1.requireAuth, async (req, res) => {
    try {
        const auth_id = req.user?.sub;
        if (!auth_id)
            return res.status(400).json({ error: 'Token inválido: sub ausente' });
        const { nome, cnpj, endereco, telefone, instagram, descricao, foto_url } = req.body;
        if (!nome)
            return res.status(400).json({ error: 'O nome da academia é obrigatório' });
        const user = await findOrCreateUser(auth_id, req.user?.email, 'ACADEMIA');
        // Verificar se já possui academia
        const { data: existing } = await supabase_1.default
            .from('Academia')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle();
        if (existing) {
            return res.status(400).json({ error: 'Usuário já possui uma academia cadastrada' });
        }
        // Processar endereço se vier como string (comum em formulários multipart/form-data)
        let parsedEndereco = {};
        if (typeof endereco === 'string') {
            try {
                parsedEndereco = JSON.parse(endereco);
            }
            catch {
                parsedEndereco = {};
            }
        }
        else if (endereco) {
            parsedEndereco = endereco;
        }
        // Upload da foto de perfil para o bucket público 'academias'
        let finalFotoUrl = foto_url || null;
        if (req.file) {
            const file = req.file;
            const fileExt = file.originalname.split('.').pop() || '';
            const filePath = `${user.id}/${Date.now()}_profile.${fileExt}`;
            await storage_1.StorageService.uploadFile('academias', filePath, file.buffer, file.mimetype);
            finalFotoUrl = storage_1.StorageService.getPublicUrl('academias', filePath);
        }
        const { data: academia, error } = await supabase_1.default
            .from('Academia')
            .insert({
            user_id: user.id,
            nome,
            cnpj: cnpj || null,
            endereco: parsedEndereco,
            telefone: telefone || null,
            instagram: instagram || null,
            descricao: descricao || null,
            foto_url: finalFotoUrl,
            nivel_selo: 'NENHUM',
        })
            .select()
            .single();
        if (error)
            throw error;
        res.status(201).json(academia);
    }
    catch (error) {
        logger_1.default.error(error, 'Erro interno ao criar academia');
        res.status(500).json({ error: 'Erro interno ao criar academia' });
    }
});
// Privada (Academia) - Atualização (com upload opcional de foto de perfil)
router.patch('/:id', upload.single('foto'), auth_middleware_1.requireAuth, async (req, res) => {
    try {
        const auth_id = req.user?.sub;
        const id = String(req.params.id);
        const { data: user } = await supabase_1.default
            .from('User')
            .select('id')
            .eq('auth_id', auth_id)
            .maybeSingle();
        if (!user)
            return res.status(401).json({ error: 'Usuário não encontrado' });
        const { data: academia } = await supabase_1.default
            .from('Academia')
            .select('user_id, foto_url')
            .eq('id', id)
            .maybeSingle();
        if (!academia || academia.user_id !== user.id) {
            return res.status(403).json({ error: 'Acesso negado ou academia não encontrada' });
        }
        const { nome, cnpj, endereco, telefone, instagram, descricao, foto_url } = req.body;
        let parsedEndereco = undefined;
        if (endereco !== undefined) {
            if (typeof endereco === 'string') {
                try {
                    parsedEndereco = JSON.parse(endereco);
                }
                catch {
                    parsedEndereco = {};
                }
            }
            else {
                parsedEndereco = endereco;
            }
        }
        // Upload de nova foto de perfil
        let finalFotoUrl = foto_url !== undefined ? foto_url : academia.foto_url;
        if (req.file) {
            const file = req.file;
            const fileExt = file.originalname.split('.').pop() || '';
            const filePath = `${user.id}/${Date.now()}_profile.${fileExt}`;
            await storage_1.StorageService.uploadFile('academias', filePath, file.buffer, file.mimetype);
            finalFotoUrl = storage_1.StorageService.getPublicUrl('academias', filePath);
        }
        const { data: updated, error } = await supabase_1.default
            .from('Academia')
            .update({
            nome,
            cnpj,
            endereco: parsedEndereco,
            telefone,
            instagram,
            descricao,
            foto_url: finalFotoUrl,
        })
            .eq('id', id)
            .select()
            .single();
        if (error)
            throw error;
        res.json(updated);
    }
    catch (error) {
        logger_1.default.error(error, 'Erro interno ao atualizar academia');
        res.status(500).json({ error: 'Erro interno ao atualizar academia' });
    }
});
// Privada (Admin) - Verificação/Selo da academia
router.post('/:id/verificar', auth_middleware_1.requireAuth, async (req, res) => {
    try {
        const auth_id = req.user?.sub;
        const { id } = req.params;
        const { data: user } = await supabase_1.default
            .from('User')
            .select('tipo')
            .eq('auth_id', auth_id)
            .maybeSingle();
        if (!user || user.tipo !== 'ADMIN') {
            return res.status(403).json({ error: 'Acesso negado: Requer privilégios de administrador' });
        }
        const { verificada, nivel_selo } = req.body;
        const { data: academia } = await supabase_1.default
            .from('Academia')
            .select('verificada, nivel_selo')
            .eq('id', String(id))
            .maybeSingle();
        if (!academia) {
            return res.status(404).json({ error: 'Academia não encontrada' });
        }
        const { data: updated, error } = await supabase_1.default
            .from('Academia')
            .update({
            verificada: typeof verificada === 'boolean' ? verificada : academia.verificada,
            nivel_selo: nivel_selo || academia.nivel_selo,
        })
            .eq('id', String(id))
            .select()
            .single();
        if (error)
            throw error;
        res.json({ message: 'Status de certificação da academia atualizado com sucesso', academia: updated });
    }
    catch (error) {
        logger_1.default.error(error, 'Erro interno ao verificar academia pelo administrador');
        res.status(500).json({ error: 'Erro interno ao verificar academia' });
    }
});
exports.default = router;
