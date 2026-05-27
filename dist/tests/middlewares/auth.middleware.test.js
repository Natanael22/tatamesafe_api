"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
// Importa o middleware diretamente (sem mock aqui)
// O setup.ts não mocka o auth.middleware
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = 'test-secret-key';
// Helper para criar mocks de req/res/next do Express
function makeMocks() {
    const req = { headers: {} };
    const res = {
        status: vitest_1.vi.fn().mockReturnThis(),
        json: vitest_1.vi.fn().mockReturnThis(),
    };
    const next = vitest_1.vi.fn();
    return { req, res, next };
}
(0, vitest_1.describe)('requireAuth middleware - Testes Unitários', () => {
    (0, vitest_1.beforeEach)(() => {
        process.env.JWT_SECRET = JWT_SECRET;
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('chama next() com token JWT válido', () => {
        const { req, res, next } = makeMocks();
        const token = jsonwebtoken_1.default.sign({ sub: 'user-123', email: 'test@test.com' }, JWT_SECRET);
        req.headers.authorization = `Bearer ${token}`;
        (0, auth_middleware_1.requireAuth)(req, res, next);
        (0, vitest_1.expect)(next).toHaveBeenCalledOnce();
        (0, vitest_1.expect)(req.user).toHaveProperty('sub', 'user-123');
    });
    (0, vitest_1.it)('retorna 401 quando header Authorization está ausente', () => {
        const { req, res, next } = makeMocks();
        (0, auth_middleware_1.requireAuth)(req, res, next);
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(401);
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ error: vitest_1.expect.stringContaining('Token') }));
        (0, vitest_1.expect)(next).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('retorna 401 quando token não começa com "Bearer "', () => {
        const { req, res, next } = makeMocks();
        req.headers.authorization = 'Token abc123';
        (0, auth_middleware_1.requireAuth)(req, res, next);
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(401);
        (0, vitest_1.expect)(next).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('retorna 401 com token assinado por secret errado', () => {
        const { req, res, next } = makeMocks();
        const token = jsonwebtoken_1.default.sign({ sub: 'user-123' }, 'wrong-secret');
        req.headers.authorization = `Bearer ${token}`;
        (0, auth_middleware_1.requireAuth)(req, res, next);
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(401);
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ error: 'Token inválido' }));
        (0, vitest_1.expect)(next).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('retorna 401 com token expirado', () => {
        const { req, res, next } = makeMocks();
        const token = jsonwebtoken_1.default.sign({ sub: 'user-123' }, JWT_SECRET, { expiresIn: '0s' });
        req.headers.authorization = `Bearer ${token}`;
        // Aguarda o token expirar
        vitest_1.vi.useFakeTimers();
        vitest_1.vi.advanceTimersByTime(1000);
        (0, auth_middleware_1.requireAuth)(req, res, next);
        vitest_1.vi.useRealTimers();
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(401);
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ error: 'Token expirado' }));
    });
    (0, vitest_1.it)('retorna 401 com token malformado', () => {
        const { req, res, next } = makeMocks();
        req.headers.authorization = 'Bearer not.a.valid.jwt.token';
        (0, auth_middleware_1.requireAuth)(req, res, next);
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(401);
        (0, vitest_1.expect)(next).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('retorna 500 quando JWT_SECRET não está configurado', () => {
        const { req, res, next } = makeMocks();
        delete process.env.JWT_SECRET;
        const token = jsonwebtoken_1.default.sign({ sub: 'user-123' }, JWT_SECRET);
        req.headers.authorization = `Bearer ${token}`;
        (0, auth_middleware_1.requireAuth)(req, res, next);
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(500);
        process.env.JWT_SECRET = JWT_SECRET; // restaura
    });
});
