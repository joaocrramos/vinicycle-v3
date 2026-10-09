CREATE TABLE "composicao_parte" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"lote_id" uuid NOT NULL,
	"recipiente_id" uuid NOT NULL,
	"operacao_id" uuid NOT NULL,
	"vigente_desde" timestamp with time zone NOT NULL,
	"lancada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"volume_litros" numeric(12, 2) NOT NULL,
	"chaptalizado" boolean DEFAULT false NOT NULL,
	"anterior_id" uuid,
	"e_estorno" boolean DEFAULT false NOT NULL,
	CONSTRAINT "composicao_parte_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "composicao_parte_volume" CHECK (volume_litros >= 0)
);
--> statement-breakpoint
CREATE TABLE "composicao_parte_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"parte_id" uuid NOT NULL,
	"variedade_id" uuid,
	"safra" integer,
	"ciclo" text,
	"origem" text NOT NULL,
	"organica" boolean DEFAULT false NOT NULL,
	"candidata_ip" boolean DEFAULT false NOT NULL,
	"fracao" numeric(10, 8) NOT NULL,
	CONSTRAINT "composicao_parte_item_origem" CHECK (origem in ('propria', 'comprada', 'granel', 'nao_informada')),
	CONSTRAINT "composicao_parte_item_fracao" CHECK (fracao > 0 and fracao <= 1)
);
--> statement-breakpoint
CREATE TABLE "genealogia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"origem_lote_id" uuid NOT NULL,
	"destino_lote_id" uuid NOT NULL,
	"litros" numeric(12, 2) NOT NULL,
	"operacao_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"estornada" boolean DEFAULT false NOT NULL,
	CONSTRAINT "genealogia_tipo" CHECK (tipo in ('incorporacao', 'corte', 'lote_novo', 'divisao', 'titularidade')),
	CONSTRAINT "genealogia_litros" CHECK (litros > 0),
	CONSTRAINT "genealogia_lotes" CHECK (origem_lote_id <> destino_lote_id)
);
--> statement-breakpoint
CREATE TABLE "lote" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"projeto_id" uuid NOT NULL,
	"titular_id" uuid,
	"tipo" text NOT NULL,
	"etapa" text,
	"origem" text NOT NULL,
	"safra" integer,
	"ciclo" text,
	"rendimento_real" numeric(6, 4),
	"situacao" text DEFAULT 'ativo' NOT NULL,
	"operacao_origem_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "lote_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "lote_tipo" CHECK (tipo in ('propria', 'terceiro')),
	CONSTRAINT "lote_tipo_titular" CHECK ((tipo = 'propria') = (titular_id is null)),
	CONSTRAINT "lote_origem" CHECK (origem in ('recepcao', 'corte', 'divisao', 'granel', 'retorno_terceiro', 'titularidade', 'carga_inicial')),
	CONSTRAINT "lote_situacao" CHECK (situacao in ('ativo', 'sem_saldo'))
);
--> statement-breakpoint
CREATE TABLE "lote_etapa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"lote_id" uuid NOT NULL,
	"etapa" text NOT NULL,
	"desde" timestamp with time zone DEFAULT now() NOT NULL,
	"por" uuid
);
--> statement-breakpoint
CREATE TABLE "modelo_plano" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"inativado_em" timestamp with time zone,
	"inativado_por" uuid,
	"motivo_inativacao" text,
	CONSTRAINT "modelo_plano_id_empresa" UNIQUE("id","empresa_id")
);
--> statement-breakpoint
CREATE TABLE "modelo_plano_etapa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"modelo_id" uuid NOT NULL,
	"tipo_operacao" text NOT NULL,
	"dia_relativo" integer NOT NULL,
	"observacao" text,
	"ordem" integer NOT NULL,
	CONSTRAINT "modelo_plano_etapa_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "modelo_plano_etapa_tipo" CHECK (tipo_operacao in ('desengace', 'prensagem', 'fermentacao', 'chaptalizacao', 'trasfega', 'atesto', 'corte', 'tratamento', 'adicao_insumo', 'perda', 'titularidade', 'ajuste_inventario', 'engarrafamento', 'tiragem', 'estagio_espumante', 'entrada_granel', 'saida_granel', 'higienizacao', 'abertura_saldo', 'estorno'))
);
--> statement-breakpoint
CREATE TABLE "movimento_uva" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"kg" numeric(12, 1) NOT NULL,
	"operacao_id" uuid NOT NULL,
	"lote_id" uuid NOT NULL,
	"recipiente_id" uuid NOT NULL,
	"litros" numeric(12, 2) NOT NULL,
	"estimado" boolean NOT NULL,
	"executado_em" timestamp with time zone NOT NULL,
	"lancado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"estorno_de_id" uuid,
	CONSTRAINT "movimento_uva_kg" CHECK (kg <> 0)
);
--> statement-breakpoint
CREATE TABLE "movimento_volume" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"recipiente_id" uuid NOT NULL,
	"lote_id" uuid NOT NULL,
	"litros" numeric(12, 2) NOT NULL,
	"tipo" text NOT NULL,
	"estimado" boolean DEFAULT false NOT NULL,
	"operacao_id" uuid NOT NULL,
	"linha_id" uuid,
	"executado_em" timestamp with time zone NOT NULL,
	"lancado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"estorno_de_id" uuid,
	CONSTRAINT "movimento_volume_tipo" CHECK (tipo in ('entrada_mosto', 'ajuste_prensagem', 'saida_prensagem', 'entrada_prensagem', 'saida_trasfega', 'entrada_trasfega', 'saida_atesto', 'entrada_atesto', 'evaporacao', 'saida_corte', 'entrada_corte', 'perda', 'ajuste_inventario', 'saida_titularidade', 'entrada_titularidade', 'engarrafamento', 'tiragem', 'entrada_granel', 'saida_granel', 'abertura_saldo', 'estorno')),
	CONSTRAINT "movimento_volume_litros" CHECK (litros <> 0)
);
--> statement-breakpoint
CREATE TABLE "operacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"codigo" text,
	"tipo" text NOT NULL,
	"executado_em" timestamp with time zone NOT NULL,
	"lancado_em" timestamp with time zone,
	"executado_por_id" uuid,
	"responsavel_id" uuid,
	"projeto_id" uuid,
	"plano_etapa_id" uuid,
	"dados" jsonb,
	"observacao" text,
	"situacao" text DEFAULT 'rascunho' NOT NULL,
	"estorno_de_id" uuid,
	"motivo" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "operacao_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "operacao_tipo" CHECK (tipo in ('desengace', 'prensagem', 'fermentacao', 'chaptalizacao', 'trasfega', 'atesto', 'corte', 'tratamento', 'adicao_insumo', 'perda', 'titularidade', 'ajuste_inventario', 'engarrafamento', 'tiragem', 'estagio_espumante', 'entrada_granel', 'saida_granel', 'higienizacao', 'abertura_saldo', 'estorno')),
	CONSTRAINT "operacao_situacao" CHECK (situacao in ('rascunho', 'confirmada', 'estornada')),
	CONSTRAINT "operacao_confirmada" CHECK ((situacao = 'rascunho') = (codigo is null) and (situacao = 'rascunho') = (lancado_em is null))
);
--> statement-breakpoint
CREATE TABLE "operacao_linha" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"operacao_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"papel" text NOT NULL,
	"recipiente_id" uuid,
	"lote_id" uuid,
	"litros" numeric(12, 2),
	"fracao_prensa" text,
	"motivo_perda" text,
	"mistura" text,
	"esvaziar_origem" boolean DEFAULT false NOT NULL,
	"litros_medidos" numeric(12, 2),
	CONSTRAINT "operacao_linha_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "operacao_linha_papel" CHECK (papel in ('origem', 'destino', 'perda', 'ajuste')),
	CONSTRAINT "operacao_linha_mistura" CHECK (mistura is null or mistura in ('incorporar', 'lote_novo'))
);
--> statement-breakpoint
CREATE TABLE "operacao_residuo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"operacao_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"kg" numeric(12, 1) NOT NULL,
	"destino" text,
	CONSTRAINT "operacao_residuo_tipo" CHECK (tipo in ('engaco', 'bagaco')),
	CONSTRAINT "operacao_residuo_kg" CHECK (kg > 0)
);
--> statement-breakpoint
CREATE TABLE "parcela" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"propriedade_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"variedade_id" uuid,
	"area_ha" numeric(10, 4),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"inativado_em" timestamp with time zone,
	"inativado_por" uuid,
	"motivo_inativacao" text,
	CONSTRAINT "parcela_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "parcela_area" CHECK (area_ha is null or area_ha > 0)
);
--> statement-breakpoint
CREATE TABLE "pesagem" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"pesado_em" timestamp with time zone NOT NULL,
	"bruto_kg" numeric(12, 1) NOT NULL,
	"tara_kg" numeric(12, 1) NOT NULL,
	CONSTRAINT "pesagem_liquido" CHECK (bruto_kg > tara_kg and tara_kg >= 0)
);
--> statement-breakpoint
CREATE TABLE "plano_etapa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"projeto_id" uuid NOT NULL,
	"tipo_operacao" text NOT NULL,
	"data_prevista" date NOT NULL,
	"recipiente_id" uuid,
	"observacao" text,
	"ordem" integer NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "plano_etapa_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "plano_etapa_tipo" CHECK (tipo_operacao in ('desengace', 'prensagem', 'fermentacao', 'chaptalizacao', 'trasfega', 'atesto', 'corte', 'tratamento', 'adicao_insumo', 'perda', 'titularidade', 'ajuste_inventario', 'engarrafamento', 'tiragem', 'estagio_espumante', 'entrada_granel', 'saida_granel', 'higienizacao', 'abertura_saldo', 'estorno'))
);
--> statement-breakpoint
CREATE TABLE "plano_insumo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"plano_etapa_id" uuid,
	"modelo_etapa_id" uuid,
	"item_estoque_id" uuid NOT NULL,
	"dose" numeric(12, 4) NOT NULL,
	"unidade" text NOT NULL,
	CONSTRAINT "plano_insumo_dono" CHECK ((plano_etapa_id is null) <> (modelo_etapa_id is null)),
	CONSTRAINT "plano_insumo_dose" CHECK (dose > 0)
);
--> statement-breakpoint
CREATE TABLE "projeto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"safra_prevista" integer NOT NULL,
	"ciclo_previsto" text,
	"classe_produto_id" uuid,
	"cor" text,
	"teor_acucar" text,
	"metodo_espumante" text,
	"teor_alcoolico_pretendido" numeric(4, 1),
	"volume_previsto_litros" numeric(12, 2),
	"kg_previstos" numeric(12, 1),
	"enologo_id" uuid,
	"projeto_origem_id" uuid,
	"incorporado_ao_projeto_id" uuid,
	"situacao" text DEFAULT 'planejado' NOT NULL,
	"situacao_desde" timestamp with time zone DEFAULT now() NOT NULL,
	"observacoes" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "projeto_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "projeto_situacao" CHECK (situacao in ('planejado', 'em_producao', 'pronto_envase', 'envase_planejado', 'engarrafado', 'encerrado', 'cancelado')),
	CONSTRAINT "projeto_safra" CHECK (safra_prevista between 1900 and 2200)
);
--> statement-breakpoint
CREATE TABLE "projeto_variedade" (
	"projeto_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"variedade_id" uuid NOT NULL,
	CONSTRAINT "projeto_variedade_pk" UNIQUE("projeto_id","variedade_id")
);
--> statement-breakpoint
CREATE TABLE "propriedade" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"dono_id" uuid,
	"numero_sivibe" text,
	"municipio" text,
	"uf" text,
	"codigo_ibge" text,
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
	CONSTRAINT "propriedade_id_empresa" UNIQUE("id","empresa_id")
);
--> statement-breakpoint
CREATE TABLE "romaneio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"codigo" text,
	"chegada_em" timestamp with time zone NOT NULL,
	"projeto_id" uuid NOT NULL,
	"origem" text NOT NULL,
	"fornecedor_id" uuid,
	"dono_uva_id" uuid,
	"nfe_id" uuid,
	"nf_numero" text,
	"nf_serie" text,
	"nf_emissao" date,
	"nf_chave" text,
	"transportador_id" uuid,
	"placa" text,
	"caixas" integer,
	"situacao" text DEFAULT 'rascunho' NOT NULL,
	"confirmado_em" timestamp with time zone,
	"confirmado_por" uuid,
	"observacoes" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "romaneio_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "romaneio_origem" CHECK (origem in ('vinhedo_proprio', 'fornecedor')),
	CONSTRAINT "romaneio_situacao" CHECK (situacao in ('rascunho', 'confirmado', 'estornado')),
	CONSTRAINT "romaneio_fornecedor" CHECK (origem <> 'fornecedor' or fornecedor_id is not null),
	CONSTRAINT "romaneio_confirmado" CHECK ((situacao = 'rascunho') = (codigo is null) and (situacao = 'rascunho') = (confirmado_em is null)),
	CONSTRAINT "romaneio_nf_chave" CHECK (nf_chave is null or nf_chave ~ '^[0-9]{44}$'),
	CONSTRAINT "romaneio_caixas" CHECK (caixas is null or caixas >= 0)
);
--> statement-breakpoint
CREATE TABLE "romaneio_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"romaneio_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"variedade_id" uuid NOT NULL,
	"parcela_id" uuid,
	"data_colheita" date NOT NULL,
	"safra" integer NOT NULL,
	"ciclo" text,
	"brix" numeric(5, 2),
	"ph" numeric(4, 2),
	"acidez_total" numeric(6, 2),
	"sanidade" numeric(5, 2),
	"temperatura" numeric(4, 1),
	"organica" boolean DEFAULT false NOT NULL,
	"candidata_ip" boolean DEFAULT false NOT NULL,
	"data_poda" date,
	"lote_id" uuid,
	"nfe_item_id" uuid,
	"observacoes" text,
	CONSTRAINT "romaneio_item_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "romaneio_item_brix" CHECK (brix is null or (brix >= 0 and brix <= 60)),
	CONSTRAINT "romaneio_item_sanidade" CHECK (sanidade is null or sanidade between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "ocorrencia_regra" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid,
	"entidade" text NOT NULL,
	"registro_id" uuid NOT NULL,
	"regra_id" uuid,
	"codigo" text NOT NULL,
	"mensagem" text NOT NULL,
	"valor_apurado" numeric(14, 4),
	"limite" numeric(14, 4),
	"resultado" text DEFAULT 'alerta' NOT NULL,
	"ciente_em" timestamp with time zone,
	"ciente_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "ocorrencia_regra_resultado" CHECK (resultado in ('alerta', 'bloqueio'))
);
--> statement-breakpoint
CREATE TABLE "regra_regulatoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" text NOT NULL,
	"chave" text NOT NULL,
	"abrangencia" text NOT NULL,
	"abrangencia_codigo" text,
	"vigente_desde" date NOT NULL,
	"vigente_ate" date,
	"minimo" numeric(14, 4),
	"maximo" numeric(14, 4),
	"unidade" text,
	"dados" jsonb,
	"descricao" text NOT NULL,
	"fonte_norma" text NOT NULL,
	"fonte_artigo" text,
	"fonte_link" text,
	"fonte_nota" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "regra_regulatoria_abrangencia" CHECK (abrangencia in ('nacional', 'uf', 'ig')),
	CONSTRAINT "regra_regulatoria_codigo" CHECK ((abrangencia = 'nacional') = (abrangencia_codigo is null)),
	CONSTRAINT "regra_regulatoria_vigencia" CHECK (vigente_ate is null or vigente_ate >= vigente_desde)
);
--> statement-breakpoint
CREATE TABLE "associacao_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"codigo_emitente" text NOT NULL,
	"sentido" text NOT NULL,
	"item_estoque_id" uuid,
	"variedade_id" uuid,
	"conversao" numeric(15, 6),
	"descartar" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "associacao_item_sentido" CHECK (sentido in ('entrada', 'saida'))
);
--> statement-breakpoint
CREATE TABLE "nfe" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"chave" text NOT NULL,
	"numero" text NOT NULL,
	"serie" text,
	"emissao" timestamp with time zone NOT NULL,
	"emitente_id" uuid,
	"emitente_documento" text NOT NULL,
	"emitente_nome" text NOT NULL,
	"destinatario_documento" text,
	"destinatario_nome" text,
	"tipo_uso" text NOT NULL,
	"origem" text DEFAULT 'arquivo' NOT NULL,
	"anexo_id" uuid,
	"situacao" text DEFAULT 'em_conferencia' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "nfe_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "nfe_chave_formato" CHECK (chave ~ '^[0-9]{44}$'),
	CONSTRAINT "nfe_tipo_uso" CHECK (tipo_uso in ('compra', 'uva', 'venda', 'devolucao', 'remessa', 'retorno')),
	CONSTRAINT "nfe_origem" CHECK (origem in ('arquivo', 'sefaz')),
	CONSTRAINT "nfe_situacao" CHECK (situacao in ('em_conferencia', 'lancada', 'descartada', 'estornada'))
);
--> statement-breakpoint
CREATE TABLE "nfe_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nfe_id" uuid NOT NULL,
	"numero_item" integer NOT NULL,
	"codigo_emitente" text NOT NULL,
	"descricao" text NOT NULL,
	"quantidade" numeric(15, 4) NOT NULL,
	"unidade" text NOT NULL,
	"valor" numeric(15, 2),
	"lote_nota" text,
	"validade_nota" date,
	"item_estoque_id" uuid,
	"variedade_id" uuid,
	"conversao" numeric(15, 6),
	"descartado" text,
	CONSTRAINT "nfe_item_id_empresa" UNIQUE("id","empresa_id")
);
--> statement-breakpoint
ALTER TABLE "composicao_parte" ADD CONSTRAINT "composicao_parte_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "composicao_parte" ADD CONSTRAINT "composicao_parte_lote_id_empresa_id_lote_id_empresa_id_fk" FOREIGN KEY ("lote_id","empresa_id") REFERENCES "public"."lote"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "composicao_parte" ADD CONSTRAINT "composicao_parte_recipiente_id_empresa_id_recipiente_id_empresa_id_fk" FOREIGN KEY ("recipiente_id","empresa_id") REFERENCES "public"."recipiente"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "composicao_parte" ADD CONSTRAINT "composicao_parte_operacao_id_empresa_id_operacao_id_empresa_id_fk" FOREIGN KEY ("operacao_id","empresa_id") REFERENCES "public"."operacao"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "composicao_parte_item" ADD CONSTRAINT "composicao_parte_item_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "composicao_parte_item" ADD CONSTRAINT "composicao_parte_item_variedade_id_variedade_id_fk" FOREIGN KEY ("variedade_id") REFERENCES "public"."variedade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "composicao_parte_item" ADD CONSTRAINT "composicao_parte_item_parte_id_empresa_id_composicao_parte_id_empresa_id_fk" FOREIGN KEY ("parte_id","empresa_id") REFERENCES "public"."composicao_parte"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "genealogia" ADD CONSTRAINT "genealogia_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "genealogia" ADD CONSTRAINT "genealogia_origem_lote_id_empresa_id_lote_id_empresa_id_fk" FOREIGN KEY ("origem_lote_id","empresa_id") REFERENCES "public"."lote"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "genealogia" ADD CONSTRAINT "genealogia_destino_lote_id_empresa_id_lote_id_empresa_id_fk" FOREIGN KEY ("destino_lote_id","empresa_id") REFERENCES "public"."lote"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "genealogia" ADD CONSTRAINT "genealogia_operacao_id_empresa_id_operacao_id_empresa_id_fk" FOREIGN KEY ("operacao_id","empresa_id") REFERENCES "public"."operacao"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lote" ADD CONSTRAINT "lote_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lote" ADD CONSTRAINT "lote_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lote" ADD CONSTRAINT "lote_projeto_id_empresa_id_projeto_id_empresa_id_fk" FOREIGN KEY ("projeto_id","empresa_id") REFERENCES "public"."projeto"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lote" ADD CONSTRAINT "lote_titular_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("titular_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lote_etapa" ADD CONSTRAINT "lote_etapa_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lote_etapa" ADD CONSTRAINT "lote_etapa_lote_id_empresa_id_lote_id_empresa_id_fk" FOREIGN KEY ("lote_id","empresa_id") REFERENCES "public"."lote"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modelo_plano" ADD CONSTRAINT "modelo_plano_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modelo_plano_etapa" ADD CONSTRAINT "modelo_plano_etapa_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modelo_plano_etapa" ADD CONSTRAINT "modelo_plano_etapa_modelo_id_empresa_id_modelo_plano_id_empresa_id_fk" FOREIGN KEY ("modelo_id","empresa_id") REFERENCES "public"."modelo_plano"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimento_uva" ADD CONSTRAINT "movimento_uva_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimento_uva" ADD CONSTRAINT "movimento_uva_item_id_empresa_id_romaneio_item_id_empresa_id_fk" FOREIGN KEY ("item_id","empresa_id") REFERENCES "public"."romaneio_item"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimento_uva" ADD CONSTRAINT "movimento_uva_operacao_id_empresa_id_operacao_id_empresa_id_fk" FOREIGN KEY ("operacao_id","empresa_id") REFERENCES "public"."operacao"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimento_uva" ADD CONSTRAINT "movimento_uva_lote_id_empresa_id_lote_id_empresa_id_fk" FOREIGN KEY ("lote_id","empresa_id") REFERENCES "public"."lote"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimento_uva" ADD CONSTRAINT "movimento_uva_recipiente_id_empresa_id_recipiente_id_empresa_id_fk" FOREIGN KEY ("recipiente_id","empresa_id") REFERENCES "public"."recipiente"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimento_volume" ADD CONSTRAINT "movimento_volume_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimento_volume" ADD CONSTRAINT "movimento_volume_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimento_volume" ADD CONSTRAINT "movimento_volume_recipiente_id_empresa_id_recipiente_id_empresa_id_fk" FOREIGN KEY ("recipiente_id","empresa_id") REFERENCES "public"."recipiente"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimento_volume" ADD CONSTRAINT "movimento_volume_lote_id_empresa_id_lote_id_empresa_id_fk" FOREIGN KEY ("lote_id","empresa_id") REFERENCES "public"."lote"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimento_volume" ADD CONSTRAINT "movimento_volume_operacao_id_empresa_id_operacao_id_empresa_id_fk" FOREIGN KEY ("operacao_id","empresa_id") REFERENCES "public"."operacao"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacao" ADD CONSTRAINT "operacao_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacao" ADD CONSTRAINT "operacao_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacao" ADD CONSTRAINT "operacao_executado_por_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("executado_por_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacao" ADD CONSTRAINT "operacao_responsavel_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("responsavel_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacao" ADD CONSTRAINT "operacao_projeto_id_empresa_id_projeto_id_empresa_id_fk" FOREIGN KEY ("projeto_id","empresa_id") REFERENCES "public"."projeto"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacao" ADD CONSTRAINT "operacao_plano_etapa_id_empresa_id_plano_etapa_id_empresa_id_fk" FOREIGN KEY ("plano_etapa_id","empresa_id") REFERENCES "public"."plano_etapa"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacao_linha" ADD CONSTRAINT "operacao_linha_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacao_linha" ADD CONSTRAINT "operacao_linha_operacao_id_empresa_id_operacao_id_empresa_id_fk" FOREIGN KEY ("operacao_id","empresa_id") REFERENCES "public"."operacao"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacao_linha" ADD CONSTRAINT "operacao_linha_recipiente_id_empresa_id_recipiente_id_empresa_id_fk" FOREIGN KEY ("recipiente_id","empresa_id") REFERENCES "public"."recipiente"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacao_linha" ADD CONSTRAINT "operacao_linha_lote_id_empresa_id_lote_id_empresa_id_fk" FOREIGN KEY ("lote_id","empresa_id") REFERENCES "public"."lote"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacao_residuo" ADD CONSTRAINT "operacao_residuo_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacao_residuo" ADD CONSTRAINT "operacao_residuo_operacao_id_empresa_id_operacao_id_empresa_id_fk" FOREIGN KEY ("operacao_id","empresa_id") REFERENCES "public"."operacao"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcela" ADD CONSTRAINT "parcela_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcela" ADD CONSTRAINT "parcela_variedade_id_variedade_id_fk" FOREIGN KEY ("variedade_id") REFERENCES "public"."variedade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcela" ADD CONSTRAINT "parcela_propriedade_id_empresa_id_propriedade_id_empresa_id_fk" FOREIGN KEY ("propriedade_id","empresa_id") REFERENCES "public"."propriedade"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pesagem" ADD CONSTRAINT "pesagem_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pesagem" ADD CONSTRAINT "pesagem_item_id_empresa_id_romaneio_item_id_empresa_id_fk" FOREIGN KEY ("item_id","empresa_id") REFERENCES "public"."romaneio_item"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plano_etapa" ADD CONSTRAINT "plano_etapa_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plano_etapa" ADD CONSTRAINT "plano_etapa_projeto_id_empresa_id_projeto_id_empresa_id_fk" FOREIGN KEY ("projeto_id","empresa_id") REFERENCES "public"."projeto"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plano_etapa" ADD CONSTRAINT "plano_etapa_recipiente_id_empresa_id_recipiente_id_empresa_id_fk" FOREIGN KEY ("recipiente_id","empresa_id") REFERENCES "public"."recipiente"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plano_insumo" ADD CONSTRAINT "plano_insumo_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plano_insumo" ADD CONSTRAINT "plano_insumo_plano_etapa_id_empresa_id_plano_etapa_id_empresa_id_fk" FOREIGN KEY ("plano_etapa_id","empresa_id") REFERENCES "public"."plano_etapa"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plano_insumo" ADD CONSTRAINT "plano_insumo_modelo_etapa_id_empresa_id_modelo_plano_etapa_id_empresa_id_fk" FOREIGN KEY ("modelo_etapa_id","empresa_id") REFERENCES "public"."modelo_plano_etapa"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plano_insumo" ADD CONSTRAINT "plano_insumo_item_estoque_id_empresa_id_item_estoque_id_empresa_id_fk" FOREIGN KEY ("item_estoque_id","empresa_id") REFERENCES "public"."item_estoque"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projeto" ADD CONSTRAINT "projeto_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projeto" ADD CONSTRAINT "projeto_classe_produto_id_classe_produto_id_fk" FOREIGN KEY ("classe_produto_id") REFERENCES "public"."classe_produto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projeto" ADD CONSTRAINT "projeto_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projeto" ADD CONSTRAINT "projeto_enologo_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("enologo_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projeto_variedade" ADD CONSTRAINT "projeto_variedade_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projeto_variedade" ADD CONSTRAINT "projeto_variedade_variedade_id_variedade_id_fk" FOREIGN KEY ("variedade_id") REFERENCES "public"."variedade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projeto_variedade" ADD CONSTRAINT "projeto_variedade_projeto_id_empresa_id_projeto_id_empresa_id_fk" FOREIGN KEY ("projeto_id","empresa_id") REFERENCES "public"."projeto"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propriedade" ADD CONSTRAINT "propriedade_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propriedade" ADD CONSTRAINT "propriedade_dono_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("dono_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "romaneio" ADD CONSTRAINT "romaneio_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "romaneio" ADD CONSTRAINT "romaneio_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "romaneio" ADD CONSTRAINT "romaneio_projeto_id_empresa_id_projeto_id_empresa_id_fk" FOREIGN KEY ("projeto_id","empresa_id") REFERENCES "public"."projeto"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "romaneio" ADD CONSTRAINT "romaneio_fornecedor_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("fornecedor_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "romaneio" ADD CONSTRAINT "romaneio_dono_uva_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("dono_uva_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "romaneio" ADD CONSTRAINT "romaneio_transportador_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("transportador_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "romaneio" ADD CONSTRAINT "romaneio_nfe_id_empresa_id_nfe_id_empresa_id_fk" FOREIGN KEY ("nfe_id","empresa_id") REFERENCES "public"."nfe"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "romaneio_item" ADD CONSTRAINT "romaneio_item_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "romaneio_item" ADD CONSTRAINT "romaneio_item_variedade_id_variedade_id_fk" FOREIGN KEY ("variedade_id") REFERENCES "public"."variedade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "romaneio_item" ADD CONSTRAINT "romaneio_item_romaneio_id_empresa_id_romaneio_id_empresa_id_fk" FOREIGN KEY ("romaneio_id","empresa_id") REFERENCES "public"."romaneio"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "romaneio_item" ADD CONSTRAINT "romaneio_item_parcela_id_empresa_id_parcela_id_empresa_id_fk" FOREIGN KEY ("parcela_id","empresa_id") REFERENCES "public"."parcela"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "romaneio_item" ADD CONSTRAINT "romaneio_item_lote_id_empresa_id_lote_id_empresa_id_fk" FOREIGN KEY ("lote_id","empresa_id") REFERENCES "public"."lote"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "romaneio_item" ADD CONSTRAINT "romaneio_item_nfe_item_id_empresa_id_nfe_item_id_empresa_id_fk" FOREIGN KEY ("nfe_item_id","empresa_id") REFERENCES "public"."nfe_item"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocorrencia_regra" ADD CONSTRAINT "ocorrencia_regra_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocorrencia_regra" ADD CONSTRAINT "ocorrencia_regra_regra_id_regra_regulatoria_id_fk" FOREIGN KEY ("regra_id") REFERENCES "public"."regra_regulatoria"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocorrencia_regra" ADD CONSTRAINT "ocorrencia_regra_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "associacao_item" ADD CONSTRAINT "associacao_item_variedade_id_variedade_id_fk" FOREIGN KEY ("variedade_id") REFERENCES "public"."variedade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "associacao_item" ADD CONSTRAINT "associacao_item_pessoa_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("pessoa_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "associacao_item" ADD CONSTRAINT "associacao_item_item_estoque_id_empresa_id_item_estoque_id_empresa_id_fk" FOREIGN KEY ("item_estoque_id","empresa_id") REFERENCES "public"."item_estoque"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfe" ADD CONSTRAINT "nfe_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfe" ADD CONSTRAINT "nfe_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfe" ADD CONSTRAINT "nfe_emitente_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("emitente_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfe_item" ADD CONSTRAINT "nfe_item_variedade_id_variedade_id_fk" FOREIGN KEY ("variedade_id") REFERENCES "public"."variedade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfe_item" ADD CONSTRAINT "nfe_item_nfe_id_empresa_id_nfe_id_empresa_id_fk" FOREIGN KEY ("nfe_id","empresa_id") REFERENCES "public"."nfe"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfe_item" ADD CONSTRAINT "nfe_item_item_estoque_id_empresa_id_item_estoque_id_empresa_id_fk" FOREIGN KEY ("item_estoque_id","empresa_id") REFERENCES "public"."item_estoque"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "composicao_parte_recipiente" ON "composicao_parte" USING btree ("recipiente_id","vigente_desde");--> statement-breakpoint
CREATE INDEX "composicao_parte_lote" ON "composicao_parte" USING btree ("lote_id");--> statement-breakpoint
CREATE INDEX "composicao_parte_item_parte" ON "composicao_parte_item" USING btree ("parte_id");--> statement-breakpoint
CREATE INDEX "genealogia_origem" ON "genealogia" USING btree ("origem_lote_id");--> statement-breakpoint
CREATE INDEX "genealogia_destino" ON "genealogia" USING btree ("destino_lote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lote_codigo" ON "lote" USING btree ("estabelecimento_id","codigo");--> statement-breakpoint
CREATE INDEX "lote_projeto" ON "lote" USING btree ("projeto_id");--> statement-breakpoint
CREATE INDEX "lote_etapa_lote" ON "lote_etapa" USING btree ("lote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "modelo_plano_nome" ON "modelo_plano" USING btree ("empresa_id",lower(nome));--> statement-breakpoint
CREATE INDEX "movimento_uva_item" ON "movimento_uva" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "movimento_volume_recipiente" ON "movimento_volume" USING btree ("recipiente_id","executado_em");--> statement-breakpoint
CREATE INDEX "movimento_volume_lote" ON "movimento_volume" USING btree ("lote_id");--> statement-breakpoint
CREATE INDEX "movimento_volume_operacao" ON "movimento_volume" USING btree ("operacao_id");--> statement-breakpoint
CREATE UNIQUE INDEX "operacao_codigo" ON "operacao" USING btree ("estabelecimento_id","codigo");--> statement-breakpoint
CREATE INDEX "operacao_projeto" ON "operacao" USING btree ("projeto_id");--> statement-breakpoint
CREATE UNIQUE INDEX "parcela_nome" ON "parcela" USING btree ("propriedade_id",lower(nome));--> statement-breakpoint
CREATE UNIQUE INDEX "projeto_codigo" ON "projeto" USING btree ("estabelecimento_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "propriedade_nome" ON "propriedade" USING btree ("empresa_id",coalesce(dono_id, '00000000-0000-0000-0000-000000000000'::uuid),lower(nome));--> statement-breakpoint
CREATE UNIQUE INDEX "romaneio_codigo" ON "romaneio" USING btree ("estabelecimento_id","codigo");--> statement-breakpoint
CREATE INDEX "romaneio_projeto" ON "romaneio" USING btree ("projeto_id");--> statement-breakpoint
CREATE INDEX "ocorrencia_regra_registro" ON "ocorrencia_regra" USING btree ("entidade","registro_id");--> statement-breakpoint
CREATE UNIQUE INDEX "regra_regulatoria_versao" ON "regra_regulatoria" USING btree ("chave","abrangencia",coalesce(abrangencia_codigo, ''),"vigente_desde");--> statement-breakpoint
CREATE UNIQUE INDEX "associacao_item_chave" ON "associacao_item" USING btree ("empresa_id","pessoa_id","codigo_emitente","sentido");--> statement-breakpoint
CREATE INDEX "associacao_item_pessoa" ON "associacao_item" USING btree ("pessoa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nfe_chave" ON "nfe" USING btree ("empresa_id","chave");--> statement-breakpoint
CREATE UNIQUE INDEX "nfe_item_numero" ON "nfe_item" USING btree ("nfe_id","numero_item");