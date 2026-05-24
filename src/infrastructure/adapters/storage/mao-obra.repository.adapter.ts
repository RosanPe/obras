import type { MaoObra } from "../../../domain/entities/mao-obra.entity";
import type { BaseMedicaoRepositoryPort } from "../../../domain/ports/base-medicao.repository.port";
import type { MaoObraRepositoryPort } from "../../../domain/ports/mao-obra.repository.port";

export class MaoObraRepositoryAdapter implements MaoObraRepositoryPort {
  constructor(private readonly baseRepo: BaseMedicaoRepositoryPort) {}

  listar(): MaoObra[] {
    return this.baseRepo.carregar().maoObra;
  }

  obterPorId(id: string): MaoObra | undefined {
    return this.listar().find((item) => item.id === id);
  }

  salvar(item: MaoObra): void {
    const base = this.baseRepo.carregar();
    base.maoObra = upsertPorId(base.maoObra, item);
    this.baseRepo.salvar(base);
  }

  remover(id: string): void {
    const base = this.baseRepo.carregar();
    base.maoObra = base.maoObra.filter((item) => item.id !== id);
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
