import type { PontoMedicao } from "../entities/ponto-medicao.entity";

export interface PontoMedicaoRepositoryPort {
  listar(): PontoMedicao[];
  obterPorId(id: string): PontoMedicao | undefined;
  salvar(ponto: PontoMedicao): void;
  remover(id: string): void;
}
