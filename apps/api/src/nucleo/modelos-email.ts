// Textos dos e-mails. A edição pela Administração ("Modelos de mensagem", administracao.md) vem
// depois; até lá, os textos ficam aqui.
import type { Mensagem } from './email'

function escapar(v: string): string {
  return v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

export function montar(
  para: string,
  assunto: string,
  paragrafos: string[],
  botao?: { texto: string; link: string },
): Mensagem {
  const texto = [
    ...paragrafos,
    ...(botao ? [`${botao.texto}: ${botao.link}`] : []),
    '',
    'ViniCycle',
  ].join('\n\n')
  const html = `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;color:#222;max-width:560px;margin:auto;padding:24px">
<p style="font-size:20px;font-weight:bold;color:#6b1f3a">ViniCycle</p>
${paragrafos.map((p) => `<p>${escapar(p)}</p>`).join('\n')}
${botao ? `<p><a href="${escapar(botao.link)}" style="display:inline-block;background:#6b1f3a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${escapar(botao.texto)}</a></p><p style="font-size:12px;color:#666">Se o botão não funcionar, copie este endereço no navegador:<br>${escapar(botao.link)}</p>` : ''}
<p style="font-size:12px;color:#666">Você recebeu este e-mail porque alguém usou este endereço no ViniCycle. Se não foi você, ignore a mensagem.</p>
</body></html>`
  return { para, assunto, texto, html, paragrafos, botao }
}

export function emailConvite(d: {
  para: string
  empresa: string
  quem: string | null
  link: string
  dias: number
  master: boolean
}): Mensagem {
  const m = montar(
    d.para,
    `Convite para ${d.empresa} no ViniCycle`,
    [
      d.quem
        ? `${d.quem} convidou você para usar o ViniCycle em ${d.empresa}.`
        : `Você foi convidado para usar o ViniCycle em ${d.empresa}.`,
      ...(d.master
        ? [
            'Você será o usuário Master da empresa: terá acesso a tudo e cuidará dos usuários e das configurações.',
          ]
        : []),
      `O convite vale por ${d.dias} dias.`,
    ],
    { texto: 'Aceitar o convite', link: d.link },
  )
  return {
    ...m,
    variaveis: { empresa: d.empresa, quem: d.quem ?? '', dias: String(d.dias), link: d.link },
  }
}

export function emailRedefinirSenha(d: { para: string; link: string }): Mensagem {
  return montar(
    d.para,
    'Redefinição de senha do ViniCycle',
    [
      'Recebemos um pedido para definir uma nova senha. O link vale por 1 hora e só pode ser usado uma vez.',
    ],
    { texto: 'Definir nova senha', link: d.link },
  )
}

export function emailDefinirSenhaEquipe(d: { para: string; link: string }): Mensagem {
  return montar(
    d.para,
    'Acesso à Administração do ViniCycle',
    [
      'Você foi incluído na equipe da plataforma ViniCycle. Defina sua senha; no primeiro acesso à Administração, o sistema pede para configurar o segundo fator.',
      'O link vale por 1 hora.',
    ],
    { texto: 'Definir senha', link: d.link },
  )
}

export function emailCodigoTrocaSenha(d: { para: string; codigo: string }): Mensagem {
  return montar(d.para, `Código para trocar a senha: ${d.codigo}`, [
    `Seu código para trocar a senha é ${d.codigo}. Ele vale por 15 minutos.`,
  ])
}

export function emailSenhaAlterada(d: { para: string }): Mensagem {
  return montar(d.para, 'Sua senha do ViniCycle foi alterada', [
    'A senha da sua conta foi alterada, e as outras sessões abertas foram encerradas.',
    'Se não foi você, use "Esqueci minha senha" na tela de entrada e avise o suporte.',
  ])
}

export function emailConfirmarEmail(d: { para: string; link: string }): Mensagem {
  return montar(
    d.para,
    'Confirme o seu novo e-mail no ViniCycle',
    [
      'Recebemos um pedido para usar este endereço como e-mail de acesso ao ViniCycle. O link vale por 1 hora e só pode ser usado uma vez.',
      'Até a confirmação, o e-mail anterior continua valendo.',
    ],
    { texto: 'Confirmar o novo e-mail', link: d.link },
  )
}

export function emailEmailAlterado(d: { para: string; novo: string }): Mensagem {
  return montar(d.para, 'O e-mail da sua conta do ViniCycle foi alterado', [
    `O e-mail de acesso da sua conta passou a ser ${d.novo}. Este endereço não será mais usado para entrar.`,
    'Se não foi você, avise o suporte imediatamente.',
  ])
}

export function emailBastao(d: {
  para: string
  empresa: string
  quem: string
  link: string
  suporte: boolean
}): Mensagem {
  return montar(
    d.para,
    `Você foi escolhido como Master de ${d.empresa} no ViniCycle`,
    [
      d.suporte
        ? `O suporte do ViniCycle designou você como novo Master de ${d.empresa}.`
        : `${d.quem} quer passar a você o papel de Master de ${d.empresa}.`,
      'O Master tem acesso a tudo e cuida dos usuários e das configurações da empresa. Nada muda até você aceitar.',
      'O pedido vale por 48 horas. Você também pode recusar.',
    ],
    { texto: 'Ver o pedido', link: d.link },
  )
}

export function emailBastaoDecidido(d: {
  para: string
  empresa: string
  escolhido: string
  decisao: 'aceita' | 'recusada' | 'cancelada'
  paraEscolhido: boolean
}): Mensagem {
  const frases = {
    aceita: d.paraEscolhido
      ? `Você agora é o Master de ${d.empresa}.`
      : `${d.escolhido} aceitou e agora é o Master de ${d.empresa}. O seu acesso passou ao perfil escolhido na passagem do bastão.`,
    recusada: `${d.escolhido} recusou o papel de Master de ${d.empresa}. Nada mudou.`,
    cancelada: `O pedido para você ser o Master de ${d.empresa} foi cancelado. Nada mudou.`,
  }
  const assuntos = {
    aceita: `Passagem de bastão concluída em ${d.empresa}`,
    recusada: `Passagem de bastão recusada em ${d.empresa}`,
    cancelada: `Passagem de bastão cancelada em ${d.empresa}`,
  }
  return montar(d.para, assuntos[d.decisao], [frases[d.decisao]])
}

export function emailAvisoTrocaPeloSuporte(d: {
  para: string
  empresa: string
  escolhido: string
}): Mensagem {
  return montar(d.para, `Troca do Master de ${d.empresa} pelo suporte`, [
    `A pedido da empresa, o suporte do ViniCycle designou ${d.escolhido} como novo Master de ${d.empresa}. A troca vale quando o designado aceitar.`,
    'Se você não reconhece este pedido, fale com o suporte do ViniCycle.',
  ])
}

// ---- Cobrança (administracao.md, Período de teste; Inadimplência e bloqueio) ----

export type AvisoCobranca =
  | { tipo: 'teste_fim'; dias: number; fim: string }
  | { tipo: 'teste_encerrado' }
  | {
      tipo: 'vencimento'
      dias: number
      numero: number
      valor: string
      vencimento: string
      linkPagamento?: string | null
    }
  | {
      tipo: 'vencida'
      numero: number
      valor: string
      vencimento: string
      somenteLeituraEm: string
      linkPagamento?: string | null
    }
  | { tipo: 'somente_leitura'; numero: number; bloqueioEm: string }
  | { tipo: 'bloqueio'; numero: number }
  | { tipo: 'desbloqueio' }
  | { tipo: 'limite_renovacao'; renovacao: string; excessos: string[] }
  | { tipo: 'franquia_esgotada'; canal: string; mes: string }

function textoCobranca(d: {
  para: string
  empresa: string
  link: string
  aviso: AvisoCobranca
}): Mensagem {
  const a = d.aviso
  const botao = { texto: 'Ver a assinatura', link: d.link }
  switch (a.tipo) {
    case 'teste_fim':
      return montar(
        d.para,
        `O teste de ${d.empresa} no ViniCycle termina em ${a.dias} dia(s)`,
        [
          `O período de teste de ${d.empresa} termina em ${a.fim}.`,
          'Para continuar usando sem interrupção, contrate a assinatura. Sem a contratação, o acesso é bloqueado no fim do teste; só o Master entra, para contratar ou exportar os dados.',
        ],
        botao,
      )
    case 'teste_encerrado':
      return montar(
        d.para,
        `O teste de ${d.empresa} no ViniCycle terminou`,
        [
          `O período de teste de ${d.empresa} terminou e o acesso foi bloqueado.`,
          'O Master continua entrando: pode contratar a assinatura, e o acesso volta na hora, ou exportar os dados.',
        ],
        botao,
      )
    case 'vencimento':
      return montar(
        d.para,
        a.dias === 0
          ? `Fatura ${a.numero} do ViniCycle vence hoje`
          : `Fatura ${a.numero} do ViniCycle vence em ${a.dias} dia(s)`,
        [`A fatura ${a.numero} de ${d.empresa}, de ${a.valor}, vence em ${a.vencimento}.`],
        a.linkPagamento ? { texto: 'Pagar a fatura', link: a.linkPagamento } : botao,
      )
    case 'vencida':
      return montar(
        d.para,
        `Fatura ${a.numero} do ViniCycle vencida`,
        [
          `A fatura ${a.numero} de ${d.empresa}, de ${a.valor}, venceu em ${a.vencimento} e ainda não consta como paga.`,
          `Tudo continua funcionando até ${a.somenteLeituraEm}. Depois disso, a empresa passa a somente leitura até o pagamento.`,
          'Se já pagou, desconsidere este aviso.',
        ],
        a.linkPagamento ? { texto: 'Pagar a fatura', link: a.linkPagamento } : botao,
      )
    case 'somente_leitura':
      return montar(
        d.para,
        `${d.empresa} está em somente leitura no ViniCycle`,
        [
          `Por falta de pagamento da fatura ${a.numero}, ${d.empresa} passou a somente leitura: todos entram, consultam e exportam, mas nada pode ser lançado.`,
          `Sem o pagamento, o acesso é bloqueado em ${a.bloqueioEm}. O acesso volta na hora em que o pagamento é registrado.`,
        ],
        botao,
      )
    case 'bloqueio':
      return montar(
        d.para,
        `${d.empresa} foi bloqueada no ViniCycle`,
        [
          `Por falta de pagamento da fatura ${a.numero}, o acesso de ${d.empresa} foi bloqueado.`,
          'Só o Master entra: ele vê o que está em aberto e pode exportar os dados. O acesso volta na hora em que o pagamento é registrado.',
        ],
        botao,
      )
    case 'desbloqueio':
      return montar(d.para, `${d.empresa} está liberada no ViniCycle`, [
        `O pagamento foi registrado e o acesso de ${d.empresa} voltou ao normal.`,
      ])
    case 'franquia_esgotada':
      return montar(
        d.para,
        `A franquia de ${a.canal} de ${d.empresa} acabou`,
        [
          `As mensagens de ${a.canal} contratadas para ${a.mes} já foram usadas. Até o mês que vem, os avisos de ${d.empresa} seguem por e-mail e na tela.`,
          'Para continuar recebendo por esse canal, contrate mais um pacote em Configurações › Assinatura.',
        ],
        botao,
      )
    case 'limite_renovacao':
      return montar(
        d.para,
        `Ajuste antes da renovação de ${d.empresa} no ViniCycle`,
        [
          `Na renovação de ${a.renovacao}, a assinatura de ${d.empresa} muda conforme o pedido agendado, e o uso atual passa dos novos limites: ${a.excessos.join('; ')}.`,
          'Ajuste antes da renovação (inative o que não usa ou mantenha os adicionais). O que passar do limite fica sem poder crescer.',
        ],
        botao,
      )
  }
}

/** Aviso da régua, com as variáveis para o modelo editável (cobranca_<tipo>). */
export function emailCobranca(d: {
  para: string
  empresa: string
  link: string
  aviso: AvisoCobranca
}): Mensagem {
  const m = textoCobranca(d)
  const a = d.aviso as Record<string, unknown>
  const variaveis: Record<string, string> = { empresa: d.empresa, link: m.botao?.link ?? d.link }
  for (const [k, v] of Object.entries(a)) {
    if (k === 'tipo' || v === null || v === undefined) continue
    variaveis[k] = Array.isArray(v) ? v.join('; ') : String(v)
  }
  return { ...m, variaveis }
}

// ---- Suporte (administracao.md, Suporte) ----

export function emailChamadoNovo(d: {
  para: string
  numero: number
  cliente: string
  assunto: string
  prioridade: string
  link: string
}): Mensagem {
  return montar(
    d.para,
    `Chamado ${d.numero} (${d.prioridade}): ${d.assunto}`,
    [`Novo chamado de ${d.cliente}: ${d.assunto}.`, `Prioridade: ${d.prioridade}.`],
    { texto: 'Abrir o chamado', link: d.link },
  )
}

export function emailChamadoRecebido(d: {
  para: string
  numero: number
  assunto: string
  prazo: string
}): Mensagem {
  return montar(d.para, `Recebemos o seu chamado ${d.numero}`, [
    `O seu pedido "${d.assunto}" foi registrado com o número ${d.numero}.`,
    `A equipe do ViniCycle responde por este e-mail até ${d.prazo}.`,
  ])
}

export function emailChamadoResposta(d: {
  para: string
  numero: number
  assunto: string
  texto: string
  link: string | null
}): Mensagem {
  return montar(
    d.para,
    `Resposta ao chamado ${d.numero}: ${d.assunto}`,
    [`A equipe do ViniCycle respondeu ao seu chamado:`, d.texto],
    d.link ? { texto: 'Ver o chamado', link: d.link } : undefined,
  )
}

export function emailChamadoSituacao(d: {
  para: string
  numero: number
  assunto: string
  situacao: string
  link: string | null
}): Mensagem {
  return montar(
    d.para,
    `Chamado ${d.numero}: ${d.situacao.toLowerCase()}`,
    [`O chamado ${d.numero} ("${d.assunto}") passou a: ${d.situacao}.`],
    d.link ? { texto: 'Ver o chamado', link: d.link } : undefined,
  )
}

/** Aviso ao Master no início de cada personificação (P28). */
export function emailAvisoPersonificacao(d: {
  para: string
  empresa: string
  membro: string
  usuario: string
  motivo: string
}): Mensagem {
  return montar(d.para, `O suporte do ViniCycle acessou ${d.empresa} como ${d.usuario}`, [
    `${d.membro}, da equipe do ViniCycle, começou agora a acessar ${d.empresa} com a visão de ${d.usuario}, por no máximo 60 minutos.`,
    `Motivo: ${d.motivo}`,
    'Tudo o que for feito fica na auditoria da empresa, com o nome de quem fez. A senha do usuário não é vista nem alterada.',
  ])
}
