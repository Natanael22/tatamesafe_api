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

const mockCertificado = {
  id: 'cert-id-1',
  academia_id: 'academia-id-1',
  tipo: 'PROTECAO_MENORES',
  instrutor: 'Dr. Carlos Silva',
  emitido_em: new Date().toISOString(),
  validade_em: new Date('2027-12-31').toISOString(),
  url_pdf: null,
};

describe('GET /api/v1/certificados', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lista certificados publicamente', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [{ ...mockCertificado, academia: { nome: 'Academia Teste' } }],
        error: null,
      }),
    };
    supabaseMock.from.mockReturnValueOnce(chain);

    const res = await request(app).get('/api/v1/certificados');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty('tipo', 'PROTECAO_MENORES');
  });
});

describe('GET /api/v1/certificados/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna certificado por ID com dados da academia', async () => {
    mockFrom({
      ...mockCertificado,
      academia: { nome: 'Academia Teste', cnpj: '12.345.678/0001-90' },
    });

    const res = await request(app).get('/api/v1/certificados/cert-id-1');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 'cert-id-1');
    expect(res.body).toHaveProperty('academia');
  });

  it('retorna 404 quando certificado não existe', async () => {
    mockFrom(null);

    const res = await request(app).get('/api/v1/certificados/id-inexistente');

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/certificados', () => {
  beforeEach(() => vi.clearAllMocks());

  it('admin emite certificado com sucesso', async () => {
    // 1. busca user
    mockFrom({ tipo: 'ADMIN' });
    // 2. verifica academia
    mockFrom({ id: 'academia-id-1' });
    // 3. cria certificado
    mockFrom(mockCertificado);

    const res = await request(app)
      .post('/api/v1/certificados')
      .set('Authorization', ADMIN_TOKEN)
      .send({
        academia_id: 'academia-id-1',
        tipo: 'PROTECAO_MENORES',
        instrutor: 'Dr. Carlos Silva',
        validade_em: '2027-12-31T00:00:00.000Z',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('tipo', 'PROTECAO_MENORES');
  });

  it('retorna 403 quando não é admin', async () => {
    mockFrom({ tipo: 'ALUNO' });

    const res = await request(app)
      .post('/api/v1/certificados')
      .set('Authorization', ALUNO_TOKEN)
      .send({
        academia_id: 'academia-id-1',
        tipo: 'INCLUSAO',
        instrutor: 'Prof. Ana',
        validade_em: '2027-01-01T00:00:00.000Z',
      });

    expect(res.status).toBe(403);
  });

  it('retorna 400 sem campos obrigatórios', async () => {
    mockFrom({ tipo: 'ADMIN' });

    const res = await request(app)
      .post('/api/v1/certificados')
      .set('Authorization', ADMIN_TOKEN)
      .send({ academia_id: 'academia-id-1' });

    expect(res.status).toBe(400);
  });

  it('retorna 404 quando academia não existe', async () => {
    // 1. busca user
    mockFrom({ tipo: 'ADMIN' });
    // 2. academia não encontrada
    mockFrom(null);

    const res = await request(app)
      .post('/api/v1/certificados')
      .set('Authorization', ADMIN_TOKEN)
      .send({
        academia_id: 'academia-inexistente',
        tipo: 'INCLUSAO',
        instrutor: 'Prof. Ana',
        validade_em: '2027-01-01T00:00:00.000Z',
      });

    expect(res.status).toBe(404);
  });
});
