CREATE TABLE "tipo_tratamento_parametro" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo_tratamento" text NOT NULL,
	"nome" text NOT NULL,
	"unidade" text,
	"obrigatorio" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"inativado_em" timestamp with time zone,
	"inativado_por" uuid,
	"motivo_inativacao" text,
	CONSTRAINT "tipo_tratamento_parametro_id_empresa" UNIQUE("id","empresa_id")
);
--> statement-breakpoint
CREATE TABLE "analise" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"lote_id" uuid NOT NULL,
	"recipiente_id" uuid,
	"amostra_em" timestamp with time zone NOT NULL,
	"tipo" text DEFAULT 'interna' NOT NULL,
	"observacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "analise_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "analise_tipo" CHECK (tipo in ('interna', 'laudo'))
);
--> statement-breakpoint
CREATE TABLE "analise_resultado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"analise_id" uuid NOT NULL,
	"parametro_id" uuid NOT NULL,
	"valor" numeric(14, 4) NOT NULL,
	"valor_digitado" text,
	"unidade_digitada" text,
	"fora_faixa" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fermentacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"lote_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"operacao_inicio_id" uuid NOT NULL,
	"operacao_fim_id" uuid,
	"fim_sugerido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "fermentacao_tipo" CHECK (tipo in ('alcoolica', 'malolatica'))
);
--> statement-breakpoint
CREATE TABLE "inventario_cantina" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"contado_em" timestamp with time zone NOT NULL,
	"local_id" uuid,
	"situacao" text DEFAULT 'rascunho' NOT NULL,
	"operacao_id" uuid,
	"observacao" text,
	"confirmado_em" timestamp with time zone,
	"confirmado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "inventario_cantina_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "inventario_cantina_situacao" CHECK (situacao in ('rascunho', 'confirmado')),
	CONSTRAINT "inventario_cantina_confirmado" CHECK ((situacao = 'confirmado') = (confirmado_em is not null))
);
--> statement-breakpoint
CREATE TABLE "inventario_cantina_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"inventario_id" uuid NOT NULL,
	"recipiente_id" uuid NOT NULL,
	"lote_id" uuid,
	"volume_livro" numeric(12, 2),
	"volume_medido" numeric(12, 2),
	"motivo" text,
	CONSTRAINT "inventario_cantina_item_recipiente" UNIQUE("inventario_id","recipiente_id"),
	CONSTRAINT "inventario_cantina_item_medido" CHECK (volume_medido is null or volume_medido >= 0)
);
--> statement-breakpoint
CREATE TABLE "operacao_chaptalizacao" (
	"operacao_id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"acucar_kg" numeric(12, 3) NOT NULL,
	"gramas_por_litro" numeric(8, 2) NOT NULL,
	"ganho_estimado" numeric(5, 2) NOT NULL,
	"regra" text
);
--> statement-breakpoint
CREATE TABLE "operacao_higienizacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"operacao_id" uuid NOT NULL,
	"recipiente_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"produto" text,
	"dose" text,
	"situacao_anterior" text NOT NULL,
	CONSTRAINT "operacao_higienizacao_tipo" CHECK (tipo in ('higienizacao', 'manutencao'))
);
--> statement-breakpoint
CREATE TABLE "operacao_insumo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"operacao_id" uuid NOT NULL,
	"recipiente_id" uuid NOT NULL,
	"lote_id" uuid NOT NULL,
	"item_id" uuid,
	"lote_item_id" uuid,
	"descricao" text,
	"dose" numeric(14, 4) NOT NULL,
	"unidade" text NOT NULL,
	"volume_tratado" numeric(12, 2) NOT NULL,
	"quantidade" numeric(14, 3),
	"so2" numeric(8, 2),
	"aplicado_em" timestamp with time zone NOT NULL,
	"temperatura" numeric(4, 1),
	CONSTRAINT "operacao_insumo_item" CHECK ((item_id is null) <> (descricao is null)),
	CONSTRAINT "operacao_insumo_dose" CHECK (dose > 0 and volume_tratado > 0)
);
--> statement-breakpoint
CREATE TABLE "operacao_parametro" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"operacao_id" uuid NOT NULL,
	"parametro_id" uuid NOT NULL,
	"valor" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lote_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"fabricacao" date,
	"validade" date,
	"titular_id" uuid,
	"origem" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "lote_item_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "lote_item_origem" CHECK (origem in ('entrada', 'nfe', 'producao', 'retorno_terceiro', 'carga_inicial', 'consumo')),
	CONSTRAINT "lote_item_datas" CHECK (fabricacao is null or validade is null or fabricacao <= validade)
);
--> statement-breakpoint
CREATE TABLE "movimento_estoque" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"modulo" text NOT NULL,
	"local_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"lote_item_id" uuid,
	"quantidade" numeric(14, 3) NOT NULL,
	"tipo" text NOT NULL,
	"motivo" text,
	"documento" text,
	"grupo_id" uuid NOT NULL,
	"operacao_id" uuid,
	"executado_em" timestamp with time zone NOT NULL,
	"lancado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"estorno_de_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "movimento_estoque_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "movimento_estoque_tipo" CHECK (tipo in ('entrada', 'entrada_nfe', 'consumo_operacao', 'consumo_envase', 'producao', 'saida', 'devolucao', 'transferencia', 'ajuste_inventario', 'descarte', 'carga_inicial', 'estorno')),
	CONSTRAINT "movimento_estoque_quantidade" CHECK (quantidade <> 0)
);
--> statement-breakpoint
CREATE TABLE "pendencia_estoque" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"local_id" uuid NOT NULL,
	"movimento_id" uuid NOT NULL,
	"executado_em" timestamp with time zone NOT NULL,
	"saldo_apurado" numeric(14, 3) NOT NULL,
	"situacao" text DEFAULT 'aberta' NOT NULL,
	"resolvida_por_id" uuid,
	"resolvida_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "pendencia_estoque_situacao" CHECK (situacao in ('aberta', 'resolvida')),
	CONSTRAINT "pendencia_estoque_resolvida" CHECK ((situacao = 'resolvida') = (resolvida_em is not null))
);
--> statement-breakpoint
ALTER TABLE "item_insumo" ADD COLUMN "teor_so2" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "composicao_parte" ADD COLUMN "so2_adicionado" numeric(8, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "operacao" ADD COLUMN "e_corte" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "romaneio" ADD COLUMN "estornado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "romaneio" ADD COLUMN "estornado_por" uuid;--> statement-breakpoint
ALTER TABLE "romaneio" ADD COLUMN "motivo_estorno" text;--> statement-breakpoint
ALTER TABLE "tipo_tratamento_parametro" ADD CONSTRAINT "tipo_tratamento_parametro_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analise" ADD CONSTRAINT "analise_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analise" ADD CONSTRAINT "analise_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analise" ADD CONSTRAINT "analise_lote_id_empresa_id_lote_id_empresa_id_fk" FOREIGN KEY ("lote_id","empresa_id") REFERENCES "public"."lote"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analise" ADD CONSTRAINT "analise_recipiente_id_empresa_id_recipiente_id_empresa_id_fk" FOREIGN KEY ("recipiente_id","empresa_id") REFERENCES "public"."recipiente"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analise_resultado" ADD CONSTRAINT "analise_resultado_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analise_resultado" ADD CONSTRAINT "analise_resultado_parametro_id_parametro_analise_id_fk" FOREIGN KEY ("parametro_id") REFERENCES "public"."parametro_analise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analise_resultado" ADD CONSTRAINT "analise_resultado_analise_id_empresa_id_analise_id_empresa_id_fk" FOREIGN KEY ("analise_id","empresa_id") REFERENCES "public"."analise"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fermentacao" ADD CONSTRAINT "fermentacao_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fermentacao" ADD CONSTRAINT "fermentacao_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fermentacao" ADD CONSTRAINT "fermentacao_lote_id_empresa_id_lote_id_empresa_id_fk" FOREIGN KEY ("lote_id","empresa_id") REFERENCES "public"."lote"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fermentacao" ADD CONSTRAINT "fermentacao_operacao_inicio_id_empresa_id_operacao_id_empresa_id_fk" FOREIGN KEY ("operacao_inicio_id","empresa_id") REFERENCES "public"."operacao"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fermentacao" ADD CONSTRAINT "fermentacao_operacao_fim_id_empresa_id_operacao_id_empresa_id_fk" FOREIGN KEY ("operacao_fim_id","empresa_id") REFERENCES "public"."operacao"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario_cantina" ADD CONSTRAINT "inventario_cantina_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario_cantina" ADD CONSTRAINT "inventario_cantina_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario_cantina" ADD CONSTRAINT "inventario_cantina_local_id_empresa_id_local_id_empresa_id_fk" FOREIGN KEY ("local_id","empresa_id") REFERENCES "public"."local"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario_cantina" ADD CONSTRAINT "inventario_cantina_operacao_id_empresa_id_operacao_id_empresa_id_fk" FOREIGN KEY ("operacao_id","empresa_id") REFERENCES "public"."operacao"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario_cantina_item" ADD CONSTRAINT "inventario_cantina_item_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario_cantina_item" ADD CONSTRAINT "inventario_cantina_item_inventario_id_empresa_id_inventario_cantina_id_empresa_id_fk" FOREIGN KEY ("inventario_id","empresa_id") REFERENCES "public"."inventario_cantina"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario_cantina_item" ADD CONSTRAINT "inventario_cantina_item_recipiente_id_empresa_id_recipiente_id_empresa_id_fk" FOREIGN KEY ("recipiente_id","empresa_id") REFERENCES "public"."recipiente"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario_cantina_item" ADD CONSTRAINT "inventario_cantina_item_lote_id_empresa_id_lote_id_empresa_id_fk" FOREIGN KEY ("lote_id","empresa_id") REFERENCES "public"."lote"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacao_chaptalizacao" ADD CONSTRAINT "operacao_chaptalizacao_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacao_chaptalizacao" ADD CONSTRAINT "operacao_chaptalizacao_operacao_id_empresa_id_operacao_id_empresa_id_fk" FOREIGN KEY ("operacao_id","empresa_id") REFERENCES "public"."operacao"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacao_higienizacao" ADD CONSTRAINT "operacao_higienizacao_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacao_higienizacao" ADD CONSTRAINT "operacao_higienizacao_operacao_id_empresa_id_operacao_id_empresa_id_fk" FOREIGN KEY ("operacao_id","empresa_id") REFERENCES "public"."operacao"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacao_higienizacao" ADD CONSTRAINT "operacao_higienizacao_recipiente_id_empresa_id_recipiente_id_empresa_id_fk" FOREIGN KEY ("recipiente_id","empresa_id") REFERENCES "public"."recipiente"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacao_insumo" ADD CONSTRAINT "operacao_insumo_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacao_insumo" ADD CONSTRAINT "operacao_insumo_operacao_id_empresa_id_operacao_id_empresa_id_fk" FOREIGN KEY ("operacao_id","empresa_id") REFERENCES "public"."operacao"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacao_insumo" ADD CONSTRAINT "operacao_insumo_recipiente_id_empresa_id_recipiente_id_empresa_id_fk" FOREIGN KEY ("recipiente_id","empresa_id") REFERENCES "public"."recipiente"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacao_insumo" ADD CONSTRAINT "operacao_insumo_lote_id_empresa_id_lote_id_empresa_id_fk" FOREIGN KEY ("lote_id","empresa_id") REFERENCES "public"."lote"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacao_insumo" ADD CONSTRAINT "operacao_insumo_item_id_empresa_id_item_estoque_id_empresa_id_fk" FOREIGN KEY ("item_id","empresa_id") REFERENCES "public"."item_estoque"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacao_parametro" ADD CONSTRAINT "operacao_parametro_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacao_parametro" ADD CONSTRAINT "operacao_parametro_operacao_id_empresa_id_operacao_id_empresa_id_fk" FOREIGN KEY ("operacao_id","empresa_id") REFERENCES "public"."operacao"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacao_parametro" ADD CONSTRAINT "operacao_parametro_parametro_id_empresa_id_tipo_tratamento_parametro_id_empresa_id_fk" FOREIGN KEY ("parametro_id","empresa_id") REFERENCES "public"."tipo_tratamento_parametro"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lote_item" ADD CONSTRAINT "lote_item_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lote_item" ADD CONSTRAINT "lote_item_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lote_item" ADD CONSTRAINT "lote_item_item_id_empresa_id_item_estoque_id_empresa_id_fk" FOREIGN KEY ("item_id","empresa_id") REFERENCES "public"."item_estoque"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lote_item" ADD CONSTRAINT "lote_item_titular_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("titular_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimento_estoque" ADD CONSTRAINT "movimento_estoque_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimento_estoque" ADD CONSTRAINT "movimento_estoque_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimento_estoque" ADD CONSTRAINT "movimento_estoque_local_id_empresa_id_local_id_empresa_id_fk" FOREIGN KEY ("local_id","empresa_id") REFERENCES "public"."local"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimento_estoque" ADD CONSTRAINT "movimento_estoque_item_id_empresa_id_item_estoque_id_empresa_id_fk" FOREIGN KEY ("item_id","empresa_id") REFERENCES "public"."item_estoque"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimento_estoque" ADD CONSTRAINT "movimento_estoque_lote_item_id_empresa_id_lote_item_id_empresa_id_fk" FOREIGN KEY ("lote_item_id","empresa_id") REFERENCES "public"."lote_item"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimento_estoque" ADD CONSTRAINT "movimento_estoque_operacao_id_empresa_id_operacao_id_empresa_id_fk" FOREIGN KEY ("operacao_id","empresa_id") REFERENCES "public"."operacao"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pendencia_estoque" ADD CONSTRAINT "pendencia_estoque_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pendencia_estoque" ADD CONSTRAINT "pendencia_estoque_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pendencia_estoque" ADD CONSTRAINT "pendencia_estoque_item_id_empresa_id_item_estoque_id_empresa_id_fk" FOREIGN KEY ("item_id","empresa_id") REFERENCES "public"."item_estoque"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pendencia_estoque" ADD CONSTRAINT "pendencia_estoque_local_id_empresa_id_local_id_empresa_id_fk" FOREIGN KEY ("local_id","empresa_id") REFERENCES "public"."local"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pendencia_estoque" ADD CONSTRAINT "pendencia_estoque_movimento_id_empresa_id_movimento_estoque_id_empresa_id_fk" FOREIGN KEY ("movimento_id","empresa_id") REFERENCES "public"."movimento_estoque"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pendencia_estoque" ADD CONSTRAINT "pendencia_estoque_resolvida_por_id_empresa_id_movimento_estoque_id_empresa_id_fk" FOREIGN KEY ("resolvida_por_id","empresa_id") REFERENCES "public"."movimento_estoque"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tipo_tratamento_parametro_nome" ON "tipo_tratamento_parametro" USING btree ("empresa_id","tipo_tratamento",lower(nome));--> statement-breakpoint
CREATE INDEX "analise_lote" ON "analise" USING btree ("lote_id","amostra_em");--> statement-breakpoint
CREATE INDEX "analise_resultado_analise" ON "analise_resultado" USING btree ("analise_id");--> statement-breakpoint
CREATE INDEX "fermentacao_lote" ON "fermentacao" USING btree ("lote_id");--> statement-breakpoint
CREATE INDEX "operacao_higienizacao_recipiente" ON "operacao_higienizacao" USING btree ("recipiente_id");--> statement-breakpoint
CREATE INDEX "operacao_insumo_lote_item" ON "operacao_insumo" USING btree ("lote_item_id");--> statement-breakpoint
CREATE INDEX "operacao_insumo_operacao" ON "operacao_insumo" USING btree ("operacao_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lote_item_codigo" ON "lote_item" USING btree ("estabelecimento_id","item_id","codigo");--> statement-breakpoint
CREATE INDEX "movimento_estoque_item" ON "movimento_estoque" USING btree ("item_id","local_id");--> statement-breakpoint
CREATE INDEX "movimento_estoque_lote" ON "movimento_estoque" USING btree ("lote_item_id");--> statement-breakpoint
CREATE INDEX "movimento_estoque_grupo" ON "movimento_estoque" USING btree ("grupo_id");--> statement-breakpoint
CREATE INDEX "movimento_estoque_operacao" ON "movimento_estoque" USING btree ("operacao_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pendencia_estoque_aberta" ON "pendencia_estoque" USING btree ("item_id","local_id") WHERE situacao = 'aberta';--> statement-breakpoint
ALTER TABLE "romaneio" ADD CONSTRAINT "romaneio_estornado" CHECK ((situacao = 'estornado') = (estornado_em is not null) and (situacao <> 'estornado' or motivo_estorno is not null));