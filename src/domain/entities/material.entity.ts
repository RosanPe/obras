import type { CategoriaMaterial, EntityId, TipoCabo } from "../../shared/types/common.types";

export interface Material {
  id: EntityId;
  codigo: string;
  descricao: string;
  unidade: string;
  categoria: CategoriaMaterial;
  tipoCabo?: TipoCabo;
}
