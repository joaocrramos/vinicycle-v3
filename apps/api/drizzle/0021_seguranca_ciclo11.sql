-- Segurança das tabelas do ciclo 11 (mesmas regras de 0001_seguranca).
-- Catálogos da plataforma: todos leem; só a Administração altera.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['plano_preco', 'adicional', 'adicional_preco'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY leitura ON %I FOR SELECT USING (true)', t);
    EXECUTE format('CREATE POLICY alteracao ON %I FOR ALL USING (app_plataforma()) WITH CHECK (app_plataforma())', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- Assinatura e cobrança: a empresa lê as suas linhas; só a Administração (e a tarefa de cobrança,
-- no contexto da plataforma) altera. As ações do Master na tela da assinatura passam pela API, que
-- confere o Master e altera no contexto da plataforma (modulos/assinaturas.ts).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['assinatura_item', 'assinatura_mudanca', 'desconto', 'fatura',
    'fatura_item', 'recebimento'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY leitura ON %I FOR SELECT USING (empresa_id = app_empresa() OR app_plataforma())', t);
    EXECUTE format('CREATE POLICY alteracao ON %I FOR ALL USING (app_plataforma()) WITH CHECK (app_plataforma())', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- Recebimento é livro: só se inclui; o erro se corrige pelo estorno, que marca a linha (P13).
REVOKE DELETE ON "recebimento" FROM vinicycle_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE fatura_numero TO vinicycle_app;
--> statement-breakpoint
-- Avisos da régua: só a plataforma.
ALTER TABLE "aviso_cobranca" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY plataforma ON "aviso_cobranca" FOR ALL USING (app_plataforma()) WITH CHECK (app_plataforma());
--> statement-breakpoint
-- Interesse em módulo: a empresa registra e vê os seus; a Administração vê todos e atende.
ALTER TABLE "interesse_modulo" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY empresa_ativa ON "interesse_modulo" FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma());
