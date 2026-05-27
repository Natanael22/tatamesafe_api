import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import supabase from '../../lib/supabase';
import { supabaseVault } from '../../lib/supabase';

const supabaseMock = supabase as any;
const supabaseVaultMock = supabaseVault as any;

function makeToken(sub: string, email: string) {
  const jwt = require('jsonwebtoken');
  return `Bearer ${jwt.sign({ sub, email }, process.env.JWT_SECRET!, { expiresIn: '1h' })}`;
}

const ADMIN_TOKEN = makeToken('admin-auth-id-999', 'admin@tatamesafe.com');
const ALUNO_TOKEN = makeToken('aluno-auth-id-123', 'aluno@teste.com');

function mockFrom(mock: any, data: any, error: any = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
  mock.from.mockReturnValueOnce(chain);
  return chain;
}

const mockDenuncia = {
  id: 'denuncia-id-1',
  protocolo: 'TS-2026-ABCDEF',
  tipo: 'ASSEDIO_MORAL',
  status: 'RECEBIDA',
  urgencia: 'MEDIA',
  envolve_menor: false,
  criado_em: new Date().toISOString(),
  atualizado_em: new Date().toISOString(),
  historico: [],
};

describe('POST /api/v1/denuncia', () => {
  beforeEach(() => vi.clearAllMocks());

  it('registra denúncia anônima com sucesso', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: 'TS-2026-ABCDEF', error: null });

    const res = await request(app)
      .post('/api/v1/denuncia')
      .send({
        tipo: 'ASSEDIO_MORAL',
        descricao_enc: Buffer.from('texto secreto').toString('base64'),
        urgencia: 'MEDIA',
        envolve_menor: false,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('protocolo');
    expect(res.body.protocolo).toMatch(/^TS-/);
  });

  it('retorna 500 quando rpc falha', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: null, error: new Error('DB error') });

    const res = await request(app)
      .post('/api/v1/denuncia')
      .send({
        tipo: 'VIOLENCIA',
        descricao_enc: Buffer.from('texto').toString('base64'),
        urgencia: 'ALTA',
        envolve_menor: true,
      });

    expect(res.status).toBe(500);
  });
});

describe('GET /api/v1/denuncia/status/:protocolo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna status público de uma denúncia', async () => {
    mockFrom(supabaseVaultMock, { status: 'RECEBIDA', atualizado_em: new Date().toISOString() });

    const res = await request(app).get('/api/v1/denuncia/status/TS-2026-ABCDEF');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'RECEBIDA');
    expect(res.body).toHaveProperty('mensagem_publica');
  });

  it('retorna 404 para protocolo inexistente', async () => {
    mockFrom(supabaseVaultMock, null);

    const res = await request(app).get('/api/v1/denuncia/status/TS-0000-XXXXXX');

    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/denuncia/admin', () => {
  beforeEach(() => vi.clearAllMocks());

  it('admin lista denúncias com sucesso', async () => {
    // 1. busca user por auth_id
    mockFrom(supabaseMock, { tipo: 'ADMIN' });
    // 2. lista denúncias do vault
    const vaultChain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [mockDenuncia], error: null }),
    };
    supabaseVaultMock.from.mockReturnValueOnce(vaultChain);

    const res = await request(app)
      .get('/api/v1/denuncia/admin')
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty('protocolo', 'TS-2026-ABCDEF');
  });

  it('retorna 403 quando não é admin', async () => {
    mockFrom(supabaseMock, { tipo: 'ALUNO' });

    const res = await request(app)
      .get('/api/v1/denuncia/admin')
      .set('Authorization', ALUNO_TOKEN);

    expect(res.status).toBe(403);
  });

  it('retorna 401 sem token', async () => {
    const res = await request(app).get('/api/v1/denuncia/admin');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/v1/denuncia/admin/:id/status', () => {
  beforeEach(() => vi.clearAllMocks());

  it('admin atualiza status com sucesso e registra histórico', async () => {
    // 1. busca user
    mockFrom(supabaseMock, { id: 'admin-id', tipo: 'ADMIN' });
    // 2. verifica se denúncia existe
    mockFrom(supabaseVaultMock, { id: 'denuncia-id-1' });
    // 3. rpc atualizar_status_denuncia
    supabaseMock.rpc.mockResolvedValueOnce({
      data: {
        denuncia: { ...mockDenuncia, status: 'EM_APURACAO' },
        historico: { id: 'hist-id', status_de: 'RECEBIDA', status_para: 'EM_APURACAO' },
      },
      error: null,
    });

    const res = await request(app)
      .patch('/api/v1/denuncia/admin/denuncia-id-1/status')
      .set('Authorization', ADMIN_TOKEN)
      .send({ status: 'EM_APURACAO', nota_interna: 'Caso prioritário' });

    expect(res.status).toBe(200);
    expect(res.body.denuncia).toHaveProperty('status', 'EM_APURACAO');
    expect(res.body).toHaveProperty('historico');
  });

  it('retorna 400 sem campo status', async () => {
    mockFrom(supabaseMock, { id: 'admin-id', tipo: 'ADMIN' });

    const res = await request(app)
      .patch('/api/v1/denuncia/admin/denuncia-id-1/status')
      .set('Authorization', ADMIN_TOKEN)
      .send({});

    expect(res.status).toBe(400);
  });

  it('retorna 404 quando denúncia não existe', async () => {
    mockFrom(supabaseMock, { id: 'admin-id', tipo: 'ADMIN' });
    mockFrom(supabaseVaultMock, null);

    const res = await request(app)
      .patch('/api/v1/denuncia/admin/id-inexistente/status')
      .set('Authorization', ADMIN_TOKEN)
      .send({ status: 'ENCERRADA' });

    expect(res.status).toBe(404);
  });
});
