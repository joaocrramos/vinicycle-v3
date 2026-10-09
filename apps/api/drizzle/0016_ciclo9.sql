CREATE TABLE "simulacao_corte" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"projeto_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"modo" text NOT NULL,
	"volume_litros" numeric(12, 2),
	"itens" jsonb NOT NULL,
	"resultado" jsonb NOT NULL,
	"observacao" text,
	"situacao" text DEFAULT 'rascunho' NOT NULL,
	"aprovada_em" timestamp with time zone,
	"aprovada_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "simulacao_corte_modo" CHECK (modo in ('percentual', 'litros')),
	CONSTRAINT "simulacao_corte_situacao" CHECK (situacao in ('rascunho', 'aprovada', 'descartada')),
	CONSTRAINT "simulacao_corte_volume" CHECK (modo <> 'percentual' or (volume_litros is not null and volume_litros > 0))
);
--> statement-breakpoint
CREATE TABLE "comunicacao_alcool" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"movimento_id" uuid NOT NULL,
	"comunicada_em" date NOT NULL,
	"protocolo" text,
	"observacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid
);
--> statement-breakpoint
CREATE TABLE "selo_faixa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"serie" text DEFAULT '' NOT NULL,
	"inicio" bigint NOT NULL,
	"fim" bigint NOT NULL,
	"grupo_id" uuid NOT NULL,
	"recebida_em" timestamp with time zone NOT NULL,
	"documento" text,
	"estornada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "selo_faixa_ordem" CHECK (inicio >= 0 and fim >= inicio)
);
--> statement-breakpoint
CREATE TABLE "selo_uso" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"producao_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"serie" text DEFAULT '' NOT NULL,
	"inicio" bigint NOT NULL,
	"fim" bigint NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "selo_uso_tipo" CHECK (tipo in ('usado', 'perdido')),
	CONSTRAINT "selo_uso_ordem" CHECK (inicio >= 0 and fim >= inicio)
);
--> statement-breakpoint
CREATE TABLE "espumante_evento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"lote_id" uuid NOT NULL,
	"estagio" text NOT NULL,
	"executado_em" timestamp with time zone NOT NULL,
	"perdas" integer DEFAULT 0 NOT NULL,
	"grupo_estoque" uuid,
	"insumos" jsonb,
	"observacao" text,
	"anulado_em" timestamp with time zone,
	"motivo_anulacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "espumante_evento_perdas" CHECK (perdas >= 0),
	CONSTRAINT "espumante_evento_anulacao" CHECK ((anulado_em is null) = (motivo_anulacao is null))
);
--> statement-breakpoint
CREATE TABLE "espumante_lote" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"projeto_id" uuid NOT NULL,
	"metodo" text NOT NULL,
	"operacao_id" uuid NOT NULL,
	"tiragem_em" timestamp with time zone NOT NULL,
	"volume_ml" integer NOT NULL,
	"garrafas_iniciais" integer NOT NULL,
	"litros" numeric(12, 2) NOT NULL,
	"composicao" jsonb NOT NULL,
	"local_id" uuid,
	"situacao" text DEFAULT 'em_processo' NOT NULL,
	"finalizado_em" timestamp with time zone,
	"produto_id" uuid,
	"lote_comercial_id" uuid,
	"grupo_finalizacao" uuid,
	"garrafas_finais" integer,
	"observacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "espumante_lote_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "espumante_lote_metodo" CHECK (metodo in ('tradicional', 'ancestral')),
	CONSTRAINT "espumante_lote_situacao" CHECK (situacao in ('em_processo', 'finalizado', 'cancelado')),
	CONSTRAINT "espumante_lote_garrafas" CHECK (garrafas_iniciais > 0 and volume_ml > 0)
);
--> statement-breakpoint
ALTER TABLE "simulacao_corte" ADD CONSTRAINT "simulacao_corte_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulacao_corte" ADD CONSTRAINT "simulacao_corte_aprovada_por_usuario_id_fk" FOREIGN KEY ("aprovada_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulacao_corte" ADD CONSTRAINT "simulacao_corte_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulacao_corte" ADD CONSTRAINT "simulacao_corte_projeto_id_empresa_id_projeto_id_empresa_id_fk" FOREIGN KEY ("projeto_id","empresa_id") REFERENCES "public"."projeto"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comunicacao_alcool" ADD CONSTRAINT "comunicacao_alcool_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comunicacao_alcool" ADD CONSTRAINT "comunicacao_alcool_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comunicacao_alcool" ADD CONSTRAINT "comunicacao_alcool_movimento_id_empresa_id_movimento_estoque_id_empresa_id_fk" FOREIGN KEY ("movimento_id","empresa_id") REFERENCES "public"."movimento_estoque"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selo_faixa" ADD CONSTRAINT "selo_faixa_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selo_faixa" ADD CONSTRAINT "selo_faixa_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selo_faixa" ADD CONSTRAINT "selo_faixa_item_id_empresa_id_item_estoque_id_empresa_id_fk" FOREIGN KEY ("item_id","empresa_id") REFERENCES "public"."item_estoque"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selo_uso" ADD CONSTRAINT "selo_uso_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selo_uso" ADD CONSTRAINT "selo_uso_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selo_uso" ADD CONSTRAINT "selo_uso_item_id_empresa_id_item_estoque_id_empresa_id_fk" FOREIGN KEY ("item_id","empresa_id") REFERENCES "public"."item_estoque"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selo_uso" ADD CONSTRAINT "selo_uso_producao_id_producao_parcial_id_fk" FOREIGN KEY ("producao_id") REFERENCES "public"."producao_parcial"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "espumante_evento" ADD CONSTRAINT "espumante_evento_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "espumante_evento" ADD CONSTRAINT "espumante_evento_lote_id_empresa_id_espumante_lote_id_empresa_id_fk" FOREIGN KEY ("lote_id","empresa_id") REFERENCES "public"."espumante_lote"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "espumante_lote" ADD CONSTRAINT "espumante_lote_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "espumante_lote" ADD CONSTRAINT "espumante_lote_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "espumante_lote" ADD CONSTRAINT "espumante_lote_projeto_id_empresa_id_projeto_id_empresa_id_fk" FOREIGN KEY ("projeto_id","empresa_id") REFERENCES "public"."projeto"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "espumante_lote" ADD CONSTRAINT "espumante_lote_operacao_id_empresa_id_operacao_id_empresa_id_fk" FOREIGN KEY ("operacao_id","empresa_id") REFERENCES "public"."operacao"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "espumante_lote" ADD CONSTRAINT "espumante_lote_local_id_empresa_id_local_id_empresa_id_fk" FOREIGN KEY ("local_id","empresa_id") REFERENCES "public"."local"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "espumante_lote" ADD CONSTRAINT "espumante_lote_produto_id_empresa_id_produto_id_empresa_id_fk" FOREIGN KEY ("produto_id","empresa_id") REFERENCES "public"."produto"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "espumante_lote" ADD CONSTRAINT "espumante_lote_lote_comercial_id_empresa_id_lote_comercial_id_empresa_id_fk" FOREIGN KEY ("lote_comercial_id","empresa_id") REFERENCES "public"."lote_comercial"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "simulacao_corte_projeto" ON "simulacao_corte" USING btree ("projeto_id");--> statement-breakpoint
CREATE UNIQUE INDEX "comunicacao_alcool_movimento" ON "comunicacao_alcool" USING btree ("movimento_id");--> statement-breakpoint
CREATE INDEX "selo_faixa_item" ON "selo_faixa" USING btree ("item_id","serie");--> statement-breakpoint
CREATE INDEX "selo_uso_item" ON "selo_uso" USING btree ("item_id","serie");--> statement-breakpoint
CREATE INDEX "selo_uso_producao" ON "selo_uso" USING btree ("producao_id");--> statement-breakpoint
CREATE INDEX "espumante_evento_lote" ON "espumante_evento" USING btree ("lote_id","executado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "espumante_lote_codigo" ON "espumante_lote" USING btree ("estabelecimento_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "espumante_lote_operacao" ON "espumante_lote" USING btree ("operacao_id");