import type { Tema, TemaRepositoryPort } from "../../../domain/ports/tema.repository.port";

export class LocalStorageTemaRepository implements TemaRepositoryPort {
  private readonly chaveTema = "base_medicao_tema";

  carregar(): Tema {
    const valor = localStorage.getItem(this.chaveTema);
    return valor === "escuro" ? "escuro" : "claro";
  }

  salvar(tema: Tema): void {
    localStorage.setItem(this.chaveTema, tema);
  }
}
