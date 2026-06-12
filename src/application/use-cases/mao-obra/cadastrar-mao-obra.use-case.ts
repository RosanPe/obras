import type { MaoObraRepositoryPort } from "../../../domain/ports/mao-obra.repository.port";
import type { SalvarMaoObraDTO } from "../../dto/mao-obra.dto";

export class CadastrarMaoObraUseCase {
  constructor(private readonly repo: MaoObraRepositoryPort) {}

  execute(dto: SalvarMaoObraDTO): void {
    this.repo.salvar({ ...dto });
  }
}
