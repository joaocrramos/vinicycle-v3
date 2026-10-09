-- Ciclo 12 (parte comercial, 2027 item 6): integrações de pagamento e mensagens, cobrança e nota
-- no provedor, pacotes de mensagens, modelos editáveis, chamados e personificação.
CREATE SEQUENCE "public"."chamado_numero" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "chamado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" integer DEFAULT nextval('chamado_numero') NOT NULL,
	"empresa_id" uuid,
	"solicitante_id" uuid,
	"solicitante_nome" text NOT NULL,
	"solicitante_email" text NOT NULL,
	"documento_informado" text,
	"origem" text NOT NULL,
	"assunto" text NOT NULL,
	"categoria" text NOT NULL,
	"prioridade" text NOT NULL,
	"situacao" text NOT NULL,
	"prazo_em" timestamp with time zone NOT NULL,
	"primeira_resposta_em" timestamp with time zone,
	"encerrado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "chamado_numero_unique" UNIQUE("numero"),
	CONSTRAINT "chamado_origem" CHECK (origem in ('sistema', 'publico')),
	CONSTRAINT "chamado_prioridade" CHECK (prioridade in ('baixa', 'normal', 'alta', 'urgente')),
	CONSTRAINT "chamado_situacao" CHECK (situacao in ('aberto', 'em_atendimento', 'aguardando_cliente', 'resolvido', 'fechado'))
);
--> statement-breakpoint
CREATE TABLE "chamado_historico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chamado_id" uuid NOT NULL,
	"empresa_id" uuid,
	"de" text,
	"para" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid
);
--> statement-breakpoint
CREATE TABLE "chamado_mensagem" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chamado_id" uuid NOT NULL,
	"empresa_id" uuid,
	"autor_id" uuid,
	"autor_tipo" text NOT NULL,
	"texto" text NOT NULL,
	"interna" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "chamado_mensagem_autor" CHECK (autor_tipo in ('cliente', 'equipe')),
	CONSTRAINT "chamado_mensagem_interna" CHECK (not interna or autor_tipo = 'equipe')
);
--> statement-breakpoint
CREATE TABLE "chamado_prazo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plano_id" uuid,
	"empresa_id" uuid,
	"prioridade" text NOT NULL,
	"horas" integer NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "chamado_prazo_alvo" CHECK ((plano_id is null) <> (empresa_id is null)),
	CONSTRAINT "chamado_prazo_prioridade" CHECK (prioridade in ('baixa', 'normal', 'alta', 'urgente')),
	CONSTRAINT "chamado_prazo_horas" CHECK (horas between 1 and 2000)
);
--> statement-breakpoint
CREATE TABLE "cliente_provedor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"integracao_id" uuid NOT NULL,
	"identificador_externo" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "cliente_provedor_unico" UNIQUE("empresa_id","integracao_id")
);
--> statement-breakpoint
CREATE TABLE "cobranca_externa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fatura_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"integracao_id" uuid NOT NULL,
	"forma" text,
	"identificador_externo" text,
	"link" text,
	"pix_copia_cola" text,
	"situacao" text NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"ultimo_erro" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "cobranca_externa_situacao" CHECK (situacao in ('pendente', 'ativa', 'paga', 'cancelar', 'cancelada', 'erro'))
);
--> statement-breakpoint
CREATE TABLE "evento_integracao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integracao_id" uuid NOT NULL,
	"identificador_externo" text NOT NULL,
	"tipo_original" text NOT NULL,
	"tipo_padrao" text NOT NULL,
	"conteudo" jsonb NOT NULL,
	"assinatura_verificada" boolean NOT NULL,
	"recebido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"processado_em" timestamp with time zone,
	"resultado" text,
	CONSTRAINT "evento_integracao_unico" UNIQUE("integracao_id","identificador_externo"),
	CONSTRAINT "evento_integracao_tipo" CHECK (tipo_padrao in ('pago', 'vencido', 'estornado', 'recusado', 'cancelado', 'nota_emitida', 'nota_erro', 'outro'))
);
--> statement-breakpoint
CREATE TABLE "integracao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" text NOT NULL,
	"adaptador" text NOT NULL,
	"nome" text NOT NULL,
	"ambiente" text NOT NULL,
	"formas" text[] DEFAULT '{}' NOT NULL,
	"configuracao" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"credenciais_cifradas" text,
	"token_aviso_cifrado" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"inativado_em" timestamp with time zone,
	"inativado_por" uuid,
	"motivo_inativacao" text,
	CONSTRAINT "integracao_tipo" CHECK (tipo in ('pagamento', 'whatsapp', 'sms')),
	CONSTRAINT "integracao_ambiente" CHECK (ambiente in ('teste', 'producao'))
);
--> statement-breakpoint
CREATE TABLE "modelo_mensagem_versao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"versao" integer NOT NULL,
	"assunto" text NOT NULL,
	"corpo" text NOT NULL,
	"ativa" boolean NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "modelo_mensagem_versao_unica" UNIQUE("codigo","versao")
);
--> statement-breakpoint
CREATE TABLE "nota_servico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fatura_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"integracao_id" uuid NOT NULL,
	"identificador_externo" text,
	"numero" text,
	"situacao" text NOT NULL,
	"link_pdf" text,
	"link_xml" text,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"ultimo_erro" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "nota_servico_situacao" CHECK (situacao in ('pendente', 'agendada', 'emitida', 'erro', 'cancelada'))
);
--> statement-breakpoint
CREATE TABLE "personificacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"membro_id" uuid NOT NULL,
	"membro_nome" text NOT NULL,
	"usuario_id" uuid NOT NULL,
	"usuario_nome" text NOT NULL,
	"empresa_id" uuid NOT NULL,
	"motivo" text NOT NULL,
	"chamado_id" uuid,
	"inicio" timestamp with time zone DEFAULT now() NOT NULL,
	"fim_previsto" timestamp with time zone NOT NULL,
	"fim" timestamp with time zone,
	"forma_encerramento" text,
	CONSTRAINT "personificacao_forma" CHECK (forma_encerramento is null or forma_encerramento in ('manual', 'tempo', 'saida'))
);
--> statement-breakpoint
ALTER TABLE "adicional" DROP CONSTRAINT "adicional_tipo";--> statement-breakpoint
ALTER TABLE "sessao" ADD COLUMN "personificacao_id" uuid;--> statement-breakpoint
ALTER TABLE "config_plataforma" ADD COLUMN "chamado_categorias" text[] DEFAULT '{Dúvida,Erro no sistema,Sugestão,Financeiro,Acesso,Outro}' NOT NULL;--> statement-breakpoint
ALTER TABLE "relatorio_agendado" ADD COLUMN "canal" text DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE "chamado" ADD CONSTRAINT "chamado_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado" ADD CONSTRAINT "chamado_solicitante_id_usuario_id_fk" FOREIGN KEY ("solicitante_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_historico" ADD CONSTRAINT "chamado_historico_chamado_id_chamado_id_fk" FOREIGN KEY ("chamado_id") REFERENCES "public"."chamado"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_mensagem" ADD CONSTRAINT "chamado_mensagem_chamado_id_chamado_id_fk" FOREIGN KEY ("chamado_id") REFERENCES "public"."chamado"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_mensagem" ADD CONSTRAINT "chamado_mensagem_autor_id_usuario_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_prazo" ADD CONSTRAINT "chamado_prazo_plano_id_plano_id_fk" FOREIGN KEY ("plano_id") REFERENCES "public"."plano"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamado_prazo" ADD CONSTRAINT "chamado_prazo_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_provedor" ADD CONSTRAINT "cliente_provedor_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_provedor" ADD CONSTRAINT "cliente_provedor_integracao_id_integracao_id_fk" FOREIGN KEY ("integracao_id") REFERENCES "public"."integracao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobranca_externa" ADD CONSTRAINT "cobranca_externa_integracao_id_integracao_id_fk" FOREIGN KEY ("integracao_id") REFERENCES "public"."integracao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobranca_externa" ADD CONSTRAINT "cobranca_externa_fatura_id_empresa_id_fatura_id_empresa_id_fk" FOREIGN KEY ("fatura_id","empresa_id") REFERENCES "public"."fatura"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_integracao" ADD CONSTRAINT "evento_integracao_integracao_id_integracao_id_fk" FOREIGN KEY ("integracao_id") REFERENCES "public"."integracao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota_servico" ADD CONSTRAINT "nota_servico_integracao_id_integracao_id_fk" FOREIGN KEY ("integracao_id") REFERENCES "public"."integracao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota_servico" ADD CONSTRAINT "nota_servico_fatura_id_empresa_id_fatura_id_empresa_id_fk" FOREIGN KEY ("fatura_id","empresa_id") REFERENCES "public"."fatura"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personificacao" ADD CONSTRAINT "personificacao_membro_id_usuario_id_fk" FOREIGN KEY ("membro_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personificacao" ADD CONSTRAINT "personificacao_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personificacao" ADD CONSTRAINT "personificacao_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personificacao" ADD CONSTRAINT "personificacao_chamado_id_chamado_id_fk" FOREIGN KEY ("chamado_id") REFERENCES "public"."chamado"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chamado_empresa" ON "chamado" USING btree ("empresa_id","situacao");--> statement-breakpoint
CREATE INDEX "chamado_mensagem_chamado" ON "chamado_mensagem" USING btree ("chamado_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chamado_prazo_plano" ON "chamado_prazo" USING btree ("plano_id","prioridade") WHERE plano_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "chamado_prazo_empresa" ON "chamado_prazo" USING btree ("empresa_id","prioridade") WHERE empresa_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "cobranca_externa_fatura" ON "cobranca_externa" USING btree ("fatura_id") WHERE situacao not in ('cancelada', 'erro');--> statement-breakpoint
CREATE UNIQUE INDEX "cobranca_externa_identificador" ON "cobranca_externa" USING btree ("integracao_id","identificador_externo") WHERE identificador_externo is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "modelo_mensagem_ativa" ON "modelo_mensagem_versao" USING btree ("codigo") WHERE ativa;--> statement-breakpoint
CREATE UNIQUE INDEX "nota_servico_fatura" ON "nota_servico" USING btree ("fatura_id") WHERE situacao <> 'cancelada';--> statement-breakpoint
CREATE INDEX "personificacao_empresa" ON "personificacao" USING btree ("empresa_id","inicio");--> statement-breakpoint
ALTER TABLE "adicional" ADD CONSTRAINT "adicional_tipo" CHECK (tipo in ('usuario', 'estabelecimento', 'armazenamento', 'modulo', 'mensagens_whatsapp', 'mensagens_sms'));--> statement-breakpoint
ALTER TABLE "relatorio_agendado" ADD CONSTRAINT "relatorio_agendado_canal" CHECK (canal in ('email', 'whatsapp', 'sms'));