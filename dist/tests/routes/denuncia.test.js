"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const app_1 = __importDefault(require("../../app"));
const supabase_1 = __importDefault(require("../../lib/supabase"));
const supabase_2 = require("../../lib/supabase");
const supabaseMock = supabase_1.default;
const supabaseVaultMock = supabase_2.supabaseVault;
function makeToken(sub, email) {
    const jwt = require('jsonwebtoken');
    return `Bearer ${jwt.sign({ sub, email }, process.env.JWT_SECRET, { expiresIn: '1h' })}`;
}
const ADMIN_TOKEN = makeToken('admin-auth-id-999', 'admin@tatamesafe.com');
const ALUNO_TOKEN = makeToken('aluno-auth-id-123', 'aluno@teste.com');
function mockFrom(mock, data, error = null) {
    const chain = {
        select: vitest_1.vi.fn().mockReturnThis(),
        insert: vitest_1.vi.fn().mockReturnThis(),
        update: vitest_1.vi.fn().mockReturnThis(),
        eq: vitest_1.vi.fn().mockReturnThis(),
        order: vitest_1.vi.fn().mockReturnThis(),
        single: vitest_1.vi.fn().mockResolvedValue({ data, error }),
        maybeSingle: vitest_1.vi.fn().mockResolvedValue({ data, error }),
    };
    mock.from.mockReturnValueOnce(chain);
    return chain;
}
const mockDenuncia = {
    id: 'denuncia-id-1',
    protocolo: 'TS-2026-ABCDEF',
    tipo: 'ASSEDIO_MORAL',
    status: 'RECEBIDA',
    urgencia: 'MEDIA',
    envolve_menor: false,
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
    historico: [],
};
(0, vitest_1.describe)('POST /api/v1/denuncia', () => {
    (0, vitest_1.beforeEach)(() => vitest_1.vi.clearAllMocks());
    (0, vitest_1.it)('registra denúncia anônima com sucesso', async () => {
        supabaseMock.rpc.mockResolvedValueOnce({ data: 'TS-2026-ABCDEF', error: null });
        const res = await (0, supertest_1.default)(app_1.default)
            .post('/api/v1/denuncia')
            .send({
            tipo: 'ASSEDIO_MORAL',
            descricao_enc: Buffer.from('texto secreto').toString('base64'),
            urgencia: 'MEDIA',
            envolve_menor: false,
        });
        (0, vitest_1.expect)(res.status).toBe(201);
        (0, vitest_1.expect)(res.body).toHaveProperty('protocolo');
        (0, vitest_1.expect)(res.body.protocolo).toMatch(/^TS-/);
    });
    (0, vitest_1.it)('retorna 500 quando rpc falha', async () => {
        supabaseMock.rpc.mockResolvedValueOnce({ data: null, error: new Error('DB error') });
        const res = await (0, supertest_1.default)(app_1.default)
            .post('/api/v1/denuncia')
            .send({
            tipo: 'VIOLENCIA',
            descricao_enc: Buffer.from('texto').toString('base64'),
            urgencia: 'ALTA',
            envolve_menor: true,
        });
        (0, vitest_1.expect)(res.status).toBe(500);
    });
});
(0, vitest_1.describe)('GET /api/v1/denuncia/status/:protocolo', () => {
    (0, vitest_1.beforeEach)(() => vitest_1.vi.clearAllMocks());
    (0, vitest_1.it)('retorna status público de uma denúncia', async () => {
        mockFrom(supabaseVaultMock, { status: 'RECEBIDA', atualizado_em: new Date().toISOString() });
        const res = await (0, supertest_1.default)(app_1.default).get('/api/v1/denuncia/status/TS-2026-ABCDEF');
        (0, vitest_1.expect)(res.status).toBe(200);
        (0, vitest_1.expect)(res.body).toHaveProperty('status', 'RECEBIDA');
        (0, vitest_1.expect)(res.body).toHaveProperty('mensagem_publica');
    });
    (0, vitest_1.it)('retorna 404 para protocolo inexistente', async () => {
        mockFrom(supabaseVaultMock, null);
        const res = await (0, supertest_1.default)(app_1.default).get('/api/v1/denuncia/status/TS-0000-XXXXXX');
        (0, vitest_1.expect)(res.status).toBe(404);
    });
});
(0, vitest_1.describe)('GET /api/v1/denuncia/admin', () => {
    (0, vitest_1.beforeEach)(() => vitest_1.vi.clearAllMocks());
    (0, vitest_1.it)('admin lista denúncias com sucesso', async () => {
        // 1. busca user por auth_id
        mockFrom(supabaseMock, { tipo: 'ADMIN' });
        // 2. lista denúncias do vault
        const vaultChain = {
            select: vitest_1.vi.fn().mockReturnThis(),
            order: vitest_1.vi.fn().mockResolvedValue({ data: [mockDenuncia], error: null }),
        };
        supabaseVaultMock.from.mockReturnValueOnce(vaultChain);
        const res = await (0, supertest_1.default)(app_1.default)
            .get('/api/v1/denuncia/admin')
            .set('Authorization', ADMIN_TOKEN);
        (0, vitest_1.expect)(res.status).toBe(200);
        (0, vitest_1.expect)(Array.isArray(res.body)).toBe(true);
        (0, vitest_1.expect)(res.body[0]).toHaveProperty('protocolo', 'TS-2026-ABCDEF');
    });
    (0, vitest_1.it)('retorna 403 quando não é admin', async () => {
        mockFrom(supabaseMock, { tipo: 'ALUNO' });
        const res = await (0, supertest_1.default)(app_1.default)
            .get('/api/v1/denuncia/admin')
            .set('Authorization', ALUNO_TOKEN);
        (0, vitest_1.expect)(res.status).toBe(403);
    });
    (0, vitest_1.it)('retorna 401 sem token', async () => {
        const res = await (0, supertest_1.default)(app_1.default).get('/api/v1/denuncia/admin');
        (0, vitest_1.expect)(res.status).toBe(401);
    });
});
(0, vitest_1.describe)('PATCH /api/v1/denuncia/admin/:id/status', () => {
    (0, vitest_1.beforeEach)(() => vitest_1.vi.clearAllMocks());
    (0, vitest_1.it)('admin atualiza status com sucesso e registra histórico', async () => {
        // 1. busca user
        mockFrom(supabaseMock, { id: 'admin-id', tipo: 'ADMIN' });
        // 2. verifica se denúncia existe
        mockFrom(supabaseVaultMock, { id: 'denuncia-id-1' });
        // 3. rpc atualizar_status_denuncia
        supabaseMock.rpc.mockResolvedValueOnce({
            data: {
                denuncia: { ...mockDenuncia, status: 'EM_APURACAO' },
                historico: { id: 'hist-id', status_de: 'RECEBIDA', status_para: 'EM_APURACAO' },
            },
            error: null,
        });
        const res = await (0, supertest_1.default)(app_1.default)
            .patch('/api/v1/denuncia/admin/denuncia-id-1/status')
            .set('Authorization', ADMIN_TOKEN)
            .send({ status: 'EM_APURACAO', nota_interna: 'Caso prioritário' });
        (0, vitest_1.expect)(res.status).toBe(200);
        (0, vitest_1.expect)(res.body.denuncia).toHaveProperty('status', 'EM_APURACAO');
        (0, vitest_1.expect)(res.body).toHaveProperty('historico');
    });
    (0, vitest_1.it)('retorna 400 sem campo status', async () => {
        mockFrom(supabaseMock, { id: 'admin-id', tipo: 'ADMIN' });
        const res = await (0, supertest_1.default)(app_1.default)
            .patch('/api/v1/denuncia/admin/denuncia-id-1/status')
            .set('Authorization', ADMIN_TOKEN)
            .send({});
        (0, vitest_1.expect)(res.status).toBe(400);
    });
    (0, vitest_1.it)('retorna 404 quando denúncia não existe', async () => {
        mockFrom(supabaseMock, { id: 'admin-id', tipo: 'ADMIN' });
        mockFrom(supabaseVaultMock, null);
        const res = await (0, supertest_1.default)(app_1.default)
            .patch('/api/v1/denuncia/admin/id-inexistente/status')
            .set('Authorization', ADMIN_TOKEN)
            .send({ status: 'ENCERRADA' });
        (0, vitest_1.expect)(res.status).toBe(404);
    });
});
