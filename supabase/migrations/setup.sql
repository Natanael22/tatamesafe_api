-- ============================================================
-- TatameSafe — Script de Setup Completo para o Supabase
-- Execute este arquivo inteiro no SQL Editor do Supabase
-- ============================================================

-- ------------------------------------------------------------
-- 0. SCHEMAS E EXTENSÕES
-- ------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS tatame;
CREATE SCHEMA IF NOT EXISTS tatame_vault;

-- Necessário para gen_random_uuid() nas funções SECURITY DEFINER
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ------------------------------------------------------------
-- 1. ENUMS — schema tatame
-- ------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE tatame."UserTipo" AS ENUM ('PAI', 'ALUNO', 'ACADEMIA', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tatame."SeloNivel" AS ENUM ('NENHUM', 'BRONZE', 'PRATA', 'OURO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tatame."CursoTipo" AS ENUM ('PROTECAO_MENORES', 'PREVENCAO_ASSEDIO', 'INCLUSAO', 'OUTRO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------
-- 2. ENUMS — schema tatame_vault
-- ------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE tatame_vault."DenunciaTipo" AS ENUM ('ASSEDIO_SEXUAL', 'ASSEDIO_MORAL', 'VIOLENCIA', 'OUTRO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tatame_vault."DenunciaStatus" AS ENUM ('RECEBIDA', 'TRIAGEM', 'EM_APURACAO', 'ENCERRADA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tatame_vault."Urgencia" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ------------------------------------------------------------
-- 3. TABELAS — schema tatame
-- ------------------------------------------------------------

-- Usuários (sincronizados com o Supabase Auth via auth_id)
CREATE TABLE IF NOT EXISTS tatame."User" (
  "id"         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "auth_id"    TEXT UNIQUE NOT NULL,
  "tipo"       tatame."UserTipo" NOT NULL,
  "nome"       TEXT,
  "email"      TEXT UNIQUE,
  "telefone"   TEXT,
  -- Hash bcrypt da senha específica deste app.
  -- Permite senhas independentes por app no mesmo projeto Supabase.
  "senha_hash" TEXT NULL,
  "criado_em"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Academias de artes marciais
CREATE TABLE IF NOT EXISTS tatame."Academia" (
  "id"            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "user_id"       TEXT UNIQUE NOT NULL REFERENCES tatame."User"("id"),
  "nome"          TEXT NOT NULL,
  "cnpj"          TEXT UNIQUE,
  "endereco"      JSONB NOT NULL DEFAULT '{}',
  "telefone"      TEXT,
  "instagram"     TEXT,
  "descricao"     TEXT,
  "foto_url"      TEXT,
  "nivel_selo"    tatame."SeloNivel" NOT NULL DEFAULT 'NENHUM',
  "verificada"    BOOLEAN NOT NULL DEFAULT false,
  "ativa"         BOOLEAN NOT NULL DEFAULT true,
  "criado_em"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "atualizado_em" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Certificados de cursos das academias
CREATE TABLE IF NOT EXISTS tatame."Certificado" (
  "id"           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "academia_id"  TEXT NOT NULL REFERENCES tatame."Academia"("id"),
  "tipo"         tatame."CursoTipo" NOT NULL,
  "instrutor"    TEXT NOT NULL,
  "emitido_em"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "validade_em"  TIMESTAMPTZ NOT NULL,
  "url_pdf"      TEXT
);

-- Avaliações de alunos sobre academias (máx. 1 por usuário por academia)
CREATE TABLE IF NOT EXISTS tatame."Avaliacao" (
  "id"           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "academia_id"  TEXT NOT NULL REFERENCES tatame."Academia"("id"),
  "user_id"      TEXT NOT NULL REFERENCES tatame."User"("id"),
  "nota"         INTEGER NOT NULL CHECK ("nota" BETWEEN 1 AND 5),
  "categorias"   JSONB NOT NULL DEFAULT '{}',
  "comentario"   TEXT,
  "criado_em"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("user_id", "academia_id")
);


-- ------------------------------------------------------------
-- 4. TABELAS — schema tatame_vault (denúncias sigilosas)
-- ------------------------------------------------------------

-- Denúncias (conteúdo criptografado)
CREATE TABLE IF NOT EXISTS tatame_vault."Denuncia" (
  "id"             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "protocolo"      TEXT UNIQUE NOT NULL,
  "tipo"           tatame_vault."DenunciaTipo" NOT NULL,
  "descricao_enc"  BYTEA NOT NULL,
  "academia_ref"   TEXT,
  "status"         tatame_vault."DenunciaStatus" NOT NULL DEFAULT 'RECEBIDA',
  "urgencia"       tatame_vault."Urgencia" NOT NULL DEFAULT 'MEDIA',
  "envolve_menor"  BOOLEAN NOT NULL DEFAULT false,
  "criado_em"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "atualizado_em"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Evidências anexadas às denúncias
CREATE TABLE IF NOT EXISTS tatame_vault."DenunciaEvidencia" (
  "id"           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "denuncia_id"  TEXT NOT NULL REFERENCES tatame_vault."Denuncia"("id"),
  "s3_key"       TEXT NOT NULL,
  "tipo_mime"    TEXT NOT NULL,
  "tamanho_kb"   INTEGER NOT NULL,
  "criado_em"    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Histórico de alterações de status das denúncias
CREATE TABLE IF NOT EXISTS tatame_vault."DenunciaHistorico" (
  "id"           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "denuncia_id"  TEXT NOT NULL REFERENCES tatame_vault."Denuncia"("id"),
  "status_de"    tatame_vault."DenunciaStatus" NOT NULL,
  "status_para"  tatame_vault."DenunciaStatus" NOT NULL,
  "nota_interna" TEXT,
  "operador_id"  TEXT NOT NULL,
  "criado_em"    TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ------------------------------------------------------------
-- 5. TRIGGER — atualizar atualizado_em automaticamente
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION tatame.set_atualizado_em()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW."atualizado_em" = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_academia_atualizado_em ON tatame."Academia";
CREATE TRIGGER trg_academia_atualizado_em
  BEFORE UPDATE ON tatame."Academia"
  FOR EACH ROW EXECUTE FUNCTION tatame.set_atualizado_em();

DROP TRIGGER IF EXISTS trg_denuncia_atualizado_em ON tatame_vault."Denuncia";
CREATE TRIGGER trg_denuncia_atualizado_em
  BEFORE UPDATE ON tatame_vault."Denuncia"
  FOR EACH ROW EXECUTE FUNCTION tatame.set_atualizado_em();


-- ------------------------------------------------------------
-- 6. FUNÇÕES SECURITY DEFINER (chamadas via supabase.rpc())
-- ------------------------------------------------------------

-- Insere denúncia sem dar permissão direta de INSERT ao cliente
CREATE OR REPLACE FUNCTION tatame.inserir_denuncia(
  p_tipo TEXT,
  p_descricao_enc BYTEA,
  p_academia_ref TEXT,
  p_urgencia TEXT,
  p_envolve_menor BOOLEAN
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tatame, tatame_vault
AS $$
DECLARE
  v_protocolo TEXT;
  v_id TEXT;
BEGIN
  v_id := gen_random_uuid()::TEXT;
  v_protocolo := 'TS-' || to_char(CURRENT_DATE, 'YYYY') || '-' || upper(substring(md5(random()::text) from 1 for 6));

  INSERT INTO tatame_vault."Denuncia" (
    "id", "protocolo", "tipo", "descricao_enc",
    "academia_ref", "urgencia", "envolve_menor",
    "status", "criado_em", "atualizado_em"
  ) VALUES (
    v_id,
    v_protocolo,
    p_tipo::tatame_vault."DenunciaTipo",
    p_descricao_enc,
    p_academia_ref,
    p_urgencia::tatame_vault."Urgencia",
    p_envolve_menor,
    'RECEBIDA',
    now(),
    now()
  );

  RETURN v_protocolo;
END;
$$;

-- Atualiza status e registra histórico em uma única transação atômica
CREATE OR REPLACE FUNCTION tatame.atualizar_status_denuncia(
  p_id TEXT,
  p_status TEXT,
  p_operador_id TEXT,
  p_nota_interna TEXT DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tatame, tatame_vault
AS $$
DECLARE
  v_status_de TEXT;
  v_historico_id TEXT;
  v_result JSON;
BEGIN
  SELECT "status"::TEXT INTO v_status_de
  FROM tatame_vault."Denuncia"
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Denúncia não encontrada: %', p_id;
  END IF;

  UPDATE tatame_vault."Denuncia"
  SET "status" = p_status::tatame_vault."DenunciaStatus",
      "atualizado_em" = now()
  WHERE id = p_id;

  v_historico_id := gen_random_uuid()::TEXT;

  INSERT INTO tatame_vault."DenunciaHistorico" (
    "id", "denuncia_id", "status_de", "status_para",
    "nota_interna", "operador_id", "criado_em"
  ) VALUES (
    v_historico_id,
    p_id,
    v_status_de::tatame_vault."DenunciaStatus",
    p_status::tatame_vault."DenunciaStatus",
    p_nota_interna,
    p_operador_id,
    now()
  );

  SELECT json_build_object(
    'denuncia', row_to_json(d),
    'historico', row_to_json(h)
  ) INTO v_result
  FROM tatame_vault."Denuncia" d, tatame_vault."DenunciaHistorico" h
  WHERE d.id = p_id AND h.id = v_historico_id;

  RETURN v_result;
END;
$$;


-- ------------------------------------------------------------
-- 7. EXPOR SCHEMAS AO SUPABASE (PostgREST)
-- ------------------------------------------------------------
-- Permite que o Supabase Client acesse os schemas tatame e tatame_vault
GRANT USAGE ON SCHEMA tatame TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA tatame_vault TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA tatame TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA tatame_vault TO service_role;

GRANT ALL ON ALL FUNCTIONS IN SCHEMA tatame TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA tatame_vault TO service_role;

-- Garante permissões em tabelas futuras automaticamente
ALTER DEFAULT PRIVILEGES IN SCHEMA tatame
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA tatame_vault
  GRANT ALL ON TABLES TO service_role;


-- ------------------------------------------------------------
-- 8. SEED — Usuário admin de desenvolvimento
-- ------------------------------------------------------------
INSERT INTO tatame."User" ("id", "auth_id", "tipo", "email", "criado_em")
VALUES (
  'admin-seed-id-001',
  'admin-auth-id-999',
  'ADMIN',
  'admin@tatamesafe.com',
  now()
)
ON CONFLICT ("auth_id") DO NOTHING;
