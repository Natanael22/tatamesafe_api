import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import supabase from '../lib/supabase';
import logger from '../lib/logger';

const router = Router();

const BCRYPT_ROUNDS = 12;
// Duração da sessão: 1 hora (em segundos)
const SESSION_DURATION_SECONDS = 60 * 60;

// ---------------------------------------------------------------------------
// Auxiliar: cria um JWT compatível com o middleware requireAuth.
// O token contém os campos padrão esperados pelo jwt.verify() local.
// ---------------------------------------------------------------------------
function createLocalSession(auth_id: string, email: string) {
  const jwtSecret = process.env.JWT_SECRET!;
  const now = Math.floor(Date.now() / 1000);

  const accessToken = jwt.sign(
    {
      sub: auth_id,
      email,
      role: 'authenticated',
      aud: 'authenticated',
      iat: now,
      exp: now + SESSION_DURATION_SECONDS,
    },
    jwtSecret
  );

  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: SESSION_DURATION_SECONDS,
    expires_at: now + SESSION_DURATION_SECONDS,
  };
}

// ---------------------------------------------------------------------------
// Auxiliar: verifica se um e-mail já existe no Supabase Auth.
// Usa a API REST admin diretamente com query filter (mais eficiente que listUsers).
// ---------------------------------------------------------------------------
async function findAuthUserByEmail(email: string) {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const response = await fetch(
    `${supabaseUrl}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
    {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Erro ao consultar Supabase Auth: ${response.status}`);
  }

  const body = await response.json() as { users?: Array<{ id: string; email?: string }> };
  // O filtro retorna resultados parciais; filtramos pelo e-mail exato
  const users = body.users ?? [];
  return users.find((u) => u.email === email) ?? null;
}

// ---------------------------------------------------------------------------
// Auxiliar: busca usuário local pelo auth_id
// ---------------------------------------------------------------------------
async function findUserByAuthId(auth_id: string) {
  const { data, error } = await supabase
    .from('User')
    .select('*, academia:Academia(*)')
    .eq('auth_id', auth_id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// POST /signup/aluno — Cadastro de Aluno
//
// Fluxo multi-app:
//  1. Verifica se o e-mail já existe no Supabase Auth
//     - Não existe → cria via signUp (primeiro app a registrar este e-mail)
//     - Existe     → reusa o auth_id (usuário de outro app)
//  2. Verifica se já tem perfil NESTE schema (tatame)
//     - Tem → 409 Conflict (já cadastrado aqui)
//     - Não tem → cria User com senha_hash bcrypt específica deste app
//  3. Retorna um JWT local (assinado com JWT_SECRET)
// ---------------------------------------------------------------------------
router.post('/signup/aluno', async (req, res) => {
  try {
    const { email, password, nome, telefone } = req.body;

    if (!email || !password || !nome) {
      return res.status(400).json({ error: 'Campos obrigatórios: email, password, nome' });
    }

    let auth_id: string;
    let isNewAuthUser = false;

    // 1. Verificar existência no Supabase Auth
    const existingAuthUser = await findAuthUserByEmail(email);

    if (!existingAuthUser) {
      // Novo e-mail no ecossistema: criar via Admin API (não altera o JWT do cliente)
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // confirma automaticamente (backend confiável)
      });

      if (authError || !authData.user) {
        logger.error(authError, 'Erro ao criar usuário no Supabase Auth (Aluno)');
        return res.status(400).json({ error: authError?.message || 'Falha no cadastro do usuário' });
      }

      auth_id = authData.user.id;
      isNewAuthUser = true;
    } else {
      // E-mail já existe no Auth (outro app): reusar identidade
      auth_id = existingAuthUser.id;
    }

    // 2. Verificar se já tem perfil neste app (schema tatame)
    const { data: existingUser } = await supabase
      .from('User')
      .select('id')
      .eq('auth_id', auth_id)
      .maybeSingle();

    if (existingUser) {
      return res.status(409).json({
        error: 'Este e-mail já está cadastrado neste app. Por favor, faça login.',
      });
    }

    // 3. Gerar hash da senha específica deste app
    const senha_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // 4. Inserir perfil local com senha_hash
    const { data: userRecord, error: userError } = await supabase
      .from('User')
      .insert({
        auth_id,
        tipo: 'ALUNO',
        nome,
        email,
        telefone: telefone || null,
        senha_hash,
      })
      .select()
      .single();

    if (userError) {
      if (isNewAuthUser) {
        await supabase.auth.admin.deleteUser(auth_id);
      }
      logger.error(userError, 'Erro ao salvar perfil do usuário local (Aluno)');
      return res.status(500).json({ error: 'Erro ao salvar o perfil do usuário' });
    }

    // 5. Criar sessão local (JWT)
    const session = createLocalSession(auth_id, email);

    // Retornar sem expor senha_hash
    const { senha_hash: _, ...userPublic } = userRecord;

    res.status(201).json({
      message: 'Cadastro de aluno realizado com sucesso',
      user: userPublic,
      session,
    });
  } catch (error: any) {
    logger.error(error, 'Erro interno no cadastro de aluno');
    res.status(500).json({ error: 'Erro interno ao processar cadastro' });
  }
});

// ---------------------------------------------------------------------------
// POST /signup/academia — Cadastro de Academia
// Mesmo fluxo multi-app do signup/aluno
// ---------------------------------------------------------------------------
router.post('/signup/academia', async (req, res) => {
  try {
    const {
      email,
      password,
      nome,
      telefone,
      cnpj,
      endereco,
      instagram,
      descricao,
      foto_url,
    } = req.body;

    if (!email || !password || !nome) {
      return res.status(400).json({ error: 'Campos obrigatórios: email, password, nome da academia' });
    }

    let auth_id: string;
    let isNewAuthUser = false;

    // 1. Verificar existência no Supabase Auth
    const existingAuthUser = await findAuthUserByEmail(email);

    if (!existingAuthUser) {
      // Novo e-mail no ecossistema: criar via Admin API (não altera o JWT do cliente)
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // confirma automaticamente (backend confiável)
      });

      if (authError || !authData.user) {
        logger.error(authError, 'Erro ao criar usuário no Supabase Auth (Academia)');
        return res.status(400).json({ error: authError?.message || 'Falha no cadastro do usuário' });
      }

      auth_id = authData.user.id;
      isNewAuthUser = true;
    } else {
      auth_id = existingAuthUser.id;
    }

    // 2. Verificar se já tem perfil neste app
    const { data: existingUser } = await supabase
      .from('User')
      .select('id')
      .eq('auth_id', auth_id)
      .maybeSingle();

    if (existingUser) {
      return res.status(409).json({
        error: 'Este e-mail já está cadastrado neste app. Por favor, faça login.',
      });
    }

    // 3. Hash da senha específica deste app
    const senha_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // 4. Inserir User
    const { data: userRecord, error: userError } = await supabase
      .from('User')
      .insert({
        auth_id,
        tipo: 'ACADEMIA',
        nome,
        email,
        telefone: telefone || null,
        senha_hash,
      })
      .select()
      .single();

    if (userError) {
      if (isNewAuthUser) {
        await supabase.auth.admin.deleteUser(auth_id);
      }
      logger.error(userError, 'Erro ao salvar perfil do usuário local (Academia)');
      return res.status(500).json({ error: 'Erro ao salvar o perfil do usuário' });
    }

    // 5. Inserir Academia
    const { data: academiaRecord, error: academiaError } = await supabase
      .from('Academia')
      .insert({
        user_id: userRecord.id,
        nome,
        cnpj: cnpj || null,
        endereco: endereco || {},
        telefone: telefone || null,
        instagram: instagram || null,
        descricao: descricao || null,
        foto_url: foto_url || null,
        nivel_selo: 'NENHUM',
        verificada: false,
        ativa: true,
      })
      .select()
      .single();

    if (academiaError) {
      await supabase.from('User').delete().eq('id', userRecord.id);
      if (isNewAuthUser) {
        await supabase.auth.admin.deleteUser(auth_id);
      }
      logger.error(academiaError, 'Erro ao salvar detalhes da academia local');
      return res.status(500).json({ error: 'Erro ao salvar os detalhes da academia' });
    }

    // 6. Criar sessão local (JWT)
    const session = createLocalSession(auth_id, email);

    const { senha_hash: _, ...userPublic } = userRecord;

    res.status(201).json({
      message: 'Cadastro de academia realizado com sucesso',
      user: userPublic,
      academia: academiaRecord,
      session,
    });
  } catch (error: any) {
    logger.error(error, 'Erro interno no cadastro de academia');
    res.status(500).json({ error: 'Erro interno ao processar cadastro' });
  }
});

// ---------------------------------------------------------------------------
// POST /signin — Login
//
// Fluxo multi-app:
//  1. Busca o usuário pelo e-mail na tabela local (deste schema)
//  2. Verifica a senha com bcrypt contra o senha_hash local
//  3. Emite JWT local assinado com JWT_SECRET
// ---------------------------------------------------------------------------
router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
    }

    // 1. Buscar usuário neste app pelo e-mail
    const { data: user, error: userError } = await supabase
      .from('User')
      .select('id, auth_id, tipo, nome, email, telefone, criado_em, senha_hash, academia:Academia(*)')
      .eq('email', email)
      .maybeSingle();

    if (userError) {
      logger.error(userError, 'Erro ao buscar usuário no login');
      return res.status(500).json({ error: 'Erro interno ao processar login' });
    }

    // Não revelar se o e-mail existe ou não (segurança)
    if (!user || !user.senha_hash) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos' });
    }

    // 2. Verificar senha bcrypt específica deste app
    const senhaValida = await bcrypt.compare(password, user.senha_hash);

    if (!senhaValida) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos' });
    }

    // 3. Emitir JWT local
    const session = createLocalSession(user.auth_id, user.email);

    // Retornar sem expor senha_hash
    const { senha_hash: _, ...userPublic } = user;

    res.json({
      message: 'Autenticado com sucesso',
      session,
      user: userPublic,
    });
  } catch (error: any) {
    logger.error(error, 'Erro interno no login');
    res.status(500).json({ error: 'Erro interno ao processar login' });
  }
});

// ---------------------------------------------------------------------------
// POST /signout — Logout
// ---------------------------------------------------------------------------
router.post('/signout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(400).json({ error: 'Token de autorização não fornecido' });
    }

    // JWTs locais são stateless — basta confirmar que o token é válido
    // e orientar o cliente a descartá-lo.
    // Para revogação real, implemente uma blocklist com Redis.
    res.json({ message: 'Sessão encerrada com sucesso' });
  } catch (error: any) {
    logger.error(error, 'Erro interno no logout');
    res.status(500).json({ error: 'Erro interno ao processar logout' });
  }
});

export default router;
