if (process.env.NODE_ENV === 'development') {
  // Desabilita a verificação de SSL localmente para evitar erros de certificado auto-assinado (ex: UNABLE_TO_GET_ISSUER_CERT_LOCALLY)
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Usamos a service_role key para o backend ter acesso total (bypassa RLS)
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  db: {
    // Aponta para o schema público tatame (as tabelas ficam em tatame.*)
    schema: 'tatame' as any,
  },
});

export default supabase;

// Cliente secundário para acessar o schema tatame_vault (denúncias)
export const supabaseVault = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  db: {
    schema: 'tatame_vault' as any,
  },
});
