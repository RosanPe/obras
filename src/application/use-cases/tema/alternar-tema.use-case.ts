import type { Tema, TemaRepositoryPort } from "../../../domain/ports/tema.repository.port";

export class AlternarTemaUseCase {
  constructor(private readonly repo: TemaRepositoryPort) {}

  execute(temaAtual: Tema): Tema {
    const proximo: Tema = temaAtual === "claro" ? "escuro" : "claro";
    this.repo.salvar(proximo);
    return proximo;
  }
}
