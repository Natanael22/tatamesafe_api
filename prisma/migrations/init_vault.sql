-- Create the tatame_vault schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS tatame_vault;
CREATE SCHEMA IF NOT EXISTS tatame;

-- Habilita extensão para geração de UUID nativo no PostgreSQL
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Function to insert a complaint without giving direct insert permission to the public role
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
  -- Gera um ID único compatível com o modelo do Prisma (UUID v4)
  v_id := gen_random_uuid()::TEXT;

  -- Generate Protocol: TS-YYYY-XXXXXX
  v_protocolo := 'TS-' || to_char(CURRENT_DATE, 'YYYY') || '-' || upper(substring(md5(random()::text) from 1 for 6));
  
  -- Insert into the tatame_vault schema
  INSERT INTO tatame_vault."Denuncia" (
    "id",
    "protocolo", 
    "tipo", 
    "descricao_enc", 
    "academia_ref", 
    "urgencia", 
    "envolve_menor",
    "status",
    "criado_em",
    "atualizado_em"
  ) VALUES (
    v_id,
    v_protocolo,
    p_tipo::"DenunciaTipo",
    p_descricao_enc,
    p_academia_ref,
    p_urgencia::"Urgencia",
    p_envolve_menor,
    'RECEBIDA',
    now(),
    now()
  );

  RETURN v_protocolo;
END;
$$;
