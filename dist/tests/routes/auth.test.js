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
function mockFrom(data, error = null) {
    const chain = {
        select: vitest_1.vi.fn().mockReturnThis(),
        insert: vitest_1.vi.fn().mockReturnThis(),
        eq: vitest_1.vi.fn().mockReturnThis(),
        single: vitest_1.vi.fn().mockResolvedValue({ data, error }),
        maybeSingle: vitest_1.vi.fn().mockResolvedValue({ data, error }),
    };
    supabaseMock.from.mockReturnValueOnce(chain);
    return chain;
}
(0, vitest_1.describe)('Auth Endpoints', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.describe)('POST /api/v1/auth/signup/aluno', () => {
        (0, vitest_1.it)('cadastra um aluno com sucesso', async () => {
            // Mock do insert em User
            mockFrom({ id: 'user-id-1', auth_id: 'mock-auth-id', tipo: 'ALUNO', nome: 'Aluno Teste' });
            // Mock da chamada ao Supabase Auth
            supabaseMock.auth.signUp.mockResolvedValueOnce({
                data: { user: { id: 'mock-auth-id' }, session: { access_token: 'mock-token' } },
                error: null,
            });
            const res = await (0, supertest_1.default)(app_1.default)
                .post('/api/v1/auth/signup/aluno')
                .send({
                email: 'aluno@teste.com',
                password: 'password123',
                nome: 'Aluno Teste',
                telefone: '11999999999',
            });
            (0, vitest_1.expect)(res.status).toBe(201);
            (0, vitest_1.expect)(res.body.message).toContain('sucesso');
            (0, vitest_1.expect)(res.body.user).toHaveProperty('tipo', 'ALUNO');
            (0, vitest_1.expect)(res.body.session).toHaveProperty('access_token', 'mock-token');
        });
        (0, vitest_1.it)('retorna 400 se faltar campos obrigatórios', async () => {
            const res = await (0, supertest_1.default)(app_1.default)
                .post('/api/v1/auth/signup/aluno')
                .send({
                email: 'aluno@teste.com',
            });
            (0, vitest_1.expect)(res.status).toBe(400);
            (0, vitest_1.expect)(res.body).toHaveProperty('error');
        });
    });
    (0, vitest_1.describe)('POST /api/v1/auth/signup/academia', () => {
        (0, vitest_1.it)('cadastra uma academia com sucesso', async () => {
            // Mock 1: insert do User (tipo ACADEMIA)
            mockFrom({ id: 'user-id-2', auth_id: 'mock-auth-id', tipo: 'ACADEMIA' });
            // Mock 2: insert da Academia
            mockFrom({ id: 'academia-id-1', nome: 'Academia Teste', user_id: 'user-id-2' });
            // Mock da chamada ao Supabase Auth
            supabaseMock.auth.signUp.mockResolvedValueOnce({
                data: { user: { id: 'mock-auth-id' }, session: { access_token: 'mock-token' } },
                error: null,
            });
            const res = await (0, supertest_1.default)(app_1.default)
                .post('/api/v1/auth/signup/academia')
                .send({
                email: 'academia@teste.com',
                password: 'password123',
                nome: 'Academia Teste',
                telefone: '11888888888',
                cnpj: '12.345.678/0001-99',
                endereco: { rua: 'Rua A', numero: 100 },
            });
            (0, vitest_1.expect)(res.status).toBe(201);
            (0, vitest_1.expect)(res.body.message).toContain('sucesso');
            (0, vitest_1.expect)(res.body.user).toHaveProperty('tipo', 'ACADEMIA');
            (0, vitest_1.expect)(res.body.academia).toHaveProperty('id', 'academia-id-1');
        });
    });
    (0, vitest_1.describe)('POST /api/v1/auth/signin', () => {
        (0, vitest_1.it)('realiza login com sucesso', async () => {
            // Mock do login no Supabase Auth
            supabaseMock.auth.signInWithPassword.mockResolvedValueOnce({
                data: { session: { access_token: 'mock-token' }, user: { id: 'mock-auth-id' } },
                error: null,
            });
            // Mock do findUserByAuthId no backend
            mockFrom({ id: 'user-id-1', auth_id: 'mock-auth-id', tipo: 'ALUNO', nome: 'Aluno Teste' });
            const res = await (0, supertest_1.default)(app_1.default)
                .post('/api/v1/auth/signin')
                .send({
                email: 'aluno@teste.com',
                password: 'password123',
            });
            (0, vitest_1.expect)(res.status).toBe(200);
            (0, vitest_1.expect)(res.body.message).toContain('sucesso');
            (0, vitest_1.expect)(res.body.session).toHaveProperty('access_token', 'mock-token');
            (0, vitest_1.expect)(res.body.user).toHaveProperty('nome', 'Aluno Teste');
        });
        (0, vitest_1.it)('retorna 401 para credenciais inválidas', async () => {
            // Mock erro do Supabase Auth
            supabaseMock.auth.signInWithPassword.mockResolvedValueOnce({
                data: { session: null, user: null },
                error: { message: 'Invalid credentials' },
            });
            const res = await (0, supertest_1.default)(app_1.default)
                .post('/api/v1/auth/signin')
                .send({
                email: 'aluno@teste.com',
                password: 'wrongpassword',
            });
            (0, vitest_1.expect)(res.status).toBe(401);
            (0, vitest_1.expect)(res.body).toHaveProperty('error');
        });
    });
    (0, vitest_1.describe)('POST /api/v1/auth/signout', () => {
        (0, vitest_1.it)('encerra sessão com sucesso', async () => {
            supabaseMock.auth.admin.signOut.mockResolvedValueOnce({ error: null });
            const res = await (0, supertest_1.default)(app_1.default)
                .post('/api/v1/auth/signout')
                .set('Authorization', 'Bearer mock-jwt-token');
            (0, vitest_1.expect)(res.status).toBe(200);
            (0, vitest_1.expect)(res.body.message).toContain('sucesso');
        });
        (0, vitest_1.it)('retorna 400 sem token', async () => {
            const res = await (0, supertest_1.default)(app_1.default).post('/api/v1/auth/signout');
            (0, vitest_1.expect)(res.status).toBe(400);
            (0, vitest_1.expect)(res.body).toHaveProperty('error');
        });
    });
});
