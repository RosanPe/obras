export type Operacao = "I" | "D" | "R";
export type CategoriaMaterial = "poste" | "cabo" | "geral";
export type TipoRede = "a" | "ab" | "abc" | "abcn" | "";
export type TipoCabo = "BT" | "MT" | "";
export type TipoGatilhoRegra = "material" | "estrutura" | "contexto";

export interface Material {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  categoria: CategoriaMaterial;
  tipoCabo?: TipoCabo;
  caboProtegido?: boolean;
}

export interface ItemEstrutura {
  materialId: string;
  quantidade: number;
}

export interface Estrutura {
  id: string;
  descricao: string;
  itens: ItemEstrutura[];
}

export interface SaidaMaoObra {
  maoObraId?: string;
  codigo: string;
  descricao: string;
  quantidade: number;
}

export interface ItemCatalogoMaoObra {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
}

export interface RegraMaoObra {
  id: string;
  nome: string;
  tipoGatilho: TipoGatilhoRegra;
  materialId: string | null;
  estruturaId: string | null;
  categorias: CategoriaMaterial[];
  operacoes: Operacao[];
  saidas: SaidaMaoObra[];
}

export interface PontoMedicao {
  id: string;
  numero: number | string;
  operacao: Operacao;
  estruturaId: string;
  posteId: string;
  caboBTId: string;
  caboMTId: string;
  quantidadeCabo: number;
  rede?: TipoRede;
  quantidadePontos?: number;
}

export interface LinhaResultado {
  codigo: string;
  descricao: string;
  quantidade: number;
  unidade: string;
}

export interface BaseMedicao {
  versao?: string;
  materiais: Material[];
  maoObra: ItemCatalogoMaoObra[];
  estruturas: Estrutura[];
  regrasMaoObra: RegraMaoObra[];
  pontos: PontoMedicao[];
}

export interface ResultadoMedicao {
  materiaisInstalacao: LinhaResultado[];
  materiaisDesativacao: LinhaResultado[];
  maoObraInstalacao: LinhaResultado[];
  maoObraDesativacao: LinhaResultado[];
  maoObraReinstalacao: LinhaResultado[];
}
