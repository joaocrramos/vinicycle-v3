-- Segurança das tabelas do ciclo 10 (mesmas regras de 0001_seguranca): contrato_terceirizacao contrato_terceirizacao_preco contrato_terceirizacao_marca contrato_terceirizacao_produto transferencia_titularidade dossie dossie_envio remessa_terceiro remessa_terceiro_item retorno_terceiro retorno_terceiro_item.
ALTER TABLE contrato_terceirizacao ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY empresa_ativa ON contrato_terceirizacao FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma());--> statement-breakpoint
ALTER TABLE contrato_terceirizacao_preco ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY empresa_ativa ON contrato_terceirizacao_preco FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma());--> statement-breakpoint
ALTER TABLE contrato_terceirizacao_marca ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY empresa_ativa ON contrato_terceirizacao_marca FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma());--> statement-breakpoint
ALTER TABLE contrato_terceirizacao_produto ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY empresa_ativa ON contrato_terceirizacao_produto FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma());--> statement-breakpoint
ALTER TABLE transferencia_titularidade ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY empresa_ativa ON transferencia_titularidade FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma());--> statement-breakpoint
ALTER TABLE dossie ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY empresa_ativa ON dossie FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma());--> statement-breakpoint
ALTER TABLE dossie_envio ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY empresa_ativa ON dossie_envio FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma());--> statement-breakpoint
ALTER TABLE remessa_terceiro ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY empresa_ativa ON remessa_terceiro FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma());--> statement-breakpoint
ALTER TABLE remessa_terceiro_item ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY empresa_ativa ON remessa_terceiro_item FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma());--> statement-breakpoint
ALTER TABLE retorno_terceiro ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY empresa_ativa ON retorno_terceiro FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma());--> statement-breakpoint
ALTER TABLE retorno_terceiro_item ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY empresa_ativa ON retorno_terceiro_item FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma());
