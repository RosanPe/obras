import type { BaseMedicao, BaseMedicaoRepositoryPort } from "../../../domain/ports/base-medicao.repository.port";
import { normalizarBaseMedicao } from "../../mappers/base-medicao.mapper";

type SeedProvider = {
  obterSeed(): BaseMedicao | null;
};

export class LocalStorageBaseRepository implements BaseMedicaoRepositoryPort {
  private readonly chaveStorage = "base_medicao_web";
  private cache: BaseMedicao | null = null;

  constructor(private readonly seedProvider?: SeedProvider) {}

  carregar(): BaseMedicao {
    if (this.cache) return this.cache;

    const salvo = localStorage.getItem(this.chaveStorage);
    if (salvo) {
      this.cache = normalizarBaseMedicao(JSON.parse(salvo));
      return this.cache;
    }

    const seed = this.seedProvider?.obterSeed() ?? null;
    this.cache = normalizarBaseMedicao(seed);
    return this.cache;
  }

  salvar(base: BaseMedicao): void {
    this.cache = normalizarBaseMedicao(base);
    localStorage.setItem(this.chaveStorage, JSON.stringify(this.cache));
  }
}
