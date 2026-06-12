import type { MaoObraRepositoryPort } from "../../../domain/ports/mao-obra.repository.port";

export class RemoverMaoObraUseCase {
  constructor(private readonly repo: MaoObraRepositoryPort) {}

  execute(id: string): void {
    this.repo.remover(id);
  }
}
