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
const mockAvaliacao = {
    id: 'aval-id-1',
    academia_id: 'academia-id-1',
    user_id: 'aluno-id',
    nota: 5,
    comentario: 'Excelente academia!',
    categorias: { anonima: false },
    criado_em: new Date().toISOString(),
};
(0, vitest_1.describe)('GET /api/v1/avaliacoes', () => {
    (0, vitest_1.beforeEach)(() => vitest_1.vi.clearAllMocks());
    (0, vitest_1.it)('lista avaliações públicas', async () => {
        const chain = {
            select: vitest_1.vi.fn().mockReturnThis(),
            order: vitest_1.vi.fn().mockResolvedValue({
                data: [{ ...mockAvaliacao, user: { nome: 'João Silva' } }],
                error: null,
            }),
        };
        supabaseMock.from.mockReturnValueOnce(chain);
        const res = await (0, supertest_1.default)(app_1.default).get('/api/v1/avaliacoes');
        (0, vitest_1.expect)(res.status).toBe(200);
        (0, vitest_1.expect)(Array.isArray(res.body)).toBe(true);
        (0, vitest_1.expect)(res.body[0]).toHaveProperty('nota', 5);
    });
    (0, vitest_1.it)('oculta nome do autor quando avaliação é anônima', async () => {
        const chain = {
            select: vitest_1.vi.fn().mockReturnThis(),
            order: vitest_1.vi.fn().mockResolvedValue({
                data: [{ ...mockAvaliacao, categorias: { anonima: true }, user: { nome: 'João Silva' } }],
                error: null,
            }),
        };
        supabaseMock.from.mockReturnValueOnce(chain);
        const res = await (0, supertest_1.default)(app_1.default).get('/api/v1/avaliacoes');
        (0, vitest_1.expect)(res.status).toBe(200);
        (0, vitest_1.expect)(res.body[0].autor).toBe('Anônimo');
    });
    (0, vitest_1.it)('exibe nome do autor quando avaliação não é anônima', async () => {
        const chain = {
            select: vitest_1.vi.fn().mockReturnThis(),
            order: vitest_1.vi.fn().mockResolvedValue({
                data: [{ ...mockAvaliacao, categorias: { anonima: false }, user: { nome: 'João Silva' } }],
                error: null,
            }),
        };
        supabaseMock.from.mockReturnValueOnce(chain);
        const res = await (0, supertest_1.default)(app_1.default).get('/api/v1/avaliacoes');
        (0, vitest_1.expect)(res.status).toBe(200);
        (0, vitest_1.expect)(res.body[0].autor).toBe('João Silva');
    });
});
(0, vitest_1.describe)('POST /api/v1/avaliacoes', () => {
    (0, vitest_1.beforeEach)(() => vitest_1.vi.clearAllMocks());
    (0, vitest_1.it)('cria avaliação com sucesso', async () => {
        // 1. busca user por auth_id
        mockFrom({ id: 'aluno-id' });
        // 2. verifica avaliação existente
        mockFrom(null);
        // 3. cria nova avaliação
        mockFrom(mockAvaliacao);
        const res = await (0, supertest_1.default)(app_1.default)
            .post('/api/v1/avaliacoes')
            .set('Authorization', ALUNO_TOKEN)
            .send({ academia_id: 'academia-id-1', nota: 5, comentario: 'Ótima!' });
        (0, vitest_1.expect)(res.status).toBe(201);
        (0, vitest_1.expect)(res.body).toHaveProperty('nota', 5);
    });
    (0, vitest_1.it)('atualiza avaliação existente (1 avaliação por academia por usuário)', async () => {
        // 1. busca user
        mockFrom({ id: 'aluno-id' });
        // 2. avaliação já existe
        mockFrom({ id: 'aval-id-1' });
        // 3. update
        mockFrom({ ...mockAvaliacao, nota: 3 });
        const res = await (0, supertest_1.default)(app_1.default)
            .post('/api/v1/avaliacoes')
            .set('Authorization', ALUNO_TOKEN)
            .send({ academia_id: 'academia-id-1', nota: 3, comentario: 'Melhorou um pouco' });
        (0, vitest_1.expect)(res.status).toBe(201);
    });
    (0, vitest_1.it)('retorna 400 com nota fora do intervalo 1-5', async () => {
        mockFrom({ id: 'aluno-id' });
        const res = await (0, supertest_1.default)(app_1.default)
            .post('/api/v1/avaliacoes')
            .set('Authorization', ALUNO_TOKEN)
            .send({ academia_id: 'academia-id-1', nota: 6 });
        (0, vitest_1.expect)(res.status).toBe(400);
        (0, vitest_1.expect)(res.body.error).toContain('1 e 5');
    });
    (0, vitest_1.it)('retorna 400 sem campos obrigatórios', async () => {
        mockFrom({ id: 'aluno-id' });
        const res = await (0, supertest_1.default)(app_1.default)
            .post('/api/v1/avaliacoes')
            .set('Authorization', ALUNO_TOKEN)
            .send({ comentario: 'Sem nota nem academia' });
        (0, vitest_1.expect)(res.status).toBe(400);
    });
    (0, vitest_1.it)('retorna 401 sem token', async () => {
        const res = await (0, supertest_1.default)(app_1.default)
            .post('/api/v1/avaliacoes')
            .send({ academia_id: 'academia-id-1', nota: 4 });
        (0, vitest_1.expect)(res.status).toBe(401);
    });
});
