-- Segurança e funções do ciclo 12 (integrações, mensagens, chamados, personificação), na ordem
-- em que foram feitas; mesmas regras de 0001_seguranca.
-- Segurança do ciclo 12, bloco 1 (pagamentos). Integrações, avisos e o cadastro no provedor são
-- só da plataforma (o aviso público entra no contexto dela, depois de conferido o token). A cobrança
-- externa e a nota de serviço a empresa lê (link de pagamento, PIX, nota); só a plataforma altera.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['integracao', 'evento_integracao', 'cliente_provedor'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY plataforma ON %I FOR ALL USING (app_plataforma()) WITH CHECK (app_plataforma())', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['cobranca_externa', 'nota_servico'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY leitura ON %I FOR SELECT USING (empresa_id = app_empresa() OR app_plataforma())', t);
    EXECUTE format('CREATE POLICY alteracao ON %I FOR ALL USING (app_plataforma()) WITH CHECK (app_plataforma())', t);
  END LOOP;
END $$;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON "evento_integracao" FROM vinicycle_app;
--> statement-breakpoint
GRANT UPDATE ("processado_em", "resultado") ON "evento_integracao" TO vinicycle_app;
--> statement-breakpoint
-- Segurança do ciclo 12, bloco 2: os modelos de mensagem editados são da plataforma; o sistema lê
-- (no envio, em qualquer contexto) e só a Administração altera.
ALTER TABLE "modelo_mensagem_versao" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY leitura ON "modelo_mensagem_versao" FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY alteracao ON "modelo_mensagem_versao" FOR ALL USING (app_plataforma()) WITH CHECK (app_plataforma());
--> statement-breakpoint
-- A franquia de mensagens é conferida também no contexto da empresa (relatórios agendados), que
-- não lê a fila de envios nem as integrações (RLS). Estas funções devolvem só o necessário.
CREATE FUNCTION mensagens_no_mes(p_empresa uuid, p_canal text, p_desde date) RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT count(*)::int FROM envio
   WHERE empresa_id = p_empresa AND canal = p_canal AND criado_em >= p_desde AND situacao <> 'falhou' $$;
--> statement-breakpoint
CREATE FUNCTION canal_ativo(p_canal text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS (SELECT 1 FROM integracao
   WHERE tipo = p_canal AND ativo AND credenciais_cifradas IS NOT NULL) $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mensagens_no_mes(uuid, text, date), canal_ativo(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mensagens_no_mes(uuid, text, date), canal_ativo(text) TO vinicycle_app;
--> statement-breakpoint
-- Segurança do ciclo 12, bloco 3 (chamados). O cliente vê e altera os chamados da empresa ativa; a
-- nota interna da equipe ele não vê. A página pública grava no contexto da plataforma, depois de
-- validar e limitar as chamadas. Conversa e histórico são livros (só inclusão).
ALTER TABLE "chamado" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY empresa_ativa ON "chamado" FOR ALL
  USING (app_plataforma() OR empresa_id = app_empresa())
  WITH CHECK (app_plataforma() OR empresa_id = app_empresa());
--> statement-breakpoint
ALTER TABLE "chamado_mensagem" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY leitura ON "chamado_mensagem" FOR SELECT
  USING (app_plataforma() OR (empresa_id = app_empresa() AND NOT interna));
--> statement-breakpoint
CREATE POLICY inclusao ON "chamado_mensagem" FOR INSERT
  WITH CHECK (app_plataforma() OR (empresa_id = app_empresa() AND NOT interna AND autor_tipo = 'cliente'));
--> statement-breakpoint
ALTER TABLE "chamado_historico" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY empresa_ativa ON "chamado_historico" FOR ALL
  USING (app_plataforma() OR empresa_id = app_empresa())
  WITH CHECK (app_plataforma() OR empresa_id = app_empresa());
--> statement-breakpoint
ALTER TABLE "chamado_prazo" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY plataforma ON "chamado_prazo" FOR ALL USING (app_plataforma()) WITH CHECK (app_plataforma());
--> statement-breakpoint
REVOKE UPDATE, DELETE ON "chamado_mensagem", "chamado_historico" FROM vinicycle_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE chamado_numero TO vinicycle_app;
--> statement-breakpoint
-- O chamado aberto pelo cliente avisa a equipe de suporte: a função devolve só os e-mails de quem
-- tem a permissão, sem abrir a equipe da plataforma ao contexto da empresa.
CREATE FUNCTION emails_equipe_suporte() RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT DISTINCT u.email FROM equipe_membro m
   JOIN usuario u ON u.id = m.usuario_id
   JOIN perfil_permissao pp ON pp.perfil_id = m.perfil_id
   JOIN funcionalidade f ON f.id = pp.funcionalidade_id
   WHERE m.ativo AND u.ativo AND f.codigo = 'plataforma.suporte' AND pp.acao = 'visualizar' $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION emails_equipe_suporte() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION emails_equipe_suporte() TO vinicycle_app;
--> statement-breakpoint
-- Os prazos de atendimento não são sigilosos: o cliente lê (para calcular o prazo do chamado).
CREATE POLICY leitura ON "chamado_prazo" FOR SELECT USING (true);
--> statement-breakpoint
-- Segurança do ciclo 12, bloco 4 (personificação, P28). A Administração inicia; a autenticação lê
-- e encerra (fim por tempo ou pelo próprio membro); a empresa vê as suas, na auditoria.
ALTER TABLE "personificacao" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY gestao ON "personificacao" FOR ALL
  USING (app_plataforma() OR app_autenticacao())
  WITH CHECK (app_plataforma() OR app_autenticacao());
--> statement-breakpoint
CREATE POLICY empresa ON "personificacao" FOR SELECT USING (empresa_id = app_empresa());
--> statement-breakpoint
REVOKE DELETE ON "personificacao" FROM vinicycle_app;
