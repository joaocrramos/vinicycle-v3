-- Segurança das tabelas do ciclo 2 (mesmas regras de drizzle/0001_seguranca.sql).

-- Catálogos da plataforma: todos leem; só a Administração altera.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['papel', 'unidade', 'classe_produto', 'indicacao_geografica'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY leitura ON %I FOR SELECT USING (true)', t);
    EXECUTE format('CREATE POLICY alteracao ON %I FOR ALL USING (app_plataforma()) WITH CHECK (app_plataforma())', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Catálogos globais com itens próprios (P8): a empresa vê os globais e os seus; altera só os seus.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['variedade', 'tipo_recipiente', 'tipo_insumo', 'tipo_documento',
    'parametro_analise', 'opcao_lista'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY leitura ON %I FOR SELECT USING (empresa_id IS NULL OR empresa_id = app_empresa() OR app_plataforma())', t);
    EXECUTE format('CREATE POLICY alteracao ON %I FOR ALL USING ((empresa_id IS NOT NULL AND empresa_id = app_empresa()) OR app_plataforma()) WITH CHECK ((empresa_id IS NOT NULL AND empresa_id = app_empresa()) OR app_plataforma())', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Tabelas da empresa: só a empresa ativa (ou a Administração).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pessoa', 'pessoa_papel', 'pessoa_cliente', 'pessoa_fornecedor',
    'pessoa_produtor_uva', 'pessoa_funcionario', 'pessoa_laboratorio', 'pessoa_rt',
    'pessoa_fabricante_marca', 'pessoa_transportador_placa', 'pessoa_contato', 'documento',
    'documento_versao', 'etiqueta', 'documento_etiqueta', 'parametro', 'empresa_variedade',
    'recipiente', 'item_estoque', 'item_insumo', 'marca', 'produto', 'produto_rotulo',
    'produto_formato', 'ficha_embalagem', 'ciclo', 'rendimento_padrao', 'empresa_parametro_analise',
    'faixa_ideal', 'periodicidade_higienizacao', 'estabelecimento_ig', 'troca_master'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY empresa_ativa ON %I FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma())', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Passagem de bastão: como no convite, o link prova o acesso à empresa. Devolve só a empresa.
CREATE FUNCTION troca_master_empresa_por_token(p_hash bytea) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT empresa_id FROM troca_master WHERE token_hash = p_hash $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION troca_master_empresa_por_token(bytea) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION troca_master_empresa_por_token(bytea) TO vinicycle_app;
