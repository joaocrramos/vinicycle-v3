// Montagem do servidor. Usado pelo `main.ts` e pelos testes (com `inject`).
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { TAMANHO_MAXIMO_ANEXO } from '@vinicycle/shared';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ZodError } from 'zod';
import type { Config } from './config';
import type { Db } from './db/cliente';
import type { Armazenamento } from './nucleo/armazenamento';
import { type ConsultasPublicas, consultasPublicas } from './nucleo/consultas-publicas';
import { ErroAplicacao } from './nucleo/erros';
import { autenticar, nomeCookie } from './nucleo/sessoes';
import { rotasAnexos } from './modulos/anexos';
import { rotasAuditoria } from './modulos/auditoria';
import { rotasAutenticacao } from './modulos/autenticacao';
import { rotasCatalogos } from './modulos/catalogos';
import { rotasConvites } from './modulos/convites';
import { rotasDocumentos } from './modulos/documentos';
import { rotasEmpresa } from './modulos/empresa';
import { rotasItensEstoque } from './modulos/itens-estoque';
import { rotasBastao } from './modulos/bastao';
import { rotasProjetos } from './modulos/producao/projetos';
import { rotasConsultas } from './modulos/producao/consultas';
import { rotasSimulacoes } from './modulos/producao/simulacoes';
import { rotasAlcool } from './modulos/alcool';
import { rotasSelos } from './modulos/selos';
import { rotasEspumantes } from './modulos/producao/espumantes';
import { rotasOperacoes } from './modulos/producao/operacoes';
import { rotasRelatorios } from './modulos/producao/relatorios';
import { rotasAlertas } from './modulos/alertas';
import { rotasCargaInicial } from './modulos/carga-inicial';
import { rotasEstoque } from './modulos/estoque';
import { rotasInicio } from './modulos/inicio';
import { rotasFechamento } from './modulos/fechamento';
import { rotasDeclaracoes } from './modulos/declaracoes';
import { rotasAutocontrole } from './modulos/autocontrole';
import { rotasContratos } from './modulos/contratos';
import { rotasTitularidade } from './modulos/titularidade';
import { rotasContaCliente } from './modulos/conta-cliente';
import { rotasDossie } from './modulos/dossie';
import { rotasProducaoTerceiro } from './modulos/producao-terceiro';
import { rotasAprovacoes } from './modulos/aprovacoes';
import { rotasDiario } from './modulos/diario';
import { rotasRelatoriosAgendados } from './modulos/relatorios-agendados';
import { rotasEstoqueNfe } from './modulos/estoque-nfe';
import { rotasSaidas } from './modulos/saidas';
import { rotasFermentacoes } from './modulos/producao/fermentacoes';
import { rotasEngarrafamento } from './modulos/producao/engarrafamento';
import { rotasGranel } from './modulos/producao/granel';
import { rotasHistoria } from './modulos/producao/historia';
import { rotasInventarios } from './modulos/producao/inventarios';
import { rotasPainel } from './modulos/producao/painel';
import { rotasLaboratorio } from './modulos/producao/laboratorio';
import { rotasRecepcao } from './modulos/producao/recepcao';
import { rotasVinhedos } from './modulos/producao/vinhedos';
import { rotasRegras } from './modulos/regras';
import { rotasParametros } from './modulos/parametros';
import { rotasParametrosCantina } from './modulos/parametros-cantina';
import { rotasProdutos } from './modulos/produtos';
import { rotasRecipientes } from './modulos/recipientes';
import { rotasEstabelecimentos } from './modulos/estabelecimentos';
import { rotasEu } from './modulos/eu';
import { rotasLocais } from './modulos/locais';
import { rotasPerfis } from './modulos/perfis';
import { rotasPessoas } from './modulos/pessoas';
import { rotasPlataforma } from './modulos/plataforma';
import { rotasPlanos } from './modulos/planos';
import { rotasAssinaturas } from './modulos/assinaturas';
import { rotasCobranca } from './modulos/cobranca';
import { rotasExportacao } from './modulos/exportacao';
import { rotasPainelComercial } from './modulos/painel-comercial';
import { rotasIntegracoes } from './modulos/integracoes';
import { rotasMensagens } from './modulos/mensagens';
import { rotasChamados } from './modulos/chamados';
import { rotasPersonificacao } from './modulos/personificacao';
import { rotasPreferencias } from './modulos/preferencias';
import { rotasUsuarios } from './modulos/usuarios';

export interface Dependencias {
  config: Config;
  db: Db;
  armazenamento: Armazenamento;
  /** Busca de CEP e CNPJ; os testes passam uma versão sem rede. */
  consultas?: ConsultasPublicas;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: Dependencias & { consultas: ConsultasPublicas };
  }
}

export async function criarApp(
  deps: Dependencias,
  opcoes: FastifyServerOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: true,
    genReqId: () => randomUUID(),
    bodyLimit: 2 * 1024 * 1024,
    ...opcoes,
  });
  app.decorate('deps', { ...deps, consultas: deps.consultas ?? consultasPublicas() });
  app.decorateRequest('sessao', null);

  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: TAMANHO_MAXIMO_ANEXO, files: 1 } });
  // Limite por IP nas rotas de entrada (P21). Nos testes, todas as chamadas vêm do mesmo IP.
  await app.register(rateLimit, {
    global: false,
    allowList: deps.config.NODE_ENV === 'test' ? () => true : undefined,
  });

  const cookieSessao = nomeCookie(deps.config.cookieSeguro);
  const origemPermitida = new URL(deps.config.URL_APLICACAO).origin;

  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;
    // Avisos dos provedores (webhooks): sem cookie; cada um é conferido pelo token do provedor.
    if (req.url.startsWith('/api/avisos/')) return;
    // Contra CSRF: além do cookie SameSite=Lax, toda alteração precisa vir da própria aplicação.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origem = req.headers.origin;
      if (origem && origem !== origemPermitida) {
        return reply.code(403).send({ codigo: 'origem', mensagem: 'Origem não permitida.' });
      }
      if (req.headers['x-vinicycle'] !== '1') {
        return reply
          .code(403)
          .send({ codigo: 'origem', mensagem: 'Requisição sem o cabeçalho da aplicação.' });
      }
    }
    const token = req.cookies[cookieSessao];
    if (token) req.sessao = await autenticar(deps.db, token);
  });

  app.setErrorHandler((erro, req, reply) => {
    if (erro instanceof ErroAplicacao) {
      return reply
        .code(erro.status)
        .send({ codigo: erro.codigo, mensagem: erro.message, detalhes: erro.detalhes });
    }
    if (erro instanceof ZodError) {
      return reply.code(400).send({
        codigo: 'validacao',
        mensagem: 'Confira os campos destacados.',
        campos: erro.issues.map((i) => ({ caminho: i.path.join('.'), mensagem: i.message })),
      });
    }
    const e = erro as { statusCode?: number; code?: string; message?: string };
    if (e.statusCode === 429) {
      return reply
        .code(429)
        .send({ codigo: 'limite', mensagem: 'Muitas tentativas. Aguarde um pouco.' });
    }
    if (e.code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply
        .code(413)
        .send({ codigo: 'arquivo_grande', mensagem: 'Arquivo acima do tamanho máximo (25 MB).' });
    }
    if (e.statusCode && e.statusCode < 500) {
      return reply
        .code(e.statusCode)
        .send({ codigo: 'requisicao', mensagem: e.message ?? 'Requisição inválida.' });
    }
    req.log.error(erro);
    return reply.code(500).send({
      codigo: 'erro_interno',
      mensagem: `Erro inesperado. Se continuar, informe ao suporte o código ${req.id}.`,
    });
  });

  app.get('/api/saude', async () => ({ ok: true }));

  await app.register(rotasAutenticacao);
  await app.register(rotasConvites);
  await app.register(rotasEu);
  await app.register(rotasEmpresa);
  await app.register(rotasEstabelecimentos);
  await app.register(rotasLocais);
  await app.register(rotasUsuarios);
  await app.register(rotasPerfis);
  await app.register(rotasAuditoria);
  await app.register(rotasAnexos);
  await app.register(rotasPreferencias);
  await app.register(rotasPlataforma);
  await app.register(rotasPlanos);
  await app.register(rotasAssinaturas);
  await app.register(rotasCobranca);
  await app.register(rotasExportacao);
  await app.register(rotasPainelComercial);
  await app.register(rotasIntegracoes);
  await app.register(rotasMensagens);
  await app.register(rotasChamados);
  await app.register(rotasPersonificacao);
  await app.register(rotasCatalogos);
  await app.register(rotasPessoas);
  await app.register(rotasDocumentos);
  await app.register(rotasRecipientes);
  await app.register(rotasItensEstoque);
  await app.register(rotasProdutos);
  await app.register(rotasParametrosCantina);
  await app.register(rotasParametros);
  await app.register(rotasBastao);
  await app.register(rotasRegras);
  await app.register(rotasProjetos);
  await app.register(rotasVinhedos);
  await app.register(rotasRecepcao);
  await app.register(rotasOperacoes);
  await app.register(rotasConsultas);
  await app.register(rotasSimulacoes);
  await app.register(rotasAlcool);
  await app.register(rotasSelos);
  await app.register(rotasEspumantes);
  await app.register(rotasRelatorios);
  await app.register(rotasAlertas);
  await app.register(rotasCargaInicial);
  await app.register(rotasEstoque);
  await app.register(rotasInicio);
  await app.register(rotasFechamento);
  await app.register(rotasDeclaracoes);
  await app.register(rotasAutocontrole);
  await app.register(rotasContratos);
  await app.register(rotasTitularidade);
  await app.register(rotasContaCliente);
  await app.register(rotasDossie);
  await app.register(rotasProducaoTerceiro);
  await app.register(rotasAprovacoes);
  await app.register(rotasDiario);
  await app.register(rotasRelatoriosAgendados);
  await app.register(rotasEstoqueNfe);
  await app.register(rotasSaidas);
  await app.register(rotasFermentacoes);
  await app.register(rotasEngarrafamento);
  await app.register(rotasGranel);
  await app.register(rotasHistoria);
  await app.register(rotasInventarios);
  await app.register(rotasPainel);
  await app.register(rotasLaboratorio);

  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/') || !deps.config.WEB_DIR) {
      return reply
        .code(404)
        .send({ codigo: 'nao_encontrado', mensagem: 'Endereço não encontrado.' });
    }
    // Interface (SPA): qualquer outro caminho devolve o index.html.
    return reply.sendFile('index.html');
  });

  if (deps.config.WEB_DIR && existsSync(deps.config.WEB_DIR)) {
    await app.register(fastifyStatic, { root: path.resolve(deps.config.WEB_DIR), wildcard: false });
  }

  return app;
}
