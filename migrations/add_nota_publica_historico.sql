-- ============================================================================
-- TatameSafe — Migração: nota_publica no DenunciaHistorico
-- Execute no Supabase Dashboard > SQL Editor
--
-- Permite que operadores enviem mensagens visíveis ao denunciante em cada
-- atualização de status, dando transparência ao andamento do caso.
-- ============================================================================

-- 1. Adicionar coluna nota_publica ao histórico
ALTER TABLE tatame_vault."DenunciaHistorico"
  ADD COLUMN IF NOT EXISTS nota_publica TEXT NULL;

COMMENT ON COLUMN tatame_vault."DenunciaHistorico".nota_publica IS
  'Mensagem opcional visível ao denunciante. Use para comunicar andamentos concretos do caso.';

-- 2. Recriar a função atualizar_status_denuncia aceitando nota_publica
CREATE OR REPLACE FUNCTION tatame.atualizar_status_denuncia(
  p_id TEXT,
  p_status TEXT,
  p_operador_id TEXT,
  p_nota_interna TEXT DEFAULT NULL,
  p_nota_publica TEXT DEFAULT NULL
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
    "nota_interna", "nota_publica", "operador_id", "criado_em"
  ) VALUES (
    v_historico_id,
    p_id,
    v_status_de::tatame_vault."DenunciaStatus",
    p_status::tatame_vault."DenunciaStatus",
    p_nota_interna,
    p_nota_publica,
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

-- Confirmar
SELECT 'Migração aplicada com sucesso!' AS resultado;
