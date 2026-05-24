import type { Operacao, TipoRede } from "../../shared/types/common.types";

export interface SalvarPontoMedicaoDTO {
  id: string;
  numero: number;
  operacao: Operacao;
  estruturaId: string;
  posteId: string;
  caboBTId: string;
  caboMTId: string;
  quantidadeCabo: number;
  rede?: TipoRede;
  quantidadePontos?: number;
}
