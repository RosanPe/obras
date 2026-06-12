import type { Estrutura } from "../entities/estrutura.entity";
import type { MaoObra } from "../entities/mao-obra.entity";
import type { Material } from "../entities/material.entity";
import type { PontoMedicao } from "../entities/ponto-medicao.entity";
import type { RegraMaoObra } from "../entities/regra-mao-obra.entity";

export interface BaseMedicao {
  versao?: string;
  materiais: Material[];
  maoObra: MaoObra[];
  estruturas: Estrutura[];
  regrasMaoObra: RegraMaoObra[];
  pontos: PontoMedicao[];
}

export interface BaseMedicaoRepositoryPort {
  carregar(): BaseMedicao;
  salvar(base: BaseMedicao): void;
}
