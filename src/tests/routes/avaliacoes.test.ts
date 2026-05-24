import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import prisma from '../../lib/prisma';

const prismaMock = prisma as any;

function makeToken(sub: string, email: string) {
  const jwt = require('jsonwebtoken');
  return `Bearer ${jwt.sign({ sub, email }, process.env.JWT_SECRET!, { expiresIn: '1h' })}`;
}

const ALUNO_TOKEN = makeToken('aluno-auth-id-123', 'aluno@teste.com');

const mockAluno = { id: 'aluno-id', auth_id: 'aluno-auth-id-123', tipo: 'ALUNO', email: 'aluno@teste.com', nome: 'João Silva' };

const mockAvaliacao = {
  id: 'aval-id-1',
  academia_id: 'academia-id-1',
  user_id: 'aluno-id',
  nota: 5,
  comentario: 'Excelente academia!',
  categorias: { anonima: false },
  criado_em: new Date(),
};

describe('GET /api/v1/avaliacoes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lista avaliações públicas', async () => {
    prismaMock.avaliacao.findMany.mockResolvedValue([
      { ...mockAvaliacao, user: { nome: 'João Silva' } },
    ]);

    const res = await request(app).get('/api/v1/avaliacoes');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty('nota', 5);
  });

  it('filtra por academia_id via query', async () => {
    prismaMock.avaliacao.findMany.mockResolvedValue([
      { ...mockAvaliacao, user: { nome: 'João Silva' } },
    ]);

    const res = await request(app).get('/api/v1/avaliacoes?academia_id=academia-id-1');

    expect(res.status).toBe(200);
    // Verifica que foi chamado com o filtro correto
    expect(prismaMock.avaliacao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { academia_id: 'academia-id-1' },
      })
    );
  });

  it('oculta nome do autor quando avaliação é anônima', async () => {
    prismaMock.avaliacao.findMany.mockResolvedValue([
      { ...mockAvaliacao, categorias: { anonima: true }, user: { nome: 'João Silva' } },
    ]);

    const res = await request(app).get('/api/v1/avaliacoes');

    expect(res.status).toBe(200);
    expect(res.body[0].autor).toBe('Anônimo');
  });

  it('exibe nome do autor quando avaliação não é anônima', async () => {
    prismaMock.avaliacao.findMany.mockResolvedValue([
      { ...mockAvaliacao, categorias: { anonima: false }, user: { nome: 'João Silva' } },
    ]);

    const res = await request(app).get('/api/v1/avaliacoes');

    expect(res.status).toBe(200);
    expect(res.body[0].autor).toBe('João Silva');
  });
});

describe('POST /api/v1/avaliacoes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cria avaliação com sucesso', async () => {
    prismaMock.user.findUnique.mockResolvedValue(mockAluno);
    prismaMock.avaliacao.findFirst.mockResolvedValue(null);
    prismaMock.avaliacao.create.mockResolvedValue(mockAvaliacao);

    const res = await request(app)
      .post('/api/v1/avaliacoes')
      .set('Authorization', ALUNO_TOKEN)
      .send({ academia_id: 'academia-id-1', nota: 5, comentario: 'Ótima!' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('nota', 5);
  });

  it('atualiza avaliação existente (1 avaliação por academia por usuário)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(mockAluno);
    prismaMock.avaliacao.findFirst.mockResolvedValue(mockAvaliacao); // já existe
    prismaMock.avaliacao.update.mockResolvedValue({ ...mockAvaliacao, nota: 3 });

    const res = await request(app)
      .post('/api/v1/avaliacoes')
      .set('Authorization', ALUNO_TOKEN)
      .send({ academia_id: 'academia-id-1', nota: 3, comentario: 'Melhorou um pouco' });

    expect(res.status).toBe(201);
    expect(prismaMock.avaliacao.update).toHaveBeenCalled();
    expect(prismaMock.avaliacao.create).not.toHaveBeenCalled();
  });

  it('retorna 400 com nota fora do intervalo 1-5', async () => {
    prismaMock.user.findUnique.mockResolvedValue(mockAluno);

    const res = await request(app)
      .post('/api/v1/avaliacoes')
      .set('Authorization', ALUNO_TOKEN)
      .send({ academia_id: 'academia-id-1', nota: 6 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('1 e 5');
  });

  it('retorna 400 sem campos obrigatórios', async () => {
    prismaMock.user.findUnique.mockResolvedValue(mockAluno);

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
