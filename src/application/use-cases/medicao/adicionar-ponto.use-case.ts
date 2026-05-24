import type { PontoMedicaoRepositoryPort } from "../../../domain/ports/ponto-medicao.repository.port";
import type { SalvarPontoMedicaoDTO } from "../../dto/medicao.dto";

export class AdicionarPontoUseCase {
  constructor(private readonly repo: PontoMedicaoRepositoryPort) {}

  execute(dto: SalvarPontoMedicaoDTO): void {
    this.repo.salvar({ ...dto });
  }
}
