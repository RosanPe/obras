import type { CategoriaMaterial } from "../../shared/types/common.types";

export const CATEGORIAS_MATERIAL_VALIDAS: CategoriaMaterial[] = ["poste", "cabo", "geral"];

export function validarCategoriaMaterial(valor: string): valor is CategoriaMaterial {
  return CATEGORIAS_MATERIAL_VALIDAS.includes(valor as CategoriaMaterial);
}
