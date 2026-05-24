import type { TipoRede } from "../../shared/types/common.types";

export const TIPOS_REDE_VALIDOS: TipoRede[] = ["", "a", "ab", "abc", "abcn"];

export function validarTipoRede(valor: string): valor is TipoRede {
  return TIPOS_REDE_VALIDOS.includes(valor as TipoRede);
}
