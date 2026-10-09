// Planilhas de importação (P23): CSV como o Excel em português salva (separador ";", vírgula
// decimal), também aceito com ","; aspas para campos com separador; BOM e quebra de linha do
// Windows. Números e datas no formato brasileiro.

/** Lê o CSV em linhas de campos, sem as linhas em branco. Detecta o separador pelo cabeçalho. */
export function lerCsv(texto: string): string[][] {
  const t = texto.replace(/^\uFEFF/, '')
  const primeira = t.split(/\r?\n/, 1)[0] ?? ''
  const sep = (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ';' : ','
  const linhas: string[][] = []
  let campo = ''
  let linha: string[] = []
  let aspas = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') {
        campo += '"'
        i++
      } else if (c === '"') aspas = false
      else campo += c
    } else if (c === '"') aspas = true
    else if (c === sep) {
      linha.push(campo.trim())
      campo = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      linha.push(campo.trim())
      if (linha.some((x) => x !== '')) linhas.push(linha)
      linha = []
      campo = ''
    } else campo += c
  }
  linha.push(campo.trim())
  if (linha.some((x) => x !== '')) linhas.push(linha)
  return linhas
}

/** "1.234,56", "1234,56" ou "1234.56" → "1234.56"; vazio ou inválido → null. */
export function numeroBr(v: string | undefined): string | null {
  if (!v) return null
  const limpo = v.replace(/\s/g, '')
  const n = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo
  return /^-?\d+(\.\d+)?$/.test(n) ? n : null
}

/** "31/12/2025" ou "2025-12-31" → "2025-12-31"; vazio ou inválido → null. */
export function dataBr(v: string | undefined): string | null {
  if (!v) return null
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : v
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const d = new Date(`${iso}T12:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso
}

/** Sim ou não: "sim", "s", "x", "1", "verdadeiro" → true. */
export const simNao = (v: string | undefined) =>
  ['sim', 's', 'x', '1', 'verdadeiro', 'true'].includes((v ?? '').trim().toLowerCase())

/** Texto para comparar nomes: sem acento, minúsculo, espaços simples. */
export const normalizarNome = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
