// Dados de referência dos catálogos (P6, P16). Itens globais: a empresa usa e acrescenta os seus.
export const UNIDADES = [
  // simbolo, nome, grandeza, casas (P3, P17)
  ['L', 'litro', 'volume', 2],
  ['mL', 'mililitro', 'volume', 0],
  ['hL', 'hectolitro', 'volume', 2],
  ['kg', 'quilograma', 'massa', 2],
  ['g', 'grama', 'massa', 2],
  ['mg', 'miligrama', 'massa', 1],
  ['t', 'tonelada', 'massa', 3],
  ['un', 'unidade', 'contagem', 0],
  ['mg/L', 'miligrama por litro', 'concentracao', 1],
  ['g/L', 'grama por litro', 'concentracao', 2],
  ['g/hL', 'grama por hectolitro', 'dose', 2],
  ['mL/hL', 'mililitro por hectolitro', 'dose', 1],
  ['°Brix', 'grau Brix', 'acucar', 2],
  ['% vol', 'por cento em volume', 'teor_alcoolico', 1],
  ['pH', 'pH', 'ph', 2],
  ['g/mL', 'grama por mililitro (densidade)', 'densidade', 4],
  ['mEq/L', 'miliequivalente por litro', 'acidez', 1],
  ['°C', 'grau Celsius', 'temperatura', 1],
  ['atm', 'atmosfera', 'pressao', 1],
  ['bar', 'bar', 'pressao', 1],
  ['%', 'por cento', 'percentual', 2],
] as const

const LEI_VINHO =
  'Lei 7.678/1988, arts. 8º a 15; IN MAPA 14/2018, alterada pela Portaria MAPA 723/2024'

/** Classes oficiais (pesquisa/2026-10-declaracoes-vinicolas.md, seção 5). */
export const CLASSES_PRODUTO = [
  // codigo, nome, categoria, exige método de espumante, fonte, vigente desde
  ['vinho_mesa', 'Vinho de mesa', 'vinho', false, LEI_VINHO, '2018-02-09'],
  ['vinho_fino', 'Vinho fino', 'vinho', false, LEI_VINHO, '2018-02-09'],
  ['vinho_nobre', 'Vinho nobre', 'vinho', false, LEI_VINHO, '2018-02-09'],
  ['vinho_leve', 'Vinho leve', 'vinho', false, LEI_VINHO, '2018-02-09'],
  ['espumante_natural', 'Espumante natural', 'espumante', true, LEI_VINHO, '2018-02-09'],
  ['moscatel_espumante', 'Moscatel espumante', 'espumante', true, LEI_VINHO, '2018-02-09'],
  ['frisante', 'Vinho frisante', 'vinho', false, LEI_VINHO, '2018-02-09'],
  ['gaseificado', 'Vinho gaseificado', 'vinho', false, LEI_VINHO, '2018-02-09'],
  ['licoroso', 'Vinho licoroso', 'vinho', false, LEI_VINHO, '2018-02-09'],
  ['composto', 'Vinho composto', 'vinho', false, LEI_VINHO, '2018-02-09'],
  [
    'vinho_colonial',
    'Vinho colonial',
    'vinho',
    false,
    'Lei 12.959/2014 (Lei 7.678/1988, art. 2º-A)',
    '2014-03-20',
  ],
  ['suco_uva', 'Suco de uva', 'derivado', false, 'Lei 7.678/1988; IN MAPA 14/2018', '2018-02-09'],
  ['mosto', 'Mosto de uva', 'derivado', false, 'Lei 7.678/1988; IN MAPA 14/2018', '2018-02-09'],
] as const

export const IGS = [
  {
    codigo: 'IP_VALE_SAO_FRANCISCO',
    nome: 'Vale do São Francisco',
    tipo: 'IP' as const,
    // Lagoa Grande, Petrolina e Santa Maria da Boa Vista (PE); Casa Nova e Curaçá (BA).
    municipiosIbge: ['2608750', '2611101', '2612604', '2907202', '2909901'],
    entidadeGestora: 'Instituto do Vinho do Vale do São Francisco (VinhoVasf)',
    fonte:
      'INPI, reconhecimento em 01/11/2022; caderno de especificações técnicas (pesquisa/2026-10-declaracoes-vinicolas.md)',
  },
]

export const TIPOS_RECIPIENTE = [
  // codigo, nome, pressurizado, é barrica (cantina.md, Recipientes)
  ['tanque_inox', 'Tanque de inox', false, false],
  ['tanque_fibra', 'Tanque de fibra', false, false],
  ['tanque_pp', 'Tanque de polipropileno (PP)', false, false],
  ['barrica', 'Barrica', false, true],
  ['tonel', 'Tonel', false, true],
  ['autoclave', 'Autoclave', true, false],
  ['ovo_concreto', 'Ovo de concreto', false, false],
  ['anfora', 'Ânfora', false, false],
  ['outro', 'Outro', false, false],
] as const

export const TIPOS_INSUMO = [
  // codigo, nome, unidades, apresentações
  ['levedura', 'Leveduras', ['g', 'kg'], ['po', 'liquido']],
  ['bacteria', 'Bactérias láticas', ['g', 'un'], ['po', 'liquido']],
  ['nutriente', 'Nutrientes', ['g', 'kg'], ['po', 'granulado']],
  ['enzima', 'Enzimas', ['g', 'kg', 'mL', 'L'], ['po', 'liquido']],
  ['acidificante', 'Acidificantes', ['g', 'kg'], ['po', 'granulado']],
  ['desacidificante', 'Desacidificantes', ['g', 'kg'], ['po']],
  ['clarificante', 'Clarificantes', ['g', 'kg', 'mL', 'L'], ['po', 'liquido', 'granulado']],
  ['tanino', 'Taninos', ['g', 'kg'], ['po', 'granulado']],
  [
    'conservante',
    'Conservantes (SO₂ e outros)',
    ['g', 'kg', 'mL', 'L'],
    ['po', 'liquido', 'pastilha', 'gas'],
  ],
  ['estabilizante', 'Estabilizantes', ['g', 'kg', 'mL', 'L'], ['po', 'liquido']],
  ['acucar', 'Açúcar (chaptalização)', ['kg'], ['po']],
  ['alcool', 'Álcool etílico', ['L'], ['liquido']],
  ['gas', 'Gases (CO₂, N₂, argônio)', ['kg', 'un'], ['gas']],
  ['madeira', 'Madeira (lascas, aduelas)', ['g', 'kg', 'un'], ['solido']],
  ['carvao', 'Carvão enológico', ['g', 'kg'], ['po']],
  ['limpeza', 'Limpeza e sanitização', ['kg', 'L', 'un'], ['po', 'liquido']],
  [
    'outro',
    'Outros',
    ['g', 'kg', 'mL', 'L', 'un'],
    ['po', 'liquido', 'granulado', 'pastilha', 'gas', 'solido'],
  ],
] as const

export const TIPOS_DOCUMENTO = [
  // codigo, nome, tem vencimento (gestao.md, Documentos)
  ['registro_mapa_estabelecimento', 'Registro MAPA do estabelecimento', true],
  ['registro_mapa_produto', 'Registro MAPA de produto', true],
  ['art_aft', 'ART/AFT do responsável técnico', true],
  ['licenca_ambiental', 'Licença ambiental', true],
  ['avcb', 'AVCB (Corpo de Bombeiros)', true],
  ['alvara', 'Alvará de funcionamento', true],
  ['licenca_sanitaria', 'Licença sanitária', true],
  ['laudo_agua', 'Laudo de potabilidade da água', true],
  ['calibracao', 'Certificado de calibração', true],
  ['certificado_organico', 'Certificado de orgânico', true],
  ['certificado_origem', 'Certificado de origem (IG)', true],
  ['credenciamento_laboratorio', 'Credenciamento de laboratório', true],
  ['certificado_digital', 'Certificado digital (A1)', true],
  ['contrato', 'Contrato', true],
  ['manual_bpf', 'Manual de Boas Práticas', false],
  ['outro', 'Outro', false],
] as const

/** Parâmetros de análise (cantina.md, Laboratório; P3). Mínimo e máximo físicos, não legais. */
export const PARAMETROS_ANALISE = [
  // codigo, nome, unidade padrão, unidades aceitas, casas, mínimo, máximo
  ['densidade', 'Densidade', 'g/mL', ['g/mL'], 4, '0.9000', '1.2000'],
  ['brix', 'Sólidos solúveis', '°Brix', ['°Brix'], 2, '0', '40'],
  ['ph', 'pH', 'pH', ['pH'], 2, '2', '5'],
  ['acidez_total', 'Acidez total', 'mEq/L', ['mEq/L', 'g/L'], 1, '0', '300'],
  ['acidez_volatil', 'Acidez volátil', 'mEq/L', ['mEq/L', 'g/L'], 1, '0', '100'],
  ['teor_alcoolico', 'Graduação alcoólica', '% vol', ['% vol'], 1, '0', '25'],
  ['acucares_totais', 'Açúcares totais', 'g/L', ['g/L'], 2, '0', '400'],
  ['acucares_redutores', 'Açúcares redutores', 'g/L', ['g/L'], 2, '0', '400'],
  ['so2_livre', 'SO₂ livre', 'mg/L', ['mg/L'], 1, '0', '200'],
  ['so2_total', 'SO₂ total', 'mg/L', ['mg/L'], 1, '0', '500'],
  ['extrato_seco', 'Extrato seco reduzido', 'g/L', ['g/L'], 2, '0', '100'],
  ['temperatura', 'Temperatura', '°C', ['°C'], 1, '-10', '60'],
  ['pressao', 'Pressão', 'atm', ['atm', 'bar'], 1, '0', '10'],
  ['acido_malico', 'Ácido málico', 'g/L', ['g/L'], 2, '0', '20'],
  ['metanol', 'Metanol', 'mg/L', ['mg/L'], 1, '0', '1000'],
] as const

/** Listas simples (03-modelo-de-dados.md, 1.11). Itens globais; a empresa acrescenta os seus. */
export const OPCOES_LISTA: Record<string, Array<[string, string]>> = {
  motivo_perda: [
    ['borra', 'Borra'],
    ['evaporacao', 'Evaporação'],
    ['vazamento', 'Vazamento'],
    ['descarte', 'Descarte'],
    ['amostra', 'Amostra para análise'],
    ['transbordo', 'Transbordo'],
    ['deterioracao', 'Deterioração'],
    ['quebra', 'Quebra'],
    ['outro', 'Outro'],
  ],
  cargo: [
    ['enologo', 'Enólogo'],
    ['cantineiro', 'Cantineiro'],
    ['auxiliar_cantina', 'Auxiliar de cantina'],
    ['agronomo', 'Agrônomo'],
    ['responsavel_tecnico', 'Responsável técnico'],
    ['administrativo', 'Administrativo'],
    ['gerente', 'Gerente'],
    ['outro', 'Outro'],
  ],
  // cantina.md, Desengace, esmagamento e prensagem.
  fracao_prensa: [
    ['flor', 'Flor (gota)'],
    ['prensa_1', '1ª prensa'],
    ['prensa_2', '2ª prensa'],
  ],
  // cantina.md, Inventário, estorno e tratamentos.
  tipo_tratamento: [
    ['clarificacao', 'Clarificação (colagem)'],
    ['filtracao', 'Filtração'],
    ['estabilizacao_tartarica', 'Estabilização tartárica'],
    ['estabilizacao_proteica', 'Estabilização proteica'],
    ['centrifugacao', 'Centrifugação'],
    ['outro', 'Outro'],
  ],
  // cantina.md, Trasfega e corte.
  metodo_trasfega: [
    ['aberta_aeracao', 'Aberta, com aeração'],
    ['fechada', 'Fechada'],
    ['gas_inerte', 'Com gás inerte'],
    ['bomba', 'Por bomba'],
    ['gravidade', 'Por gravidade'],
  ],
  // cantina.md, Saídas: tipos de saída.
  tipo_saida: [
    ['venda', 'Venda'],
    ['degustacao', 'Degustação e cortesia'],
    ['quebra', 'Quebra e avaria'],
    ['transferencia', 'Transferência'],
    ['consumo_interno', 'Consumo interno'],
    ['doacao', 'Doação'],
    // Vinificação para terceiros (04, roteiro do ciclo 10, bloco 3).
    ['devolucao_titular', 'Devolução ao titular'],
    ['entrega_ordem_titular', 'Entrega por ordem do titular'],
  ],
  // cantina.md, Etapas de produção (lista padrão).
  etapa_producao: [
    ['desengace', 'Desengace'],
    ['prensa_programada', 'Prensa programada'],
    ['maceracao', 'Maceração'],
    ['maturacao', 'Maturação'],
  ],
  // cantina.md, Espumantes (todos os métodos previstos).
  metodo_espumante: [
    ['tradicional', 'Tradicional (champenoise)'],
    ['charmat', 'Charmat (tanque)'],
    ['asti', 'Asti'],
    ['ancestral', 'Ancestral'],
  ],
  // cantina.md, Espumantes: estágios das garrafas em processo (tradicional e ancestral); a empresa
  // inclui os seus (P29).
  estagio_espumante: [
    ['fermentacao_garrafa', 'Fermentação na garrafa'],
    ['repouso_borras', 'Repouso sobre borras'],
    ['remuage', 'Remuage'],
    ['degorgement', 'Dégorgement'],
    ['licor_expedicao', 'Licor de expedição (dosagem)'],
  ],
  // Denominação: classe + cor + açúcar (IN MAPA 14/2018, art. 26).
  cor_vinho: [
    ['tinto', 'Tinto'],
    ['rosado', 'Rosado'],
    ['branco', 'Branco'],
  ],
  teor_acucar: [
    ['nature', 'Nature'],
    ['extra_brut', 'Extra-brut'],
    ['brut', 'Brut'],
    ['seco', 'Seco'],
    ['meio_seco', 'Meio seco (demi-sec)'],
    ['suave', 'Suave'],
    ['doce', 'Doce'],
  ],
  categoria_fornecimento: [
    ['insumos', 'Insumos enológicos'],
    ['embalagens', 'Embalagens'],
    ['uva', 'Uva'],
    ['servicos', 'Serviços'],
    ['equipamentos', 'Equipamentos'],
    ['outros', 'Outros'],
  ],
  conselho_profissional: [
    ['crq', 'CRQ'],
    ['crea', 'CREA'],
    ['crbio', 'CRBio'],
    ['outro', 'Outro'],
  ],
  material_recipiente: [
    ['inox', 'Aço inox'],
    ['fibra', 'Fibra de vidro'],
    ['madeira', 'Madeira'],
    ['concreto', 'Concreto'],
    ['argila', 'Argila'],
    ['polietileno', 'Polietileno'],
    ['polipropileno', 'Polipropileno (PP)'],
    ['outro', 'Outro'],
  ],
  origem_madeira: [
    ['carvalho_frances', 'Carvalho francês'],
    ['carvalho_americano', 'Carvalho americano'],
    ['carvalho_europa_leste', 'Carvalho do leste europeu'],
    ['outra', 'Outra'],
  ],
  tosta: [
    ['leve', 'Leve'],
    ['media', 'Média'],
    ['media_mais', 'Média mais'],
    ['forte', 'Forte'],
  ],
  apresentacao_insumo: [
    ['po', 'Pó'],
    ['granulado', 'Granulado'],
    ['liquido', 'Líquido'],
    ['pastilha', 'Pastilha'],
    ['gas', 'Gás'],
    ['solido', 'Sólido'],
  ],
}
