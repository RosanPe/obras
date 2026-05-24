import type { RegraMaoObra } from "../../../domain/entities/regra-mao-obra.entity";
import type { BaseMedicaoRepositoryPort } from "../../../domain/ports/base-medicao.repository.port";
import type { RegraMaoObraRepositoryPort } from "../../../domain/ports/regra-mao-obra.repository.port";

export class RegraMaoObraRepositoryAdapter implements RegraMaoObraRepositoryPort {
  constructor(private readonly baseRepo: BaseMedicaoRepositoryPort) {}

  listar(): RegraMaoObra[] {
    return this.baseRepo.carregar().regrasMaoObra;
  }

  obterPorId(id: string): RegraMaoObra | undefined {
    return this.listar().find((item) => item.id === id);
  }

  salvar(regra: RegraMaoObra): void {
    const base = this.baseRepo.carregar();
    base.regrasMaoObra = upsertPorId(base.regrasMaoObra, regra);
    this.baseRepo.salvar(base);
  }

  remover(id: string): void {
    const base = this.baseRepo.carregar();
    base.regrasMaoObra = base.regrasMaoObra.filter((item) => item.id !== id);
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
