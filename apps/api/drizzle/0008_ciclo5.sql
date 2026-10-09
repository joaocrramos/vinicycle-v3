CREATE TABLE "amostra" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"lote_id" uuid NOT NULL,
	"recipiente_id" uuid,
	"coletada_em" timestamp with time zone NOT NULL,
	"laboratorio_id" uuid NOT NULL,
	"prazo" date,
	"situacao" text DEFAULT 'coletada' NOT NULL,
	"enviada_em" timestamp with time zone,
	"observacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "amostra_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "amostra_situacao" CHECK (situacao in ('coletada', 'enviada', 'laudo_recebido', 'cancelada'))
);
--> statement-breakpoint
CREATE TABLE "operacao_granel" (
	"operacao_id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"sentido" text NOT NULL,
	"tipo" text NOT NULL,
	"nota_numero" text,
	"nota_chave" text,
	"remetente_id" uuid,
	"destinatario_id" uuid,
	"transportador_id" uuid,
	"glt" text,
	"embalagem" text,
	"recebimento_confirmado_em" date,
	"recebimento_confirmado_por" uuid,
	CONSTRAINT "operacao_granel_sentido" CHECK (sentido in ('entrada', 'saida')),
	CONSTRAINT "operacao_granel_tipo" CHECK ((sentido = 'entrada' and tipo in ('compra', 'retorno_terceiro', 'outra')) or (sentido = 'saida' and tipo in ('venda', 'remessa_terceiro', 'devolucao_titular', 'outra'))),
	CONSTRAINT "operacao_granel_embalagem" CHECK (embalagem in ('carro_tanque', 'tambor', 'barril', 'outra')),
	CONSTRAINT "operacao_granel_chave" CHECK (nota_chave ~ '^[0-9]{44}$')
);
--> statement-breakpoint
CREATE TABLE "lote_comercial" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"projeto_id" uuid,
	"produto_id" uuid,
	"titular_id" uuid,
	"primeiro_envase" timestamp with time zone,
	"ultimo_envase" timestamp with time zone,
	"composicao" jsonb,
	"chaptalizado" boolean DEFAULT false NOT NULL,
	"litros" numeric(12, 2) DEFAULT '0' NOT NULL,
	"origem" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "lote_comercial_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "lote_comercial_origem" CHECK (origem in ('envase', 'retorno_terceiro', 'carga_inicial'))
);
--> statement-breakpoint
CREATE TABLE "lote_comercial_origem" (
	"lote_comercial_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"lote_id" uuid NOT NULL,
	"litros" numeric(12, 2) NOT NULL,
	CONSTRAINT "lote_comercial_origem_unica" UNIQUE("lote_comercial_id","lote_id")
);
--> statement-breakpoint
CREATE TABLE "ordem_engarrafamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"projeto_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"rotulo_id" uuid,
	"data_prevista" date NOT NULL,
	"engarrafado_por_id" uuid,
	"local_produto_id" uuid NOT NULL,
	"local_materiais_id" uuid NOT NULL,
	"situacao" text DEFAULT 'planejada' NOT NULL,
	"lote_comercial_id" uuid,
	"observacao" text,
	"motivo_cancelamento" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "ordem_engarrafamento_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "ordem_engarrafamento_situacao" CHECK (situacao in ('planejada', 'em_execucao', 'encerrada', 'cancelada'))
);
--> statement-breakpoint
CREATE TABLE "ordem_formato" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"ordem_id" uuid NOT NULL,
	"formato_id" uuid NOT NULL,
	"garrafas_previstas" integer NOT NULL,
	CONSTRAINT "ordem_formato_unico" UNIQUE("ordem_id","formato_id"),
	CONSTRAINT "ordem_formato_garrafas" CHECK (garrafas_previstas >= 0)
);
--> statement-breakpoint
CREATE TABLE "ordem_origem" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"ordem_id" uuid NOT NULL,
	"recipiente_id" uuid NOT NULL,
	CONSTRAINT "ordem_origem_unica" UNIQUE("ordem_id","recipiente_id")
);
--> statement-breakpoint
CREATE TABLE "producao_formato" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"producao_id" uuid NOT NULL,
	"formato_id" uuid NOT NULL,
	"garrafas" integer NOT NULL,
	CONSTRAINT "producao_formato_garrafas" CHECK (garrafas > 0)
);
--> statement-breakpoint
CREATE TABLE "producao_material" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"producao_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"lote_item_id" uuid,
	"previsto" numeric(14, 3) NOT NULL,
	"real" numeric(14, 3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "producao_parcial" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"ordem_id" uuid NOT NULL,
	"operacao_id" uuid NOT NULL,
	"executado_em" timestamp with time zone NOT NULL,
	"litros_tirados" numeric(12, 2) NOT NULL,
	"litros_engarrafados" numeric(12, 2) NOT NULL,
	"perda_litros" numeric(12, 2) NOT NULL,
	"composicao" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devolucao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"saida_id" uuid,
	"executado_em" timestamp with time zone NOT NULL,
	"documento" text,
	"motivo" text,
	"grupo_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid
);
--> statement-breakpoint
CREATE TABLE "devolucao_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"devolucao_id" uuid NOT NULL,
	"baixa_id" uuid,
	"item_id" uuid NOT NULL,
	"lote_item_id" uuid,
	"local_id" uuid NOT NULL,
	"quantidade" numeric(14, 3) NOT NULL,
	"avariada" boolean DEFAULT false NOT NULL,
	"movimento_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saida" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"origem" text NOT NULL,
	"nfe_id" uuid,
	"executado_em" timestamp with time zone NOT NULL,
	"documento" text,
	"destinatario_documento" text,
	"destinatario_nome" text,
	"pessoa_id" uuid,
	"motivo" text,
	"situacao" text DEFAULT 'lancada' NOT NULL,
	"motivo_estorno" text,
	"grupo_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "saida_origem" CHECK (origem in ('manual', 'xml')),
	CONSTRAINT "saida_situacao" CHECK (situacao in ('lancada', 'estornada'))
);
--> statement-breakpoint
CREATE TABLE "saida_baixa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"saida_item_id" uuid NOT NULL,
	"lote_item_id" uuid,
	"local_id" uuid NOT NULL,
	"quantidade" numeric(14, 3) NOT NULL,
	"estrategia" text NOT NULL,
	"movimento_id" uuid NOT NULL,
	CONSTRAINT "saida_baixa_estrategia" CHECK (estrategia in ('documento', 'escolha', 'mais_antigo', 'sem_lote'))
);
--> statement-breakpoint
CREATE TABLE "saida_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"saida_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantidade" numeric(14, 3) NOT NULL,
	"codigo_documento" text,
	"nfe_item_id" uuid
);
--> statement-breakpoint
DROP INDEX "associacao_item_chave";--> statement-breakpoint
ALTER TABLE "associacao_item" ALTER COLUMN "pessoa_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "analise" ADD COLUMN "laboratorio_id" uuid;--> statement-breakpoint
ALTER TABLE "analise" ADD COLUMN "amostra_id" uuid;--> statement-breakpoint
ALTER TABLE "analise" ADD COLUMN "documento" text;--> statement-breakpoint
ALTER TABLE "analise" ADD COLUMN "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "analise" ADD COLUMN "atualizado_por" uuid;--> statement-breakpoint
ALTER TABLE "analise" ADD COLUMN "versao" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "associacao_item" ADD COLUMN "local_id" uuid;--> statement-breakpoint
ALTER TABLE "nfe_item" ADD COLUMN "fabricacao_nota" date;--> statement-breakpoint
ALTER TABLE "nfe_item" ADD COLUMN "local_id" uuid;--> statement-breakpoint
ALTER TABLE "movimento_estoque" ADD COLUMN "nfe_id" uuid;--> statement-breakpoint
ALTER TABLE "amostra" ADD CONSTRAINT "amostra_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amostra" ADD CONSTRAINT "amostra_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amostra" ADD CONSTRAINT "amostra_lote_id_empresa_id_lote_id_empresa_id_fk" FOREIGN KEY ("lote_id","empresa_id") REFERENCES "public"."lote"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amostra" ADD CONSTRAINT "amostra_recipiente_id_empresa_id_recipiente_id_empresa_id_fk" FOREIGN KEY ("recipiente_id","empresa_id") REFERENCES "public"."recipiente"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amostra" ADD CONSTRAINT "amostra_laboratorio_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("laboratorio_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacao_granel" ADD CONSTRAINT "operacao_granel_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacao_granel" ADD CONSTRAINT "operacao_granel_operacao_id_empresa_id_operacao_id_empresa_id_fk" FOREIGN KEY ("operacao_id","empresa_id") REFERENCES "public"."operacao"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacao_granel" ADD CONSTRAINT "operacao_granel_remetente_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("remetente_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacao_granel" ADD CONSTRAINT "operacao_granel_destinatario_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("destinatario_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacao_granel" ADD CONSTRAINT "operacao_granel_transportador_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("transportador_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lote_comercial" ADD CONSTRAINT "lote_comercial_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lote_comercial" ADD CONSTRAINT "lote_comercial_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lote_comercial" ADD CONSTRAINT "lote_comercial_projeto_id_empresa_id_projeto_id_empresa_id_fk" FOREIGN KEY ("projeto_id","empresa_id") REFERENCES "public"."projeto"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lote_comercial" ADD CONSTRAINT "lote_comercial_produto_id_empresa_id_produto_id_empresa_id_fk" FOREIGN KEY ("produto_id","empresa_id") REFERENCES "public"."produto"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lote_comercial" ADD CONSTRAINT "lote_comercial_titular_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("titular_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lote_comercial_origem" ADD CONSTRAINT "lote_comercial_origem_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lote_comercial_origem" ADD CONSTRAINT "lote_comercial_origem_lote_comercial_id_empresa_id_lote_comercial_id_empresa_id_fk" FOREIGN KEY ("lote_comercial_id","empresa_id") REFERENCES "public"."lote_comercial"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lote_comercial_origem" ADD CONSTRAINT "lote_comercial_origem_lote_id_empresa_id_lote_id_empresa_id_fk" FOREIGN KEY ("lote_id","empresa_id") REFERENCES "public"."lote"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordem_engarrafamento" ADD CONSTRAINT "ordem_engarrafamento_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordem_engarrafamento" ADD CONSTRAINT "ordem_engarrafamento_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordem_engarrafamento" ADD CONSTRAINT "ordem_engarrafamento_projeto_id_empresa_id_projeto_id_empresa_id_fk" FOREIGN KEY ("projeto_id","empresa_id") REFERENCES "public"."projeto"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordem_engarrafamento" ADD CONSTRAINT "ordem_engarrafamento_produto_id_empresa_id_produto_id_empresa_id_fk" FOREIGN KEY ("produto_id","empresa_id") REFERENCES "public"."produto"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordem_engarrafamento" ADD CONSTRAINT "ordem_engarrafamento_rotulo_id_produto_rotulo_id_fk" FOREIGN KEY ("rotulo_id") REFERENCES "public"."produto_rotulo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordem_engarrafamento" ADD CONSTRAINT "ordem_engarrafamento_engarrafado_por_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("engarrafado_por_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordem_engarrafamento" ADD CONSTRAINT "ordem_engarrafamento_local_produto_id_empresa_id_local_id_empresa_id_fk" FOREIGN KEY ("local_produto_id","empresa_id") REFERENCES "public"."local"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordem_engarrafamento" ADD CONSTRAINT "ordem_engarrafamento_local_materiais_id_empresa_id_local_id_empresa_id_fk" FOREIGN KEY ("local_materiais_id","empresa_id") REFERENCES "public"."local"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordem_engarrafamento" ADD CONSTRAINT "ordem_engarrafamento_lote_comercial_id_empresa_id_lote_comercial_id_empresa_id_fk" FOREIGN KEY ("lote_comercial_id","empresa_id") REFERENCES "public"."lote_comercial"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordem_formato" ADD CONSTRAINT "ordem_formato_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordem_formato" ADD CONSTRAINT "ordem_formato_ordem_id_empresa_id_ordem_engarrafamento_id_empresa_id_fk" FOREIGN KEY ("ordem_id","empresa_id") REFERENCES "public"."ordem_engarrafamento"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordem_formato" ADD CONSTRAINT "ordem_formato_formato_id_empresa_id_produto_formato_id_empresa_id_fk" FOREIGN KEY ("formato_id","empresa_id") REFERENCES "public"."produto_formato"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordem_origem" ADD CONSTRAINT "ordem_origem_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordem_origem" ADD CONSTRAINT "ordem_origem_ordem_id_empresa_id_ordem_engarrafamento_id_empresa_id_fk" FOREIGN KEY ("ordem_id","empresa_id") REFERENCES "public"."ordem_engarrafamento"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordem_origem" ADD CONSTRAINT "ordem_origem_recipiente_id_empresa_id_recipiente_id_empresa_id_fk" FOREIGN KEY ("recipiente_id","empresa_id") REFERENCES "public"."recipiente"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producao_formato" ADD CONSTRAINT "producao_formato_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producao_formato" ADD CONSTRAINT "producao_formato_producao_id_producao_parcial_id_fk" FOREIGN KEY ("producao_id") REFERENCES "public"."producao_parcial"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producao_formato" ADD CONSTRAINT "producao_formato_formato_id_empresa_id_produto_formato_id_empresa_id_fk" FOREIGN KEY ("formato_id","empresa_id") REFERENCES "public"."produto_formato"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producao_material" ADD CONSTRAINT "producao_material_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producao_material" ADD CONSTRAINT "producao_material_producao_id_producao_parcial_id_fk" FOREIGN KEY ("producao_id") REFERENCES "public"."producao_parcial"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producao_material" ADD CONSTRAINT "producao_material_item_id_empresa_id_item_estoque_id_empresa_id_fk" FOREIGN KEY ("item_id","empresa_id") REFERENCES "public"."item_estoque"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producao_material" ADD CONSTRAINT "producao_material_lote_item_id_empresa_id_lote_item_id_empresa_id_fk" FOREIGN KEY ("lote_item_id","empresa_id") REFERENCES "public"."lote_item"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producao_parcial" ADD CONSTRAINT "producao_parcial_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producao_parcial" ADD CONSTRAINT "producao_parcial_ordem_id_empresa_id_ordem_engarrafamento_id_empresa_id_fk" FOREIGN KEY ("ordem_id","empresa_id") REFERENCES "public"."ordem_engarrafamento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producao_parcial" ADD CONSTRAINT "producao_parcial_operacao_id_empresa_id_operacao_id_empresa_id_fk" FOREIGN KEY ("operacao_id","empresa_id") REFERENCES "public"."operacao"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devolucao" ADD CONSTRAINT "devolucao_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devolucao" ADD CONSTRAINT "devolucao_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devolucao" ADD CONSTRAINT "devolucao_saida_id_saida_id_fk" FOREIGN KEY ("saida_id") REFERENCES "public"."saida"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devolucao_item" ADD CONSTRAINT "devolucao_item_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devolucao_item" ADD CONSTRAINT "devolucao_item_devolucao_id_devolucao_id_fk" FOREIGN KEY ("devolucao_id") REFERENCES "public"."devolucao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devolucao_item" ADD CONSTRAINT "devolucao_item_baixa_id_saida_baixa_id_fk" FOREIGN KEY ("baixa_id") REFERENCES "public"."saida_baixa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devolucao_item" ADD CONSTRAINT "devolucao_item_item_id_empresa_id_item_estoque_id_empresa_id_fk" FOREIGN KEY ("item_id","empresa_id") REFERENCES "public"."item_estoque"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devolucao_item" ADD CONSTRAINT "devolucao_item_lote_item_id_empresa_id_lote_item_id_empresa_id_fk" FOREIGN KEY ("lote_item_id","empresa_id") REFERENCES "public"."lote_item"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devolucao_item" ADD CONSTRAINT "devolucao_item_local_id_empresa_id_local_id_empresa_id_fk" FOREIGN KEY ("local_id","empresa_id") REFERENCES "public"."local"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devolucao_item" ADD CONSTRAINT "devolucao_item_movimento_id_empresa_id_movimento_estoque_id_empresa_id_fk" FOREIGN KEY ("movimento_id","empresa_id") REFERENCES "public"."movimento_estoque"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saida" ADD CONSTRAINT "saida_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saida" ADD CONSTRAINT "saida_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saida" ADD CONSTRAINT "saida_nfe_id_empresa_id_nfe_id_empresa_id_fk" FOREIGN KEY ("nfe_id","empresa_id") REFERENCES "public"."nfe"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saida" ADD CONSTRAINT "saida_pessoa_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("pessoa_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saida_baixa" ADD CONSTRAINT "saida_baixa_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saida_baixa" ADD CONSTRAINT "saida_baixa_saida_item_id_saida_item_id_fk" FOREIGN KEY ("saida_item_id") REFERENCES "public"."saida_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saida_baixa" ADD CONSTRAINT "saida_baixa_lote_item_id_empresa_id_lote_item_id_empresa_id_fk" FOREIGN KEY ("lote_item_id","empresa_id") REFERENCES "public"."lote_item"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saida_baixa" ADD CONSTRAINT "saida_baixa_local_id_empresa_id_local_id_empresa_id_fk" FOREIGN KEY ("local_id","empresa_id") REFERENCES "public"."local"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saida_baixa" ADD CONSTRAINT "saida_baixa_movimento_id_empresa_id_movimento_estoque_id_empresa_id_fk" FOREIGN KEY ("movimento_id","empresa_id") REFERENCES "public"."movimento_estoque"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saida_item" ADD CONSTRAINT "saida_item_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saida_item" ADD CONSTRAINT "saida_item_saida_id_saida_id_fk" FOREIGN KEY ("saida_id") REFERENCES "public"."saida"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saida_item" ADD CONSTRAINT "saida_item_item_id_empresa_id_item_estoque_id_empresa_id_fk" FOREIGN KEY ("item_id","empresa_id") REFERENCES "public"."item_estoque"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saida_item" ADD CONSTRAINT "saida_item_nfe_item_id_empresa_id_nfe_item_id_empresa_id_fk" FOREIGN KEY ("nfe_item_id","empresa_id") REFERENCES "public"."nfe_item"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "amostra_codigo" ON "amostra" USING btree ("estabelecimento_id","codigo");--> statement-breakpoint
CREATE INDEX "amostra_lote" ON "amostra" USING btree ("lote_id");--> statement-breakpoint
CREATE INDEX "operacao_granel_glt" ON "operacao_granel" USING btree ("glt");--> statement-breakpoint
CREATE UNIQUE INDEX "lote_comercial_codigo" ON "lote_comercial" USING btree ("estabelecimento_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "ordem_engarrafamento_lote" ON "ordem_engarrafamento" USING btree ("lote_comercial_id");--> statement-breakpoint
CREATE INDEX "ordem_engarrafamento_projeto" ON "ordem_engarrafamento" USING btree ("projeto_id");--> statement-breakpoint
CREATE UNIQUE INDEX "producao_parcial_operacao" ON "producao_parcial" USING btree ("operacao_id");--> statement-breakpoint
CREATE INDEX "producao_parcial_ordem" ON "producao_parcial" USING btree ("ordem_id");--> statement-breakpoint
CREATE INDEX "devolucao_saida" ON "devolucao" USING btree ("saida_id");--> statement-breakpoint
CREATE INDEX "saida_data" ON "saida" USING btree ("estabelecimento_id","executado_em");--> statement-breakpoint
CREATE INDEX "saida_baixa_lote" ON "saida_baixa" USING btree ("lote_item_id");--> statement-breakpoint
CREATE INDEX "saida_item_saida" ON "saida_item" USING btree ("saida_id");--> statement-breakpoint
ALTER TABLE "analise" ADD CONSTRAINT "analise_laboratorio_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("laboratorio_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analise" ADD CONSTRAINT "analise_amostra_id_empresa_id_amostra_id_empresa_id_fk" FOREIGN KEY ("amostra_id","empresa_id") REFERENCES "public"."amostra"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "associacao_item" ADD CONSTRAINT "associacao_item_local_id_empresa_id_local_id_empresa_id_fk" FOREIGN KEY ("local_id","empresa_id") REFERENCES "public"."local"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfe_item" ADD CONSTRAINT "nfe_item_local_id_empresa_id_local_id_empresa_id_fk" FOREIGN KEY ("local_id","empresa_id") REFERENCES "public"."local"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimento_estoque" ADD CONSTRAINT "movimento_estoque_nfe_id_empresa_id_nfe_id_empresa_id_fk" FOREIGN KEY ("nfe_id","empresa_id") REFERENCES "public"."nfe"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analise_amostra" ON "analise" USING btree ("amostra_id");--> statement-breakpoint
CREATE INDEX "movimento_estoque_nfe" ON "movimento_estoque" USING btree ("nfe_id");--> statement-breakpoint
CREATE UNIQUE INDEX "associacao_item_chave" ON "associacao_item" USING btree ("empresa_id",coalesce(pessoa_id, '00000000-0000-0000-0000-000000000000'::uuid),"codigo_emitente","sentido");