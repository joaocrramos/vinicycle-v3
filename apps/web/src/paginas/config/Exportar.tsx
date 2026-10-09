// Configurações › Exportar dados (P15): o pacote completo da empresa, só o Master. Disponível
// também com a empresa bloqueada ou inativa (administracao.md, Inadimplência e bloqueio).
import { Download } from 'lucide-react'
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao } from '@/componentes/ui/cartao'
import { Pagina } from '@/layout/Estrutura'

export function BotaoExportar() {
  return (
    <a
      href="/api/exportacao/pacote"
      className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 [&_svg]:size-4"
    >
      <Download /> Baixar o pacote (ZIP)
    </a>
  )
}

export function PaginaExportar() {
  return (
    <Pagina titulo="Exportar dados" trilha={['Configurações']}>
      <Cartao>
        <CabecalhoCartao
          titulo="Pacote completo"
          descricao="Todos os dados da empresa no momento do download, para guardar ou levar a outro sistema."
        />
        <CorpoCartao className="flex flex-col gap-4 text-sm">
          <ul className="list-disc pl-5">
            <li>Uma planilha CSV por tabela do sistema, que abre no Excel.</li>
            <li>Os arquivos anexados, organizados por registro.</li>
            <li>Senhas, códigos de acesso e certificados não são exportados.</li>
          </ul>
          <Aviso tom="info">
            Com muitos anexos, o download pode demorar alguns minutos. A exportação fica registrada
            na auditoria.
          </Aviso>
          <div>
            <BotaoExportar />
          </div>
        </CorpoCartao>
      </Cartao>
    </Pagina>
  )
}
