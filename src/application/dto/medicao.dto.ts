import type { Operacao, TipoRede } from "../../shared/types/common.types";

export interface SalvarPontoMedicaoDTO {
  id: string;
  numero: number;
  operacao: Operacao;
  estruturaId: string;
  estrutura2Id?: string;
  estrutura3Id?: string;
  posteId: string;
  caboBTId: string;
  caboMTId: string;
  quantidadeCabo: number;
  rede?: TipoRede;
  quantidadePontos?: number;
}
