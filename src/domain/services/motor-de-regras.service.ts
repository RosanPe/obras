import type { Estrutura } from "../entities/estrutura.entity";
import type { MaoObra } from "../entities/mao-obra.entity";
import type { Material } from "../entities/material.entity";
import type { PontoMedicao } from "../entities/ponto-medicao.entity";
import type { RegraMaoObra } from "../entities/regra-mao-obra.entity";
import { FATOR_REDE, type Operacao } from "../../shared/types/common.types";
import type { LinhaResultado, ResultadoMedicao } from "../../shared/types/resultado.types";

interface ContextoMotor {
  materiais: Material[];
  maoObra: MaoObra[];
  estruturas: Estrutura[];
  regrasMaoObra: RegraMaoObra[];
}

export class MotorDeRegrasService {
  constructor(private readonly contexto: ContextoMotor) {}

  processar(pontos: PontoMedicao[]): ResultadoMedicao {
    const materiaisInstalacao = new Map<string, LinhaResultado>();
    const materiaisDesativacao = new Map<string, LinhaResultado>();
    const maoObraInstalacao = new Map<string, LinhaResultado>();
    const maoObraDesativacao = new Map<string, LinhaResultado>();
    const maoObraReinstalacao = new Map<string, LinhaResultado>();

    for (const ponto of pontos) {
      const multiplicador = ponto.quantidadePontos ?? 1;
      const destinoMaterial = ponto.operacao === "D" ? materiaisDesativacao : materiaisInstalacao;
      const destinoMaoObra = this.selecionarMapaMaoObra(ponto.operacao, maoObraInstalacao, maoObraDesativacao, maoObraReinstalacao);

      if (ponto.operacao !== "R") {
        this.adicionarEstrutura(destinoMaterial, ponto, multiplicador);
        this.adicionarMaterial(destinoMaterial, ponto.posteId, multiplicador);
        this.adicionarMaterial(destinoMaterial, ponto.caboBTId, this.quantidadeCabosNoPonto(ponto));
        this.adicionarMaterial(destinoMaterial, ponto.caboMTId, this.quantidadeCabosNoPonto(ponto));
      }

      this.aplicarRegras(destinoMaoObra, ponto, multiplicador);
    }

    return {
      materiaisInstalacao: this.ordenar(materiaisInstalacao),
      materiaisDesativacao: this.ordenar(materiaisDesativacao),
      maoObraInstalacao: this.ordenar(maoObraInstalacao),
      maoObraDesativacao: this.ordenar(maoObraDesativacao),
      maoObraReinstalacao: this.ordenar(maoObraReinstalacao)
    };
  }

  private selecionarMapaMaoObra(
    operacao: Operacao,
    instalacao: Map<string, LinhaResultado>,
    desativacao: Map<string, LinhaResultado>,
    reinstalacao: Map<string, LinhaResultado>
  ): Map<string, LinhaResultado> {
    if (operacao === "D") return desativacao;
    if (operacao === "R") return reinstalacao;
    return instalacao;
  }

  private adicionarEstrutura(mapa: Map<string, LinhaResultado>, ponto: PontoMedicao, multiplicador: number): void {
    const estrutura = this.contexto.estruturas.find((item) => item.id === ponto.estruturaId);
    if (!estrutura) return;

    estrutura.itens.forEach((item) => this.adicionarMaterial(mapa, item.materialId, item.quantidade * multiplicador));
  }

  private adicionarMaterial(mapa: Map<string, LinhaResultado>, materialId: string, quantidade: number): void {
    const material = this.contexto.materiais.find((item) => item.id === materialId);
    if (!material || quantidade <= 0) return;
    this.somar(mapa, material.codigo, material.descricao, quantidade, material.unidade);
  }

  private aplicarRegras(mapa: Map<string, LinhaResultado>, ponto: PontoMedicao, multiplicadorPonto: number): void {
    for (const regra of this.contexto.regrasMaoObra) {
      if (!this.regraAtendePonto(regra, ponto)) continue;

      const materialGatilho = this.materialDoGatilho(regra, ponto);
      const estrutura = this.contexto.estruturas.find((item) => item.id === ponto.estruturaId);

      regra.saidas.forEach((saida) => {
        const itemMaoObra = this.contexto.maoObra.find((item) => item.id === saida.maoObraId);
        if (!itemMaoObra) return;

        const descricao = this.preencherTemplateDescricao(saida.templateDescricao, itemMaoObra.descricao, materialGatilho?.descricao, estrutura?.descricao);
        const quantidadeBase = saida.quantidade * multiplicadorPonto;
        const quantidadeFinal = materialGatilho?.categoria === "cabo"
          ? quantidadeBase * this.quantidadeCabosNoPonto(ponto)
          : quantidadeBase;

        this.somar(mapa, itemMaoObra.codigo, descricao, quantidadeFinal, itemMaoObra.unidade || "un");
      });
    }
  }

  private regraAtendePonto(regra: RegraMaoObra, ponto: PontoMedicao): boolean {
    if (regra.operacoes.length > 0 && !regra.operacoes.includes(ponto.operacao)) return false;

    if (regra.gatilho.tipo === "estrutura") {
      if (!ponto.estruturaId) return false;
      if (!regra.gatilho.estruturaId) return true;
      return regra.gatilho.estruturaId === ponto.estruturaId;
    }

    if (regra.gatilho.tipo === "contexto") {
      return Boolean(ponto.estruturaId || ponto.posteId || ponto.caboBTId || ponto.caboMTId);
    }

    const material = this.materialDoGatilho(regra, ponto);
    if (!material) return false;

    if (regra.gatilho.materialId) {
      return regra.gatilho.materialId === material.id;
    }

    return (regra.gatilho.categorias ?? []).includes(material.categoria);
  }

  private materialDoGatilho(regra: RegraMaoObra, ponto: PontoMedicao): Material | undefined {
    if (regra.gatilho.materialId) {
      return this.materiaisDoPonto(ponto).find((item) => item.id === regra.gatilho.materialId);
    }

    if ((regra.gatilho.categorias ?? []).includes("poste")) {
      return this.contexto.materiais.find((item) => item.id === ponto.posteId);
    }

    if ((regra.gatilho.categorias ?? []).includes("cabo")) {
      return this.contexto.materiais.find((item) => item.id === ponto.caboBTId)
        || this.contexto.materiais.find((item) => item.id === ponto.caboMTId);
    }

    if ((regra.gatilho.categorias ?? []).includes("geral")) {
      return this.materiaisDoPonto(ponto).find((item) => item.categoria === "geral");
    }

    return undefined;
  }

  private materiaisDoPonto(ponto: PontoMedicao): Material[] {
    const ids = [ponto.posteId, ponto.caboBTId, ponto.caboMTId].filter(Boolean);
    const estrutura = this.contexto.estruturas.find((item) => item.id === ponto.estruturaId);
    estrutura?.itens.forEach((item) => ids.push(item.materialId));

    return ids
      .map((id) => this.contexto.materiais.find((item) => item.id === id))
      .filter((item): item is Material => Boolean(item));
  }

  private quantidadeCabosNoPonto(ponto: PontoMedicao): number {
    const base = ponto.quantidadeCabo || 0;
    const fator = ponto.rede && ponto.rede !== "" ? FATOR_REDE[ponto.rede] || 1 : 1;
    return base * fator;
  }

  private preencherTemplateDescricao(
    templateDescricao: string | undefined,
    descricaoPadrao: string,
    descricaoMaterial?: string,
    descricaoEstrutura?: string
  ): string {
    if (!templateDescricao) return descricaoPadrao;

    return templateDescricao
      .replace("{maoObra}", descricaoPadrao)
      .replace("{material}", descricaoMaterial ?? "")
      .replace("{estrutura}", descricaoEstrutura ?? "")
      .trim();
  }

  private somar(mapa: Map<string, LinhaResultado>, codigo: string, descricao: string, quantidade: number, unidade: string): void {
    const chave = `${codigo}::${descricao}`;
    const atual = mapa.get(chave) ?? { codigo, descricao, quantidade: 0, unidade };
    atual.quantidade += quantidade;
    mapa.set(chave, atual);
  }

  private ordenar(mapa: Map<string, LinhaResultado>): LinhaResultado[] {
    return [...mapa.values()].sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR"));
  }
}
