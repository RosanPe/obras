import type { TipoCabo } from "../../shared/types/common.types";

export const TIPOS_CABO_VALIDOS: TipoCabo[] = ["", "BT", "MT"];

export function validarTipoCabo(valor: string): valor is TipoCabo {
  return TIPOS_CABO_VALIDOS.includes(valor as TipoCabo);
}
