CREATE TABLE "convite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"email" text NOT NULL,
	"perfil_id" uuid NOT NULL,
	"estabelecimentos" uuid[] DEFAULT '{}' NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"enviado_por" uuid,
	"enviado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"situacao" text DEFAULT 'pendente' NOT NULL,
	"reenvios" integer DEFAULT 0 NOT NULL,
	"aceito_em" timestamp with time zone,
	"aceito_por" uuid,
	"cancelado_em" timestamp with time zone,
	"cancelado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "convite_situacao" CHECK (situacao in ('pendente', 'aceito', 'expirado', 'cancelado'))
);
--> statement-breakpoint
CREATE TABLE "estabelecimento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"ficha_id" uuid NOT NULL,
	"registro_mapa" text,
	"registro_mapa_validade" date,
	"capacidade_litros" numeric(14, 2),
	"fuso" text NOT NULL,
	"origem_uva" text,
	"atividades_mapa" text[] DEFAULT '{}' NOT NULL,
	"tem_manual_bpf" boolean,
	"manual_bpf_revisao" date,
	"forma_registro_atual" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"inativado_em" timestamp with time zone,
	"inativado_por" uuid,
	"motivo_inativacao" text,
	CONSTRAINT "estabelecimento_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "estabelecimento_origem_uva" CHECK (origem_uva is null or origem_uva in ('propria', 'comprada', 'ambas')),
	CONSTRAINT "estabelecimento_atividades" CHECK (atividades_mapa <@ array['produtor', 'padronizador', 'engarrafador', 'atacadista', 'exportador', 'importador']::text[]),
	CONSTRAINT "estabelecimento_forma_registro" CHECK (forma_registro_atual is null or forma_registro_atual in ('planilha', 'papel', 'outro_sistema', 'nenhuma')),
	CONSTRAINT "estabelecimento_capacidade" CHECK (capacidade_litros is null or capacidade_litros >= 0)
);
--> statement-breakpoint
CREATE TABLE "local" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"uso" text NOT NULL,
	"modulo_estoque" text,
	"refrigerado" boolean DEFAULT false NOT NULL,
	"externo" boolean DEFAULT false NOT NULL,
	"observacoes" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"inativado_em" timestamp with time zone,
	"inativado_por" uuid,
	"motivo_inativacao" text,
	CONSTRAINT "local_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "local_uso" CHECK (uso in ('recipientes', 'estoque', 'ambos')),
	CONSTRAINT "local_modulo_estoque" CHECK ((uso = 'recipientes') = (modulo_estoque is null))
);
--> statement-breakpoint
CREATE TABLE "sessao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"ultimo_uso_em" timestamp with time zone DEFAULT now() NOT NULL,
	"encerrada_em" timestamp with time zone,
	"motivo_encerramento" text,
	"ip" "inet",
	"navegador" text,
	"contexto" text DEFAULT 'empresa' NOT NULL,
	"empresa_id" uuid,
	"estabelecimento_id" uuid,
	"segundo_fator_em" timestamp with time zone,
	CONSTRAINT "sessao_contexto" CHECK (contexto in ('empresa', 'plataforma'))
);
--> statement-breakpoint
CREATE TABLE "token_verificacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid,
	"email" text NOT NULL,
	"tipo" text NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"dados" jsonb,
	"expira_em" timestamp with time zone NOT NULL,
	"usado_em" timestamp with time zone,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "token_verificacao_tipo" CHECK (tipo in ('redefinir_senha', 'trocar_senha', 'trocar_email', 'aceite_bastao'))
);
--> statement-breakpoint
CREATE TABLE "usuario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"ficha_id" uuid NOT NULL,
	"senha_hash" text,
	"totp_segredo_cifrado" text,
	"totp_ativo_em" timestamp with time zone,
	"preferencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tentativas_login" integer DEFAULT 0 NOT NULL,
	"bloqueado_ate" timestamp with time zone,
	"ultimo_acesso_em" timestamp with time zone,
	"senha_alterada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"inativado_em" timestamp with time zone,
	"inativado_por" uuid,
	"motivo_inativacao" text
);
--> statement-breakpoint
CREATE TABLE "vinculo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"perfil_id" uuid NOT NULL,
	"e_master" boolean DEFAULT false NOT NULL,
	"ultimo_estabelecimento_id" uuid,
	"convite_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"inativado_em" timestamp with time zone,
	"inativado_por" uuid,
	"motivo_inativacao" text,
	CONSTRAINT "vinculo_id_empresa" UNIQUE("id","empresa_id")
);
--> statement-breakpoint
CREATE TABLE "vinculo_estabelecimento" (
	"vinculo_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	CONSTRAINT "vinculo_estabelecimento_vinculo_id_estabelecimento_id_pk" PRIMARY KEY("vinculo_id","estabelecimento_id")
);
--> statement-breakpoint
CREATE TABLE "ficha" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid,
	"dono" text NOT NULL,
	"tipo_pessoa" text NOT NULL,
	"nome" text NOT NULL,
	"nome_fantasia" text,
	"tipo_documento" text,
	"documento" text,
	"pais" text,
	"inscricao_estadual" text,
	"inscricao_municipal" text,
	"site" text,
	"avatar_cor" text,
	"avatar_anexo_id" uuid,
	"observacoes" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "ficha_dono" CHECK (dono in ('empresa', 'estabelecimento', 'pessoa', 'usuario')),
	CONSTRAINT "ficha_tipo_pessoa" CHECK (tipo_pessoa in ('fisica', 'juridica', 'estrangeira')),
	CONSTRAINT "ficha_empresa_dono" CHECK ((dono = 'usuario') = (empresa_id is null))
);
--> statement-breakpoint
CREATE TABLE "ficha_contato" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ficha_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"rotulo" text DEFAULT '' NOT NULL,
	"valor" text NOT NULL,
	"whatsapp" boolean DEFAULT false NOT NULL,
	"rede" text,
	"principal" boolean DEFAULT false NOT NULL,
	CONSTRAINT "ficha_contato_tipo" CHECK (tipo in ('email', 'telefone', 'rede')),
	CONSTRAINT "ficha_contato_rede" CHECK (rede is null or rede in ('instagram', 'facebook', 'linkedin', 'tiktok', 'youtube', 'x', 'outra'))
);
--> statement-breakpoint
CREATE TABLE "ficha_endereco" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ficha_id" uuid NOT NULL,
	"rotulo" text NOT NULL,
	"cep" text NOT NULL,
	"logradouro" text NOT NULL,
	"numero" text NOT NULL,
	"complemento" text,
	"bairro" text DEFAULT '' NOT NULL,
	"municipio" text NOT NULL,
	"codigo_ibge" text,
	"uf" text NOT NULL,
	"principal" boolean DEFAULT false NOT NULL,
	CONSTRAINT "ficha_endereco_rotulo" CHECK (rotulo in ('principal', 'cobranca', 'entrega', 'propriedade_rural')),
	CONSTRAINT "ficha_endereco_uf" CHECK (uf in ('AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO')),
	CONSTRAINT "ficha_endereco_cep" CHECK (cep ~ '^[0-9]{8}$')
);
--> statement-breakpoint
CREATE TABLE "assinatura" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"plano_id" uuid NOT NULL,
	"periodicidade" text NOT NULL,
	"inicio" date NOT NULL,
	"fim" date,
	"em_teste" boolean DEFAULT false NOT NULL,
	"fim_teste" date,
	"situacao" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "assinatura_periodicidade" CHECK (periodicidade in ('mensal', 'trimestral', 'semestral', 'anual')),
	CONSTRAINT "assinatura_situacao" CHECK (situacao in ('vigente', 'encerrada'))
);
--> statement-breakpoint
CREATE TABLE "config_plataforma" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"convite_validade_dias" integer DEFAULT 7 NOT NULL,
	"bastao_horas" integer DEFAULT 48 NOT NULL,
	"teste_dias" integer DEFAULT 7 NOT NULL,
	"tolerancia_dias" integer DEFAULT 5 NOT NULL,
	"avisos_teste_dias" integer[] DEFAULT '{3,1}' NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "config_plataforma_unica" CHECK (id)
);
--> statement-breakpoint
CREATE TABLE "empresa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ficha_id" uuid NOT NULL,
	"situacao" text NOT NULL,
	"moeda" text DEFAULT 'BRL' NOT NULL,
	"cor_marca" text,
	"logo_anexo_id" uuid,
	"contato_financeiro_nome" text,
	"contato_financeiro_email" text,
	"contato_financeiro_telefone" text,
	"regime_tributario" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "empresa_situacao" CHECK (situacao in ('teste', 'ativo', 'somente_leitura', 'bloqueado', 'inativo'))
);
--> statement-breakpoint
CREATE TABLE "empresa_situacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"situacao" text NOT NULL,
	"desde" timestamp with time zone DEFAULT now() NOT NULL,
	"motivo" text,
	"origem" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "empresa_situacao_situacao" CHECK (situacao in ('teste', 'ativo', 'somente_leitura', 'bloqueado', 'inativo')),
	CONSTRAINT "empresa_situacao_origem" CHECK (origem in ('teste', 'inadimplencia', 'manual', 'criacao'))
);
--> statement-breakpoint
CREATE TABLE "envio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canal" text NOT NULL,
	"destinatario" text NOT NULL,
	"modelo" text NOT NULL,
	"assunto" text,
	"corpo_texto" text NOT NULL,
	"corpo_html" text,
	"origem" text NOT NULL,
	"origem_id" uuid,
	"empresa_id" uuid,
	"situacao" text DEFAULT 'pendente' NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"ultimo_erro" text,
	"provedor" text,
	"proxima_tentativa_em" timestamp with time zone DEFAULT now() NOT NULL,
	"enviado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "envio_canal" CHECK (canal in ('email', 'whatsapp', 'sms')),
	CONSTRAINT "envio_situacao" CHECK (situacao in ('pendente', 'enviado', 'falhou'))
);
--> statement-breakpoint
CREATE TABLE "envio_tentativa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"envio_id" uuid NOT NULL,
	"ocorrida_em" timestamp with time zone DEFAULT now() NOT NULL,
	"sucesso" boolean NOT NULL,
	"resposta" jsonb
);
--> statement-breakpoint
CREATE TABLE "equipe_membro" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"perfil_id" uuid NOT NULL,
	"concedido_por" uuid,
	"concedido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"inativado_em" timestamp with time zone,
	"inativado_por" uuid,
	"motivo_inativacao" text,
	CONSTRAINT "equipe_membro_usuario_id_unique" UNIQUE("usuario_id")
);
--> statement-breakpoint
CREATE TABLE "funcionalidade" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"modulo_id" uuid,
	"escopo" text NOT NULL,
	"acoes" text[] NOT NULL,
	"somente_master" boolean DEFAULT false NOT NULL,
	"ordem" integer NOT NULL,
	CONSTRAINT "funcionalidade_codigo_unique" UNIQUE("codigo"),
	CONSTRAINT "funcionalidade_escopo" CHECK (escopo in ('empresa', 'plataforma')),
	CONSTRAINT "funcionalidade_modulo_escopo" CHECK ((escopo = 'empresa') = (modulo_id is not null))
);
--> statement-breakpoint
CREATE TABLE "modulo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"funcao" text NOT NULL,
	"situacao" text NOT NULL,
	"ordem" integer NOT NULL,
	CONSTRAINT "modulo_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "perfil" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"escopo" text NOT NULL,
	"empresa_id" uuid,
	"codigo" text,
	"nome" text NOT NULL,
	"descricao" text,
	"modelo_origem_id" uuid,
	"e_master" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"inativado_em" timestamp with time zone,
	"inativado_por" uuid,
	"motivo_inativacao" text,
	CONSTRAINT "perfil_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "perfil_escopo" CHECK (escopo in ('plataforma', 'modelo', 'empresa')),
	CONSTRAINT "perfil_empresa_escopo" CHECK ((escopo = 'empresa') = (empresa_id is not null)),
	CONSTRAINT "perfil_master_escopo" CHECK (not e_master or escopo <> 'plataforma')
);
--> statement-breakpoint
CREATE TABLE "perfil_permissao" (
	"perfil_id" uuid NOT NULL,
	"funcionalidade_id" uuid NOT NULL,
	"acao" text NOT NULL,
	"empresa_id" uuid,
	CONSTRAINT "perfil_permissao_perfil_id_funcionalidade_id_acao_pk" PRIMARY KEY("perfil_id","funcionalidade_id","acao")
);
--> statement-breakpoint
CREATE TABLE "plano" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"limite_estabelecimentos" integer,
	"limite_usuarios" integer,
	"limite_armazenamento_gb" numeric(8, 2),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"inativado_em" timestamp with time zone,
	"inativado_por" uuid,
	"motivo_inativacao" text,
	CONSTRAINT "plano_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "plano_modulo" (
	"plano_id" uuid NOT NULL,
	"modulo_id" uuid NOT NULL,
	CONSTRAINT "plano_modulo_plano_id_modulo_id_pk" PRIMARY KEY("plano_id","modulo_id")
);
--> statement-breakpoint
CREATE TABLE "termo_aceite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"termo_versao_id" uuid NOT NULL,
	"aceito_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" "inet",
	CONSTRAINT "termo_aceite_usuario_versao" UNIQUE("usuario_id","termo_versao_id")
);
--> statement-breakpoint
CREATE TABLE "termo_versao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" text NOT NULL,
	"versao" text NOT NULL,
	"texto" text NOT NULL,
	"vigente_desde" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "termo_versao_tipo_versao" UNIQUE("tipo","versao"),
	CONSTRAINT "termo_versao_tipo" CHECK (tipo in ('termos_uso', 'privacidade'))
);
--> statement-breakpoint
CREATE TABLE "anexo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid,
	"entidade" text NOT NULL,
	"registro_id" uuid NOT NULL,
	"categoria" text NOT NULL,
	"nome_original" text NOT NULL,
	"tipo_mime" text NOT NULL,
	"tamanho_bytes" bigint NOT NULL,
	"hash_sha256" text NOT NULL,
	"caminho" text NOT NULL,
	"descricao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"inativado_em" timestamp with time zone,
	"inativado_por" uuid,
	"motivo_inativacao" text,
	CONSTRAINT "anexo_categoria" CHECK (categoria in ('laudo', 'nota_fiscal', 'certificado', 'foto', 'rotulo', 'comprovante', 'outro')),
	CONSTRAINT "anexo_tamanho" CHECK (tamanho_bytes >= 0)
);
--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ocorrido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"usuario_id" uuid,
	"personificado_id" uuid,
	"personificacao_id" uuid,
	"empresa_id" uuid,
	"estabelecimento_id" uuid,
	"acao" text NOT NULL,
	"entidade" text,
	"registro_id" uuid,
	"diferenca" jsonb,
	"dados" jsonb,
	"motivo" text,
	"ip" text,
	"navegador" text,
	"requisicao_id" text
);
--> statement-breakpoint
CREATE TABLE "formato_codigo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"mascara" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "formato_codigo_tipo" UNIQUE("empresa_id","tipo")
);
--> statement-breakpoint
CREATE TABLE "preferencia_listagem" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"empresa_id" uuid,
	"tabela" text NOT NULL,
	"ordem" text,
	"direcao" text,
	"tamanho" integer DEFAULT 10 NOT NULL,
	"filtros" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preferencia_listagem_tabela" UNIQUE NULLS NOT DISTINCT("usuario_id","empresa_id","tabela")
);
--> statement-breakpoint
CREATE TABLE "sequencia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid,
	"estabelecimento_id" uuid,
	"tipo" text NOT NULL,
	"periodo" text NOT NULL,
	"ultimo" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sequencia_serie" UNIQUE NULLS NOT DISTINCT("estabelecimento_id","tipo","periodo"),
	CONSTRAINT "sequencia_empresa_estab" CHECK ((empresa_id is null) = (estabelecimento_id is null))
);
--> statement-breakpoint
ALTER TABLE "convite" ADD CONSTRAINT "convite_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convite" ADD CONSTRAINT "convite_perfil_id_empresa_id_perfil_id_empresa_id_fk" FOREIGN KEY ("perfil_id","empresa_id") REFERENCES "public"."perfil"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estabelecimento" ADD CONSTRAINT "estabelecimento_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estabelecimento" ADD CONSTRAINT "estabelecimento_ficha_id_ficha_id_fk" FOREIGN KEY ("ficha_id") REFERENCES "public"."ficha"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local" ADD CONSTRAINT "local_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessao" ADD CONSTRAINT "sessao_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessao" ADD CONSTRAINT "sessao_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessao" ADD CONSTRAINT "sessao_estabelecimento_id_estabelecimento_id_fk" FOREIGN KEY ("estabelecimento_id") REFERENCES "public"."estabelecimento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_verificacao" ADD CONSTRAINT "token_verificacao_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_ficha_id_ficha_id_fk" FOREIGN KEY ("ficha_id") REFERENCES "public"."ficha"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculo" ADD CONSTRAINT "vinculo_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculo" ADD CONSTRAINT "vinculo_convite_id_convite_id_fk" FOREIGN KEY ("convite_id") REFERENCES "public"."convite"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculo" ADD CONSTRAINT "vinculo_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculo" ADD CONSTRAINT "vinculo_perfil_id_empresa_id_perfil_id_empresa_id_fk" FOREIGN KEY ("perfil_id","empresa_id") REFERENCES "public"."perfil"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculo_estabelecimento" ADD CONSTRAINT "vinculo_estabelecimento_vinculo_id_empresa_id_vinculo_id_empresa_id_fk" FOREIGN KEY ("vinculo_id","empresa_id") REFERENCES "public"."vinculo"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculo_estabelecimento" ADD CONSTRAINT "vinculo_estabelecimento_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ficha_contato" ADD CONSTRAINT "ficha_contato_ficha_id_ficha_id_fk" FOREIGN KEY ("ficha_id") REFERENCES "public"."ficha"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ficha_endereco" ADD CONSTRAINT "ficha_endereco_ficha_id_ficha_id_fk" FOREIGN KEY ("ficha_id") REFERENCES "public"."ficha"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinatura" ADD CONSTRAINT "assinatura_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinatura" ADD CONSTRAINT "assinatura_plano_id_plano_id_fk" FOREIGN KEY ("plano_id") REFERENCES "public"."plano"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa" ADD CONSTRAINT "empresa_ficha_id_ficha_id_fk" FOREIGN KEY ("ficha_id") REFERENCES "public"."ficha"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_situacao" ADD CONSTRAINT "empresa_situacao_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envio" ADD CONSTRAINT "envio_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envio_tentativa" ADD CONSTRAINT "envio_tentativa_envio_id_envio_id_fk" FOREIGN KEY ("envio_id") REFERENCES "public"."envio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipe_membro" ADD CONSTRAINT "equipe_membro_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipe_membro" ADD CONSTRAINT "equipe_membro_perfil_id_perfil_id_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfil"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funcionalidade" ADD CONSTRAINT "funcionalidade_modulo_id_modulo_id_fk" FOREIGN KEY ("modulo_id") REFERENCES "public"."modulo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfil" ADD CONSTRAINT "perfil_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfil" ADD CONSTRAINT "perfil_modelo_origem_id_perfil_id_fk" FOREIGN KEY ("modelo_origem_id") REFERENCES "public"."perfil"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfil_permissao" ADD CONSTRAINT "perfil_permissao_perfil_id_perfil_id_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfil"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfil_permissao" ADD CONSTRAINT "perfil_permissao_funcionalidade_id_funcionalidade_id_fk" FOREIGN KEY ("funcionalidade_id") REFERENCES "public"."funcionalidade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfil_permissao" ADD CONSTRAINT "perfil_permissao_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfil_permissao" ADD CONSTRAINT "perfil_permissao_perfil_id_empresa_id_perfil_id_empresa_id_fk" FOREIGN KEY ("perfil_id","empresa_id") REFERENCES "public"."perfil"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plano_modulo" ADD CONSTRAINT "plano_modulo_plano_id_plano_id_fk" FOREIGN KEY ("plano_id") REFERENCES "public"."plano"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plano_modulo" ADD CONSTRAINT "plano_modulo_modulo_id_modulo_id_fk" FOREIGN KEY ("modulo_id") REFERENCES "public"."modulo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "termo_aceite" ADD CONSTRAINT "termo_aceite_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "termo_aceite" ADD CONSTRAINT "termo_aceite_termo_versao_id_termo_versao_id_fk" FOREIGN KEY ("termo_versao_id") REFERENCES "public"."termo_versao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexo" ADD CONSTRAINT "anexo_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexo" ADD CONSTRAINT "anexo_estabelecimento_id_estabelecimento_id_fk" FOREIGN KEY ("estabelecimento_id") REFERENCES "public"."estabelecimento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formato_codigo" ADD CONSTRAINT "formato_codigo_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferencia_listagem" ADD CONSTRAINT "preferencia_listagem_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferencia_listagem" ADD CONSTRAINT "preferencia_listagem_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequencia" ADD CONSTRAINT "sequencia_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequencia" ADD CONSTRAINT "sequencia_estabelecimento_id_estabelecimento_id_fk" FOREIGN KEY ("estabelecimento_id") REFERENCES "public"."estabelecimento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "convite_token" ON "convite" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "convite_pendente" ON "convite" USING btree ("empresa_id",lower(email)) WHERE situacao = 'pendente';--> statement-breakpoint
CREATE UNIQUE INDEX "estabelecimento_ficha" ON "estabelecimento" USING btree ("ficha_id");--> statement-breakpoint
CREATE INDEX "estabelecimento_empresa" ON "estabelecimento" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "local_nome" ON "local" USING btree ("estabelecimento_id",lower(nome));--> statement-breakpoint
CREATE UNIQUE INDEX "sessao_token" ON "sessao" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessao_usuario" ON "sessao" USING btree ("usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "token_verificacao_hash" ON "token_verificacao" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "token_verificacao_usuario" ON "token_verificacao" USING btree ("usuario_id","tipo");--> statement-breakpoint
CREATE UNIQUE INDEX "usuario_email" ON "usuario" USING btree (lower(email));--> statement-breakpoint
CREATE UNIQUE INDEX "usuario_ficha" ON "usuario" USING btree ("ficha_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vinculo_usuario_empresa" ON "vinculo" USING btree ("empresa_id","usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vinculo_master" ON "vinculo" USING btree ("empresa_id") WHERE e_master and ativo;--> statement-breakpoint
CREATE INDEX "vinculo_usuario" ON "vinculo" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "ficha_empresa" ON "ficha" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ficha_documento_empresa" ON "ficha" USING btree ("documento") WHERE dono = 'empresa' and documento is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "ficha_documento_na_empresa" ON "ficha" USING btree ("empresa_id","dono","documento") WHERE dono in ('estabelecimento', 'pessoa') and documento is not null;--> statement-breakpoint
CREATE INDEX "ficha_contato_ficha" ON "ficha_contato" USING btree ("ficha_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ficha_contato_email_principal" ON "ficha_contato" USING btree ("ficha_id") WHERE principal and tipo = 'email';--> statement-breakpoint
CREATE INDEX "ficha_endereco_ficha" ON "ficha_endereco" USING btree ("ficha_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ficha_endereco_principal" ON "ficha_endereco" USING btree ("ficha_id") WHERE principal;--> statement-breakpoint
CREATE UNIQUE INDEX "assinatura_vigente" ON "assinatura" USING btree ("empresa_id") WHERE situacao = 'vigente';--> statement-breakpoint
CREATE UNIQUE INDEX "empresa_ficha" ON "empresa" USING btree ("ficha_id");--> statement-breakpoint
CREATE INDEX "empresa_situacao_empresa" ON "empresa_situacao" USING btree ("empresa_id","desde");--> statement-breakpoint
CREATE INDEX "envio_pendente" ON "envio" USING btree ("proxima_tentativa_em") WHERE situacao = 'pendente';--> statement-breakpoint
CREATE UNIQUE INDEX "perfil_nome_empresa" ON "perfil" USING btree ("empresa_id",lower(nome)) WHERE escopo = 'empresa';--> statement-breakpoint
CREATE UNIQUE INDEX "perfil_nome_global" ON "perfil" USING btree ("escopo",lower(nome)) WHERE escopo <> 'empresa';--> statement-breakpoint
CREATE UNIQUE INDEX "perfil_master_empresa" ON "perfil" USING btree ("empresa_id") WHERE e_master and escopo = 'empresa';--> statement-breakpoint
CREATE INDEX "perfil_permissao_empresa" ON "perfil_permissao" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "anexo_registro" ON "anexo" USING btree ("empresa_id","entidade","registro_id");--> statement-breakpoint
CREATE INDEX "anexo_hash" ON "anexo" USING btree ("empresa_id","hash_sha256");--> statement-breakpoint
CREATE INDEX "auditoria_empresa_data" ON "auditoria" USING btree ("empresa_id","ocorrido_em");--> statement-breakpoint
CREATE INDEX "auditoria_registro" ON "auditoria" USING btree ("entidade","registro_id");--> statement-breakpoint
CREATE INDEX "auditoria_usuario_data" ON "auditoria" USING btree ("usuario_id","ocorrido_em");--> statement-breakpoint
CREATE INDEX "auditoria_data" ON "auditoria" USING btree ("ocorrido_em");