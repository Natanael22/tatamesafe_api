import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import supabase from '../../lib/supabase';

const supabaseMock = supabase as any;

function makeToken(sub: string, email: string) {
  const jwt = require('jsonwebtoken');
  return `Bearer ${jwt.sign({ sub, email }, process.env.JWT_SECRET!, { expiresIn: '1h' })}`;
}

const ADMIN_TOKEN = makeToken('admin-auth-id-999', 'admin@tatamesafe.com');
const ALUNO_TOKEN = makeToken('aluno-auth-id-123', 'aluno@teste.com');

// Helper: configura o que supabase.from(table) retorna para um único chamado
function mockFrom(data: any, error: any = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
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

describe('GET /api/v1/academias', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna lista de academias ativas', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [mockAcademia], error: null }),
    };
    supabaseMock.from.mockReturnValueOnce(chain);

    const res = await request(app).get('/api/v1/academias');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty('nome', 'Academia Teste');
  });

  it('retorna lista vazia quando não há academias', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    supabaseMock.from.mockReturnValueOnce(chain);

    const res = await request(app).get('/api/v1/academias');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /api/v1/academias/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna academia por ID', async () => {
    mockFrom({ ...mockAcademia, certificados: [], avaliacoes: [] });

    const res = await request(app).get('/api/v1/academias/academia-id-1');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 'academia-id-1');
  });

  it('retorna 404 quando academia não existe', async () => {
    mockFrom(null);

    const res = await request(app).get('/api/v1/academias/id-inexistente');

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/academias', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cria academia com token válido', async () => {
    // 1. findOrCreateUser → busca usuário por auth_id
    mockFrom({ id: 'aluno-id', auth_id: 'aluno-auth-id-123', tipo: 'ALUNO' });
    // 2. busca academia existente por user_id
    mockFrom(null);
    // 3. insere nova academia
    mockFrom(mockAcademia);

    const res = await request(app)
      .post('/api/v1/academias')
      .set('Authorization', ALUNO_TOKEN)
      .send({ nome: 'Academia Teste', endereco: { cidade: 'SP' } });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('nome', 'Academia Teste');
  });

  it('retorna 401 sem token', async () => {
    const res = await request(app)
      .post('/api/v1/academias')
      .send({ nome: 'Academia Sem Token' });

    expect(res.status).toBe(401);
  });

  it('retorna 400 sem campo nome', async () => {
    const res = await request(app)
      .post('/api/v1/academias')
      .set('Authorization', ALUNO_TOKEN)
      .send({ endereco: { cidade: 'SP' } });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('retorna 400 quando usuário já tem academia', async () => {
    // 1. usuário encontrado
    mockFrom({ id: 'aluno-id', auth_id: 'aluno-auth-id-123', tipo: 'ALUNO' });
    // 2. academia já existe
    mockFrom({ id: 'academia-existente' });

    const res = await request(app)
      .post('/api/v1/academias')
      .set('Authorization', ALUNO_TOKEN)
      .send({ nome: 'Segunda Academia' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('já possui');
  });
});

describe('POST /api/v1/academias/:id/verificar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('admin verifica academia com sucesso', async () => {
    // 1. busca user por auth_id (admin)
    mockFrom({ tipo: 'ADMIN' });
    // 2. busca academia atual para pegar valores existentes
    mockFrom({ verificada: false, nivel_selo: 'NENHUM' });
    // 3. update da academia
    mockFrom({ ...mockAcademia, verificada: true, nivel_selo: 'OURO' });

    const res = await request(app)
      .post('/api/v1/academias/academia-id-1/verificar')
      .set('Authorization', ADMIN_TOKEN)
      .send({ verificada: true, nivel_selo: 'OURO' });

    expect(res.status).toBe(200);
    expect(res.body.academia).toHaveProperty('verificada', true);
  });

  it('retorna 403 quando não é admin', async () => {
    mockFrom({ tipo: 'ALUNO' });

    const res = await request(app)
      .post('/api/v1/academias/academia-id-1/verificar')
      .set('Authorization', ALUNO_TOKEN)
      .send({ verificada: true });

    expect(res.status).toBe(403);
  });
});
