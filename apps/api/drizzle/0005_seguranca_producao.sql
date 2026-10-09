-- Segurança das tabelas do ciclo 3 (mesmas regras de drizzle/0001_seguranca.sql).

-- Regras versionadas (P16): todos leem; só a Administração altera.
ALTER TABLE "regra_regulatoria" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY leitura ON "regra_regulatoria" FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY alteracao ON "regra_regulatoria" FOR ALL USING (app_plataforma()) WITH CHECK (app_plataforma());
--> statement-breakpoint

-- Tabelas da empresa: só a empresa ativa (ou a Administração).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['projeto', 'projeto_variedade', 'modelo_plano', 'modelo_plano_etapa',
    'plano_etapa', 'plano_insumo', 'propriedade', 'parcela', 'lote', 'lote_etapa', 'romaneio',
    'romaneio_item', 'pesagem', 'operacao', 'operacao_linha', 'operacao_residuo',
    'movimento_volume', 'movimento_uva', 'genealogia', 'composicao_parte', 'composicao_parte_item',
    'ocorrencia_regra', 'nfe', 'nfe_item', 'associacao_item'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY empresa_ativa ON %I FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma())', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Livros (somente inclusão, P13): o estorno faz lançamentos inversos; nada se edita nem se apaga.
-- A ocorrência só registra o "ciente" na inclusão.
REVOKE UPDATE, DELETE ON "movimento_volume", "movimento_uva", "composicao_parte",
  "composicao_parte_item", "lote_etapa", "ocorrencia_regra" FROM vinicycle_app;
