import type { Tema, TemaRepositoryPort } from "../../../domain/ports/tema.repository.port";

export class ObterTemaUseCase {
  constructor(private readonly repo: TemaRepositoryPort) {}

  execute(): Tema {
    return this.repo.carregar();
  }
}
