import type { RegraMaoObra } from "../entities/regra-mao-obra.entity";

export interface RegraMaoObraRepositoryPort {
  listar(): RegraMaoObra[];
  obterPorId(id: string): RegraMaoObra | undefined;
  salvar(regra: RegraMaoObra): void;
  remover(id: string): void;
}
