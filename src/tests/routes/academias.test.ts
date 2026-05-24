import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import prisma from '../../lib/prisma';

const prismaMock = prisma as any;

// Helper: gera um JWT de teste válido
function makeToken(sub: string, email: string) {
  const jwt = require('jsonwebtoken');
  return `Bearer ${jwt.sign({ sub, email }, process.env.JWT_SECRET!, { expiresIn: '1h' })}`;
}

const ADMIN_TOKEN = makeToken('admin-auth-id-999', 'admin@tatamesafe.com');
const ALUNO_TOKEN = makeToken('aluno-auth-id-123', 'aluno@teste.com');

const mockAdmin = { id: 'admin-id', auth_id: 'admin-auth-id-999', tipo: 'ADMIN', email: 'admin@tatamesafe.com' };
const mockAluno = { id: 'aluno-id', auth_id: 'aluno-auth-id-123', tipo: 'ALUNO', email: 'aluno@teste.com' };

const mockAcademia = {
  id: 'academia-id-1',
  user_id: 'aluno-id',
  nome: 'Academia Teste',
  cnpj: '12.345.678/0001-90',
  endereco: { cidade: 'São Paulo', estado: 'SP' },
  telefone: '11999999999',
  instagram: '@academia',
  descricao: 'Descrição teste',
  foto_url: null,
  nivel_selo: 'NENHUM',
  verificada: false,
  ativa: true,
  criado_em: new Date(),
  atualizado_em: new Date(),
};

describe('GET /api/v1/academias', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna lista de academias ativas', async () => {
    prismaMock.academia.findMany.mockResolvedValue([mockAcademia]);

    const res = await request(app).get('/api/v1/academias');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty('nome', 'Academia Teste');
  });

  it('retorna lista vazia quando não há academias', async () => {
    prismaMock.academia.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/v1/academias');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /api/v1/academias/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna academia por ID', async () => {
    prismaMock.academia.findUnique.mockResolvedValue({ ...mockAcademia, certificados: [], avaliacoes: [] });

    const res = await request(app).get('/api/v1/academias/academia-id-1');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 'academia-id-1');
  });

  it('retorna 404 quando academia não existe', async () => {
    prismaMock.academia.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/academias/id-inexistente');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

describe('POST /api/v1/academias', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cria academia com token válido', async () => {
    prismaMock.user.findUnique.mockResolvedValue(mockAluno);
    prismaMock.academia.findUnique.mockResolvedValue(null); // não tem academia ainda
    prismaMock.academia.create.mockResolvedValue(mockAcademia);

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
    prismaMock.user.findUnique.mockResolvedValue(mockAluno);
    prismaMock.academia.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/academias')
      .set('Authorization', ALUNO_TOKEN)
      .send({ endereco: { cidade: 'SP' } });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('retorna 400 quando usuário já tem academia', async () => {
    prismaMock.user.findUnique.mockResolvedValue(mockAluno);
    prismaMock.academia.findUnique.mockResolvedValue(mockAcademia); // já existe

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
    prismaMock.user.findUnique.mockResolvedValue(mockAdmin);
    prismaMock.academia.findUnique.mockResolvedValue(mockAcademia);
    prismaMock.academia.update.mockResolvedValue({ ...mockAcademia, verificada: true, nivel_selo: 'OURO' });

    const res = await request(app)
      .post('/api/v1/academias/academia-id-1/verificar')
      .set('Authorization', ADMIN_TOKEN)
      .send({ verificada: true, nivel_selo: 'OURO' });

    expect(res.status).toBe(200);
    expect(res.body.academia).toHaveProperty('verificada', true);
  });

  it('retorna 403 quando não é admin', async () => {
    prismaMock.user.findUnique.mockResolvedValue(mockAluno);

    const res = await request(app)
      .post('/api/v1/academias/academia-id-1/verificar')
      .set('Authorization', ALUNO_TOKEN)
      .send({ verificada: true });

    expect(res.status).toBe(403);
  });
});
