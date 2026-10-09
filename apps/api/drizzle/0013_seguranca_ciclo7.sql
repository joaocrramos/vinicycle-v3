-- Segurança das tabelas do ciclo 7 (mesmas regras de 0001_seguranca): declarações e retificações.
ALTER TABLE declaracao ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY empresa_ativa ON declaracao FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma());--> statement-breakpoint
ALTER TABLE declaracao_retificacao ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY empresa_ativa ON declaracao_retificacao FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma());
