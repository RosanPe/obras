import type { Material } from "../../../domain/entities/material.entity";
import type { MaterialRepositoryPort } from "../../../domain/ports/material.repository.port";
import type { BaseMedicaoRepositoryPort } from "../../../domain/ports/base-medicao.repository.port";

export class MaterialRepositoryAdapter implements MaterialRepositoryPort {
  constructor(private readonly baseRepo: BaseMedicaoRepositoryPort) {}

  listar(): Material[] {
    return this.baseRepo.carregar().materiais;
  }

  obterPorId(id: string): Material | undefined {
    return this.listar().find((item) => item.id === id);
  }

  salvar(material: Material): void {
    const base = this.baseRepo.carregar();
    base.materiais = upsertPorId(base.materiais, material);
    this.baseRepo.salvar(base);
  }

  remover(id: string): void {
    const base = this.baseRepo.carregar();
    base.materiais = base.materiais.filter((item) => item.id !== id);
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
