import type { CategoriaMaterial, EntityId, Operacao, TipoGatilhoRegra } from "../../shared/types/common.types";

export interface GatilhoRegraMaoObra {
  tipo: TipoGatilhoRegra;
  materialId?: EntityId;
  estruturaId?: EntityId;
  categorias?: CategoriaMaterial[];
}

export interface SaidaRegraMaoObra {
  maoObraId: EntityId;
  quantidade: number;
  templateDescricao?: string;
}

export interface RegraMaoObra {
  id: EntityId;
  nome: string;
  operacoes: Operacao[];
  gatilho: GatilhoRegraMaoObra;
  saidas: SaidaRegraMaoObra[];
}
