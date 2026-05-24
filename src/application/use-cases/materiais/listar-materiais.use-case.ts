import type { Material } from "../../../domain/entities/material.entity";
import type { MaterialRepositoryPort } from "../../../domain/ports/material.repository.port";

export class ListarMateriaisUseCase {
  constructor(private readonly repo: MaterialRepositoryPort) {}

  execute(): Material[] {
    return this.repo.listar();
  }
}
