"use strict";
/**
 * Setup global para todos os testes.
 * - Mocka o módulo do Supabase para evitar conexão real com o banco.
 * - Mocka o Redis/BullMQ para evitar dependência de serviços externos.
 * - Configura variáveis de ambiente necessárias.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
// Variáveis de ambiente para testes
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key';
process.env.PORT = '3001';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
// Função que cria um builder do Supabase encadeável (fluent API mock)
function createSupabaseQueryMock() {
    const builder = {
        _data: null,
        _error: null,
        select: vitest_1.vi.fn().mockReturnThis(),
        insert: vitest_1.vi.fn().mockReturnThis(),
        update: vitest_1.vi.fn().mockReturnThis(),
        eq: vitest_1.vi.fn().mockReturnThis(),
        order: vitest_1.vi.fn().mockReturnThis(),
        single: vitest_1.vi.fn().mockImplementation(function () {
            return Promise.resolve({ data: this._data, error: this._error });
        }),
        maybeSingle: vitest_1.vi.fn().mockImplementation(function () {
            return Promise.resolve({ data: this._data, error: this._error });
        }),
        // Permite que os testes configurem o dado retornado
        __setData(data) {
            this._data = data;
            return this;
        },
        __setError(error) {
            this._error = error;
            return this;
        },
    };
    // Faz todos os métodos retornarem o próprio builder
    Object.keys(builder).forEach((key) => {
        if (typeof builder[key] === 'function' && !key.startsWith('__') && key !== 'single' && key !== 'maybeSingle') {
            builder[key] = vitest_1.vi.fn().mockReturnValue(builder);
        }
    });
    return builder;
}
// Mock do Supabase — cria um from(), rpc(), auth e storage encadeáveis com vi.fn()
function createSupabaseMock() {
    return {
        from: vitest_1.vi.fn().mockImplementation(() => createSupabaseQueryMock()),
        rpc: vitest_1.vi.fn().mockResolvedValue({ data: null, error: null }),
        auth: {
            signUp: vitest_1.vi.fn().mockResolvedValue({ data: { user: { id: 'mock-auth-id' }, session: { access_token: 'mock-token' } }, error: null }),
            signInWithPassword: vitest_1.vi.fn().mockResolvedValue({ data: { session: { access_token: 'mock-token' }, user: { id: 'mock-auth-id' } }, error: null }),
            signOut: vitest_1.vi.fn().mockResolvedValue({ error: null }),
            admin: {
                signOut: vitest_1.vi.fn().mockResolvedValue({ error: null }),
                deleteUser: vitest_1.vi.fn().mockResolvedValue({ error: null }),
            },
        },
        storage: {
            from: vitest_1.vi.fn().mockReturnValue({
                upload: vitest_1.vi.fn().mockResolvedValue({ data: { path: 'mock-path' }, error: null }),
                getPublicUrl: vitest_1.vi.fn().mockReturnValue({ data: { publicUrl: 'http://mock-public-url' } }),
                createSignedUrl: vitest_1.vi.fn().mockResolvedValue({ data: { signedUrl: 'http://mock-signed-url' }, error: null }),
            }),
            getBucket: vitest_1.vi.fn().mockResolvedValue({ data: { name: 'mock-bucket' }, error: null }),
            createBucket: vitest_1.vi.fn().mockResolvedValue({ data: {}, error: null }),
        },
    };
}
vitest_1.vi.mock('../lib/supabase', () => ({
    default: createSupabaseMock(),
    supabaseVault: createSupabaseMock(),
}));
// Mock global do Redis/BullMQ para evitar conexões reais
vitest_1.vi.mock('ioredis', () => {
    const RedisMock = vitest_1.vi.fn().mockImplementation(function () {
        return {
            get: vitest_1.vi.fn(),
            set: vitest_1.vi.fn(),
            del: vitest_1.vi.fn(),
            on: vitest_1.vi.fn(),
            quit: vitest_1.vi.fn(),
        };
    });
    return { default: RedisMock };
});
vitest_1.vi.mock('bullmq', () => {
    const QueueMock = vitest_1.vi.fn().mockImplementation(function () {
        return {
            add: vitest_1.vi.fn().mockResolvedValue({}),
            close: vitest_1.vi.fn(),
        };
    });
    return { Queue: QueueMock, Worker: vitest_1.vi.fn() };
});
// Mock do rate limiter para não bloquear testes
vitest_1.vi.mock('../middlewares/rateLimiter', () => ({
    denunciaLimiter: (_req, _res, next) => next(),
}));
