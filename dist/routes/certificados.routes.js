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
    limits: { fileSize: 10 * 1024 * 1024 }, // Limite de 10MB para PDFs
});
// Pública - Listar certificados (opcionalmente filtrado por academia)
router.get('/', async (req, res) => {
    try {
        const { academia_id } = req.query;
        let query = supabase_1.default
            .from('Certificado')
            .select('*, academia:Academia(nome)')
            .order('emitido_em', { ascending: false });
        if (academia_id) {
            query = query.eq('academia_id', String(academia_id));
        }
        const { data, error } = await query;
        if (error)
            throw error;
        res.json(data);
    }
    catch (error) {
        logger_1.default.error(error, 'Erro interno ao buscar certificados');
        res.status(500).json({ error: 'Erro interno ao buscar certificados' });
    }
});
// Pública - Validação/Consulta de um certificado específico
router.get('/:id', async (req, res) => {
    try {
        const { data, error } = await supabase_1.default
            .from('Certificado')
            .select('*, academia:Academia(nome, cnpj)')
            .eq('id', String(req.params.id))
            .maybeSingle();
        if (error)
            throw error;
        if (!data)
            return res.status(404).json({ error: 'Certificado não encontrado' });
        res.json(data);
    }
    catch (error) {
        logger_1.default.error(error, 'Erro interno ao consultar certificado específico');
        res.status(500).json({ error: 'Erro interno ao consultar certificado' });
    }
});
// Privada (Admin) - Emissão de novo certificado (com upload opcional de PDF)
router.post('/', upload.single('pdf'), auth_middleware_1.requireAuth, async (req, res) => {
    try {
        const auth_id = req.user?.sub;
        const { data: user } = await supabase_1.default
            .from('User')
            .select('tipo')
            .eq('auth_id', auth_id)
            .maybeSingle();
        if (!user || user.tipo !== 'ADMIN') {
            return res.status(403).json({ error: 'Acesso negado: Requer privilégios de administrador' });
        }
        const { academia_id, tipo, instrutor, validade_em, url_pdf } = req.body;
        if (!academia_id || !tipo || !instrutor || !validade_em) {
            return res.status(400).json({ error: 'Campos obrigatórios: academia_id, tipo, instrutor, validade_em' });
        }
        const { data: academia } = await supabase_1.default
            .from('Academia')
            .select('id')
            .eq('id', String(academia_id))
            .maybeSingle();
        if (!academia) {
            return res.status(404).json({ error: 'Academia não encontrada' });
        }
        // Fazer upload do PDF para o bucket público 'certificados'
        let finalUrlPdf = url_pdf || null;
        if (req.file) {
            const file = req.file;
            const fileExt = file.originalname.split('.').pop() || '';
            const filePath = `${academia_id}/${Date.now()}_certificado.${fileExt}`;
            await storage_1.StorageService.uploadFile('certificados', filePath, file.buffer, file.mimetype);
            finalUrlPdf = storage_1.StorageService.getPublicUrl('certificados', filePath);
        }
        const { data: certificado, error } = await supabase_1.default
            .from('Certificado')
            .insert({
            academia_id: String(academia_id),
            tipo,
            instrutor,
            validade_em: new Date(validade_em).toISOString(),
            url_pdf: finalUrlPdf,
        })
            .select()
            .single();
        if (error)
            throw error;
        res.status(201).json(certificado);
    }
    catch (error) {
        logger_1.default.error(error, 'Erro ao emitir novo certificado');
        res.status(500).json({ error: 'Erro ao emitir certificado' });
    }
});
exports.default = router;
