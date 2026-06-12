import type { CategoriaMaterial, Operacao, TipoGatilhoRegra } from "../../shared/types/common.types";

export interface SalvarRegraDTO {
  id: string;
  nome: string;
  operacoes: Operacao[];
  gatilho: {
    tipo: TipoGatilhoRegra;
    materialId?: string;
    estruturaId?: string;
    categorias?: CategoriaMaterial[];
  };
  saidas: Array<{
    maoObraId: string;
    quantidade: number;
    templateDescricao?: string;
  }>;
}
