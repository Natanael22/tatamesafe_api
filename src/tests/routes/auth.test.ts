import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import supabase from '../../lib/supabase';

const supabaseMock = supabase as any;

function mockFrom(data: any, error: any = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
  supabaseMock.from.mockReturnValueOnce(chain);
  return chain;
}

describe('Auth Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/v1/auth/signup/aluno', () => {
    it('cadastra um aluno com sucesso', async () => {
      // Mock do insert em User
      mockFrom({ id: 'user-id-1', auth_id: 'mock-auth-id', tipo: 'ALUNO', nome: 'Aluno Teste' });

      // Mock da chamada ao Supabase Auth
      supabaseMock.auth.signUp.mockResolvedValueOnce({
        data: { user: { id: 'mock-auth-id' }, session: { access_token: 'mock-token' } },
        error: null,
      });

      const res = await request(app)
        .post('/api/v1/auth/signup/aluno')
        .send({
          email: 'aluno@teste.com',
          password: 'password123',
          nome: 'Aluno Teste',
          telefone: '11999999999',
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toContain('sucesso');
      expect(res.body.user).toHaveProperty('tipo', 'ALUNO');
      expect(res.body.session).toHaveProperty('access_token', 'mock-token');
    });

    it('retorna 400 se faltar campos obrigatórios', async () => {
      const res = await request(app)
        .post('/api/v1/auth/signup/aluno')
        .send({
          email: 'aluno@teste.com',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('POST /api/v1/auth/signup/academia', () => {
    it('cadastra uma academia com sucesso', async () => {
      // Mock 1: insert do User (tipo ACADEMIA)
      mockFrom({ id: 'user-id-2', auth_id: 'mock-auth-id', tipo: 'ACADEMIA' });
      // Mock 2: insert da Academia
      mockFrom({ id: 'academia-id-1', nome: 'Academia Teste', user_id: 'user-id-2' });

      // Mock da chamada ao Supabase Auth
      supabaseMock.auth.signUp.mockResolvedValueOnce({
        data: { user: { id: 'mock-auth-id' }, session: { access_token: 'mock-token' } },
        error: null,
      });

      const res = await request(app)
        .post('/api/v1/auth/signup/academia')
        .send({
          email: 'academia@teste.com',
          password: 'password123',
          nome: 'Academia Teste',
          telefone: '11888888888',
          cnpj: '12.345.678/0001-99',
          endereco: { rua: 'Rua A', numero: 100 },
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toContain('sucesso');
      expect(res.body.user).toHaveProperty('tipo', 'ACADEMIA');
      expect(res.body.academia).toHaveProperty('id', 'academia-id-1');
    });
  });

  describe('POST /api/v1/auth/signin', () => {
    it('realiza login com sucesso', async () => {
      // Mock do login no Supabase Auth
      supabaseMock.auth.signInWithPassword.mockResolvedValueOnce({
        data: { session: { access_token: 'mock-token' }, user: { id: 'mock-auth-id' } },
        error: null,
      });

      // Mock do findUserByAuthId no backend
      mockFrom({ id: 'user-id-1', auth_id: 'mock-auth-id', tipo: 'ALUNO', nome: 'Aluno Teste' });

      const res = await request(app)
        .post('/api/v1/auth/signin')
        .send({
          email: 'aluno@teste.com',
          password: 'password123',
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('sucesso');
      expect(res.body.session).toHaveProperty('access_token', 'mock-token');
      expect(res.body.user).toHaveProperty('nome', 'Aluno Teste');
    });

    it('retorna 401 para credenciais inválidas', async () => {
      // Mock erro do Supabase Auth
      supabaseMock.auth.signInWithPassword.mockResolvedValueOnce({
        data: { session: null, user: null },
        error: { message: 'Invalid credentials' },
      });

      const res = await request(app)
        .post('/api/v1/auth/signin')
        .send({
          email: 'aluno@teste.com',
          password: 'wrongpassword',
        });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('POST /api/v1/auth/signout', () => {
    it('encerra sessão com sucesso', async () => {
      supabaseMock.auth.admin.signOut.mockResolvedValueOnce({ error: null });

      const res = await request(app)
        .post('/api/v1/auth/signout')
        .set('Authorization', 'Bearer mock-jwt-token');

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('sucesso');
    });

    it('retorna 400 sem token', async () => {
      const res = await request(app).post('/api/v1/auth/signout');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });
});
