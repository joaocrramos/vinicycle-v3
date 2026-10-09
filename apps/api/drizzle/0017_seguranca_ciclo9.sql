-- Segurança das tabelas do ciclo 9 (mesmas regras de 0001_seguranca): simulacao_corte comunicacao_alcool selo_faixa selo_uso espumante_lote espumante_evento.
ALTER TABLE simulacao_corte ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY empresa_ativa ON simulacao_corte FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma());--> statement-breakpoint
ALTER TABLE comunicacao_alcool ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY empresa_ativa ON comunicacao_alcool FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma());--> statement-breakpoint
ALTER TABLE selo_faixa ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY empresa_ativa ON selo_faixa FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma());--> statement-breakpoint
ALTER TABLE selo_uso ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY empresa_ativa ON selo_uso FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma());--> statement-breakpoint
ALTER TABLE espumante_lote ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY empresa_ativa ON espumante_lote FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma());--> statement-breakpoint
ALTER TABLE espumante_evento ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY empresa_ativa ON espumante_evento FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma());
