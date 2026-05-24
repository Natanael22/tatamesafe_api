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

const mockAdmin = { id: 'admin-id', auth_id: 'admin-auth-id-999', tipo: 'ADMIN' };
const mockAluno = { id: 'aluno-id', auth_id: 'aluno-auth-id-123', tipo: 'ALUNO' };
const ALUNO_TOKEN = makeToken('aluno-auth-id-123', 'aluno@teste.com');

const mockAcademia = {
  id: 'academia-id-1',
  nome: 'Academia Teste',
  cnpj: '12.345.678/0001-90',
};

const mockCertificado = {
  id: 'cert-id-1',
  academia_id: 'academia-id-1',
  tipo: 'PROTECAO_MENORES',
  instrutor: 'Dr. Carlos Silva',
  emitido_em: new Date(),
  validade_em: new Date('2027-12-31'),
  url_pdf: 'https://storage.tatamesafe.com/cert-id-1.pdf',
};

describe('GET /api/v1/certificados', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lista certificados publicamente', async () => {
    prismaMock.certificado.findMany.mockResolvedValue([
      { ...mockCertificado, academia: { nome: 'Academia Teste' } },
    ]);

    const res = await request(app).get('/api/v1/certificados');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty('tipo', 'PROTECAO_MENORES');
  });

  it('filtra por academia_id via query', async () => {
    prismaMock.certificado.findMany.mockResolvedValue([]);

    await request(app).get('/api/v1/certificados?academia_id=academia-id-1');

    expect(prismaMock.certificado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { academia_id: 'academia-id-1' },
      })
    );
  });
});

describe('GET /api/v1/certificados/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna certificado por ID com dados da academia', async () => {
    prismaMock.certificado.findUnique.mockResolvedValue({
      ...mockCertificado,
      academia: { nome: 'Academia Teste', cnpj: '12.345.678/0001-90' },
    });

    const res = await request(app).get('/api/v1/certificados/cert-id-1');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 'cert-id-1');
    expect(res.body).toHaveProperty('academia');
  });

  it('retorna 404 quando certificado não existe', async () => {
    prismaMock.certificado.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/certificados/id-inexistente');

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/certificados', () => {
  beforeEach(() => vi.clearAllMocks());

  it('admin emite certificado com sucesso', async () => {
    prismaMock.user.findUnique.mockResolvedValue(mockAdmin);
    prismaMock.academia.findUnique.mockResolvedValue(mockAcademia);
    prismaMock.certificado.create.mockResolvedValue(mockCertificado);

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
    prismaMock.user.findUnique.mockResolvedValue(mockAluno);

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
    prismaMock.user.findUnique.mockResolvedValue(mockAdmin);

    const res = await request(app)
      .post('/api/v1/certificados')
      .set('Authorization', ADMIN_TOKEN)
      .send({ academia_id: 'academia-id-1' }); // faltam tipo, instrutor, validade_em

    expect(res.status).toBe(400);
  });

  it('retorna 404 quando academia não existe', async () => {
    prismaMock.user.findUnique.mockResolvedValue(mockAdmin);
    prismaMock.academia.findUnique.mockResolvedValue(null);

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
