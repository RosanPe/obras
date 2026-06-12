import type { EntityId } from "../../shared/types/common.types";

export interface ItemEstrutura {
  materialId: EntityId;
  quantidade: number;
}

export interface Estrutura {
  id: EntityId;
  descricao: string;
  itens: ItemEstrutura[];
}
