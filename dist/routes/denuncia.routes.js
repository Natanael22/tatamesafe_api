"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const multer_1 = __importDefault(require("multer"));
const supabase_1 = __importDefault(require("../lib/supabase"));
const supabase_2 = require("../lib/supabase");
const rateLimiter_1 = require("../middlewares/rateLimiter");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const storage_1 = require("../lib/storage");
const logger_1 = __importDefault(require("../lib/logger"));
const router = (0, express_1.Router)();
const connection = new ioredis_1.default(process.env.REDIS_URL || 'redis://localhost:6379');
const denunciaQueue = new bullmq_1.Queue('denuncia-queue', { connection });
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // Limite de 10MB
});
// Pública (com rate limit) - Registrar denúncia anônima (com anexo de evidência opcional)
router.post('/', upload.single('evidencia'), rateLimiter_1.denunciaLimiter, async (req, res) => {
    try {
        const { tipo, descricao_enc, academia_ref, urgencia, envolve_menor } = req.body;
        if (!tipo || !descricao_enc) {
            return res.status(400).json({ error: 'Campos obrigatórios: tipo, descricao_enc' });
        }
        // Chama a função SECURITY DEFINER via supabase.rpc() (schema tatame, mas a função acessa tatame_vault)
        const bufferDesc = Buffer.from(descricao_enc, 'base64');
        const { data, error } = await supabase_1.default.rpc('inserir_denuncia', {
            p_tipo: tipo,
            p_descricao_enc: bufferDesc.toString('hex'), // PostgreSQL aceita hex para BYTEA via RPC
            p_academia_ref: academia_ref || null,
            p_urgencia: urgencia || 'MEDIA',
            p_envolve_menor: envolve_menor === 'true' || envolve_menor === true,
        });
        if (error)
            throw error;
        const protocolo = data;
        if (!protocolo)
            throw new Error('Falha ao gerar protocolo');
        // Se houver arquivo de evidência, faz o upload para o Supabase Storage
        if (req.file) {
            const file = req.file;
            // Busca o ID da denúncia recém-criada
            const { data: denuncia, error: findError } = await supabase_2.supabaseVault
                .from('Denuncia')
                .select('id')
                .eq('protocolo', protocolo)
                .single();
            if (findError || !denuncia) {
                logger_1.default.error(findError, `Erro ao buscar ID da denúncia para anexar evidência (${protocolo})`);
            }
            else {
                const fileExt = file.originalname.split('.').pop() || '';
                const filePath = `${denuncia.id}/${Date.now()}_evidencia.${fileExt}`;
                // Faz upload para o bucket privado 'denuncias'
                await storage_1.StorageService.uploadFile('denuncias', filePath, file.buffer, file.mimetype);
                // Insere na tabela de evidências
                const sizeKb = Math.round(file.size / 1024);
                const { error: evidenceError } = await supabase_2.supabaseVault
                    .from('DenunciaEvidencia')
                    .insert({
                    denuncia_id: denuncia.id,
                    s3_key: filePath,
                    tipo_mime: file.mimetype,
                    tamanho_kb: sizeKb,
                });
                if (evidenceError) {
                    logger_1.default.error(evidenceError, `Erro ao registrar evidência no banco para denúncia ${denuncia.id}`);
                }
            }
        }
        // Adiciona job na fila BullMQ
        await denunciaQueue.add('denuncia.nova', {
            protocolo,
            urgencia: urgencia || 'MEDIA',
            envolve_menor: envolve_menor === 'true' || envolve_menor === true,
        });
        res.status(201).json({ protocolo });
    }
    catch (error) {
        logger_1.default.error(error, 'Erro ao registrar denúncia');
        res.status(500).json({ error: 'Erro interno ao registrar denúncia' });
    }
});
// Privada (Admin) - Listagem de denúncias
router.get('/admin', auth_middleware_1.requireAuth, async (req, res) => {
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
        const { data: denuncias, error } = await supabase_2.supabaseVault
            .from('Denuncia')
            .select('*, historico:DenunciaHistorico(*), evidencias:DenunciaEvidencia(*)')
            .order('criado_em', { ascending: false });
        if (error)
            throw error;
        // Para cada evidência de cada denúncia, gera uma URL assinada (válida por 15 minutos)
        const denunciasComUrls = await Promise.all((denuncias || []).map(async (denuncia) => {
            const evidenciasComSignedUrls = await Promise.all((denuncia.evidencias || []).map(async (ev) => {
                try {
                    const url = await storage_1.StorageService.createSignedUrl('denuncias', ev.s3_key);
                    return { ...ev, url };
                }
                catch (err) {
                    logger_1.default.error(err, `Erro ao gerar URL assinada para a evidência ${ev.id}`);
                    return { ...ev, url: null };
                }
            }));
            return { ...denuncia, evidencias: evidenciasComSignedUrls };
        }));
        res.json(denunciasComUrls);
    }
    catch (error) {
        logger_1.default.error(error, 'Erro interno ao listar denúncias');
        res.status(500).json({ error: 'Erro interno ao listar denúncias' });
    }
});
// Privada (Admin) - Atualização de status da denúncia
router.patch('/admin/:id/status', auth_middleware_1.requireAuth, async (req, res) => {
    try {
        const auth_id = req.user?.sub;
        const { data: user } = await supabase_1.default
            .from('User')
            .select('id, tipo')
            .eq('auth_id', auth_id)
            .maybeSingle();
        if (!user || user.tipo !== 'ADMIN') {
            return res.status(403).json({ error: 'Acesso negado: Requer privilégios de administrador' });
        }
        const { id } = req.params;
        const { status, nota_interna } = req.body;
        if (!status) {
            return res.status(400).json({ error: 'O novo status é obrigatório' });
        }
        // Verifica se a denúncia existe
        const { data: denuncia } = await supabase_2.supabaseVault
            .from('Denuncia')
            .select('id')
            .eq('id', String(id))
            .maybeSingle();
        if (!denuncia) {
            return res.status(404).json({ error: 'Denúncia não encontrada' });
        }
        // Chama a função SQL atômica que atualiza status E registra histórico em uma transação
        const { data: result, error } = await supabase_1.default.rpc('atualizar_status_denuncia', {
            p_id: String(id),
            p_status: status,
            p_operador_id: user.id,
            p_nota_interna: nota_interna || null,
        });
        if (error)
            throw error;
        res.json(result);
    }
    catch (error) {
        logger_1.default.error(error, 'Erro interno ao atualizar status da denúncia');
        res.status(500).json({ error: 'Erro interno ao atualizar status da denúncia' });
    }
});
// Pública - Consulta status por protocolo
router.get('/status/:protocolo', async (req, res) => {
    try {
        const { protocolo } = req.params;
        const { data: denuncia, error } = await supabase_2.supabaseVault
            .from('Denuncia')
            .select('status, atualizado_em')
            .eq('protocolo', protocolo)
            .maybeSingle();
        if (error)
            throw error;
        if (!denuncia) {
            return res.status(404).json({ error: 'Protocolo não encontrado' });
        }
        res.json({
            status: denuncia.status,
            atualizado_em: denuncia.atualizado_em,
            mensagem_publica: 'Denúncia recebida e em processamento',
        });
    }
    catch (error) {
        logger_1.default.error(error, 'Erro interno ao consultar status da denúncia');
        res.status(500).json({ error: 'Erro interno ao consultar status' });
    }
});
exports.default = router;
