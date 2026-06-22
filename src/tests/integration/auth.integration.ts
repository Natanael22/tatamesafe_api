/**
 * Teste de Integração Real — Auth (signup/signin/signout)
 *
 * ⚠️  Este script NÃO usa mocks. Ele conecta ao Supabase real via variáveis do .env
 *     e executa o fluxo completo de cadastro → login → logout.
 *
 * Como executar:
 *   npx tsx src/tests/integration/auth.integration.ts
 *
 * Pré-requisitos:
 *   - API NÃO precisa estar rodando (o script sobe um servidor temporário)
 *   - Arquivo .env preenchido com SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET
 *   - O e-mail de teste será deletado do Supabase Auth ao final
 */

import 'dotenv/config';
import http from 'http';
import app from '../../app';

// ─── Configurações do teste ─────────────────────────────────────────────────
const TEST_EMAIL_ALUNO = `integ_aluno_${Date.now()}@tatamesafe-test.com`;
const TEST_EMAIL_ACADEMIA = `integ_academia_${Date.now()}@tatamesafe-test.com`;
const TEST_PASSWORD = 'Integ@Test123';

// ─── Helpers ────────────────────────────────────────────────────────────────
let server: http.Server;
let baseUrl: string;

function request(method: string, path: string, body?: object, token?: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const url = new URL(path, baseUrl);
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: {
        ...headers,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode ?? 0, body: data });
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─── Controle de resultados ─────────────────────────────────────────────────
type TestResult = { name: string; passed: boolean; error?: string };
const results: TestResult[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion falhou: ${message}`);
}

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`  ✅ ${name}`);
  } catch (err: any) {
    results.push({ name, passed: false, error: err.message });
    console.log(`  ❌ ${name}`);
    console.log(`     → ${err.message}`);
  }
}

// ─── Estado compartilhado entre testes ──────────────────────────────────────
let alunoToken = '';
let academiaToken = '';

// ─── Testes ─────────────────────────────────────────────────────────────────
async function runTests() {
  console.log('\n🔍 Iniciando testes de integração — Auth\n');

  // ── Signup Aluno ──────────────────────────────────────────────────────────
  console.log('📋 Cadastro de Aluno');

  await runTest('POST /api/v1/auth/signup/aluno → 201 com token', async () => {
    const res = await request('POST', '/api/v1/auth/signup/aluno', {
      email: TEST_EMAIL_ALUNO,
      password: TEST_PASSWORD,
      nome: 'Aluno Integração',
      telefone: '11999990001',
    });

    assert(res.status === 201, `Status esperado 201, recebido ${res.status}. Body: ${JSON.stringify(res.body)}`);
    assert(res.body.session?.access_token, 'access_token não retornado');
    assert(res.body.user?.tipo === 'ALUNO', `tipo esperado ALUNO, recebido ${res.body.user?.tipo}`);
    assert(!res.body.user?.senha_hash, 'senha_hash não deveria ser exposta');

    alunoToken = res.body.session.access_token;
  });

  await runTest('POST /api/v1/auth/signup/aluno → 409 para e-mail duplicado', async () => {
    const res = await request('POST', '/api/v1/auth/signup/aluno', {
      email: TEST_EMAIL_ALUNO,
      password: TEST_PASSWORD,
      nome: 'Aluno Duplicado',
    });

    assert(res.status === 409, `Status esperado 409, recebido ${res.status}. Body: ${JSON.stringify(res.body)}`);
  });

  await runTest('POST /api/v1/auth/signup/aluno → 400 sem campos obrigatórios', async () => {
    const res = await request('POST', '/api/v1/auth/signup/aluno', {
      email: 'incompleto@teste.com',
    });

    assert(res.status === 400, `Status esperado 400, recebido ${res.status}`);
    assert(res.body.error, 'Erro não retornado');
  });

  // ── Signup Academia ───────────────────────────────────────────────────────
  console.log('\n📋 Cadastro de Academia');

  await runTest('POST /api/v1/auth/signup/academia → 201 com token', async () => {
    const res = await request('POST', '/api/v1/auth/signup/academia', {
      email: TEST_EMAIL_ACADEMIA,
      password: TEST_PASSWORD,
      nome: 'Academia Integração',
      telefone: '11888880001',
      cnpj: '12.345.678/0001-99',
      endereco: {
        rua: 'Rua dos Testes',
        numero: 42,
        cidade: 'São Paulo',
        estado: 'SP',
      },
    });

    assert(res.status === 201, `Status esperado 201, recebido ${res.status}. Body: ${JSON.stringify(res.body)}`);
    assert(res.body.session?.access_token, 'access_token não retornado');
    assert(res.body.user?.tipo === 'ACADEMIA', `tipo esperado ACADEMIA, recebido ${res.body.user?.tipo}`);
    assert(res.body.academia?.id, 'academia.id não retornado');
    assert(!res.body.user?.senha_hash, 'senha_hash não deveria ser exposta');

    academiaToken = res.body.session.access_token;
  });

  // ── SignIn ────────────────────────────────────────────────────────────────
  console.log('\n📋 Login');

  await runTest('POST /api/v1/auth/signin → 200 com token para aluno', async () => {
    const res = await request('POST', '/api/v1/auth/signin', {
      email: TEST_EMAIL_ALUNO,
      password: TEST_PASSWORD,
    });

    assert(res.status === 200, `Status esperado 200, recebido ${res.status}. Body: ${JSON.stringify(res.body)}`);
    assert(res.body.session?.access_token, 'access_token não retornado');
    assert(res.body.user?.email === TEST_EMAIL_ALUNO, 'e-mail do usuário não bate');
  });

  await runTest('POST /api/v1/auth/signin → 401 para senha incorreta', async () => {
    const res = await request('POST', '/api/v1/auth/signin', {
      email: TEST_EMAIL_ALUNO,
      password: 'SenhaErrada999',
    });

    assert(res.status === 401, `Status esperado 401, recebido ${res.status}`);
    assert(res.body.error, 'Erro não retornado');
  });

  await runTest('POST /api/v1/auth/signin → 401 para e-mail inexistente', async () => {
    const res = await request('POST', '/api/v1/auth/signin', {
      email: 'naoexiste@tatamesafe-test.com',
      password: TEST_PASSWORD,
    });

    assert(res.status === 401, `Status esperado 401, recebido ${res.status}`);
  });

  // ── SignOut ───────────────────────────────────────────────────────────────
  console.log('\n📋 Logout');

  await runTest('POST /api/v1/auth/signout → 200 com token válido', async () => {
    // Gera um JWT válido localmente (não depende do signup ter sucesso)
    const jwt = await import('jsonwebtoken');
    const now = Math.floor(Date.now() / 1000);
    const testToken = jwt.default.sign(
      { sub: 'test-id', email: 'test@test.com', role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600 },
      process.env.JWT_SECRET!
    );

    const res = await request('POST', '/api/v1/auth/signout', undefined, testToken);

    assert(res.status === 200, `Status esperado 200, recebido ${res.status}. Body: ${JSON.stringify(res.body)}`);
    assert(res.body.message?.includes('sucesso'), 'Mensagem de sucesso não retornada');
  });

  await runTest('POST /api/v1/auth/signout → 400 sem token', async () => {
    const res = await request('POST', '/api/v1/auth/signout');

    assert(res.status === 400, `Status esperado 400, recebido ${res.status}`);
  });
}

// ─── Limpeza: remove usuários de teste do Supabase Auth ─────────────────────
async function cleanup() {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log('\n🧹 Limpando usuários de teste do Supabase Auth...');

  for (const email of [TEST_EMAIL_ALUNO, TEST_EMAIL_ACADEMIA]) {
    try {
      // Buscar pelo e-mail via REST Admin
      const response = await fetch(
        `${process.env.SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          },
        }
      );
      const body = await response.json() as { users?: Array<{ id: string; email?: string }> };
      const user = (body.users ?? []).find((u) => u.email === email);

      if (user) {
        const { error } = await supabase.auth.admin.deleteUser(user.id);
        if (error) {
          console.log(`  ⚠️  Erro ao deletar ${email}: ${error.message}`);
        } else {
          console.log(`  🗑️  Deletado: ${email}`);
        }
      } else {
        console.log(`  ⏭️  Não encontrado (já deletado?): ${email}`);
      }
    } catch (err: any) {
      console.log(`  ⚠️  Falha na limpeza de ${email}: ${err.message}`);
    }
  }
}

// ─── Ponto de entrada ────────────────────────────────────────────────────────
async function main() {
  // Sobe servidor temporário em porta aleatória
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;
  console.log(`🚀 Servidor de teste rodando em ${baseUrl}`);

  try {
    await runTests();
  } finally {
    await cleanup();
    server.close();
  }

  // ── Resumo ──────────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log('\n' + '─'.repeat(50));
  console.log(`📊 Resultado: ${passed} passou | ${failed} falhou`);

  if (failed > 0) {
    console.log('\nTestes com falha:');
    results.filter((r) => !r.passed).forEach((r) => {
      console.log(`  ❌ ${r.name}`);
      console.log(`     ${r.error}`);
    });
    process.exit(1);
  } else {
    console.log('\n✅ Todos os testes passaram!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
