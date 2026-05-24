/**
 * Setup global para todos os testes.
 * - Mocka o módulo do Prisma para evitar conexão real com o banco.
 * - Mocka o Redis/BullMQ para evitar dependência de serviços externos.
 * - Configura variáveis de ambiente necessárias.
 */

import { vi } from 'vitest';

// Variáveis de ambiente para testes
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key';
process.env.PORT = '3001';

// Mock global do Prisma
vi.mock('../lib/prisma', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    academia: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    avaliacao: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    certificado: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    denuncia: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    denunciaHistorico: {
      create: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

// Mock global do Redis/BullMQ para evitar conexões reais
vi.mock('ioredis', () => {
  const RedisMock = vi.fn().mockImplementation(function () {
    return {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      on: vi.fn(),
      quit: vi.fn(),
    };
  });
  return { default: RedisMock };
});

vi.mock('bullmq', () => {
  const QueueMock = vi.fn().mockImplementation(function () {
    return {
      add: vi.fn().mockResolvedValue({}),
      close: vi.fn(),
    };
  });
  return { Queue: QueueMock, Worker: vi.fn() };
});

// Mock do rate limiter para não bloquear testes
vi.mock('../middlewares/rateLimiter', () => ({
  denunciaLimiter: (_req: any, _res: any, next: any) => next(),
}));
