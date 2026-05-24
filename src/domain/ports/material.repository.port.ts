import type { Material } from "../entities/material.entity";

export interface MaterialRepositoryPort {
  listar(): Material[];
  obterPorId(id: string): Material | undefined;
  salvar(material: Material): void;
  remover(id: string): void;
}
