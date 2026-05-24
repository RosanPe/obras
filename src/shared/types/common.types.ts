export type EntityId = string;

export type Operacao = "I" | "D" | "R";
export type CategoriaMaterial = "poste" | "cabo" | "geral";
export type TipoRede = "a" | "ab" | "abc" | "abcn" | "";
export type TipoCabo = "BT" | "MT" | "";
export type TipoGatilhoRegra = "material" | "estrutura" | "contexto";

export const FATOR_REDE: Record<Exclude<TipoRede, "">, number> = {
  a: 1,
  ab: 2,
  abc: 3,
  abcn: 4
};
