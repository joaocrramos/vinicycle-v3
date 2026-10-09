ALTER TABLE "assinatura_mudanca" DROP CONSTRAINT "assinatura_mudanca_tipo";--> statement-breakpoint
ALTER TABLE "assinatura_mudanca" ADD COLUMN "valor_novo" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "assinatura_mudanca" ADD COLUMN "motivo" text;--> statement-breakpoint
ALTER TABLE "assinatura_mudanca" ADD CONSTRAINT "assinatura_mudanca_tipo" CHECK (tipo in ('plano', 'periodicidade', 'adicional_inclusao', 'adicional_retirada', 'reajuste'));