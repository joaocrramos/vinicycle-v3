CREATE TABLE "declaracao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"ano" integer NOT NULL,
	"situacao" text NOT NULL,
	"numeros" jsonb NOT NULL,
	"protocolo" text NOT NULL,
	"declarada_em" timestamp with time zone NOT NULL,
	"declarada_por" uuid NOT NULL,
	CONSTRAINT "declaracao_tipo" CHECK (tipo in ('anual_mapa', 'sivibe')),
	CONSTRAINT "declaracao_situacao" CHECK (situacao in ('declarada', 'em_retificacao', 'retificada')),
	CONSTRAINT "declaracao_ano_valido" CHECK (ano between 2000 and 2200)
);
--> statement-breakpoint
CREATE TABLE "declaracao_retificacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"declaracao_id" uuid NOT NULL,
	"motivo" text NOT NULL,
	"aberta_em" timestamp with time zone NOT NULL,
	"aberta_por" uuid NOT NULL,
	"numeros_anteriores" jsonb NOT NULL,
	"protocolo_anterior" text NOT NULL,
	"concluida_em" timestamp with time zone,
	"concluida_por" uuid,
	"protocolo" text,
	CONSTRAINT "declaracao_retificacao_conclusao" CHECK ((concluida_em is null) = (protocolo is null))
);
--> statement-breakpoint
ALTER TABLE "declaracao" ADD CONSTRAINT "declaracao_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declaracao" ADD CONSTRAINT "declaracao_estabelecimento_id_estabelecimento_id_fk" FOREIGN KEY ("estabelecimento_id") REFERENCES "public"."estabelecimento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declaracao" ADD CONSTRAINT "declaracao_declarada_por_usuario_id_fk" FOREIGN KEY ("declarada_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declaracao_retificacao" ADD CONSTRAINT "declaracao_retificacao_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declaracao_retificacao" ADD CONSTRAINT "declaracao_retificacao_declaracao_id_declaracao_id_fk" FOREIGN KEY ("declaracao_id") REFERENCES "public"."declaracao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declaracao_retificacao" ADD CONSTRAINT "declaracao_retificacao_aberta_por_usuario_id_fk" FOREIGN KEY ("aberta_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declaracao_retificacao" ADD CONSTRAINT "declaracao_retificacao_concluida_por_usuario_id_fk" FOREIGN KEY ("concluida_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "declaracao_ano" ON "declaracao" USING btree ("estabelecimento_id","tipo","ano");--> statement-breakpoint
CREATE INDEX "declaracao_retificacao_declaracao" ON "declaracao_retificacao" USING btree ("declaracao_id");