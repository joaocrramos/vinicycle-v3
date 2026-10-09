CREATE TABLE "autocontrole_controle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"codigo_modelo" text,
	"nome" text NOT NULL,
	"descricao" text,
	"periodicidade_quantidade" integer,
	"periodicidade_unidade" text,
	"responsavel_id" uuid,
	"evidencia_automatica" text,
	"inicio" date NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"inativado_em" timestamp with time zone,
	"inativado_por" uuid,
	"motivo_inativacao" text,
	CONSTRAINT "autocontrole_controle_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "autocontrole_controle_periodicidade" CHECK ((periodicidade_quantidade is null) = (periodicidade_unidade is null) and (periodicidade_quantidade is null or periodicidade_quantidade between 1 and 999)),
	CONSTRAINT "autocontrole_controle_unidade" CHECK (periodicidade_unidade is null or periodicidade_unidade in ('dia', 'semana', 'mes', 'ano')),
	CONSTRAINT "autocontrole_controle_automatica" CHECK (evidencia_automatica is null or evidencia_automatica in ('higienizacao', 'temperatura'))
);
--> statement-breakpoint
CREATE TABLE "autocontrole_evidencia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"controle_id" uuid NOT NULL,
	"realizada_em" date NOT NULL,
	"descricao" text NOT NULL,
	"anulada_em" timestamp with time zone,
	"anulada_por" uuid,
	"motivo_anulacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "autocontrole_evidencia_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "autocontrole_evidencia_anulacao" CHECK ((anulada_em is null) = (motivo_anulacao is null))
);
--> statement-breakpoint
CREATE TABLE "solicitacao_aprovacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"entidade" text NOT NULL,
	"registro_id" text NOT NULL,
	"resumo" text NOT NULL,
	"dados" jsonb NOT NULL,
	"situacao" text DEFAULT 'pendente' NOT NULL,
	"solicitado_por" uuid NOT NULL,
	"solicitado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"decidido_por" uuid,
	"decidido_em" timestamp with time zone,
	"motivo" text,
	"erro" text,
	"visto_em" timestamp with time zone,
	CONSTRAINT "solicitacao_aprovacao_tipo" CHECK (tipo in ('inventario', 'estorno', 'reabertura', 'retificacao')),
	CONSTRAINT "solicitacao_aprovacao_situacao" CHECK (situacao in ('pendente', 'aprovada', 'recusada', 'cancelada', 'falhou')),
	CONSTRAINT "solicitacao_aprovacao_motivo" CHECK (situacao not in ('recusada', 'cancelada') or motivo is not null)
);
--> statement-breakpoint
CREATE TABLE "diario_nota" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"data" date NOT NULL,
	"texto" text NOT NULL,
	"projeto_id" uuid,
	"recipiente_id" uuid,
	"parcela_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"inativado_em" timestamp with time zone,
	"inativado_por" uuid,
	"motivo_inativacao" text,
	CONSTRAINT "diario_nota_id_empresa" UNIQUE("id","empresa_id")
);
--> statement-breakpoint
CREATE TABLE "relatorio_agendado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"relatorio" text NOT NULL,
	"frequencia" text NOT NULL,
	"proximo_envio" timestamp with time zone NOT NULL,
	"ultimo_envio" timestamp with time zone,
	"ultimo_aviso" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "relatorio_agendado_relatorio" CHECK (relatorio in ('alertas', 'mes', 'painel', 'estoque')),
	CONSTRAINT "relatorio_agendado_frequencia" CHECK (frequencia in ('diaria', 'semanal', 'quinzenal', 'mensal'))
);
--> statement-breakpoint
ALTER TABLE "autocontrole_controle" ADD CONSTRAINT "autocontrole_controle_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autocontrole_controle" ADD CONSTRAINT "autocontrole_controle_responsavel_id_usuario_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autocontrole_controle" ADD CONSTRAINT "autocontrole_controle_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autocontrole_evidencia" ADD CONSTRAINT "autocontrole_evidencia_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autocontrole_evidencia" ADD CONSTRAINT "autocontrole_evidencia_anulada_por_usuario_id_fk" FOREIGN KEY ("anulada_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autocontrole_evidencia" ADD CONSTRAINT "autocontrole_evidencia_controle_id_empresa_id_autocontrole_controle_id_empresa_id_fk" FOREIGN KEY ("controle_id","empresa_id") REFERENCES "public"."autocontrole_controle"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacao_aprovacao" ADD CONSTRAINT "solicitacao_aprovacao_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacao_aprovacao" ADD CONSTRAINT "solicitacao_aprovacao_estabelecimento_id_estabelecimento_id_fk" FOREIGN KEY ("estabelecimento_id") REFERENCES "public"."estabelecimento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacao_aprovacao" ADD CONSTRAINT "solicitacao_aprovacao_solicitado_por_usuario_id_fk" FOREIGN KEY ("solicitado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacao_aprovacao" ADD CONSTRAINT "solicitacao_aprovacao_decidido_por_usuario_id_fk" FOREIGN KEY ("decidido_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diario_nota" ADD CONSTRAINT "diario_nota_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diario_nota" ADD CONSTRAINT "diario_nota_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diario_nota" ADD CONSTRAINT "diario_nota_projeto_id_empresa_id_projeto_id_empresa_id_fk" FOREIGN KEY ("projeto_id","empresa_id") REFERENCES "public"."projeto"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diario_nota" ADD CONSTRAINT "diario_nota_recipiente_id_empresa_id_recipiente_id_empresa_id_fk" FOREIGN KEY ("recipiente_id","empresa_id") REFERENCES "public"."recipiente"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diario_nota" ADD CONSTRAINT "diario_nota_parcela_id_empresa_id_parcela_id_empresa_id_fk" FOREIGN KEY ("parcela_id","empresa_id") REFERENCES "public"."parcela"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relatorio_agendado" ADD CONSTRAINT "relatorio_agendado_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relatorio_agendado" ADD CONSTRAINT "relatorio_agendado_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relatorio_agendado" ADD CONSTRAINT "relatorio_agendado_estabelecimento_id_estabelecimento_id_fk" FOREIGN KEY ("estabelecimento_id") REFERENCES "public"."estabelecimento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "autocontrole_controle_estabelecimento" ON "autocontrole_controle" USING btree ("estabelecimento_id");--> statement-breakpoint
CREATE INDEX "autocontrole_evidencia_controle" ON "autocontrole_evidencia" USING btree ("controle_id","realizada_em");--> statement-breakpoint
CREATE UNIQUE INDEX "solicitacao_aprovacao_pendente" ON "solicitacao_aprovacao" USING btree ("tipo","entidade","registro_id") WHERE situacao = 'pendente';--> statement-breakpoint
CREATE INDEX "solicitacao_aprovacao_estabelecimento" ON "solicitacao_aprovacao" USING btree ("estabelecimento_id","situacao");--> statement-breakpoint
CREATE INDEX "diario_nota_estabelecimento" ON "diario_nota" USING btree ("estabelecimento_id","data");--> statement-breakpoint
CREATE INDEX "diario_nota_projeto" ON "diario_nota" USING btree ("projeto_id");--> statement-breakpoint
CREATE INDEX "diario_nota_recipiente" ON "diario_nota" USING btree ("recipiente_id");--> statement-breakpoint
CREATE INDEX "diario_nota_parcela" ON "diario_nota" USING btree ("parcela_id");--> statement-breakpoint
CREATE UNIQUE INDEX "relatorio_agendado_unico" ON "relatorio_agendado" USING btree ("usuario_id","estabelecimento_id","relatorio");--> statement-breakpoint
CREATE INDEX "relatorio_agendado_proximo" ON "relatorio_agendado" USING btree ("proximo_envio");