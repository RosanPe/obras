import type { PontoMedicaoRepositoryPort } from "../../../domain/ports/ponto-medicao.repository.port";
import type { MaterialRepositoryPort } from "../../../domain/ports/material.repository.port";
import type { MaoObraRepositoryPort } from "../../../domain/ports/mao-obra.repository.port";
import type { EstruturaRepositoryPort } from "../../../domain/ports/estrutura.repository.port";
import type { RegraMaoObraRepositoryPort } from "../../../domain/ports/regra-mao-obra.repository.port";
import { MotorDeRegrasService } from "../../../domain/services/motor-de-regras.service";
import type { ResultadoMedicao } from "../../../shared/types/resultado.types";

export class GerarMedicaoUseCase {
  constructor(
    private readonly pontoRepo: PontoMedicaoRepositoryPort,
    private readonly materialRepo: MaterialRepositoryPort,
    private readonly maoObraRepo: MaoObraRepositoryPort,
    private readonly estruturaRepo: EstruturaRepositoryPort,
    private readonly regraRepo: RegraMaoObraRepositoryPort
  ) {}

  execute(): ResultadoMedicao {
    const motor = new MotorDeRegrasService({
      materiais: this.materialRepo.listar(),
      maoObra: this.maoObraRepo.listar(),
      estruturas: this.estruturaRepo.listar(),
      regrasMaoObra: this.regraRepo.listar()
    });

    return motor.processar(this.pontoRepo.listar());
  }
}
