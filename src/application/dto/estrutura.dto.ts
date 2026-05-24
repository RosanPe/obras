export interface SalvarEstruturaDTO {
  id: string;
  descricao: string;
  itens: Array<{
    materialId: string;
    quantidade: number;
  }>;
}
