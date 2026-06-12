import type { Estrutura } from "../../../domain/entities/estrutura.entity";
import type { BaseMedicaoRepositoryPort } from "../../../domain/ports/base-medicao.repository.port";
import type { EstruturaRepositoryPort } from "../../../domain/ports/estrutura.repository.port";

export class EstruturaRepositoryAdapter implements EstruturaRepositoryPort {
  constructor(private readonly baseRepo: BaseMedicaoRepositoryPort) {}

  listar(): Estrutura[] {
    return this.baseRepo.carregar().estruturas;
  }

  obterPorId(id: string): Estrutura | undefined {
    return this.listar().find((item) => item.id === id);
  }

  salvar(estrutura: Estrutura): void {
    const base = this.baseRepo.carregar();
    base.estruturas = upsertPorId(base.estruturas, estrutura);
    this.baseRepo.salvar(base);
  }

  remover(id: string): void {
    const base = this.baseRepo.carregar();
    base.estruturas = base.estruturas.filter((item) => item.id !== id);
    this.baseRepo.salvar(base);
  }
}

function upsertPorId<T extends { id: string }>(lista: T[], valor: T): T[] {
  const indice = lista.findIndex((item) => item.id === valor.id);
  if (indice === -1) return [...lista, valor];
  const nova = [...lista];
  nova[indice] = valor;
  return nova;
}
