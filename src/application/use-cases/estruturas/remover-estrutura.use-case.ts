import type { EstruturaRepositoryPort } from "../../../domain/ports/estrutura.repository.port";

export class RemoverEstruturaUseCase {
  constructor(private readonly repo: EstruturaRepositoryPort) {}

  execute(id: string): void {
    this.repo.remover(id);
  }
}
