-- Segurança das tabelas do ciclo 8 (mesmas regras de 0001_seguranca): autocontrole_controle autocontrole_evidencia solicitacao_aprovacao diario_nota relatorio_agendado.
ALTER TABLE autocontrole_controle ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY empresa_ativa ON autocontrole_controle FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma());--> statement-breakpoint
ALTER TABLE autocontrole_evidencia ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY empresa_ativa ON autocontrole_evidencia FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma());--> statement-breakpoint
ALTER TABLE solicitacao_aprovacao ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY empresa_ativa ON solicitacao_aprovacao FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma());--> statement-breakpoint
ALTER TABLE diario_nota ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY empresa_ativa ON diario_nota FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma());--> statement-breakpoint
ALTER TABLE relatorio_agendado ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY empresa_ativa ON relatorio_agendado FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma());
--> statement-breakpoint
-- A tarefa de fundo dos relatórios agendados só lê quem está devido; o envio é no contexto do usuário.
CREATE POLICY tarefa ON relatorio_agendado FOR SELECT USING (app_sistema());
