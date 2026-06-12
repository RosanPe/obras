import type { RegraMaoObra } from "../../../domain/entities/regra-mao-obra.entity";
import type { RegraMaoObraRepositoryPort } from "../../../domain/ports/regra-mao-obra.repository.port";

export class ListarRegrasUseCase {
  constructor(private readonly repo: RegraMaoObraRepositoryPort) {}

  execute(): RegraMaoObra[] {
    return this.repo.listar();
  }
}
