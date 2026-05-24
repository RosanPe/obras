import type { EstruturaRepositoryPort } from "../../../domain/ports/estrutura.repository.port";
import type { MaoObraRepositoryPort } from "../../../domain/ports/mao-obra.repository.port";
import type { MaterialRepositoryPort } from "../../../domain/ports/material.repository.port";
import type { RegraMaoObraRepositoryPort } from "../../../domain/ports/regra-mao-obra.repository.port";
import { ValidadorRegrasService } from "../../../domain/services/validador-regras.service";
import type { SalvarRegraDTO } from "../../dto/regra.dto";

export class AtualizarRegraUseCase {
  constructor(
    private readonly repo: RegraMaoObraRepositoryPort,
    private readonly materialRepo: MaterialRepositoryPort,
    private readonly estruturaRepo: EstruturaRepositoryPort,
    private readonly maoObraRepo: MaoObraRepositoryPort,
    private readonly validador = new ValidadorRegrasService()
  ) {}

  execute(dto: SalvarRegraDTO): void {
    this.validador.validarRelacoes(dto, this.materialRepo.listar(), this.estruturaRepo.listar(), this.maoObraRepo.listar());
    this.repo.salvar({ ...dto });
  }
}
