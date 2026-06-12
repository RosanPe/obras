import type { BaseMedicao } from "../../domain/ports/base-medicao.repository.port";
import type { RegraMaoObra } from "../../domain/entities/regra-mao-obra.entity";

interface LegacySaidaRegra {
  maoObraId?: string;
  codigo?: string;
  descricao?: string;
  quantidade: number;
}

interface LegacyRegra {
  id: string;
  nome: string;
  tipoGatilho?: "material" | "estrutura" | "contexto";
  materialId?: string | null;
  estruturaId?: string | null;
  categorias?: Array<"poste" | "cabo" | "geral">;
  operacoes?: Array<"I" | "D" | "R">;
  saidas?: LegacySaidaRegra[];
}

interface LegacyBase {
  versao?: string;
  materiais?: BaseMedicao["materiais"];
  maoObra?: BaseMedicao["maoObra"];
  estruturas?: BaseMedicao["estruturas"];
  regrasMaoObra?: LegacyRegra[];
  pontos?: BaseMedicao["pontos"];
}

export function normalizarBaseMedicao(base: Partial<LegacyBase> | null | undefined): BaseMedicao {
  const materiais = base?.materiais ?? [];
  const maoObra = base?.maoObra ?? [];

  return {
    versao: base?.versao,
    materiais,
    maoObra,
    estruturas: base?.estruturas ?? [],
    regrasMaoObra: (base?.regrasMaoObra ?? []).map((regra) => normalizarRegra(regra, maoObra)),
    pontos: base?.pontos ?? []
  };
}

function normalizarRegra(regra: LegacyRegra, catalogoMaoObra: BaseMedicao["maoObra"]): RegraMaoObra {
  return {
    id: regra.id,
    nome: regra.nome,
    operacoes: regra.operacoes ?? ["I"],
    gatilho: {
      tipo: regra.tipoGatilho ?? "material",
      materialId: regra.materialId ?? undefined,
      estruturaId: regra.estruturaId ?? undefined,
      categorias: regra.categorias ?? []
    },
    saidas: (regra.saidas ?? [])
      .map((saida) => normalizarSaida(saida, catalogoMaoObra))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
  };
}

function normalizarSaida(saida: LegacySaidaRegra, catalogoMaoObra: BaseMedicao["maoObra"]) {
  if (saida.maoObraId && catalogoMaoObra.some((item) => item.id === saida.maoObraId)) {
    return {
      maoObraId: saida.maoObraId,
      quantidade: Number(saida.quantidade || 0),
      templateDescricao: saida.descricao
    };
  }

  if (saida.codigo) {
    const encontrado = catalogoMaoObra.find((item) => item.codigo === saida.codigo);
    if (encontrado) {
      return {
        maoObraId: encontrado.id,
        quantidade: Number(saida.quantidade || 0),
        templateDescricao: saida.descricao
      };
    }
  }

  return null;
}
