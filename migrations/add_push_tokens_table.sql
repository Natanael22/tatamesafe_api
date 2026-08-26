-- ============================================================================
-- TatameSafe — Migração: DenunciaPushToken
-- Execute no Supabase Dashboard > SQL Editor
--
-- Tabela para armazenar os tokens de Push Notification dos dispositivos que
-- querem receber alertas (Expo Notifications) sobre uma denúncia.
-- ============================================================================

CREATE TABLE IF NOT EXISTS tatame_vault."DenunciaPushToken" (
  "id"           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "denuncia_id"  TEXT NOT NULL REFERENCES tatame_vault."Denuncia"("id") ON DELETE CASCADE,
  "push_token"   TEXT NOT NULL,
  "criado_em"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("denuncia_id", "push_token")
);

-- Permissões para que a Role 'service_role' (nossa API) acesse
GRANT ALL ON TABLE tatame_vault."DenunciaPushToken" TO service_role;

SELECT 'Migração aplicada com sucesso! Tabela DenunciaPushToken criada.' AS resultado;
