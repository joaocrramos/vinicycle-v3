CREATE TABLE "contrato_terceirizacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"sentido" text NOT NULL,
	"numero" text,
	"atividades" text[] NOT NULL,
	"contraparte_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"registro_mapa_contraparte" text,
	"registro_mapa_contraparte_validade" date,
	"registro_produto" text NOT NULL,
	"vigencia_inicio" date NOT NULL,
	"vigencia_fim" date,
	"insumos_cantina" text,
	"insumos_cliente" text,
	"perda_tolerada_tipo" text,
	"perda_tolerada_valor" numeric(10, 4),
	"pagamento_dinheiro" boolean DEFAULT true NOT NULL,
	"pagamento_produto_valor" numeric(14, 4),
	"pagamento_produto_unidade" text,
	"prefixo_lote" text,
	"forma_texto" text DEFAULT 'produzido_para' NOT NULL,
	"texto_rotulo" text,
	"comunicado_sipeagro_em" date,
	"protocolo_sipeagro" text,
	"alterado_apos_comunicacao" boolean DEFAULT false NOT NULL,
	"documento_id" uuid,
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
	CONSTRAINT "contrato_terceirizacao_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "contrato_terceirizacao_sentido" CHECK (sentido in ('prestamos', 'contratamos')),
	CONSTRAINT "contrato_terceirizacao_atividades" CHECK (cardinality(atividades) between 1 and 4 and atividades <@ array['elaboracao', 'padronizacao', 'envase', 'guarda']::text[]),
	CONSTRAINT "contrato_terceirizacao_registro_produto" CHECK (registro_produto in ('contratante', 'cantina')),
	CONSTRAINT "contrato_terceirizacao_forma_texto" CHECK (forma_texto in ('produzido_para', 'responsabilidade_produzido', 'responsabilidade_padronizado', 'cantina_produtora')),
	CONSTRAINT "contrato_terceirizacao_vigencia" CHECK (vigencia_fim is null or vigencia_fim >= vigencia_inicio),
	CONSTRAINT "contrato_terceirizacao_perda" CHECK ((perda_tolerada_tipo is null) = (perda_tolerada_valor is null) and (perda_tolerada_tipo is null or perda_tolerada_tipo in ('percentual', 'rendimento_minimo'))),
	CONSTRAINT "contrato_terceirizacao_pagamento" CHECK ((pagamento_produto_valor is null) = (pagamento_produto_unidade is null) and (pagamento_produto_unidade is null or pagamento_produto_unidade in ('percentual', 'litro', 'garrafa')) and (pagamento_dinheiro or pagamento_produto_unidade is not null)),
	CONSTRAINT "contrato_terceirizacao_prefixo" CHECK (prefixo_lote is null or prefixo_lote ~ '^[A-Z0-9]{1,6}$')
);
--> statement-breakpoint
CREATE TABLE "contrato_terceirizacao_marca" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"contrato_id" uuid NOT NULL,
	"marca_id" uuid NOT NULL,
	CONSTRAINT "contrato_terceirizacao_marca_unica" UNIQUE("contrato_id","marca_id")
);
--> statement-breakpoint
CREATE TABLE "contrato_terceirizacao_preco" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"contrato_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"descricao" text NOT NULL,
	"valor" numeric(14, 2) NOT NULL,
	"unidade" text NOT NULL,
	CONSTRAINT "contrato_terceirizacao_preco_valor" CHECK (valor >= 0)
);
--> statement-breakpoint
CREATE TABLE "contrato_terceirizacao_produto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"contrato_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	CONSTRAINT "contrato_terceirizacao_produto_unico" UNIQUE("contrato_id","produto_id")
);
--> statement-breakpoint
CREATE TABLE "dossie" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"titular_id" uuid NOT NULL,
	"lote_id" uuid,
	"lote_comercial_id" uuid,
	"titulo" text NOT NULL,
	"conteudo" jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "dossie_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "dossie_partida" CHECK ((lote_id is null) <> (lote_comercial_id is null))
);
--> statement-breakpoint
CREATE TABLE "dossie_envio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"dossie_id" uuid NOT NULL,
	"para" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid
);
--> statement-breakpoint
CREATE TABLE "transferencia_titularidade" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"forma" text NOT NULL,
	"executado_em" timestamp with time zone NOT NULL,
	"motivo" text NOT NULL,
	"contrato_id" uuid,
	"de_titular_id" uuid,
	"para_titular_id" uuid,
	"operacao_id" uuid,
	"grupo_estoque_id" uuid,
	"litros" numeric(14, 2) DEFAULT '0' NOT NULL,
	"garrafas" integer DEFAULT 0 NOT NULL,
	"observacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "transferencia_titularidade_forma" CHECK (forma in ('granel', 'estoque')),
	CONSTRAINT "transferencia_titularidade_motivo" CHECK (motivo in ('compra_venda', 'pagamento_servico', 'outro')),
	CONSTRAINT "transferencia_titularidade_origem" CHECK ((forma = 'granel') = (operacao_id is not null) and (forma = 'estoque') = (grupo_estoque_id is not null)),
	CONSTRAINT "transferencia_titularidade_titulares" CHECK (coalesce(de_titular_id, '00000000-0000-0000-0000-000000000000'::uuid) <> coalesce(para_titular_id, '00000000-0000-0000-0000-000000000000'::uuid))
);
--> statement-breakpoint
CREATE TABLE "remessa_terceiro" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"projeto_id" uuid NOT NULL,
	"cantina_id" uuid NOT NULL,
	"contrato_id" uuid,
	"executado_em" timestamp with time zone NOT NULL,
	"nf_numero" text,
	"nf_chave" text,
	"grupo_estoque_id" uuid,
	"concluida_em" timestamp with time zone,
	"observacao" text,
	"situacao" text DEFAULT 'lancada' NOT NULL,
	"motivo_estorno" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "remessa_terceiro_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "remessa_terceiro_situacao" CHECK (situacao in ('lancada', 'estornada')),
	CONSTRAINT "remessa_terceiro_nf_chave" CHECK (nf_chave is null or nf_chave ~ '^[0-9]{44}$')
);
--> statement-breakpoint
CREATE TABLE "remessa_terceiro_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"remessa_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"tipo" text NOT NULL,
	"variedade_id" uuid,
	"safra" integer,
	"kg" numeric(12, 1),
	"origem_uva" text,
	"parcela_id" uuid,
	"romaneio_item_id" uuid,
	"fornecedor_id" uuid,
	"operacao_id" uuid,
	"litros" numeric(12, 2),
	"item_id" uuid,
	"lote_item_id" uuid,
	"quantidade" numeric(14, 3),
	"local_destino_id" uuid,
	CONSTRAINT "remessa_terceiro_item_tipo" CHECK (tipo in ('uva', 'granel', 'insumo')),
	CONSTRAINT "remessa_terceiro_item_uva" CHECK (tipo <> 'uva' or (variedade_id is not null and kg > 0 and origem_uva in ('parcela', 'romaneio', 'fornecedor'))),
	CONSTRAINT "remessa_terceiro_item_granel" CHECK (tipo <> 'granel' or operacao_id is not null),
	CONSTRAINT "remessa_terceiro_item_insumo" CHECK (tipo <> 'insumo' or (item_id is not null and quantidade > 0 and local_destino_id is not null))
);
--> statement-breakpoint
CREATE TABLE "retorno_terceiro" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"projeto_id" uuid NOT NULL,
	"cantina_id" uuid NOT NULL,
	"remessa_id" uuid,
	"executado_em" timestamp with time zone NOT NULL,
	"nf_numero" text,
	"nf_chave" text,
	"glt" text,
	"perdas_informadas" numeric(12, 2),
	"grupo_estoque_id" uuid,
	"observacao" text,
	"situacao" text DEFAULT 'lancada' NOT NULL,
	"motivo_estorno" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "retorno_terceiro_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "retorno_terceiro_situacao" CHECK (situacao in ('lancada', 'estornada')),
	CONSTRAINT "retorno_terceiro_nf_chave" CHECK (nf_chave is null or nf_chave ~ '^[0-9]{44}$'),
	CONSTRAINT "retorno_terceiro_perdas" CHECK (perdas_informadas is null or perdas_informadas >= 0)
);
--> statement-breakpoint
CREATE TABLE "retorno_terceiro_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"retorno_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"tipo" text NOT NULL,
	"operacao_id" uuid,
	"litros" numeric(12, 2),
	"produto_id" uuid,
	"formato_id" uuid,
	"garrafas" integer,
	"lote_comercial_id" uuid,
	"item_id" uuid,
	"lote_item_id" uuid,
	"quantidade" numeric(14, 3),
	"local_id" uuid,
	CONSTRAINT "retorno_terceiro_item_tipo" CHECK (tipo in ('granel', 'engarrafado', 'insumo_consumido')),
	CONSTRAINT "retorno_terceiro_item_granel" CHECK (tipo <> 'granel' or operacao_id is not null),
	CONSTRAINT "retorno_terceiro_item_engarrafado" CHECK (tipo <> 'engarrafado' or (formato_id is not null and garrafas > 0 and lote_comercial_id is not null)),
	CONSTRAINT "retorno_terceiro_item_insumo" CHECK (tipo <> 'insumo_consumido' or (item_id is not null and quantidade > 0 and local_id is not null))
);
--> statement-breakpoint
ALTER TABLE "anexo" DROP CONSTRAINT "anexo_categoria";--> statement-breakpoint
ALTER TABLE "operacao_granel" DROP CONSTRAINT "operacao_granel_tipo";--> statement-breakpoint
ALTER TABLE "lote_item" DROP CONSTRAINT "lote_item_origem";--> statement-breakpoint
ALTER TABLE "movimento_estoque" DROP CONSTRAINT "movimento_estoque_tipo";--> statement-breakpoint
DROP INDEX "lote_item_codigo";--> statement-breakpoint
ALTER TABLE "romaneio" ADD COLUMN "contrato_id" uuid;--> statement-breakpoint
ALTER TABLE "saida" ADD COLUMN "titular_id" uuid;--> statement-breakpoint
ALTER TABLE "contrato_terceirizacao" ADD CONSTRAINT "contrato_terceirizacao_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrato_terceirizacao" ADD CONSTRAINT "contrato_terceirizacao_contraparte_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("contraparte_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrato_terceirizacao" ADD CONSTRAINT "contrato_terceirizacao_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrato_terceirizacao" ADD CONSTRAINT "contrato_terceirizacao_documento_id_empresa_id_documento_id_empresa_id_fk" FOREIGN KEY ("documento_id","empresa_id") REFERENCES "public"."documento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrato_terceirizacao_marca" ADD CONSTRAINT "contrato_terceirizacao_marca_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrato_terceirizacao_marca" ADD CONSTRAINT "contrato_terceirizacao_marca_contrato_id_empresa_id_contrato_terceirizacao_id_empresa_id_fk" FOREIGN KEY ("contrato_id","empresa_id") REFERENCES "public"."contrato_terceirizacao"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrato_terceirizacao_marca" ADD CONSTRAINT "contrato_terceirizacao_marca_marca_id_empresa_id_marca_id_empresa_id_fk" FOREIGN KEY ("marca_id","empresa_id") REFERENCES "public"."marca"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrato_terceirizacao_preco" ADD CONSTRAINT "contrato_terceirizacao_preco_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrato_terceirizacao_preco" ADD CONSTRAINT "contrato_terceirizacao_preco_contrato_id_empresa_id_contrato_terceirizacao_id_empresa_id_fk" FOREIGN KEY ("contrato_id","empresa_id") REFERENCES "public"."contrato_terceirizacao"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrato_terceirizacao_produto" ADD CONSTRAINT "contrato_terceirizacao_produto_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrato_terceirizacao_produto" ADD CONSTRAINT "contrato_terceirizacao_produto_contrato_id_empresa_id_contrato_terceirizacao_id_empresa_id_fk" FOREIGN KEY ("contrato_id","empresa_id") REFERENCES "public"."contrato_terceirizacao"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrato_terceirizacao_produto" ADD CONSTRAINT "contrato_terceirizacao_produto_produto_id_empresa_id_produto_id_empresa_id_fk" FOREIGN KEY ("produto_id","empresa_id") REFERENCES "public"."produto"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossie" ADD CONSTRAINT "dossie_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossie" ADD CONSTRAINT "dossie_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossie" ADD CONSTRAINT "dossie_titular_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("titular_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossie" ADD CONSTRAINT "dossie_lote_id_empresa_id_lote_id_empresa_id_fk" FOREIGN KEY ("lote_id","empresa_id") REFERENCES "public"."lote"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossie" ADD CONSTRAINT "dossie_lote_comercial_id_empresa_id_lote_comercial_id_empresa_id_fk" FOREIGN KEY ("lote_comercial_id","empresa_id") REFERENCES "public"."lote_comercial"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossie_envio" ADD CONSTRAINT "dossie_envio_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossie_envio" ADD CONSTRAINT "dossie_envio_dossie_id_empresa_id_dossie_id_empresa_id_fk" FOREIGN KEY ("dossie_id","empresa_id") REFERENCES "public"."dossie"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencia_titularidade" ADD CONSTRAINT "transferencia_titularidade_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencia_titularidade" ADD CONSTRAINT "transferencia_titularidade_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencia_titularidade" ADD CONSTRAINT "transferencia_titularidade_contrato_id_empresa_id_contrato_terceirizacao_id_empresa_id_fk" FOREIGN KEY ("contrato_id","empresa_id") REFERENCES "public"."contrato_terceirizacao"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencia_titularidade" ADD CONSTRAINT "transferencia_titularidade_de_titular_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("de_titular_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencia_titularidade" ADD CONSTRAINT "transferencia_titularidade_para_titular_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("para_titular_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencia_titularidade" ADD CONSTRAINT "transferencia_titularidade_operacao_id_empresa_id_operacao_id_empresa_id_fk" FOREIGN KEY ("operacao_id","empresa_id") REFERENCES "public"."operacao"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remessa_terceiro" ADD CONSTRAINT "remessa_terceiro_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remessa_terceiro" ADD CONSTRAINT "remessa_terceiro_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remessa_terceiro" ADD CONSTRAINT "remessa_terceiro_projeto_id_empresa_id_projeto_id_empresa_id_fk" FOREIGN KEY ("projeto_id","empresa_id") REFERENCES "public"."projeto"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remessa_terceiro" ADD CONSTRAINT "remessa_terceiro_cantina_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("cantina_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remessa_terceiro" ADD CONSTRAINT "remessa_terceiro_contrato_id_empresa_id_contrato_terceirizacao_id_empresa_id_fk" FOREIGN KEY ("contrato_id","empresa_id") REFERENCES "public"."contrato_terceirizacao"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remessa_terceiro_item" ADD CONSTRAINT "remessa_terceiro_item_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remessa_terceiro_item" ADD CONSTRAINT "remessa_terceiro_item_variedade_id_variedade_id_fk" FOREIGN KEY ("variedade_id") REFERENCES "public"."variedade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remessa_terceiro_item" ADD CONSTRAINT "remessa_terceiro_item_remessa_id_empresa_id_remessa_terceiro_id_empresa_id_fk" FOREIGN KEY ("remessa_id","empresa_id") REFERENCES "public"."remessa_terceiro"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remessa_terceiro_item" ADD CONSTRAINT "remessa_terceiro_item_parcela_id_empresa_id_parcela_id_empresa_id_fk" FOREIGN KEY ("parcela_id","empresa_id") REFERENCES "public"."parcela"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remessa_terceiro_item" ADD CONSTRAINT "remessa_terceiro_item_romaneio_item_id_empresa_id_romaneio_item_id_empresa_id_fk" FOREIGN KEY ("romaneio_item_id","empresa_id") REFERENCES "public"."romaneio_item"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remessa_terceiro_item" ADD CONSTRAINT "remessa_terceiro_item_fornecedor_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("fornecedor_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remessa_terceiro_item" ADD CONSTRAINT "remessa_terceiro_item_operacao_id_empresa_id_operacao_id_empresa_id_fk" FOREIGN KEY ("operacao_id","empresa_id") REFERENCES "public"."operacao"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remessa_terceiro_item" ADD CONSTRAINT "remessa_terceiro_item_item_id_empresa_id_item_estoque_id_empresa_id_fk" FOREIGN KEY ("item_id","empresa_id") REFERENCES "public"."item_estoque"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remessa_terceiro_item" ADD CONSTRAINT "remessa_terceiro_item_lote_item_id_empresa_id_lote_item_id_empresa_id_fk" FOREIGN KEY ("lote_item_id","empresa_id") REFERENCES "public"."lote_item"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remessa_terceiro_item" ADD CONSTRAINT "remessa_terceiro_item_local_destino_id_empresa_id_local_id_empresa_id_fk" FOREIGN KEY ("local_destino_id","empresa_id") REFERENCES "public"."local"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retorno_terceiro" ADD CONSTRAINT "retorno_terceiro_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retorno_terceiro" ADD CONSTRAINT "retorno_terceiro_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retorno_terceiro" ADD CONSTRAINT "retorno_terceiro_projeto_id_empresa_id_projeto_id_empresa_id_fk" FOREIGN KEY ("projeto_id","empresa_id") REFERENCES "public"."projeto"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retorno_terceiro" ADD CONSTRAINT "retorno_terceiro_cantina_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("cantina_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retorno_terceiro" ADD CONSTRAINT "retorno_terceiro_remessa_id_empresa_id_remessa_terceiro_id_empresa_id_fk" FOREIGN KEY ("remessa_id","empresa_id") REFERENCES "public"."remessa_terceiro"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retorno_terceiro_item" ADD CONSTRAINT "retorno_terceiro_item_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retorno_terceiro_item" ADD CONSTRAINT "retorno_terceiro_item_retorno_id_empresa_id_retorno_terceiro_id_empresa_id_fk" FOREIGN KEY ("retorno_id","empresa_id") REFERENCES "public"."retorno_terceiro"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retorno_terceiro_item" ADD CONSTRAINT "retorno_terceiro_item_operacao_id_empresa_id_operacao_id_empresa_id_fk" FOREIGN KEY ("operacao_id","empresa_id") REFERENCES "public"."operacao"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retorno_terceiro_item" ADD CONSTRAINT "retorno_terceiro_item_produto_id_empresa_id_produto_id_empresa_id_fk" FOREIGN KEY ("produto_id","empresa_id") REFERENCES "public"."produto"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retorno_terceiro_item" ADD CONSTRAINT "retorno_terceiro_item_formato_id_empresa_id_produto_formato_id_empresa_id_fk" FOREIGN KEY ("formato_id","empresa_id") REFERENCES "public"."produto_formato"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retorno_terceiro_item" ADD CONSTRAINT "retorno_terceiro_item_lote_comercial_id_empresa_id_lote_comercial_id_empresa_id_fk" FOREIGN KEY ("lote_comercial_id","empresa_id") REFERENCES "public"."lote_comercial"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retorno_terceiro_item" ADD CONSTRAINT "retorno_terceiro_item_item_id_empresa_id_item_estoque_id_empresa_id_fk" FOREIGN KEY ("item_id","empresa_id") REFERENCES "public"."item_estoque"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retorno_terceiro_item" ADD CONSTRAINT "retorno_terceiro_item_lote_item_id_empresa_id_lote_item_id_empresa_id_fk" FOREIGN KEY ("lote_item_id","empresa_id") REFERENCES "public"."lote_item"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retorno_terceiro_item" ADD CONSTRAINT "retorno_terceiro_item_local_id_empresa_id_local_id_empresa_id_fk" FOREIGN KEY ("local_id","empresa_id") REFERENCES "public"."local"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contrato_terceirizacao_contraparte" ON "contrato_terceirizacao" USING btree ("contraparte_id","vigencia_inicio");--> statement-breakpoint
CREATE INDEX "contrato_terceirizacao_marca_marca" ON "contrato_terceirizacao_marca" USING btree ("marca_id");--> statement-breakpoint
CREATE INDEX "contrato_terceirizacao_preco_contrato" ON "contrato_terceirizacao_preco" USING btree ("contrato_id","ordem");--> statement-breakpoint
CREATE INDEX "contrato_terceirizacao_produto_produto" ON "contrato_terceirizacao_produto" USING btree ("produto_id");--> statement-breakpoint
CREATE INDEX "dossie_titular" ON "dossie" USING btree ("titular_id","criado_em");--> statement-breakpoint
CREATE INDEX "dossie_envio_dossie" ON "dossie_envio" USING btree ("dossie_id");--> statement-breakpoint
CREATE INDEX "transferencia_titularidade_contrato" ON "transferencia_titularidade" USING btree ("contrato_id");--> statement-breakpoint
CREATE INDEX "transferencia_titularidade_titulares" ON "transferencia_titularidade" USING btree ("de_titular_id","para_titular_id");--> statement-breakpoint
CREATE INDEX "remessa_terceiro_projeto" ON "remessa_terceiro" USING btree ("projeto_id");--> statement-breakpoint
CREATE INDEX "remessa_terceiro_item_remessa" ON "remessa_terceiro_item" USING btree ("remessa_id","ordem");--> statement-breakpoint
CREATE INDEX "remessa_terceiro_item_romaneio" ON "remessa_terceiro_item" USING btree ("romaneio_item_id");--> statement-breakpoint
CREATE INDEX "remessa_terceiro_item_operacao" ON "remessa_terceiro_item" USING btree ("operacao_id");--> statement-breakpoint
CREATE INDEX "retorno_terceiro_remessa" ON "retorno_terceiro" USING btree ("remessa_id");--> statement-breakpoint
CREATE INDEX "retorno_terceiro_projeto" ON "retorno_terceiro" USING btree ("projeto_id");--> statement-breakpoint
CREATE INDEX "retorno_terceiro_item_retorno" ON "retorno_terceiro_item" USING btree ("retorno_id","ordem");--> statement-breakpoint
ALTER TABLE "romaneio" ADD CONSTRAINT "romaneio_contrato_id_empresa_id_contrato_terceirizacao_id_empresa_id_fk" FOREIGN KEY ("contrato_id","empresa_id") REFERENCES "public"."contrato_terceirizacao"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saida" ADD CONSTRAINT "saida_titular_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("titular_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lote_item_codigo" ON "lote_item" USING btree ("estabelecimento_id","item_id","codigo",coalesce(titular_id, '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
ALTER TABLE "anexo" ADD CONSTRAINT "anexo_categoria" CHECK (categoria in ('laudo', 'nota_fiscal', 'certificado', 'foto', 'rotulo', 'comprovante', 'contrato', 'outro'));--> statement-breakpoint
ALTER TABLE "operacao_granel" ADD CONSTRAINT "operacao_granel_tipo" CHECK ((sentido = 'entrada' and tipo in ('compra', 'recebido_cliente', 'retorno_terceiro', 'outra')) or (sentido = 'saida' and tipo in ('venda', 'remessa_terceiro', 'devolucao_titular', 'outra')));--> statement-breakpoint
ALTER TABLE "lote_item" ADD CONSTRAINT "lote_item_origem" CHECK (origem in ('entrada', 'nfe', 'producao', 'retorno_terceiro', 'carga_inicial', 'consumo', 'titularidade'));--> statement-breakpoint
ALTER TABLE "movimento_estoque" ADD CONSTRAINT "movimento_estoque_tipo" CHECK (tipo in ('entrada', 'entrada_nfe', 'consumo_operacao', 'consumo_envase', 'producao', 'saida', 'devolucao', 'transferencia', 'ajuste_inventario', 'descarte', 'carga_inicial', 'titularidade', 'estorno'));