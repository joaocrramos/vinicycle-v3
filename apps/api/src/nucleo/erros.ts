// Erros de negócio com mensagem pronta para a tela (pt-BR).

export class ErroAplicacao extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
    readonly detalhes?: unknown,
  ) {
    super(mensagem);
  }
}

export class ErroNaoAutenticado extends ErroAplicacao {
  constructor(mensagem = 'Sessão encerrada. Entre novamente.') {
    super(401, 'nao_autenticado', mensagem);
  }
}

/** Acesso negado (P27): "sem permissão para *ação* em *tela*". Fica na auditoria (P14). */
export class ErroPermissao extends ErroAplicacao {
  constructor(
    readonly funcionalidade: string,
    readonly acao: string,
    mensagem: string,
  ) {
    super(403, 'sem_permissao', mensagem);
  }
}

export class ErroNaoEncontrado extends ErroAplicacao {
  constructor(mensagem = 'Registro não encontrado.') {
    super(404, 'nao_encontrado', mensagem);
  }
}

/** Regra de integridade ou de negócio que impede a ação (P29: bloqueia). */
export class ErroRegra extends ErroAplicacao {
  constructor(mensagem: string, codigo = 'regra', detalhes?: unknown) {
    super(422, codigo, mensagem, detalhes);
  }
}

/** Outro usuário alterou o registro antes (controle de edição simultânea, 1.4). */
export class ErroConflito extends ErroAplicacao {
  constructor(
    mensagem = 'Este registro foi alterado por outra pessoa. Recarregue e tente de novo.',
  ) {
    super(409, 'conflito', mensagem);
  }
}
