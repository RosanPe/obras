import type { PontoMedicao } from "../../../domain/entities/ponto-medicao.entity";
import type { BaseMedicaoRepositoryPort } from "../../../domain/ports/base-medicao.repository.port";
import type { PontoMedicaoRepositoryPort } from "../../../domain/ports/ponto-medicao.repository.port";

export class PontoMedicaoRepositoryAdapter implements PontoMedicaoRepositoryPort {
  constructor(private readonly baseRepo: BaseMedicaoRepositoryPort) {}

  listar(): PontoMedicao[] {
    return this.baseRepo.carregar().pontos;
  }

  obterPorId(id: string): PontoMedicao | undefined {
    return this.listar().find((item) => item.id === id);
  }

  salvar(ponto: PontoMedicao): void {
    const base = this.baseRepo.carregar();
    base.pontos = upsertPorId(base.pontos, ponto);
    this.baseRepo.salvar(base);
  }

  remover(id: string): void {
    const base = this.baseRepo.carregar();
    base.pontos = base.pontos.filter((item) => item.id !== id);
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
