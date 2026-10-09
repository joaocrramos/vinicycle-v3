-- Segurança da base (02-arquitetura.md, Princípios 1 e 2; 03-modelo-de-dados.md, 1.2 e 1.3).
--
-- Papéis:
--   vinicycle_dono  dono do esquema; roda as migrações. Não é usado pela API.
--   vinicycle_app   usado pela API; sem privilégio de ignorar o RLS.
--
-- Contexto de cada transação da API, gravado com set_config(..., true):
--   app.usuario_id     usuário autenticado;
--   app.empresa_id     empresa ativa;
--   app.plataforma     'on' na Administração, depois de a API conferir o perfil de plataforma;
--   app.autenticacao   'on' só nos fluxos de entrada (login, senha, convite): libera as tabelas
--                      do usuário (identidade, sessão, token), nunca as da empresa;
--   app.sistema        'on' nas tarefas de fundo (fila de envios).

-- Busca sem diferenciar acentos (P4).
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint

-- A empresa e a ficha dela nascem na mesma transação: a referência é conferida no fim.
ALTER TABLE "ficha" ADD CONSTRAINT "ficha_empresa_id_empresa_id_fk"
  FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint

CREATE FUNCTION app_usuario() RETURNS uuid LANGUAGE sql STABLE PARALLEL SAFE AS
$$ SELECT nullif(current_setting('app.usuario_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE FUNCTION app_empresa() RETURNS uuid LANGUAGE sql STABLE PARALLEL SAFE AS
$$ SELECT nullif(current_setting('app.empresa_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE FUNCTION app_plataforma() RETURNS boolean LANGUAGE sql STABLE PARALLEL SAFE AS
$$ SELECT coalesce(current_setting('app.plataforma', true), '') = 'on' $$;
--> statement-breakpoint
CREATE FUNCTION app_autenticacao() RETURNS boolean LANGUAGE sql STABLE PARALLEL SAFE AS
$$ SELECT coalesce(current_setting('app.autenticacao', true), '') = 'on' $$;
--> statement-breakpoint
CREATE FUNCTION app_sistema() RETURNS boolean LANGUAGE sql STABLE PARALLEL SAFE AS
$$ SELECT coalesce(current_setting('app.sistema', true), '') = 'on' $$;
--> statement-breakpoint

-- Convite: o link prova o acesso à empresa que convidou. A função devolve só a empresa, para a
-- API ativar esse contexto; o resto do convite é lido com o RLS normal.
CREATE FUNCTION convite_empresa_por_token(p_hash bytea) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT empresa_id FROM convite WHERE token_hash = p_hash $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION convite_empresa_por_token(bytea) FROM PUBLIC;
--> statement-breakpoint

-- Privilégios da API. Livros (somente inclusão): só inserir e ler (P13, P14).
GRANT USAGE ON SCHEMA public TO vinicycle_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vinicycle_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON "auditoria", "empresa_situacao", "termo_aceite", "envio_tentativa" FROM vinicycle_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_usuario(), app_empresa(), app_plataforma(), app_autenticacao(),
  app_sistema(), convite_empresa_por_token(bytea) TO vinicycle_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vinicycle_app;
--> statement-breakpoint

-- Catálogos da plataforma: todos leem; só a Administração altera.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['modulo', 'funcionalidade', 'plano', 'plano_modulo', 'termo_versao',
    'config_plataforma'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY leitura ON %I FOR SELECT USING (true)', t);
    EXECUTE format('CREATE POLICY alteracao ON %I FOR ALL USING (app_plataforma()) WITH CHECK (app_plataforma())', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Tabelas da empresa: só a empresa ativa (ou a Administração).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['estabelecimento', 'local', 'convite', 'vinculo_estabelecimento',
    'anexo', 'formato_codigo', 'sequencia', 'empresa_situacao', 'assinatura'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY empresa_ativa ON %I FOR ALL USING (empresa_id = app_empresa() OR app_plataforma()) WITH CHECK (empresa_id = app_empresa() OR app_plataforma())', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- A assinatura e o histórico de situações só são alterados pela Administração.
DROP POLICY empresa_ativa ON "assinatura";
--> statement-breakpoint
CREATE POLICY leitura ON "assinatura" FOR SELECT USING (empresa_id = app_empresa() OR app_plataforma());
--> statement-breakpoint
CREATE POLICY alteracao ON "assinatura" FOR ALL USING (app_plataforma()) WITH CHECK (app_plataforma());
--> statement-breakpoint

-- Empresa: a ativa, as do usuário (seletor de empresa) e a Administração.
ALTER TABLE "empresa" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY leitura ON "empresa" FOR SELECT USING (
  id = app_empresa() OR app_plataforma()
  OR EXISTS (SELECT 1 FROM vinculo v WHERE v.empresa_id = empresa.id AND v.usuario_id = app_usuario() AND v.ativo)
);
--> statement-breakpoint
CREATE POLICY inclusao ON "empresa" FOR INSERT WITH CHECK (app_plataforma());
--> statement-breakpoint
CREATE POLICY alteracao ON "empresa" FOR UPDATE USING (id = app_empresa() OR app_plataforma())
  WITH CHECK (id = app_empresa() OR app_plataforma());
--> statement-breakpoint

-- Vínculo: os da empresa ativa e os do próprio usuário (para escolher a empresa).
ALTER TABLE "vinculo" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY leitura ON "vinculo" FOR SELECT USING (
  empresa_id = app_empresa() OR usuario_id = app_usuario() OR app_plataforma()
);
--> statement-breakpoint
CREATE POLICY alteracao ON "vinculo" FOR ALL USING (empresa_id = app_empresa() OR app_plataforma())
  WITH CHECK (empresa_id = app_empresa() OR app_plataforma());
--> statement-breakpoint

-- Perfis: os da empresa ativa; o de plataforma do próprio membro da equipe; todos na Administração.
-- Perfis de plataforma e modelos nunca aparecem para empresas (P27).
ALTER TABLE "perfil" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY leitura ON "perfil" FOR SELECT USING (
  empresa_id = app_empresa() OR app_plataforma()
  OR (escopo = 'plataforma' AND EXISTS (
    SELECT 1 FROM equipe_membro m WHERE m.perfil_id = perfil.id AND m.usuario_id = app_usuario() AND m.ativo))
);
--> statement-breakpoint
CREATE POLICY alteracao ON "perfil" FOR ALL
  USING ((escopo = 'empresa' AND empresa_id = app_empresa()) OR app_plataforma())
  WITH CHECK ((escopo = 'empresa' AND empresa_id = app_empresa()) OR app_plataforma());
--> statement-breakpoint
ALTER TABLE "perfil_permissao" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY leitura ON "perfil_permissao" FOR SELECT USING (
  empresa_id = app_empresa() OR app_plataforma()
  OR (empresa_id IS NULL AND EXISTS (SELECT 1 FROM perfil p WHERE p.id = perfil_permissao.perfil_id))
);
--> statement-breakpoint
CREATE POLICY alteracao ON "perfil_permissao" FOR ALL USING (empresa_id = app_empresa() OR app_plataforma())
  WITH CHECK (empresa_id = app_empresa() OR app_plataforma());
--> statement-breakpoint

ALTER TABLE "equipe_membro" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY leitura ON "equipe_membro" FOR SELECT USING (usuario_id = app_usuario() OR app_plataforma());
--> statement-breakpoint
CREATE POLICY alteracao ON "equipe_membro" FOR ALL USING (app_plataforma()) WITH CHECK (app_plataforma());
--> statement-breakpoint

-- Identidade do usuário (P8): o próprio, os colegas da empresa ativa, os fluxos de entrada e a
-- Administração.
ALTER TABLE "usuario" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY leitura ON "usuario" FOR SELECT USING (
  id = app_usuario() OR app_autenticacao() OR app_plataforma()
  OR EXISTS (SELECT 1 FROM vinculo v WHERE v.usuario_id = usuario.id AND v.empresa_id = app_empresa())
);
--> statement-breakpoint
CREATE POLICY inclusao ON "usuario" FOR INSERT WITH CHECK (app_autenticacao() OR app_plataforma());
--> statement-breakpoint
CREATE POLICY alteracao ON "usuario" FOR UPDATE
  USING (id = app_usuario() OR app_autenticacao() OR app_plataforma())
  WITH CHECK (id = app_usuario() OR app_autenticacao() OR app_plataforma());
--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sessao', 'token_verificacao', 'termo_aceite'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY proprio ON %I FOR ALL USING (usuario_id = app_usuario() OR app_autenticacao() OR app_plataforma()) WITH CHECK (usuario_id = app_usuario() OR app_autenticacao() OR app_plataforma())', t);
  END LOOP;
END $$;
--> statement-breakpoint

ALTER TABLE "preferencia_listagem" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY proprio ON "preferencia_listagem" FOR ALL USING (usuario_id = app_usuario())
  WITH CHECK (usuario_id = app_usuario());
--> statement-breakpoint

-- Ficha (P2). A ficha do usuário (sem empresa) é visível a quem vê o usuário; a da empresa, a
-- quem vê a empresa. Só altera quem é dono.
CREATE FUNCTION pode_alterar_ficha(p_empresa uuid, p_ficha uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN app_plataforma() THEN true
    WHEN p_empresa IS NOT NULL THEN p_empresa = app_empresa()
    ELSE app_autenticacao()
      OR EXISTS (SELECT 1 FROM usuario u WHERE u.ficha_id = p_ficha AND u.id = app_usuario())
  END
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION pode_alterar_ficha(uuid, uuid) TO vinicycle_app;
--> statement-breakpoint
ALTER TABLE "ficha" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY leitura ON "ficha" FOR SELECT USING (
  empresa_id = app_empresa() OR app_plataforma()
  OR (empresa_id IS NULL AND (app_autenticacao() OR EXISTS (SELECT 1 FROM usuario u WHERE u.ficha_id = ficha.id)))
  OR EXISTS (SELECT 1 FROM empresa e WHERE e.ficha_id = ficha.id)
);
--> statement-breakpoint
CREATE POLICY inclusao ON "ficha" FOR INSERT WITH CHECK (
  empresa_id = app_empresa() OR app_plataforma() OR (empresa_id IS NULL AND dono = 'usuario')
);
--> statement-breakpoint
CREATE POLICY alteracao ON "ficha" FOR UPDATE USING (pode_alterar_ficha(empresa_id, id))
  WITH CHECK (pode_alterar_ficha(empresa_id, id));
--> statement-breakpoint
CREATE POLICY exclusao ON "ficha" FOR DELETE USING (pode_alterar_ficha(empresa_id, id));
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ficha_endereco', 'ficha_contato'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY leitura ON %I FOR SELECT USING (EXISTS (SELECT 1 FROM ficha f WHERE f.id = ficha_id))', t);
    EXECUTE format('CREATE POLICY alteracao ON %I FOR ALL USING (EXISTS (SELECT 1 FROM ficha f WHERE f.id = ficha_id AND pode_alterar_ficha(f.empresa_id, f.id))) WITH CHECK (EXISTS (SELECT 1 FROM ficha f WHERE f.id = ficha_id AND pode_alterar_ficha(f.empresa_id, f.id)))', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Auditoria (P14): qualquer contexto inclui o próprio rastro; a empresa lê o seu.
ALTER TABLE "auditoria" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY leitura ON "auditoria" FOR SELECT USING (empresa_id = app_empresa() OR app_plataforma());
--> statement-breakpoint
CREATE POLICY inclusao ON "auditoria" FOR INSERT WITH CHECK (
  empresa_id IS NULL OR empresa_id = app_empresa() OR app_plataforma()
);
--> statement-breakpoint

-- Fila de envios: qualquer contexto enfileira; só a tarefa de fundo e a Administração leem.
ALTER TABLE "envio" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY inclusao ON "envio" FOR INSERT WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY processamento ON "envio" FOR ALL USING (app_sistema() OR app_plataforma())
  WITH CHECK (app_sistema() OR app_plataforma());
--> statement-breakpoint
ALTER TABLE "envio_tentativa" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY processamento ON "envio_tentativa" FOR ALL USING (app_sistema() OR app_plataforma())
  WITH CHECK (app_sistema() OR app_plataforma());
