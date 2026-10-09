// Regras regulatórias iniciais (P16): uma linha por versão. Regra nova é versão nova, nunca edição.
// Vigência pela data de publicação quando a norma não traz outra; a fonte fica na própria regra.

export interface RegraInicial {
  tipo: 'limite' | 'cadastro';
  chave: string;
  abrangencia: 'nacional' | 'uf' | 'ig';
  abrangenciaCodigo: string | null;
  vigenteDesde: string;
  minimo?: string;
  maximo?: string;
  unidade?: string;
  descricao: string;
  fonteNorma: string;
  fonteArtigo?: string;
  fonteLink?: string;
  fonteNota?: string;
}

export const REGRAS: RegraInicial[] = [
  {
    tipo: 'limite',
    chave: 'rendimento_prensagem_maximo',
    abrangencia: 'nacional',
    abrangenciaCodigo: null,
    vigenteDesde: '2025-11-03',
    maximo: '0.8000',
    unidade: 'L/kg',
    descricao: 'Rendimento máximo de 4/5 depois da separação das borras',
    fonteNorma: 'Decreto 12.709/2025',
    fonteArtigo: 'art. 93',
    fonteLink: 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/decreto/d12709.htm',
    fonteNota:
      '4/5 lido como 80 L por 100 kg de uva (0,8 L/kg). Vigência pela publicação no DOU de 03/11/2025.',
  },
  {
    tipo: 'limite',
    chave: 'varietal_minimo',
    abrangencia: 'nacional',
    abrangenciaCodigo: null,
    vigenteDesde: '1988-11-08',
    minimo: '75.0000',
    unidade: '%',
    descricao: 'Vinho varietal: pelo menos 75% da variedade declarada no rótulo',
    fonteNorma: 'Lei 7.678/1988',
    fonteArtigo: 'art. 41',
  },
  {
    tipo: 'limite',
    chave: 'varietal_minimo',
    abrangencia: 'ig',
    abrangenciaCodigo: 'IP_VALE_SAO_FRANCISCO',
    vigenteDesde: '2022-11-01',
    minimo: '85.0000',
    unidade: '%',
    descricao: 'IP Vale do São Francisco: pelo menos 85% da variedade declarada',
    fonteNorma: 'Regulamento de uso da IP Vale do São Francisco',
    fonteNota:
      'Reconhecimento pelo INPI em 01/11/2022 (pesquisa/2026-10-declaracoes-vinicolas.md).',
  },
  {
    tipo: 'limite',
    chave: 'safra_minima',
    abrangencia: 'nacional',
    abrangenciaCodigo: null,
    vigenteDesde: '2018-03-09',
    minimo: '85.0000',
    unidade: '%',
    descricao: 'Safra no rótulo: pelo menos 85% do vinho da safra declarada',
    fonteNorma: 'IN MAPA 14/2018',
    fonteArtigo: 'art. 28',
    fonteNota: 'IN de 08/02/2018, publicada no DOU de 09/03/2018.',
  },
  {
    tipo: 'cadastro',
    chave: 'produtor_uva_sivibe',
    abrangencia: 'nacional',
    abrangenciaCodigo: null,
    vigenteDesde: '2025-11-03',
    descricao: 'Uva de produtor sem cadastro no SIVIBE ou sem a declaração do ano anterior',
    fonteNorma: 'Decreto 12.709/2025',
    fonteArtigo: 'art. 203, V',
    fonteNota: 'Também IN MAPA 59/2020, art. 13 (cadastro vitícola).',
  },
  {
    tipo: 'limite',
    chave: 'chaptalizacao_maxima_vinho_nobre',
    abrangencia: 'nacional',
    abrangenciaCodigo: null,
    vigenteDesde: '2014-02-21',
    maximo: '0.0000',
    unidade: '% vol',
    descricao: 'Chaptalização vedada no vinho nobre',
    fonteNorma: 'Decreto 8.198/2014 (revogado), mantido até ato novo do MAPA',
    fonteNota:
      'Os limites de chaptalização estavam no Decreto 8.198/2014, revogado pelo Decreto 12.709/2025 (art. 240); ficam como referência até ato novo do MAPA (cantina.md, Chaptalização).',
  },
  {
    tipo: 'limite',
    chave: 'chaptalizacao_maxima_vinho_fino_branco',
    abrangencia: 'nacional',
    abrangenciaCodigo: null,
    vigenteDesde: '2014-02-21',
    maximo: '0.0000',
    unidade: '% vol',
    descricao: 'Chaptalização vedada no vinho fino branco',
    fonteNorma: 'Decreto 8.198/2014 (revogado), mantido até ato novo do MAPA',
    fonteNota:
      'Os limites de chaptalização estavam no Decreto 8.198/2014, revogado pelo Decreto 12.709/2025 (art. 240); ficam como referência até ato novo do MAPA (cantina.md, Chaptalização).',
  },
  {
    tipo: 'limite',
    chave: 'chaptalizacao_maxima_vinho_fino_rosado',
    abrangencia: 'nacional',
    abrangenciaCodigo: null,
    vigenteDesde: '2014-02-21',
    maximo: '0.0000',
    unidade: '% vol',
    descricao: 'Chaptalização vedada no vinho fino rosé',
    fonteNorma: 'Decreto 8.198/2014 (revogado), mantido até ato novo do MAPA',
    fonteNota:
      'Os limites de chaptalização estavam no Decreto 8.198/2014, revogado pelo Decreto 12.709/2025 (art. 240); ficam como referência até ato novo do MAPA (cantina.md, Chaptalização).',
  },
  {
    tipo: 'limite',
    chave: 'chaptalizacao_maxima_vinho_fino_tinto',
    abrangencia: 'nacional',
    abrangenciaCodigo: null,
    vigenteDesde: '2014-02-21',
    maximo: '1.5000',
    unidade: '% vol',
    descricao: 'Vinho fino tinto: chaptalização de até 1,5% vol',
    fonteNorma: 'Decreto 8.198/2014 (revogado), mantido até ato novo do MAPA',
    fonteNota:
      'Os limites de chaptalização estavam no Decreto 8.198/2014, revogado pelo Decreto 12.709/2025 (art. 240); ficam como referência até ato novo do MAPA (cantina.md, Chaptalização).',
  },
  {
    tipo: 'limite',
    chave: 'chaptalizacao_maxima_espumante_natural',
    abrangencia: 'nacional',
    abrangenciaCodigo: null,
    vigenteDesde: '2014-02-21',
    maximo: '0.0000',
    unidade: '% vol',
    descricao: 'Chaptalização vedada na base de espumante',
    fonteNorma: 'Decreto 8.198/2014 (revogado), mantido até ato novo do MAPA',
    fonteNota:
      'Os limites de chaptalização estavam no Decreto 8.198/2014, revogado pelo Decreto 12.709/2025 (art. 240); ficam como referência até ato novo do MAPA (cantina.md, Chaptalização).',
  },
  {
    tipo: 'limite',
    chave: 'chaptalizacao_maxima_moscatel_espumante',
    abrangencia: 'nacional',
    abrangenciaCodigo: null,
    vigenteDesde: '2014-02-21',
    maximo: '40.0000',
    unidade: 'g/L',
    descricao: 'Moscatel espumante: até 40 g/L de açúcar',
    fonteNorma: 'Decreto 8.198/2014 (revogado), mantido até ato novo do MAPA',
    fonteNota:
      'Os limites de chaptalização estavam no Decreto 8.198/2014, revogado pelo Decreto 12.709/2025 (art. 240); ficam como referência até ato novo do MAPA (cantina.md, Chaptalização).',
  },
  {
    tipo: 'limite',
    chave: 'so2_total_maximo',
    abrangencia: 'nacional',
    abrangenciaCodigo: null,
    vigenteDesde: '2023-03-01',
    maximo: '300.0000',
    unidade: 'mg/L',
    descricao: 'SO₂ total no vinho: até 300 mg/L (soma de SO₂, metabissulfito e bissulfito)',
    fonteNorma: 'IN Anvisa 211/2023',
    fonteArtigo: 'categoria 16.1.1.2',
    fonteNota:
      'O sistema soma o SO₂ adicionado (teor do insumo × quantidade ÷ volume); o SO₂ total medido entra com o laboratório. Conferir a data de publicação da IN no DOU.',
  },
];
