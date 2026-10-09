CREATE TABLE "alerta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid,
	"tipo" text NOT NULL,
	"gravidade" text NOT NULL,
	"funcionalidade" text NOT NULL,
	"chave" text NOT NULL,
	"mensagem" text NOT NULL,
	"link" text,
	"vence_em" date,
	"situacao" text DEFAULT 'aberto' NOT NULL,
	"aberto_em" timestamp with time zone DEFAULT now() NOT NULL,
	"resolvido_em" timestamp with time zone,
	CONSTRAINT "alerta_gravidade" CHECK (gravidade in ('info', 'atencao', 'critico')),
	CONSTRAINT "alerta_situacao" CHECK (situacao in ('aberto', 'resolvido'))
);
--> statement-breakpoint
CREATE TABLE "alerta_leitura" (
	"alerta_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"lida_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alerta_leitura_alerta_id_usuario_id_pk" PRIMARY KEY("alerta_id","usuario_id")
);
--> statement-breakpoint
CREATE TABLE "importacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"data_saldo" timestamp with time zone NOT NULL,
	"e_carga_inicial" boolean DEFAULT true NOT NULL,
	"nome_arquivo" text NOT NULL,
	"anexo_id" uuid,
	"linhas" integer NOT NULL,
	"situacao" text DEFAULT 'aplicada' NOT NULL,
	"operacao_id" uuid,
	"grupo_id" uuid,
	"motivo_estorno" text,
	"estornada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "importacao_tipo" CHECK (tipo in ('saldo_granel', 'saldo_garrafas', 'saldo_itens')),
	CONSTRAINT "importacao_situacao" CHECK (situacao in ('aplicada', 'estornada'))
);
--> statement-breakpoint
CREATE TABLE "fechamento_mensal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"ano" integer NOT NULL,
	"mes" integer NOT NULL,
	"situacao" text NOT NULL,
	"conferencia" jsonb NOT NULL,
	"relatorio" jsonb NOT NULL,
	"fechado_em" timestamp with time zone NOT NULL,
	"fechado_por" uuid NOT NULL,
	"reaberto_em" timestamp with time zone,
	"reaberto_por" uuid,
	"motivo_reabertura" text,
	CONSTRAINT "fechamento_mensal_situacao" CHECK (situacao in ('fechado', 'reaberto')),
	CONSTRAINT "fechamento_mensal_mes_valido" CHECK (mes between 1 and 12)
);
--> statement-breakpoint
ALTER TABLE "alerta" ADD CONSTRAINT "alerta_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerta" ADD CONSTRAINT "alerta_estabelecimento_id_estabelecimento_id_fk" FOREIGN KEY ("estabelecimento_id") REFERENCES "public"."estabelecimento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerta_leitura" ADD CONSTRAINT "alerta_leitura_alerta_id_alerta_id_fk" FOREIGN KEY ("alerta_id") REFERENCES "public"."alerta"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerta_leitura" ADD CONSTRAINT "alerta_leitura_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerta_leitura" ADD CONSTRAINT "alerta_leitura_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacao" ADD CONSTRAINT "importacao_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacao" ADD CONSTRAINT "importacao_estabelecimento_id_estabelecimento_id_fk" FOREIGN KEY ("estabelecimento_id") REFERENCES "public"."estabelecimento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacao" ADD CONSTRAINT "importacao_operacao_id_operacao_id_fk" FOREIGN KEY ("operacao_id") REFERENCES "public"."operacao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fechamento_mensal" ADD CONSTRAINT "fechamento_mensal_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fechamento_mensal" ADD CONSTRAINT "fechamento_mensal_estabelecimento_id_estabelecimento_id_fk" FOREIGN KEY ("estabelecimento_id") REFERENCES "public"."estabelecimento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fechamento_mensal" ADD CONSTRAINT "fechamento_mensal_fechado_por_usuario_id_fk" FOREIGN KEY ("fechado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fechamento_mensal" ADD CONSTRAINT "fechamento_mensal_reaberto_por_usuario_id_fk" FOREIGN KEY ("reaberto_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alerta_chave_aberta" ON "alerta" USING btree ("empresa_id","chave") WHERE situacao = 'aberto';--> statement-breakpoint
CREATE INDEX "alerta_situacao" ON "alerta" USING btree ("empresa_id","situacao");--> statement-breakpoint
CREATE INDEX "importacao_estab" ON "importacao" USING btree ("estabelecimento_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "fechamento_mensal_mes" ON "fechamento_mensal" USING btree ("estabelecimento_id","ano","mes");