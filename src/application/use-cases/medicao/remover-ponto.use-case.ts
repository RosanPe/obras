import type { PontoMedicaoRepositoryPort } from "../../../domain/ports/ponto-medicao.repository.port";

export class RemoverPontoUseCase {
  constructor(private readonly repo: PontoMedicaoRepositoryPort) {}

  execute(id: string): void {
    this.repo.remover(id);
  }
}
