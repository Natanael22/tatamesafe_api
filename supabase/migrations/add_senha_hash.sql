-- ============================================================
-- TatameSafe — Migration: adiciona senha_hash por app na tabela User
-- Execute este arquivo no SQL Editor do Supabase caso o banco
-- já tenha sido criado com o setup.sql anterior.
-- ============================================================

ALTER TABLE tatame."User"
  ADD COLUMN IF NOT EXISTS "senha_hash" TEXT NULL;

COMMENT ON COLUMN tatame."User"."senha_hash" IS
  'Hash bcrypt da senha específica deste app. Nullable para retrocompatibilidade.
   Permite que o mesmo auth_id (Supabase Auth) tenha senhas diferentes em cada app/schema.';
