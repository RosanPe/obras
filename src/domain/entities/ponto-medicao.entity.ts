import type { EntityId, Operacao, TipoRede } from "../../shared/types/common.types";

export interface PontoMedicao {
  id: EntityId;
  numero: number;
  operacao: Operacao;
  estruturaId: EntityId;
  posteId: EntityId;
  caboBTId: EntityId;
  caboMTId: EntityId;
  quantidadeCabo: number;
  rede?: TipoRede;
  quantidadePontos?: number;
}
