import type { CategoriaMaterial, TipoCabo } from "../../shared/types/common.types";

export interface SalvarMaterialDTO {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  categoria: CategoriaMaterial;
  tipoCabo?: TipoCabo;
}
