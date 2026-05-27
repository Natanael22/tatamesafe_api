/**
 * Setup global para todos os testes.
 * - Mocka o módulo do Supabase para evitar conexão real com o banco.
 * - Mocka o Redis/BullMQ para evitar dependência de serviços externos.
 * - Configura variáveis de ambiente necessárias.
 */

import { vi } from 'vitest';

// Variáveis de ambiente para testes
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key';
process.env.PORT = '3001';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

// Função que cria um builder do Supabase encadeável (fluent API mock)
function createSupabaseQueryMock() {
  const builder: any = {
    _data: null as any,
    _error: null as any,
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockImplementation(function (this: any) {
      return Promise.resolve({ data: this._data, error: this._error });
    }),
    maybeSingle: vi.fn().mockImplementation(function (this: any) {
      return Promise.resolve({ data: this._data, error: this._error });
    }),
    // Permite que os testes configurem o dado retornado
    __setData(data: any) {
      this._data = data;
      return this;
    },
    __setError(error: any) {
      this._error = error;
      return this;
    },
  };

  // Faz todos os métodos retornarem o próprio builder
  Object.keys(builder).forEach((key) => {
    if (typeof builder[key] === 'function' && !key.startsWith('__') && key !== 'single' && key !== 'maybeSingle') {
      builder[key] = vi.fn().mockReturnValue(builder);
    }
  });

  return builder;
}

// Mock do Supabase — cria um from() encadeável com vi.fn()
function createSupabaseMock() {
  return {
    from: vi.fn().mockImplementation(() => createSupabaseQueryMock()),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

vi.mock('../lib/supabase', () => ({
  default: createSupabaseMock(),
  supabaseVault: createSupabaseMock(),
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
