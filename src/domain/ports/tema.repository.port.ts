export type Tema = "claro" | "escuro";

export interface TemaRepositoryPort {
  carregar(): Tema;
  salvar(tema: Tema): void;
}
