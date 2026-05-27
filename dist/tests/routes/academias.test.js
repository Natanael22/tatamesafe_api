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
// Helper: configura o que supabase.from(table) retorna para um único chamado
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
const mockAcademia = {
    id: 'academia-id-1',
    user_id: 'aluno-id',
    nome: 'Academia Teste',
    cnpj: '12.345.678/0001-90',
    endereco: { cidade: 'São Paulo' },
    nivel_selo: 'NENHUM',
    verificada: false,
    ativa: true,
    foto_url: null,
};
(0, vitest_1.describe)('GET /api/v1/academias', () => {
    (0, vitest_1.beforeEach)(() => vitest_1.vi.clearAllMocks());
    (0, vitest_1.it)('retorna lista de academias ativas', async () => {
        const chain = {
            select: vitest_1.vi.fn().mockReturnThis(),
            eq: vitest_1.vi.fn().mockResolvedValue({ data: [mockAcademia], error: null }),
        };
        supabaseMock.from.mockReturnValueOnce(chain);
        const res = await (0, supertest_1.default)(app_1.default).get('/api/v1/academias');
        (0, vitest_1.expect)(res.status).toBe(200);
        (0, vitest_1.expect)(Array.isArray(res.body)).toBe(true);
        (0, vitest_1.expect)(res.body[0]).toHaveProperty('nome', 'Academia Teste');
    });
    (0, vitest_1.it)('retorna lista vazia quando não há academias', async () => {
        const chain = {
            select: vitest_1.vi.fn().mockReturnThis(),
            eq: vitest_1.vi.fn().mockResolvedValue({ data: [], error: null }),
        };
        supabaseMock.from.mockReturnValueOnce(chain);
        const res = await (0, supertest_1.default)(app_1.default).get('/api/v1/academias');
        (0, vitest_1.expect)(res.status).toBe(200);
        (0, vitest_1.expect)(res.body).toEqual([]);
    });
});
(0, vitest_1.describe)('GET /api/v1/academias/:id', () => {
    (0, vitest_1.beforeEach)(() => vitest_1.vi.clearAllMocks());
    (0, vitest_1.it)('retorna academia por ID', async () => {
        mockFrom({ ...mockAcademia, certificados: [], avaliacoes: [] });
        const res = await (0, supertest_1.default)(app_1.default).get('/api/v1/academias/academia-id-1');
        (0, vitest_1.expect)(res.status).toBe(200);
        (0, vitest_1.expect)(res.body).toHaveProperty('id', 'academia-id-1');
    });
    (0, vitest_1.it)('retorna 404 quando academia não existe', async () => {
        mockFrom(null);
        const res = await (0, supertest_1.default)(app_1.default).get('/api/v1/academias/id-inexistente');
        (0, vitest_1.expect)(res.status).toBe(404);
    });
});
(0, vitest_1.describe)('POST /api/v1/academias', () => {
    (0, vitest_1.beforeEach)(() => vitest_1.vi.clearAllMocks());
    (0, vitest_1.it)('cria academia com token válido', async () => {
        // 1. findOrCreateUser → busca usuário por auth_id
        mockFrom({ id: 'aluno-id', auth_id: 'aluno-auth-id-123', tipo: 'ALUNO' });
        // 2. busca academia existente por user_id
        mockFrom(null);
        // 3. insere nova academia
        mockFrom(mockAcademia);
        const res = await (0, supertest_1.default)(app_1.default)
            .post('/api/v1/academias')
            .set('Authorization', ALUNO_TOKEN)
            .send({ nome: 'Academia Teste', endereco: { cidade: 'SP' } });
        (0, vitest_1.expect)(res.status).toBe(201);
        (0, vitest_1.expect)(res.body).toHaveProperty('nome', 'Academia Teste');
    });
    (0, vitest_1.it)('retorna 401 sem token', async () => {
        const res = await (0, supertest_1.default)(app_1.default)
            .post('/api/v1/academias')
            .send({ nome: 'Academia Sem Token' });
        (0, vitest_1.expect)(res.status).toBe(401);
    });
    (0, vitest_1.it)('retorna 400 sem campo nome', async () => {
        const res = await (0, supertest_1.default)(app_1.default)
            .post('/api/v1/academias')
            .set('Authorization', ALUNO_TOKEN)
            .send({ endereco: { cidade: 'SP' } });
        (0, vitest_1.expect)(res.status).toBe(400);
        (0, vitest_1.expect)(res.body).toHaveProperty('error');
    });
    (0, vitest_1.it)('retorna 400 quando usuário já tem academia', async () => {
        // 1. usuário encontrado
        mockFrom({ id: 'aluno-id', auth_id: 'aluno-auth-id-123', tipo: 'ALUNO' });
        // 2. academia já existe
        mockFrom({ id: 'academia-existente' });
        const res = await (0, supertest_1.default)(app_1.default)
            .post('/api/v1/academias')
            .set('Authorization', ALUNO_TOKEN)
            .send({ nome: 'Segunda Academia' });
        (0, vitest_1.expect)(res.status).toBe(400);
        (0, vitest_1.expect)(res.body.error).toContain('já possui');
    });
});
(0, vitest_1.describe)('POST /api/v1/academias/:id/verificar', () => {
    (0, vitest_1.beforeEach)(() => vitest_1.vi.clearAllMocks());
    (0, vitest_1.it)('admin verifica academia com sucesso', async () => {
        // 1. busca user por auth_id (admin)
        mockFrom({ tipo: 'ADMIN' });
        // 2. busca academia atual para pegar valores existentes
        mockFrom({ verificada: false, nivel_selo: 'NENHUM' });
        // 3. update da academia
        mockFrom({ ...mockAcademia, verificada: true, nivel_selo: 'OURO' });
        const res = await (0, supertest_1.default)(app_1.default)
            .post('/api/v1/academias/academia-id-1/verificar')
            .set('Authorization', ADMIN_TOKEN)
            .send({ verificada: true, nivel_selo: 'OURO' });
        (0, vitest_1.expect)(res.status).toBe(200);
        (0, vitest_1.expect)(res.body.academia).toHaveProperty('verificada', true);
    });
    (0, vitest_1.it)('retorna 403 quando não é admin', async () => {
        mockFrom({ tipo: 'ALUNO' });
        const res = await (0, supertest_1.default)(app_1.default)
            .post('/api/v1/academias/academia-id-1/verificar')
            .set('Authorization', ALUNO_TOKEN)
            .send({ verificada: true });
        (0, vitest_1.expect)(res.status).toBe(403);
    });
});
