import type { MaoObra } from "../entities/mao-obra.entity";

export interface MaoObraRepositoryPort {
  listar(): MaoObra[];
  obterPorId(id: string): MaoObra | undefined;
  salvar(item: MaoObra): void;
  remover(id: string): void;
}
