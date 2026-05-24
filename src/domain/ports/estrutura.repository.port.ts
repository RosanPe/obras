import type { Estrutura } from "../entities/estrutura.entity";

export interface EstruturaRepositoryPort {
  listar(): Estrutura[];
  obterPorId(id: string): Estrutura | undefined;
  salvar(estrutura: Estrutura): void;
  remover(id: string): void;
}
