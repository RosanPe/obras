import type { Operacao } from "../../shared/types/common.types";

export const OPERACOES_VALIDAS: Operacao[] = ["I", "D", "R"];

export function validarOperacao(valor: string): valor is Operacao {
  return OPERACOES_VALIDAS.includes(valor as Operacao);
}
