import type { Estrutura } from "../../../domain/entities/estrutura.entity";
import type { EstruturaRepositoryPort } from "../../../domain/ports/estrutura.repository.port";

export class ListarEstruturasUseCase {
  constructor(private readonly repo: EstruturaRepositoryPort) {}

  execute(): Estrutura[] {
    return this.repo.listar();
  }
}
