-- Segurança das tabelas do ciclo 4 (mesmas regras de 0001_seguranca): estoque de insumos,
-- insumos e tratamentos das operações, análises e fermentações, inventário da cantina e
-- higienização.

-- Tabelas da empresa: só a empresa ativa (ou a Administração).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'lote_item', 'movimento_estoque', 'pendencia_estoque',
    'operacao_insumo', 'operacao_chaptalizacao', 'operacao_parametro', 'tipo_tratamento_parametro',
    'analise', 'analise_resultado', 'fermentacao',
    'inventario_cantina', 'inventario_cantina_item',
    'operacao_higienizacao'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY empresa_ativa ON %I FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma())', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Livro do estoque (somente inclusão, P13): o estorno faz lançamentos inversos.
REVOKE UPDATE, DELETE ON "movimento_estoque" FROM vinicycle_app;
