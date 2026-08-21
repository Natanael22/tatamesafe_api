import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

// Ignora erro de certificado autoassinado (Supabase local)
if (process.env.SUPABASE_URL?.includes('localhost') || process.env.SUPABASE_URL?.includes('127.0.0.1')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  try {
    const { setGlobalDispatcher, Agent } = require('undici');
    setGlobalDispatcher(new Agent({ connect: { rejectUnauthorized: false } }));
  } catch (e) {}
}

const supabaseUrl = process.env.SUPABASE_URL!;

const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('ERRO: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devem estar configurados no .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  db: { schema: 'tatame' as any }
});

async function main() {
  const email = process.argv[2] || 'admin@tatamesafe.com.br';
  const password = process.argv[3] || 'TatameSafe@Admin123';
  const nome = process.argv[4] || 'Admin Principal';

  console.log(`\nCriando operador/admin...`);
  console.log(`Email: ${email}`);
  console.log(`Nome:  ${nome}\n`);

  try {
    // 1. Verifica se o usuário já existe no Auth
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;

    let authId;
    const existingAuthUser = users.find(u => u.email === email);

    if (existingAuthUser) {
      console.log('⚠️  Usuário já existe no Supabase Auth. Aproveitando ID existente...');
      authId = existingAuthUser.id;
    } else {
      console.log('👤 Criando usuário no Supabase Auth...');
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Já cria com email confirmado
        user_metadata: { nome, tipo: 'ADMIN' }
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Falha ao obter dados do usuário recém-criado.');
      
      authId = authData.user.id;
      console.log('✓ Usuário criado no Auth com ID:', authId);
    }

    // 2. Verifica se já existe na tabela tatame."User"
    const { data: existingUser } = await supabase
      .from('User')
      .select('id, tipo')
      .eq('auth_id', authId)
      .maybeSingle();

    if (existingUser) {
      if (existingUser.tipo !== 'ADMIN') {
        console.log(`⚠️  Usuário já existe no banco, mas com tipo ${existingUser.tipo}. Atualizando para ADMIN...`);
        await supabase.from('User').update({ tipo: 'ADMIN' }).eq('id', existingUser.id);
        console.log('✓ Tipo atualizado para ADMIN com sucesso.');
      } else {
        console.log('✓ Usuário já está cadastrado como ADMIN no banco.');
      }
    } else {
      console.log('💾 Inserindo perfil na tabela User...');
      const senhaHash = await bcrypt.hash(password, 12);
      
      const { error: insertError } = await supabase.from('User').insert({
        auth_id: authId,
        tipo: 'ADMIN',
        nome,
        email,
        telefone: null,
        senha_hash: senhaHash
      });

      if (insertError) throw insertError;
      console.log('✓ Perfil criado com sucesso na tabela User.');
    }

    console.log(`\n✅ Sucesso! Agora você pode logar no painel em http://localhost:3000/admin`);
    console.log(`   Email: ${email}`);
    console.log(`   Senha: ${password}\n`);
    
  } catch (error: any) {
    console.error('\n❌ ERRO FATAL:', error.message || error);
    process.exit(1);
  }
}

main();
