-- Segurança das tabelas do ciclo 6 (mesmas regras de 0001_seguranca): alertas, importações e
-- fechamento mensal.
ALTER TABLE alerta ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY empresa_ativa ON alerta FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma());--> statement-breakpoint
ALTER TABLE alerta_leitura ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY empresa_ativa ON alerta_leitura FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma());--> statement-breakpoint
ALTER TABLE importacao ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY empresa_ativa ON importacao FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma());--> statement-breakpoint
ALTER TABLE fechamento_mensal ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY empresa_ativa ON fechamento_mensal FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma());
