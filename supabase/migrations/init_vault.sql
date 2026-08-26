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

-- Função atômica para atualizar status de denúncia e registrar histórico
-- Substitui o prisma.$transaction que não tem equivalente direto no Supabase JS client
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
  -- Busca status atual
  SELECT "status"::TEXT INTO v_status_de
  FROM tatame_vault."Denuncia"
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Denúncia não encontrada: %', p_id;
  END IF;

  -- Atualiza o status
  UPDATE tatame_vault."Denuncia"
  SET "status" = p_status::"DenunciaStatus",
      "atualizado_em" = now()
  WHERE id = p_id;

  -- Gera ID do histórico
  v_historico_id := gen_random_uuid()::TEXT;

  -- Registra no histórico
  INSERT INTO tatame_vault."DenunciaHistorico" (
    "id", "denuncia_id", "status_de", "status_para", "nota_interna", "operador_id", "criado_em"
  ) VALUES (
    v_historico_id,
    p_id,
    v_status_de::"DenunciaStatus",
    p_status::"DenunciaStatus",
    p_nota_interna,
    p_operador_id,
    now()
  );

  -- Retorna a denúncia atualizada e o histórico em um único JSON
  SELECT json_build_object(
    'denuncia', row_to_json(d),
    'historico', row_to_json(h)
  ) INTO v_result
  FROM tatame_vault."Denuncia" d, tatame_vault."DenunciaHistorico" h
  WHERE d.id = p_id AND h.id = v_historico_id;

  RETURN v_result;
END;
$$;
