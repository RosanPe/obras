import type { EntityId } from "../../shared/types/common.types";

export interface MaoObra {
  id: EntityId;
  codigo: string;
  descricao: string;
  unidade: string;
}
