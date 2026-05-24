import type { EstruturaRepositoryPort } from "../../../domain/ports/estrutura.repository.port";
import type { SalvarEstruturaDTO } from "../../dto/estrutura.dto";

export class CadastrarEstruturaUseCase {
  constructor(private readonly repo: EstruturaRepositoryPort) {}

  execute(dto: SalvarEstruturaDTO): void {
    this.repo.salvar({ ...dto });
  }
}
