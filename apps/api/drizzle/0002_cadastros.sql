CREATE TABLE "estabelecimento_ig" (
	"estabelecimento_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"indicacao_geografica_id" uuid NOT NULL,
	"desde" date,
	CONSTRAINT "estabelecimento_ig_estabelecimento_id_indicacao_geografica_id_pk" PRIMARY KEY("estabelecimento_id","indicacao_geografica_id")
);
--> statement-breakpoint
CREATE TABLE "troca_master" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"master_atual_id" uuid,
	"escolhido_usuario_id" uuid,
	"escolhido_email" text NOT NULL,
	"perfil_anterior_id" uuid,
	"iniciado_por" text NOT NULL,
	"motivo" text,
	"token_hash" "bytea" NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"situacao" text DEFAULT 'pendente' NOT NULL,
	"decidido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "troca_master_iniciado_por" CHECK (iniciado_por in ('master', 'suporte')),
	CONSTRAINT "troca_master_situacao" CHECK (situacao in ('pendente', 'aceita', 'recusada', 'cancelada', 'expirada'))
);
--> statement-breakpoint
CREATE TABLE "ciclo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"numero" text NOT NULL,
	"nome" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "ciclo_numero" UNIQUE("estabelecimento_id","numero"),
	CONSTRAINT "ciclo_numero_formato" CHECK (numero ~ '^[0-9]{2}$')
);
--> statement-breakpoint
CREATE TABLE "empresa_parametro_analise" (
	"empresa_id" uuid NOT NULL,
	"parametro_id" uuid NOT NULL,
	"unidade_preferida" text,
	"ativo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "empresa_parametro_analise_empresa_id_parametro_id_pk" PRIMARY KEY("empresa_id","parametro_id")
);
--> statement-breakpoint
CREATE TABLE "empresa_variedade" (
	"empresa_id" uuid NOT NULL,
	"variedade_id" uuid NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "empresa_variedade_empresa_id_variedade_id_pk" PRIMARY KEY("empresa_id","variedade_id")
);
--> statement-breakpoint
CREATE TABLE "faixa_ideal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"parametro_id" uuid NOT NULL,
	"nivel" text DEFAULT 'empresa' NOT NULL,
	"registro_id" uuid,
	"minimo" numeric(14, 4),
	"maximo" numeric(14, 4),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "faixa_ideal_nivel" UNIQUE NULLS NOT DISTINCT("empresa_id","parametro_id","nivel","registro_id"),
	CONSTRAINT "faixa_ideal_nivel_valido" CHECK (nivel in ('empresa', 'modelo_plano', 'projeto', 'lote')),
	CONSTRAINT "faixa_ideal_ordem" CHECK (minimo is null or maximo is null or minimo <= maximo)
);
--> statement-breakpoint
CREATE TABLE "ficha_embalagem" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"formato_id" uuid NOT NULL,
	"item_estoque_id" uuid NOT NULL,
	"quantidade" numeric(12, 4) NOT NULL,
	CONSTRAINT "ficha_embalagem_item" UNIQUE("formato_id","item_estoque_id"),
	CONSTRAINT "ficha_embalagem_quantidade" CHECK (quantidade > 0)
);
--> statement-breakpoint
CREATE TABLE "item_estoque" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"modulo" text NOT NULL,
	"tipo" text NOT NULL,
	"nome" text NOT NULL,
	"codigo_interno" text,
	"unidade_base" text NOT NULL,
	"estoque_minimo" numeric(14, 3),
	"controla_lote" boolean DEFAULT false NOT NULL,
	"controla_validade" boolean DEFAULT false NOT NULL,
	"controla_numeracao" boolean DEFAULT false NOT NULL,
	"e_alcool_etilico" boolean DEFAULT false NOT NULL,
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
	CONSTRAINT "item_estoque_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "item_estoque_tipo" CHECK (tipo in ('insumo', 'embalagem', 'produto_acabado', 'selo', 'outro')),
	CONSTRAINT "item_estoque_minimo" CHECK (estoque_minimo is null or estoque_minimo >= 0)
);
--> statement-breakpoint
CREATE TABLE "item_insumo" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo_insumo_id" uuid NOT NULL,
	"nome_comercial" text,
	"marca" text,
	"fabricante_id" uuid,
	"apresentacao" text
);
--> statement-breakpoint
CREATE TABLE "marca" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"dono_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"inativado_em" timestamp with time zone,
	"inativado_por" uuid,
	"motivo_inativacao" text,
	CONSTRAINT "marca_id_empresa" UNIQUE("id","empresa_id")
);
--> statement-breakpoint
CREATE TABLE "periodicidade_higienizacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo_recipiente_id" uuid NOT NULL,
	"intervalo_dias" integer NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "periodicidade_higienizacao_tipo" UNIQUE("empresa_id","tipo_recipiente_id"),
	CONSTRAINT "periodicidade_higienizacao_dias" CHECK (intervalo_dias > 0)
);
--> statement-breakpoint
CREATE TABLE "produto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"marca_id" uuid NOT NULL,
	"classe_produto_id" uuid NOT NULL,
	"cor" text,
	"teor_acucar" text,
	"metodo_espumante" text,
	"registro_mapa" text,
	"titular_id" uuid,
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
	CONSTRAINT "produto_id_empresa" UNIQUE("id","empresa_id")
);
--> statement-breakpoint
CREATE TABLE "produto_formato" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"volume_ml" integer NOT NULL,
	"item_estoque_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"inativado_em" timestamp with time zone,
	"inativado_por" uuid,
	"motivo_inativacao" text,
	CONSTRAINT "produto_formato_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "produto_formato_volume" UNIQUE("produto_id","volume_ml"),
	CONSTRAINT "produto_formato_volume_positivo" CHECK (volume_ml > 0)
);
--> statement-breakpoint
CREATE TABLE "produto_rotulo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"versao" text NOT NULL,
	"teor_alcoolico" numeric(4, 1) NOT NULL,
	"url_pagina" text,
	"vigente_desde" date NOT NULL,
	"vigente_ate" date,
	"observacoes" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "produto_rotulo_versao" UNIQUE("produto_id","versao"),
	CONSTRAINT "produto_rotulo_teor" CHECK (teor_alcoolico > 0 and teor_alcoolico < 100)
);
--> statement-breakpoint
CREATE TABLE "recipiente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"tipo_recipiente_id" uuid NOT NULL,
	"material" text,
	"capacidade_litros" numeric(12, 2) NOT NULL,
	"possui_frio" boolean DEFAULT false NOT NULL,
	"local_id" uuid NOT NULL,
	"situacao" text DEFAULT 'ativo' NOT NULL,
	"situacao_desde" timestamp with time zone DEFAULT now() NOT NULL,
	"motivo_situacao" text,
	"dimensoes" text,
	"fabricante" text,
	"data_aquisicao" date,
	"tanoaria" text,
	"origem_madeira" text,
	"tosta" text,
	"ano_primeiro_uso" integer,
	"observacoes" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "recipiente_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "recipiente_situacao" CHECK (situacao in ('ativo', 'aguardando_higienizacao', 'manutencao', 'inativo')),
	CONSTRAINT "recipiente_capacidade" CHECK (capacidade_litros > 0),
	CONSTRAINT "recipiente_ano" CHECK (ano_primeiro_uso is null or ano_primeiro_uso between 1900 and 2200)
);
--> statement-breakpoint
CREATE TABLE "rendimento_padrao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid NOT NULL,
	"variedade_id" uuid,
	"estilo" text,
	"litros_por_kg" numeric(6, 4) NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "rendimento_padrao_chave" UNIQUE NULLS NOT DISTINCT("estabelecimento_id","variedade_id","estilo"),
	CONSTRAINT "rendimento_padrao_faixa" CHECK (litros_por_kg > 0 and litros_por_kg < 1)
);
--> statement-breakpoint
CREATE TABLE "classe_produto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"categoria" text NOT NULL,
	"exige_metodo_espumante" boolean DEFAULT false NOT NULL,
	"ordem" integer NOT NULL,
	"fonte" text NOT NULL,
	"vigente_desde" date NOT NULL,
	"vigente_ate" date,
	CONSTRAINT "classe_produto_versao" UNIQUE("codigo","vigente_desde"),
	CONSTRAINT "classe_produto_categoria" CHECK (categoria in ('vinho', 'espumante', 'derivado'))
);
--> statement-breakpoint
CREATE TABLE "indicacao_geografica" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"tipo" text NOT NULL,
	"municipios_ibge" text[] DEFAULT '{}' NOT NULL,
	"entidade_gestora" text,
	"fonte" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "indicacao_geografica_codigo_unique" UNIQUE("codigo"),
	CONSTRAINT "indicacao_geografica_tipo" CHECK (tipo in ('IP', 'DO'))
);
--> statement-breakpoint
CREATE TABLE "opcao_lista" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid,
	"lista" text NOT NULL,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"ordem" integer DEFAULT 100 NOT NULL,
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
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
CREATE TABLE "papel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"ordem" integer NOT NULL,
	CONSTRAINT "papel_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "parametro_analise" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid,
	"codigo" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"inativado_em" timestamp with time zone,
	"inativado_por" uuid,
	"motivo_inativacao" text,
	"nome" text NOT NULL,
	"unidade_padrao" text NOT NULL,
	"unidades_aceitas" text[] DEFAULT '{}' NOT NULL,
	"casas" integer NOT NULL,
	"minimo" numeric(14, 4),
	"maximo" numeric(14, 4),
	"ordem" integer DEFAULT 100 NOT NULL,
	CONSTRAINT "parametro_analise_codigo_so_global" CHECK (empresa_id is null or codigo is null)
);
--> statement-breakpoint
CREATE TABLE "tipo_documento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid,
	"codigo" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"inativado_em" timestamp with time zone,
	"inativado_por" uuid,
	"motivo_inativacao" text,
	"nome" text NOT NULL,
	"tem_vencimento" boolean DEFAULT true NOT NULL,
	"avisos_dias" integer[] DEFAULT '{60,30,7}' NOT NULL,
	CONSTRAINT "tipo_documento_codigo_so_global" CHECK (empresa_id is null or codigo is null)
);
--> statement-breakpoint
CREATE TABLE "tipo_insumo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid,
	"codigo" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"inativado_em" timestamp with time zone,
	"inativado_por" uuid,
	"motivo_inativacao" text,
	"nome" text NOT NULL,
	"unidades" text[] DEFAULT '{}' NOT NULL,
	"apresentacoes" text[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "tipo_insumo_codigo_so_global" CHECK (empresa_id is null or codigo is null)
);
--> statement-breakpoint
CREATE TABLE "tipo_recipiente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid,
	"codigo" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"inativado_em" timestamp with time zone,
	"inativado_por" uuid,
	"motivo_inativacao" text,
	"nome" text NOT NULL,
	"pressurizado" boolean DEFAULT false NOT NULL,
	"e_barrica" boolean DEFAULT false NOT NULL,
	CONSTRAINT "tipo_recipiente_codigo_so_global" CHECK (empresa_id is null or codigo is null)
);
--> statement-breakpoint
CREATE TABLE "unidade" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"simbolo" text NOT NULL,
	"nome" text NOT NULL,
	"grandeza" text NOT NULL,
	"casas" integer NOT NULL,
	"ordem" integer NOT NULL,
	CONSTRAINT "unidade_simbolo_unique" UNIQUE("simbolo")
);
--> statement-breakpoint
CREATE TABLE "variedade" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid,
	"codigo" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"inativado_em" timestamp with time zone,
	"inativado_por" uuid,
	"motivo_inativacao" text,
	"codigo_oficial" text,
	"nome" text NOT NULL,
	"tipo" text NOT NULL,
	"cor" text NOT NULL,
	"sinonimos" text[] DEFAULT '{}' NOT NULL,
	"fonte" text,
	"avisada_plataforma_em" timestamp with time zone,
	"equivale_a" uuid,
	CONSTRAINT "variedade_codigo_so_global" CHECK (empresa_id is null or codigo is null),
	CONSTRAINT "variedade_tipo" CHECK (tipo in ('vinifera', 'americana_hibrida')),
	CONSTRAINT "variedade_cor" CHECK (cor in ('tinta', 'branca', 'rosada')),
	CONSTRAINT "variedade_propria_sem_codigo" CHECK (empresa_id is null or codigo_oficial is null)
);
--> statement-breakpoint
CREATE TABLE "documento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid,
	"tipo_documento_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"modulo" text,
	"orgao_emissor" text,
	"responsavel_id" uuid,
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
	CONSTRAINT "documento_id_empresa" UNIQUE("id","empresa_id")
);
--> statement-breakpoint
CREATE TABLE "documento_etiqueta" (
	"documento_id" uuid NOT NULL,
	"etiqueta_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	CONSTRAINT "documento_etiqueta_documento_id_etiqueta_id_pk" PRIMARY KEY("documento_id","etiqueta_id")
);
--> statement-breakpoint
CREATE TABLE "documento_versao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"documento_id" uuid NOT NULL,
	"numero" text,
	"emissao" date,
	"vencimento" date,
	"situacao" text DEFAULT 'vigente' NOT NULL,
	"assinado_por" text,
	"assinado_em" date,
	"observacoes" text,
	"anterior_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "documento_versao_situacao" CHECK (situacao in ('vigente', 'substituida')),
	CONSTRAINT "documento_versao_datas" CHECK (vencimento is null or emissao is null or vencimento >= emissao)
);
--> statement-breakpoint
CREATE TABLE "etiqueta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"cor" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "etiqueta_id_empresa" UNIQUE("id","empresa_id")
);
--> statement-breakpoint
CREATE TABLE "parametro" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"estabelecimento_id" uuid,
	"chave" text NOT NULL,
	"valor" jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "parametro_chave" UNIQUE NULLS NOT DISTINCT("empresa_id","estabelecimento_id","chave")
);
--> statement-breakpoint
CREATE TABLE "pessoa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"ficha_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"inativado_em" timestamp with time zone,
	"inativado_por" uuid,
	"motivo_inativacao" text,
	CONSTRAINT "pessoa_id_empresa" UNIQUE("id","empresa_id")
);
--> statement-breakpoint
CREATE TABLE "pessoa_cliente" (
	"pessoa_id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"condicoes_comerciais" text
);
--> statement-breakpoint
CREATE TABLE "pessoa_contato" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"cargo" text,
	"emails" text[] DEFAULT '{}' NOT NULL,
	"telefones" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pessoa_fabricante_marca" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"marca" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pessoa_fornecedor" (
	"pessoa_id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"categorias" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pessoa_funcionario" (
	"pessoa_id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"cargo" text,
	"situacao" text DEFAULT 'ativo' NOT NULL,
	CONSTRAINT "pessoa_funcionario_situacao" CHECK (situacao in ('ativo', 'afastado', 'desligado'))
);
--> statement-breakpoint
CREATE TABLE "pessoa_laboratorio" (
	"pessoa_id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"credenciamento_mapa" text,
	"credenciamento_validade" date,
	"prazo_medio_laudo_dias" integer
);
--> statement-breakpoint
CREATE TABLE "pessoa_papel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"papel" text NOT NULL,
	"desde" date DEFAULT current_date NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "pessoa_papel_unico" UNIQUE("pessoa_id","papel")
);
--> statement-breakpoint
CREATE TABLE "pessoa_produtor_uva" (
	"pessoa_id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"numero_sivibe" text,
	"situacao_cadastro" text DEFAULT 'nao_verificado' NOT NULL,
	"declaracao_ano_anterior" boolean,
	"conferido_em" date,
	CONSTRAINT "pessoa_produtor_uva_situacao" CHECK (situacao_cadastro in ('regular', 'irregular', 'nao_verificado'))
);
--> statement-breakpoint
CREATE TABLE "pessoa_rt" (
	"pessoa_id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"conselho" text,
	"numero_registro" text,
	"art_numero" text,
	"art_validade" date
);
--> statement-breakpoint
CREATE TABLE "pessoa_transportador_placa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"placa" text NOT NULL,
	CONSTRAINT "pessoa_transportador_placa_unica" UNIQUE("pessoa_id","placa")
);
--> statement-breakpoint
ALTER TABLE "estabelecimento" ADD COLUMN "responsavel_tecnico_id" uuid;--> statement-breakpoint
ALTER TABLE "estabelecimento" ADD COLUMN "produtos_elaborados" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "estabelecimento_ig" ADD CONSTRAINT "estabelecimento_ig_indicacao_geografica_id_indicacao_geografica_id_fk" FOREIGN KEY ("indicacao_geografica_id") REFERENCES "public"."indicacao_geografica"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estabelecimento_ig" ADD CONSTRAINT "estabelecimento_ig_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "troca_master" ADD CONSTRAINT "troca_master_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "troca_master" ADD CONSTRAINT "troca_master_master_atual_id_usuario_id_fk" FOREIGN KEY ("master_atual_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "troca_master" ADD CONSTRAINT "troca_master_escolhido_usuario_id_usuario_id_fk" FOREIGN KEY ("escolhido_usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "troca_master" ADD CONSTRAINT "troca_master_perfil_anterior_id_empresa_id_perfil_id_empresa_id_fk" FOREIGN KEY ("perfil_anterior_id","empresa_id") REFERENCES "public"."perfil"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ciclo" ADD CONSTRAINT "ciclo_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_parametro_analise" ADD CONSTRAINT "empresa_parametro_analise_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_parametro_analise" ADD CONSTRAINT "empresa_parametro_analise_parametro_id_parametro_analise_id_fk" FOREIGN KEY ("parametro_id") REFERENCES "public"."parametro_analise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_parametro_analise" ADD CONSTRAINT "empresa_parametro_analise_unidade_preferida_unidade_simbolo_fk" FOREIGN KEY ("unidade_preferida") REFERENCES "public"."unidade"("simbolo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_variedade" ADD CONSTRAINT "empresa_variedade_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_variedade" ADD CONSTRAINT "empresa_variedade_variedade_id_variedade_id_fk" FOREIGN KEY ("variedade_id") REFERENCES "public"."variedade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faixa_ideal" ADD CONSTRAINT "faixa_ideal_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faixa_ideal" ADD CONSTRAINT "faixa_ideal_parametro_id_parametro_analise_id_fk" FOREIGN KEY ("parametro_id") REFERENCES "public"."parametro_analise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ficha_embalagem" ADD CONSTRAINT "ficha_embalagem_formato_id_empresa_id_produto_formato_id_empresa_id_fk" FOREIGN KEY ("formato_id","empresa_id") REFERENCES "public"."produto_formato"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ficha_embalagem" ADD CONSTRAINT "ficha_embalagem_item_estoque_id_empresa_id_item_estoque_id_empresa_id_fk" FOREIGN KEY ("item_estoque_id","empresa_id") REFERENCES "public"."item_estoque"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_estoque" ADD CONSTRAINT "item_estoque_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_estoque" ADD CONSTRAINT "item_estoque_unidade_base_unidade_simbolo_fk" FOREIGN KEY ("unidade_base") REFERENCES "public"."unidade"("simbolo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_insumo" ADD CONSTRAINT "item_insumo_tipo_insumo_id_tipo_insumo_id_fk" FOREIGN KEY ("tipo_insumo_id") REFERENCES "public"."tipo_insumo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_insumo" ADD CONSTRAINT "item_insumo_item_id_empresa_id_item_estoque_id_empresa_id_fk" FOREIGN KEY ("item_id","empresa_id") REFERENCES "public"."item_estoque"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_insumo" ADD CONSTRAINT "item_insumo_fabricante_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("fabricante_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marca" ADD CONSTRAINT "marca_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marca" ADD CONSTRAINT "marca_dono_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("dono_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periodicidade_higienizacao" ADD CONSTRAINT "periodicidade_higienizacao_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periodicidade_higienizacao" ADD CONSTRAINT "periodicidade_higienizacao_tipo_recipiente_id_tipo_recipiente_id_fk" FOREIGN KEY ("tipo_recipiente_id") REFERENCES "public"."tipo_recipiente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produto" ADD CONSTRAINT "produto_classe_produto_id_classe_produto_id_fk" FOREIGN KEY ("classe_produto_id") REFERENCES "public"."classe_produto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produto" ADD CONSTRAINT "produto_marca_id_empresa_id_marca_id_empresa_id_fk" FOREIGN KEY ("marca_id","empresa_id") REFERENCES "public"."marca"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produto" ADD CONSTRAINT "produto_titular_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("titular_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produto_formato" ADD CONSTRAINT "produto_formato_produto_id_empresa_id_produto_id_empresa_id_fk" FOREIGN KEY ("produto_id","empresa_id") REFERENCES "public"."produto"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produto_formato" ADD CONSTRAINT "produto_formato_item_estoque_id_empresa_id_item_estoque_id_empresa_id_fk" FOREIGN KEY ("item_estoque_id","empresa_id") REFERENCES "public"."item_estoque"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produto_rotulo" ADD CONSTRAINT "produto_rotulo_produto_id_empresa_id_produto_id_empresa_id_fk" FOREIGN KEY ("produto_id","empresa_id") REFERENCES "public"."produto"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipiente" ADD CONSTRAINT "recipiente_tipo_recipiente_id_tipo_recipiente_id_fk" FOREIGN KEY ("tipo_recipiente_id") REFERENCES "public"."tipo_recipiente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipiente" ADD CONSTRAINT "recipiente_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipiente" ADD CONSTRAINT "recipiente_local_id_empresa_id_local_id_empresa_id_fk" FOREIGN KEY ("local_id","empresa_id") REFERENCES "public"."local"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rendimento_padrao" ADD CONSTRAINT "rendimento_padrao_variedade_id_variedade_id_fk" FOREIGN KEY ("variedade_id") REFERENCES "public"."variedade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rendimento_padrao" ADD CONSTRAINT "rendimento_padrao_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opcao_lista" ADD CONSTRAINT "opcao_lista_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parametro_analise" ADD CONSTRAINT "parametro_analise_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parametro_analise" ADD CONSTRAINT "parametro_analise_unidade_padrao_unidade_simbolo_fk" FOREIGN KEY ("unidade_padrao") REFERENCES "public"."unidade"("simbolo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipo_documento" ADD CONSTRAINT "tipo_documento_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipo_insumo" ADD CONSTRAINT "tipo_insumo_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipo_recipiente" ADD CONSTRAINT "tipo_recipiente_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variedade" ADD CONSTRAINT "variedade_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento" ADD CONSTRAINT "documento_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento" ADD CONSTRAINT "documento_tipo_documento_id_tipo_documento_id_fk" FOREIGN KEY ("tipo_documento_id") REFERENCES "public"."tipo_documento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento" ADD CONSTRAINT "documento_responsavel_id_usuario_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento" ADD CONSTRAINT "documento_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_etiqueta" ADD CONSTRAINT "documento_etiqueta_documento_id_empresa_id_documento_id_empresa_id_fk" FOREIGN KEY ("documento_id","empresa_id") REFERENCES "public"."documento"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_etiqueta" ADD CONSTRAINT "documento_etiqueta_etiqueta_id_empresa_id_etiqueta_id_empresa_id_fk" FOREIGN KEY ("etiqueta_id","empresa_id") REFERENCES "public"."etiqueta"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_versao" ADD CONSTRAINT "documento_versao_documento_id_empresa_id_documento_id_empresa_id_fk" FOREIGN KEY ("documento_id","empresa_id") REFERENCES "public"."documento"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etiqueta" ADD CONSTRAINT "etiqueta_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parametro" ADD CONSTRAINT "parametro_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parametro" ADD CONSTRAINT "parametro_estabelecimento_id_empresa_id_estabelecimento_id_empresa_id_fk" FOREIGN KEY ("estabelecimento_id","empresa_id") REFERENCES "public"."estabelecimento"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pessoa" ADD CONSTRAINT "pessoa_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pessoa" ADD CONSTRAINT "pessoa_ficha_id_ficha_id_fk" FOREIGN KEY ("ficha_id") REFERENCES "public"."ficha"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pessoa_cliente" ADD CONSTRAINT "pessoa_cliente_pessoa_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("pessoa_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pessoa_contato" ADD CONSTRAINT "pessoa_contato_pessoa_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("pessoa_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pessoa_fabricante_marca" ADD CONSTRAINT "pessoa_fabricante_marca_pessoa_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("pessoa_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pessoa_fornecedor" ADD CONSTRAINT "pessoa_fornecedor_pessoa_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("pessoa_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pessoa_funcionario" ADD CONSTRAINT "pessoa_funcionario_pessoa_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("pessoa_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pessoa_laboratorio" ADD CONSTRAINT "pessoa_laboratorio_pessoa_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("pessoa_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pessoa_papel" ADD CONSTRAINT "pessoa_papel_papel_papel_codigo_fk" FOREIGN KEY ("papel") REFERENCES "public"."papel"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pessoa_papel" ADD CONSTRAINT "pessoa_papel_pessoa_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("pessoa_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pessoa_produtor_uva" ADD CONSTRAINT "pessoa_produtor_uva_pessoa_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("pessoa_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pessoa_rt" ADD CONSTRAINT "pessoa_rt_pessoa_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("pessoa_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pessoa_transportador_placa" ADD CONSTRAINT "pessoa_transportador_placa_pessoa_id_empresa_id_pessoa_id_empresa_id_fk" FOREIGN KEY ("pessoa_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "troca_master_token" ON "troca_master" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "troca_master_pendente" ON "troca_master" USING btree ("empresa_id") WHERE situacao = 'pendente';--> statement-breakpoint
CREATE UNIQUE INDEX "item_estoque_nome" ON "item_estoque" USING btree ("empresa_id","modulo","tipo",lower(nome));--> statement-breakpoint
CREATE UNIQUE INDEX "marca_nome" ON "marca" USING btree ("empresa_id",coalesce(dono_id, '00000000-0000-0000-0000-000000000000'::uuid),lower(nome));--> statement-breakpoint
CREATE INDEX "periodicidade_higienizacao_empresa" ON "periodicidade_higienizacao" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "produto_nome" ON "produto" USING btree ("empresa_id","marca_id",lower(nome));--> statement-breakpoint
CREATE UNIQUE INDEX "produto_formato_item" ON "produto_formato" USING btree ("item_estoque_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipiente_codigo" ON "recipiente" USING btree ("estabelecimento_id",lower(codigo));--> statement-breakpoint
CREATE UNIQUE INDEX "opcao_lista_codigo" ON "opcao_lista" USING btree (coalesce(empresa_id, '00000000-0000-0000-0000-000000000000'::uuid),"lista","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "opcao_lista_nome" ON "opcao_lista" USING btree (coalesce(empresa_id, '00000000-0000-0000-0000-000000000000'::uuid),"lista",lower(nome));--> statement-breakpoint
CREATE UNIQUE INDEX "parametro_analise_codigo_global" ON "parametro_analise" USING btree ("codigo") WHERE empresa_id is null;--> statement-breakpoint
CREATE UNIQUE INDEX "parametro_analise_nome" ON "parametro_analise" USING btree (coalesce(empresa_id, '00000000-0000-0000-0000-000000000000'::uuid),lower(nome));--> statement-breakpoint
CREATE UNIQUE INDEX "tipo_documento_codigo_global" ON "tipo_documento" USING btree ("codigo") WHERE empresa_id is null;--> statement-breakpoint
CREATE UNIQUE INDEX "tipo_documento_nome" ON "tipo_documento" USING btree (coalesce(empresa_id, '00000000-0000-0000-0000-000000000000'::uuid),lower(nome));--> statement-breakpoint
CREATE UNIQUE INDEX "tipo_insumo_codigo_global" ON "tipo_insumo" USING btree ("codigo") WHERE empresa_id is null;--> statement-breakpoint
CREATE UNIQUE INDEX "tipo_insumo_nome" ON "tipo_insumo" USING btree (coalesce(empresa_id, '00000000-0000-0000-0000-000000000000'::uuid),lower(nome));--> statement-breakpoint
CREATE UNIQUE INDEX "tipo_recipiente_codigo_global" ON "tipo_recipiente" USING btree ("codigo") WHERE empresa_id is null;--> statement-breakpoint
CREATE UNIQUE INDEX "tipo_recipiente_nome" ON "tipo_recipiente" USING btree (coalesce(empresa_id, '00000000-0000-0000-0000-000000000000'::uuid),lower(nome));--> statement-breakpoint
CREATE UNIQUE INDEX "variedade_codigo_global" ON "variedade" USING btree ("codigo") WHERE empresa_id is null;--> statement-breakpoint
CREATE UNIQUE INDEX "variedade_nome" ON "variedade" USING btree (coalesce(empresa_id, '00000000-0000-0000-0000-000000000000'::uuid),lower(nome));--> statement-breakpoint
CREATE UNIQUE INDEX "variedade_codigo_oficial" ON "variedade" USING btree ("codigo_oficial") WHERE empresa_id is null and codigo_oficial is not null;--> statement-breakpoint
CREATE INDEX "documento_empresa" ON "documento" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documento_versao_vigente" ON "documento_versao" USING btree ("documento_id") WHERE situacao = 'vigente';--> statement-breakpoint
CREATE UNIQUE INDEX "etiqueta_nome" ON "etiqueta" USING btree ("empresa_id",lower(nome));--> statement-breakpoint
CREATE UNIQUE INDEX "pessoa_ficha" ON "pessoa" USING btree ("ficha_id");--> statement-breakpoint
CREATE INDEX "pessoa_empresa" ON "pessoa" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "pessoa_contato_pessoa" ON "pessoa_contato" USING btree ("pessoa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pessoa_fabricante_marca_unica" ON "pessoa_fabricante_marca" USING btree ("pessoa_id",lower(marca));--> statement-breakpoint
CREATE INDEX "pessoa_papel_empresa" ON "pessoa_papel" USING btree ("empresa_id","papel");--> statement-breakpoint
ALTER TABLE "estabelecimento" ADD CONSTRAINT "estabelecimento_rt_fk" FOREIGN KEY ("responsavel_tecnico_id","empresa_id") REFERENCES "public"."pessoa"("id","empresa_id") ON DELETE no action ON UPDATE no action;