import type { MaterialRepositoryPort } from "../../../domain/ports/material.repository.port";
import type { SalvarMaterialDTO } from "../../dto/material.dto";

export class CadastrarMaterialUseCase {
  constructor(private readonly repo: MaterialRepositoryPort) {}

  execute(dto: SalvarMaterialDTO): void {
    this.repo.salvar({ ...dto });
  }
}
