import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import supabase from '../../lib/supabase';

const supabaseMock = supabase as any;

function makeToken(sub: string, email: string) {
  const jwt = require('jsonwebtoken');
  return `Bearer ${jwt.sign({ sub, email }, process.env.JWT_SECRET!, { expiresIn: '1h' })}`;
}

const ALUNO_TOKEN = makeToken('aluno-auth-id-123', 'aluno@teste.com');

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

const mockAvaliacao = {
  id: 'aval-id-1',
  academia_id: 'academia-id-1',
  user_id: 'aluno-id',
  nota: 5,
  comentario: 'Excelente academia!',
  categorias: { anonima: false },
  criado_em: new Date().toISOString(),
};

describe('GET /api/v1/avaliacoes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lista avaliações públicas', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [{ ...mockAvaliacao, user: { nome: 'João Silva' } }],
        error: null,
      }),
    };
    supabaseMock.from.mockReturnValueOnce(chain);

    const res = await request(app).get('/api/v1/avaliacoes');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty('nota', 5);
  });

  it('oculta nome do autor quando avaliação é anônima', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [{ ...mockAvaliacao, categorias: { anonima: true }, user: { nome: 'João Silva' } }],
        error: null,
      }),
    };
    supabaseMock.from.mockReturnValueOnce(chain);

    const res = await request(app).get('/api/v1/avaliacoes');

    expect(res.status).toBe(200);
    expect(res.body[0].autor).toBe('Anônimo');
  });

  it('exibe nome do autor quando avaliação não é anônima', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [{ ...mockAvaliacao, categorias: { anonima: false }, user: { nome: 'João Silva' } }],
        error: null,
      }),
    };
    supabaseMock.from.mockReturnValueOnce(chain);

    const res = await request(app).get('/api/v1/avaliacoes');

    expect(res.status).toBe(200);
    expect(res.body[0].autor).toBe('João Silva');
  });
});

describe('POST /api/v1/avaliacoes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cria avaliação com sucesso', async () => {
    // 1. busca user por auth_id
    mockFrom({ id: 'aluno-id' });
    // 2. verifica avaliação existente
    mockFrom(null);
    // 3. cria nova avaliação
    mockFrom(mockAvaliacao);

    const res = await request(app)
      .post('/api/v1/avaliacoes')
      .set('Authorization', ALUNO_TOKEN)
      .send({ academia_id: 'academia-id-1', nota: 5, comentario: 'Ótima!' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('nota', 5);
  });

  it('atualiza avaliação existente (1 avaliação por academia por usuário)', async () => {
    // 1. busca user
    mockFrom({ id: 'aluno-id' });
    // 2. avaliação já existe
    mockFrom({ id: 'aval-id-1' });
    // 3. update
    mockFrom({ ...mockAvaliacao, nota: 3 });

    const res = await request(app)
      .post('/api/v1/avaliacoes')
      .set('Authorization', ALUNO_TOKEN)
      .send({ academia_id: 'academia-id-1', nota: 3, comentario: 'Melhorou um pouco' });

    expect(res.status).toBe(201);
  });

  it('retorna 400 com nota fora do intervalo 1-5', async () => {
    mockFrom({ id: 'aluno-id' });

    const res = await request(app)
      .post('/api/v1/avaliacoes')
      .set('Authorization', ALUNO_TOKEN)
      .send({ academia_id: 'academia-id-1', nota: 6 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('1 e 5');
  });

  it('retorna 400 sem campos obrigatórios', async () => {
    mockFrom({ id: 'aluno-id' });

    const res = await request(app)
      .post('/api/v1/avaliacoes')
      .set('Authorization', ALUNO_TOKEN)
      .send({ comentario: 'Sem nota nem academia' });

    expect(res.status).toBe(400);
  });

  it('retorna 401 sem token', async () => {
    const res = await request(app)
      .post('/api/v1/avaliacoes')
      .send({ academia_id: 'academia-id-1', nota: 4 });

    expect(res.status).toBe(401);
  });
});
