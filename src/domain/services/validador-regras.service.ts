import type { Estrutura } from "../entities/estrutura.entity";
import type { MaoObra } from "../entities/mao-obra.entity";
import type { Material } from "../entities/material.entity";
import type { RegraMaoObra } from "../entities/regra-mao-obra.entity";

export class ValidadorRegrasService {
  validarRelacoes(regra: RegraMaoObra, materiais: Material[], estruturas: Estrutura[], maoObra: MaoObra[]): void {
    if (regra.gatilho.materialId && !materiais.some((item) => item.id === regra.gatilho.materialId)) {
      throw new Error(`Material de gatilho nao encontrado: ${regra.gatilho.materialId}`);
    }

    if (regra.gatilho.estruturaId && !estruturas.some((item) => item.id === regra.gatilho.estruturaId)) {
      throw new Error(`Estrutura de gatilho nao encontrada: ${regra.gatilho.estruturaId}`);
    }

    regra.saidas.forEach((saida) => {
      if (!maoObra.some((item) => item.id === saida.maoObraId)) {
        throw new Error(`Mao de obra de saida nao encontrada: ${saida.maoObraId}`);
      }
    });
  }
}
