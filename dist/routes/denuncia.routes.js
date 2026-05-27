"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const supabase_1 = __importDefault(require("../lib/supabase"));
const supabase_2 = require("../lib/supabase");
const rateLimiter_1 = require("../middlewares/rateLimiter");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const logger_1 = __importDefault(require("../lib/logger"));
const router = (0, express_1.Router)();
const connection = new ioredis_1.default(process.env.REDIS_URL || 'redis://localhost:6379');
const denunciaQueue = new bullmq_1.Queue('denuncia-queue', { connection });
// Pública (com rate limit) - Registrar denúncia anônima
router.post('/', rateLimiter_1.denunciaLimiter, async (req, res) => {
    try {
        const { tipo, descricao_enc, academia_ref, urgencia, envolve_menor } = req.body;
        // Chama a função SECURITY DEFINER via supabase.rpc() (schema tatame, mas a função acessa tatame_vault)
        // O parâmetro descricao_enc chega como base64 e a função espera BYTEA — passamos a string base64 decodificada
        const bufferDesc = Buffer.from(descricao_enc, 'base64');
        const { data, error } = await supabase_1.default.rpc('inserir_denuncia', {
            p_tipo: tipo,
            p_descricao_enc: bufferDesc.toString('hex'), // PostgreSQL aceita hex para BYTEA via RPC
            p_academia_ref: academia_ref || null,
            p_urgencia: urgencia || 'MEDIA',
            p_envolve_menor: envolve_menor || false,
        });
        if (error)
            throw error;
        const protocolo = data;
        if (!protocolo)
            throw new Error('Falha ao gerar protocolo');
        // Adiciona job na fila BullMQ
        await denunciaQueue.add('denuncia.nova', {
            protocolo,
            urgencia,
            envolve_menor,
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
            .select('*, historico:DenunciaHistorico(*)')
            .order('criado_em', { ascending: false });
        if (error)
            throw error;
        res.json(denuncias);
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
