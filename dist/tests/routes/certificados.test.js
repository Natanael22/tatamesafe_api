"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const app_1 = __importDefault(require("../../app"));
const supabase_1 = __importDefault(require("../../lib/supabase"));
const supabaseMock = supabase_1.default;
function makeToken(sub, email) {
    const jwt = require('jsonwebtoken');
    return `Bearer ${jwt.sign({ sub, email }, process.env.JWT_SECRET, { expiresIn: '1h' })}`;
}
const ADMIN_TOKEN = makeToken('admin-auth-id-999', 'admin@tatamesafe.com');
const ALUNO_TOKEN = makeToken('aluno-auth-id-123', 'aluno@teste.com');
function mockFrom(data, error = null) {
    const chain = {
        select: vitest_1.vi.fn().mockReturnThis(),
        insert: vitest_1.vi.fn().mockReturnThis(),
        update: vitest_1.vi.fn().mockReturnThis(),
        eq: vitest_1.vi.fn().mockReturnThis(),
        order: vitest_1.vi.fn().mockReturnThis(),
        single: vitest_1.vi.fn().mockResolvedValue({ data, error }),
        maybeSingle: vitest_1.vi.fn().mockResolvedValue({ data, error }),
    };
    supabaseMock.from.mockReturnValueOnce(chain);
    return chain;
}
const mockCertificado = {
    id: 'cert-id-1',
    academia_id: 'academia-id-1',
    tipo: 'PROTECAO_MENORES',
    instrutor: 'Dr. Carlos Silva',
    emitido_em: new Date().toISOString(),
    validade_em: new Date('2027-12-31').toISOString(),
    url_pdf: null,
};
(0, vitest_1.describe)('GET /api/v1/certificados', () => {
    (0, vitest_1.beforeEach)(() => vitest_1.vi.clearAllMocks());
    (0, vitest_1.it)('lista certificados publicamente', async () => {
        const chain = {
            select: vitest_1.vi.fn().mockReturnThis(),
            order: vitest_1.vi.fn().mockResolvedValue({
                data: [{ ...mockCertificado, academia: { nome: 'Academia Teste' } }],
                error: null,
            }),
        };
        supabaseMock.from.mockReturnValueOnce(chain);
        const res = await (0, supertest_1.default)(app_1.default).get('/api/v1/certificados');
        (0, vitest_1.expect)(res.status).toBe(200);
        (0, vitest_1.expect)(Array.isArray(res.body)).toBe(true);
        (0, vitest_1.expect)(res.body[0]).toHaveProperty('tipo', 'PROTECAO_MENORES');
    });
});
(0, vitest_1.describe)('GET /api/v1/certificados/:id', () => {
    (0, vitest_1.beforeEach)(() => vitest_1.vi.clearAllMocks());
    (0, vitest_1.it)('retorna certificado por ID com dados da academia', async () => {
        mockFrom({
            ...mockCertificado,
            academia: { nome: 'Academia Teste', cnpj: '12.345.678/0001-90' },
        });
        const res = await (0, supertest_1.default)(app_1.default).get('/api/v1/certificados/cert-id-1');
        (0, vitest_1.expect)(res.status).toBe(200);
        (0, vitest_1.expect)(res.body).toHaveProperty('id', 'cert-id-1');
        (0, vitest_1.expect)(res.body).toHaveProperty('academia');
    });
    (0, vitest_1.it)('retorna 404 quando certificado não existe', async () => {
        mockFrom(null);
        const res = await (0, supertest_1.default)(app_1.default).get('/api/v1/certificados/id-inexistente');
        (0, vitest_1.expect)(res.status).toBe(404);
    });
});
(0, vitest_1.describe)('POST /api/v1/certificados', () => {
    (0, vitest_1.beforeEach)(() => vitest_1.vi.clearAllMocks());
    (0, vitest_1.it)('admin emite certificado com sucesso', async () => {
        // 1. busca user
        mockFrom({ tipo: 'ADMIN' });
        // 2. verifica academia
        mockFrom({ id: 'academia-id-1' });
        // 3. cria certificado
        mockFrom(mockCertificado);
        const res = await (0, supertest_1.default)(app_1.default)
            .post('/api/v1/certificados')
            .set('Authorization', ADMIN_TOKEN)
            .send({
            academia_id: 'academia-id-1',
            tipo: 'PROTECAO_MENORES',
            instrutor: 'Dr. Carlos Silva',
            validade_em: '2027-12-31T00:00:00.000Z',
        });
        (0, vitest_1.expect)(res.status).toBe(201);
        (0, vitest_1.expect)(res.body).toHaveProperty('tipo', 'PROTECAO_MENORES');
    });
    (0, vitest_1.it)('retorna 403 quando não é admin', async () => {
        mockFrom({ tipo: 'ALUNO' });
        const res = await (0, supertest_1.default)(app_1.default)
            .post('/api/v1/certificados')
            .set('Authorization', ALUNO_TOKEN)
            .send({
            academia_id: 'academia-id-1',
            tipo: 'INCLUSAO',
            instrutor: 'Prof. Ana',
            validade_em: '2027-01-01T00:00:00.000Z',
        });
        (0, vitest_1.expect)(res.status).toBe(403);
    });
    (0, vitest_1.it)('retorna 400 sem campos obrigatórios', async () => {
        mockFrom({ tipo: 'ADMIN' });
        const res = await (0, supertest_1.default)(app_1.default)
            .post('/api/v1/certificados')
            .set('Authorization', ADMIN_TOKEN)
            .send({ academia_id: 'academia-id-1' });
        (0, vitest_1.expect)(res.status).toBe(400);
    });
    (0, vitest_1.it)('retorna 404 quando academia não existe', async () => {
        // 1. busca user
        mockFrom({ tipo: 'ADMIN' });
        // 2. academia não encontrada
        mockFrom(null);
        const res = await (0, supertest_1.default)(app_1.default)
            .post('/api/v1/certificados')
            .set('Authorization', ADMIN_TOKEN)
            .send({
            academia_id: 'academia-inexistente',
            tipo: 'INCLUSAO',
            instrutor: 'Prof. Ana',
            validade_em: '2027-01-01T00:00:00.000Z',
        });
        (0, vitest_1.expect)(res.status).toBe(404);
    });
});
