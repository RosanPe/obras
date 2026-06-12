import type { MaterialRepositoryPort } from "../../../domain/ports/material.repository.port";

export class RemoverMaterialUseCase {
  constructor(private readonly repo: MaterialRepositoryPort) {}

  execute(id: string): void {
    this.repo.remover(id);
  }
}
