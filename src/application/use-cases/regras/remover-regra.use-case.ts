import type { RegraMaoObraRepositoryPort } from "../../../domain/ports/regra-mao-obra.repository.port";

export class RemoverRegraUseCase {
  constructor(private readonly repo: RegraMaoObraRepositoryPort) {}

  execute(id: string): void {
    this.repo.remover(id);
  }
}
