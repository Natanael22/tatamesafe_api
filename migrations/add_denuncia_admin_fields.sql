-- ============================================================================
-- TatameSafe — Migração: Administração de Denúncias
-- Executar no Supabase Dashboard > SQL Editor
--
-- Adiciona campos de SLA, operador e encaminhamento à tabela Denuncia,
-- e cria a tabela DenunciaTriagem para registro formal de triagens.
--
-- ATENÇÃO: O schema pode ser 'tatame_vault' ou 'vault' dependendo do projeto.
-- Verifique com: SELECT schema_name FROM information_schema.schemata;
-- ============================================================================

-- 1. Adicionar colunas na tabela Denuncia
-- ---------------------------------------------------------------------------
ALTER TABLE tatame_vault."Denuncia"
  ADD COLUMN IF NOT EXISTS sla_prazo         TIMESTAMPTZ        NULL,
  ADD COLUMN IF NOT EXISTS operador_id       TEXT               NULL,
  ADD COLUMN IF NOT EXISTS encaminhamento    TEXT               NULL,
  ADD COLUMN IF NOT EXISTS encaminhamento_notas TEXT            NULL;

-- Comentários para documentação
COMMENT ON COLUMN tatame_vault."Denuncia".sla_prazo IS
  'Prazo SLA calculado na criação: CRITICA=2h, ALTA=8h, MEDIA=24h, BAIXA=72h';
COMMENT ON COLUMN tatame_vault."Denuncia".operador_id IS
  'ID do operador (User.id do schema tatame) responsável pela denúncia';
COMMENT ON COLUMN tatame_vault."Denuncia".encaminhamento IS
  'Para onde foi encaminhada: CONSELHO_TUTELAR | DELEGACIA | PSICOLOGO | MINISTERIO_PUBLICO | OUTRO';
COMMENT ON COLUMN tatame_vault."Denuncia".encaminhamento_notas IS
  'Notas do encaminhamento: número de BO, contatos, etc.';

-- 2. Criar tabela de Triagem Formal
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tatame_vault."DenunciaTriagem" (
  id                    TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  denuncia_id           TEXT        NOT NULL REFERENCES tatame_vault."Denuncia"(id) ON DELETE CASCADE,
  operador_id           TEXT        NOT NULL,
  categoria_confirmada  TEXT        NOT NULL CHECK (categoria_confirmada IN ('ASSEDIO_SEXUAL', 'ASSEDIO_MORAL', 'VIOLENCIA', 'OUTRO')),
  urgencia_confirmada   TEXT        NOT NULL CHECK (urgencia_confirmada  IN ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA')),
  encaminhamento        TEXT        NULL       CHECK (encaminhamento     IN ('CONSELHO_TUTELAR', 'DELEGACIA', 'PSICOLOGO', 'MINISTERIO_PUBLICO', 'OUTRO')),
  notas                 TEXT        NULL,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Garante uma única triagem por denúncia
  UNIQUE (denuncia_id)
);

COMMENT ON TABLE tatame_vault."DenunciaTriagem" IS
  'Registro formal de triagem realizada pelo operador. Imutável após inserção.';

-- 3. Índices para performance das consultas admin
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_denuncia_status    ON tatame_vault."Denuncia" (status);
CREATE INDEX IF NOT EXISTS idx_denuncia_urgencia  ON tatame_vault."Denuncia" (urgencia);
CREATE INDEX IF NOT EXISTS idx_denuncia_sla_prazo ON tatame_vault."Denuncia" (sla_prazo)
  WHERE status NOT IN ('ENCERRADA');
CREATE INDEX IF NOT EXISTS idx_denuncia_operador  ON tatame_vault."Denuncia" (operador_id)
  WHERE operador_id IS NULL; -- Acelera busca por denúncias sem operador

-- 4. RLS para DenunciaTriagem (mesmo padrão da Denuncia)
-- ---------------------------------------------------------------------------
ALTER TABLE tatame_vault."DenunciaTriagem" ENABLE ROW LEVEL SECURITY;

-- Operadores (triagem_service) podem inserir e ler
-- Ajuste o role conforme a configuração do seu projeto
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'tatame_vault'
    AND tablename = '"DenunciaTriagem"'
    AND policyname = 'service_role_denuncia_triagem'
  ) THEN
    CREATE POLICY service_role_denuncia_triagem
      ON tatame_vault."DenunciaTriagem"
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- Verificação
-- ============================================================================
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'tatame_vault'
  AND table_name = 'Denuncia'
  AND column_name IN ('sla_prazo', 'operador_id', 'encaminhamento', 'encaminhamento_notas')
ORDER BY column_name;
