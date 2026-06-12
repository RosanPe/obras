import type { MaoObra } from "../../../domain/entities/mao-obra.entity";
import type { MaoObraRepositoryPort } from "../../../domain/ports/mao-obra.repository.port";

export class ListarMaoObraUseCase {
  constructor(private readonly repo: MaoObraRepositoryPort) {}

  execute(): MaoObra[] {
    return this.repo.listar();
  }
}
