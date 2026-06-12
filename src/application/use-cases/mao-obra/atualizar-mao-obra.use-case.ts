import type { MaoObraRepositoryPort } from "../../../domain/ports/mao-obra.repository.port";
import type { SalvarMaoObraDTO } from "../../dto/mao-obra.dto";

export class AtualizarMaoObraUseCase {
  constructor(private readonly repo: MaoObraRepositoryPort) {}

  execute(dto: SalvarMaoObraDTO): void {
    this.repo.salvar({ ...dto });
  }
}
