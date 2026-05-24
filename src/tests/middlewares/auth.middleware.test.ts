import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

// Importa o middleware diretamente (sem mock aqui)
// O setup.ts não mocka o auth.middleware
import { requireAuth } from '../../middlewares/auth.middleware';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'test-secret-key';

// Helper para criar mocks de req/res/next do Express
function makeMocks() {
  const req = { headers: {} } as unknown as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

describe('requireAuth middleware - Testes Unitários', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    vi.clearAllMocks();
  });

  it('chama next() com token JWT válido', () => {
    const { req, res, next } = makeMocks();
    const token = jwt.sign({ sub: 'user-123', email: 'test@test.com' }, JWT_SECRET);
    (req as any).headers.authorization = `Bearer ${token}`;

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect((req as any).user).toHaveProperty('sub', 'user-123');
  });

  it('retorna 401 quando header Authorization está ausente', () => {
    const { req, res, next } = makeMocks();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Token') })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('retorna 401 quando token não começa com "Bearer "', () => {
    const { req, res, next } = makeMocks();
    (req as any).headers.authorization = 'Token abc123';

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('retorna 401 com token assinado por secret errado', () => {
    const { req, res, next } = makeMocks();
    const token = jwt.sign({ sub: 'user-123' }, 'wrong-secret');
    (req as any).headers.authorization = `Bearer ${token}`;

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Token inválido' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('retorna 401 com token expirado', () => {
    const { req, res, next } = makeMocks();
    const token = jwt.sign({ sub: 'user-123' }, JWT_SECRET, { expiresIn: '0s' });
    (req as any).headers.authorization = `Bearer ${token}`;

    // Aguarda o token expirar
    vi.useFakeTimers();
    vi.advanceTimersByTime(1000);

    requireAuth(req, res, next);

    vi.useRealTimers();

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Token expirado' })
    );
  });

  it('retorna 401 com token malformado', () => {
    const { req, res, next } = makeMocks();
    (req as any).headers.authorization = 'Bearer not.a.valid.jwt.token';

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('retorna 500 quando JWT_SECRET não está configurado', () => {
    const { req, res, next } = makeMocks();
    delete process.env.JWT_SECRET;
    const token = jwt.sign({ sub: 'user-123' }, JWT_SECRET);
    (req as any).headers.authorization = `Bearer ${token}`;

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    process.env.JWT_SECRET = JWT_SECRET; // restaura
  });
});
