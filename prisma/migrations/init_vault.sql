-- Create the tatame_vault schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS tatame_vault;
CREATE SCHEMA IF NOT EXISTS tatame;

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
BEGIN
  -- Generate Protocol: TS-YYYY-XXXXXX
  v_protocolo := 'TS-' || to_char(CURRENT_DATE, 'YYYY') || '-' || upper(substring(md5(random()::text) from 1 for 6));
  
  -- Insert into the tatame_vault schema
  INSERT INTO tatame_vault."Denuncia" (
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
