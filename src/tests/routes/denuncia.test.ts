import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import prisma from '../../lib/prisma';

const prismaMock = prisma as any;

function makeToken(sub: string, email: string) {
  const jwt = require('jsonwebtoken');
  return `Bearer ${jwt.sign({ sub, email }, process.env.JWT_SECRET!, { expiresIn: '1h' })}`;
}

const ADMIN_TOKEN = makeToken('admin-auth-id-999', 'admin@tatamesafe.com');
const ALUNO_TOKEN = makeToken('aluno-auth-id-123', 'aluno@teste.com');

const mockAdmin = { id: 'admin-id', auth_id: 'admin-auth-id-999', tipo: 'ADMIN' };
const mockAluno = { id: 'aluno-id', auth_id: 'aluno-auth-id-123', tipo: 'ALUNO' };

const mockDenuncia = {
  id: 'denuncia-id-1',
  protocolo: 'TS-2026-ABCDEF',
  tipo: 'ASSEDIO_MORAL',
  descricao_enc: Buffer.from('encrypted'),
  academia_ref: null,
  status: 'RECEBIDA',
  urgencia: 'MEDIA',
  envolve_menor: false,
  criado_em: new Date(),
  atualizado_em: new Date(),
  historico: [],
};

describe('POST /api/v1/denuncia', () => {
  beforeEach(() => vi.clearAllMocks());

  it('registra denúncia anônima com sucesso', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ protocolo: 'TS-2026-ABCDEF' }]);

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

  it('retorna 500 quando falha ao gerar protocolo', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ protocolo: null }]);

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
    prismaMock.denuncia.findUnique.mockResolvedValue({
      status: 'RECEBIDA',
      atualizado_em: new Date(),
    });

    const res = await request(app).get('/api/v1/denuncia/status/TS-2026-ABCDEF');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'RECEBIDA');
    expect(res.body).toHaveProperty('mensagem_publica');
  });

  it('retorna 404 para protocolo inexistente', async () => {
    prismaMock.denuncia.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/denuncia/status/TS-0000-XXXXXX');

    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/denuncia/admin', () => {
  beforeEach(() => vi.clearAllMocks());

  it('admin lista denúncias com sucesso', async () => {
    prismaMock.user.findUnique.mockResolvedValue(mockAdmin);
    prismaMock.denuncia.findMany.mockResolvedValue([mockDenuncia]);

    const res = await request(app)
      .get('/api/v1/denuncia/admin')
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty('protocolo', 'TS-2026-ABCDEF');
  });

  it('retorna 403 quando não é admin', async () => {
    prismaMock.user.findUnique.mockResolvedValue(mockAluno);

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
    prismaMock.user.findUnique.mockResolvedValue(mockAdmin);
    prismaMock.denuncia.findUnique.mockResolvedValue(mockDenuncia);
    prismaMock.$transaction.mockResolvedValue([
      { ...mockDenuncia, status: 'EM_APURACAO' },
      { id: 'historico-id', status_de: 'RECEBIDA', status_para: 'EM_APURACAO' },
    ]);

    const res = await request(app)
      .patch('/api/v1/denuncia/admin/denuncia-id-1/status')
      .set('Authorization', ADMIN_TOKEN)
      .send({ status: 'EM_APURACAO', nota_interna: 'Caso prioritário' });

    expect(res.status).toBe(200);
    expect(res.body.denuncia).toHaveProperty('status', 'EM_APURACAO');
    expect(res.body).toHaveProperty('historico');
  });

  it('retorna 400 sem campo status', async () => {
    prismaMock.user.findUnique.mockResolvedValue(mockAdmin);

    const res = await request(app)
      .patch('/api/v1/denuncia/admin/denuncia-id-1/status')
      .set('Authorization', ADMIN_TOKEN)
      .send({});

    expect(res.status).toBe(400);
  });

  it('retorna 404 quando denúncia não existe', async () => {
    prismaMock.user.findUnique.mockResolvedValue(mockAdmin);
    prismaMock.denuncia.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/v1/denuncia/admin/id-inexistente/status')
      .set('Authorization', ADMIN_TOKEN)
      .send({ status: 'ENCERRADA' });

    expect(res.status).toBe(404);
  });
});
