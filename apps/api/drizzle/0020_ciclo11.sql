-- Ciclo 11 (parte comercial, 2027 item 6): planos com preços, adicionais, assinatura completa,
-- mudanças, descontos, faturas, recebimentos, avisos da régua e interesse em módulos.
CREATE SEQUENCE "public"."fatura_numero" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "adicional" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"tipo" text NOT NULL,
	"modulo_id" uuid,
	"quantidade_por_unidade" integer DEFAULT 1 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"inativado_em" timestamp with time zone,
	"inativado_por" uuid,
	"motivo_inativacao" text,
	CONSTRAINT "adicional_tipo" CHECK (tipo in ('usuario', 'estabelecimento', 'armazenamento', 'modulo')),
	CONSTRAINT "adicional_modulo" CHECK ((tipo = 'modulo') = (modulo_id is not null)),
	CONSTRAINT "adicional_quantidade" CHECK (quantidade_por_unidade >= 1)
);
--> statement-breakpoint
CREATE TABLE "adicional_preco" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"adicional_id" uuid NOT NULL,
	"periodicidade" text NOT NULL,
	"valor" numeric(12, 2) NOT NULL,
	"vigente_desde" date NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "adicional_preco_vigencia" UNIQUE("adicional_id","periodicidade","vigente_desde"),
	CONSTRAINT "adicional_preco_periodicidade" CHECK (periodicidade in ('mensal', 'trimestral', 'semestral', 'anual')),
	CONSTRAINT "adicional_preco_valor" CHECK (valor >= 0)
);
--> statement-breakpoint
CREATE TABLE "assinatura_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"assinatura_id" uuid NOT NULL,
	"adicional_id" uuid NOT NULL,
	"quantidade" integer NOT NULL,
	"quantidade_por_unidade" integer NOT NULL,
	"valor_unitario" numeric(12, 2) NOT NULL,
	"inicio" date NOT NULL,
	"fim" date,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "assinatura_item_quantidade" CHECK (quantidade >= 1 and quantidade_por_unidade >= 1),
	CONSTRAINT "assinatura_item_valor" CHECK (valor_unitario >= 0)
);
--> statement-breakpoint
CREATE TABLE "assinatura_mudanca" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"assinatura_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"plano_anterior_id" uuid,
	"plano_id" uuid,
	"periodicidade" text,
	"adicional_id" uuid,
	"assinatura_item_id" uuid,
	"quantidade" integer,
	"efeito_em" date NOT NULL,
	"situacao" text NOT NULL,
	"valor_proporcional" numeric(12, 2),
	"fatura_id" uuid,
	"origem" text NOT NULL,
	"aplicada_em" timestamp with time zone,
	"cancelada_em" timestamp with time zone,
	"cancelada_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "assinatura_mudanca_tipo" CHECK (tipo in ('plano', 'periodicidade', 'adicional_inclusao', 'adicional_retirada')),
	CONSTRAINT "assinatura_mudanca_situacao" CHECK (situacao in ('agendada', 'aplicada', 'cancelada')),
	CONSTRAINT "assinatura_mudanca_origem" CHECK (origem in ('plataforma', 'master'))
);
--> statement-breakpoint
CREATE TABLE "aviso_cobranca" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"referencia_id" uuid NOT NULL,
	"chave" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "aviso_cobranca_unico" UNIQUE("tipo","referencia_id","chave")
);
--> statement-breakpoint
CREATE TABLE "desconto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"valor" numeric(12, 2) NOT NULL,
	"motivo" text NOT NULL,
	"inicio" date NOT NULL,
	"fim" date,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"inativado_em" timestamp with time zone,
	"inativado_por" uuid,
	"motivo_inativacao" text,
	CONSTRAINT "desconto_tipo" CHECK (tipo in ('percentual', 'valor')),
	CONSTRAINT "desconto_valor" CHECK (valor > 0 and (tipo <> 'percentual' or valor <= 100)),
	CONSTRAINT "desconto_validade" CHECK (fim is null or fim >= inicio)
);
--> statement-breakpoint
CREATE TABLE "fatura" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" integer DEFAULT nextval('fatura_numero') NOT NULL,
	"empresa_id" uuid NOT NULL,
	"assinatura_id" uuid,
	"ciclo_inicio" date,
	"ciclo_fim" date,
	"emissao" date NOT NULL,
	"vencimento" date NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"situacao" text NOT NULL,
	"observacao" text,
	"cancelada_em" timestamp with time zone,
	"cancelada_por" uuid,
	"motivo_cancelamento" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "fatura_numero_unique" UNIQUE("numero"),
	CONSTRAINT "fatura_id_empresa" UNIQUE("id","empresa_id"),
	CONSTRAINT "fatura_situacao" CHECK (situacao in ('aberta', 'paga', 'parcial', 'vencida', 'cancelada')),
	CONSTRAINT "fatura_total" CHECK (total >= 0),
	CONSTRAINT "fatura_ciclo" CHECK ((ciclo_inicio is null) = (ciclo_fim is null)),
	CONSTRAINT "fatura_cancelada" CHECK ((situacao = 'cancelada') = (cancelada_em is not null and motivo_cancelamento is not null))
);
--> statement-breakpoint
CREATE TABLE "fatura_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fatura_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"descricao" text NOT NULL,
	"origem" text NOT NULL,
	"quantidade" integer DEFAULT 1 NOT NULL,
	"valor_unitario" numeric(12, 2) NOT NULL,
	"valor" numeric(12, 2) NOT NULL,
	CONSTRAINT "fatura_item_origem" CHECK (origem in ('plano', 'adicional', 'proporcional', 'desconto', 'avulso')),
	CONSTRAINT "fatura_item_sinal" CHECK ((origem = 'desconto') = (valor < 0) or valor = 0)
);
--> statement-breakpoint
CREATE TABLE "interesse_modulo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"modulo_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"observacao" text,
	"atendido_em" timestamp with time zone,
	"atendido_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid
);
--> statement-breakpoint
CREATE TABLE "plano_preco" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plano_id" uuid NOT NULL,
	"periodicidade" text NOT NULL,
	"valor" numeric(12, 2) NOT NULL,
	"vigente_desde" date NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "plano_preco_vigencia" UNIQUE("plano_id","periodicidade","vigente_desde"),
	CONSTRAINT "plano_preco_periodicidade" CHECK (periodicidade in ('mensal', 'trimestral', 'semestral', 'anual')),
	CONSTRAINT "plano_preco_valor" CHECK (valor >= 0)
);
--> statement-breakpoint
CREATE TABLE "recebimento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fatura_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"data" date NOT NULL,
	"valor" numeric(12, 2) NOT NULL,
	"forma" text NOT NULL,
	"referencia" text,
	"origem" text NOT NULL,
	"estornado_em" timestamp with time zone,
	"estornado_por" uuid,
	"motivo_estorno" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "recebimento_valor" CHECK (valor > 0),
	CONSTRAINT "recebimento_forma" CHECK (forma in ('pix', 'boleto', 'cartao_credito', 'cartao_debito', 'transferencia', 'dinheiro')),
	CONSTRAINT "recebimento_origem" CHECK (origem in ('manual', 'provedor')),
	CONSTRAINT "recebimento_estorno" CHECK ((estornado_em is null) = (motivo_estorno is null))
);
--> statement-breakpoint
ALTER TABLE "empresa_situacao" DROP CONSTRAINT "empresa_situacao_origem";--> statement-breakpoint
ALTER TABLE "assinatura" ADD COLUMN "valor_contratado" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "assinatura" ADD COLUMN "ciclo_inicio" date;--> statement-breakpoint
ALTER TABLE "assinatura" ADD COLUMN "ciclo_fim" date;--> statement-breakpoint
ALTER TABLE "assinatura" ADD COLUMN "dia_base" integer;--> statement-breakpoint
ALTER TABLE "assinatura" ADD COLUMN "dia_vencimento" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "assinatura" ADD COLUMN "forma_pagamento" text;--> statement-breakpoint
ALTER TABLE "config_plataforma" ADD COLUMN "somente_leitura_dias" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "config_plataforma" ADD COLUMN "fatura_antecedencia_dias" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "config_plataforma" ADD COLUMN "avisos_vencimento_dias" integer[] DEFAULT '{3,0}' NOT NULL;--> statement-breakpoint
ALTER TABLE "plano" ADD COLUMN "formas_pagamento" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "assinatura" ADD CONSTRAINT "assinatura_id_empresa" UNIQUE("id","empresa_id");--> statement-breakpoint
ALTER TABLE "adicional" ADD CONSTRAINT "adicional_modulo_id_modulo_id_fk" FOREIGN KEY ("modulo_id") REFERENCES "public"."modulo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adicional_preco" ADD CONSTRAINT "adicional_preco_adicional_id_adicional_id_fk" FOREIGN KEY ("adicional_id") REFERENCES "public"."adicional"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinatura_item" ADD CONSTRAINT "assinatura_item_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinatura_item" ADD CONSTRAINT "assinatura_item_adicional_id_adicional_id_fk" FOREIGN KEY ("adicional_id") REFERENCES "public"."adicional"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinatura_item" ADD CONSTRAINT "assinatura_item_assinatura_id_empresa_id_assinatura_id_empresa_id_fk" FOREIGN KEY ("assinatura_id","empresa_id") REFERENCES "public"."assinatura"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinatura_mudanca" ADD CONSTRAINT "assinatura_mudanca_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinatura_mudanca" ADD CONSTRAINT "assinatura_mudanca_plano_anterior_id_plano_id_fk" FOREIGN KEY ("plano_anterior_id") REFERENCES "public"."plano"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinatura_mudanca" ADD CONSTRAINT "assinatura_mudanca_plano_id_plano_id_fk" FOREIGN KEY ("plano_id") REFERENCES "public"."plano"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinatura_mudanca" ADD CONSTRAINT "assinatura_mudanca_adicional_id_adicional_id_fk" FOREIGN KEY ("adicional_id") REFERENCES "public"."adicional"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinatura_mudanca" ADD CONSTRAINT "assinatura_mudanca_assinatura_item_id_assinatura_item_id_fk" FOREIGN KEY ("assinatura_item_id") REFERENCES "public"."assinatura_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinatura_mudanca" ADD CONSTRAINT "assinatura_mudanca_fatura_id_fatura_id_fk" FOREIGN KEY ("fatura_id") REFERENCES "public"."fatura"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinatura_mudanca" ADD CONSTRAINT "assinatura_mudanca_assinatura_id_empresa_id_assinatura_id_empresa_id_fk" FOREIGN KEY ("assinatura_id","empresa_id") REFERENCES "public"."assinatura"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aviso_cobranca" ADD CONSTRAINT "aviso_cobranca_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desconto" ADD CONSTRAINT "desconto_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fatura" ADD CONSTRAINT "fatura_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fatura" ADD CONSTRAINT "fatura_assinatura_id_empresa_id_assinatura_id_empresa_id_fk" FOREIGN KEY ("assinatura_id","empresa_id") REFERENCES "public"."assinatura"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fatura_item" ADD CONSTRAINT "fatura_item_fatura_id_empresa_id_fatura_id_empresa_id_fk" FOREIGN KEY ("fatura_id","empresa_id") REFERENCES "public"."fatura"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interesse_modulo" ADD CONSTRAINT "interesse_modulo_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interesse_modulo" ADD CONSTRAINT "interesse_modulo_modulo_id_modulo_id_fk" FOREIGN KEY ("modulo_id") REFERENCES "public"."modulo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interesse_modulo" ADD CONSTRAINT "interesse_modulo_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plano_preco" ADD CONSTRAINT "plano_preco_plano_id_plano_id_fk" FOREIGN KEY ("plano_id") REFERENCES "public"."plano"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recebimento" ADD CONSTRAINT "recebimento_fatura_id_empresa_id_fatura_id_empresa_id_fk" FOREIGN KEY ("fatura_id","empresa_id") REFERENCES "public"."fatura"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assinatura_item_assinatura" ON "assinatura_item" USING btree ("assinatura_id");--> statement-breakpoint
CREATE INDEX "assinatura_mudanca_assinatura" ON "assinatura_mudanca" USING btree ("assinatura_id","situacao");--> statement-breakpoint
CREATE UNIQUE INDEX "fatura_ciclo_unico" ON "fatura" USING btree ("assinatura_id","ciclo_inicio") WHERE situacao <> 'cancelada' and assinatura_id is not null;--> statement-breakpoint
CREATE INDEX "fatura_empresa" ON "fatura" USING btree ("empresa_id","vencimento");--> statement-breakpoint
CREATE INDEX "fatura_item_fatura" ON "fatura_item" USING btree ("fatura_id");--> statement-breakpoint
CREATE UNIQUE INDEX "interesse_modulo_aberto" ON "interesse_modulo" USING btree ("empresa_id","modulo_id") WHERE atendido_em is null;--> statement-breakpoint
CREATE INDEX "recebimento_fatura" ON "recebimento" USING btree ("fatura_id");--> statement-breakpoint
ALTER TABLE "assinatura" ADD CONSTRAINT "assinatura_dia_vencimento" CHECK (dia_vencimento between 1 and 31);--> statement-breakpoint
ALTER TABLE "assinatura" ADD CONSTRAINT "assinatura_forma" CHECK (forma_pagamento is null or forma_pagamento in ('pix', 'boleto', 'cartao_credito', 'cartao_debito', 'transferencia', 'dinheiro'));--> statement-breakpoint
ALTER TABLE "assinatura" ADD CONSTRAINT "assinatura_ciclo" CHECK ((ciclo_inicio is null) = (ciclo_fim is null) and (ciclo_inicio is null or ciclo_fim >= ciclo_inicio));--> statement-breakpoint
ALTER TABLE "assinatura" ADD CONSTRAINT "assinatura_valor" CHECK (valor_contratado >= 0);--> statement-breakpoint
ALTER TABLE "empresa_situacao" ADD CONSTRAINT "empresa_situacao_origem" CHECK (origem in ('teste', 'inadimplencia', 'manual', 'criacao', 'contratacao', 'pagamento'));--> statement-breakpoint
-- Assinaturas que já existiam: o ciclo atual começa no início da assinatura (fora do teste), o
-- dia-base e o dia de vencimento são o dia do início, e o preço contratado fica zero até a
-- Administração ajustar (os planos ainda não tinham preço).
UPDATE "assinatura" SET
  "dia_base" = extract(day from "inicio")::int,
  "dia_vencimento" = extract(day from "inicio")::int,
  "ciclo_inicio" = CASE WHEN "em_teste" THEN NULL ELSE "inicio" END,
  "ciclo_fim" = CASE WHEN "em_teste" THEN NULL ELSE ("inicio"
    + (CASE "periodicidade" WHEN 'mensal' THEN 1 WHEN 'trimestral' THEN 3 WHEN 'semestral' THEN 6 ELSE 12 END)
    * interval '1 month' - interval '1 day')::date END;
