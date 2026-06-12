import type { BaseMedicao, Estrutura, LinhaResultado, Material, PontoMedicao, RegraMaoObra, ResultadoMedicao } from "../tipos/modelos";

// Motor puro: recebe a base e os pontos, devolve somente dados calculados.
export class MotorDeRegras {
  constructor(private readonly base: BaseMedicao) {}

  processar(pontos: PontoMedicao[]): ResultadoMedicao {
    const materiaisInstalacao = new Map<string, LinhaResultado>();
    const materiaisDesativacao = new Map<string, LinhaResultado>();
    const maoObraInstalacao = new Map<string, LinhaResultado>();
    const maoObraDesativacao = new Map<string, LinhaResultado>();
    const maoObraReinstalacao = new Map<string, LinhaResultado>();
    const pendenciasMaoObraCabos: Array<{
      chave: string;
      mapa: Map<string, LinhaResultado>;
      codigo: string;
      descricao: string;
      quantidadeBase: number;
      fatorRede: number;
    }> = [];

    for (const ponto of pontos) {
      const multiplicador = ponto.quantidadePontos ?? 1;
      const destino = ponto.operacao === "D" ? materiaisDesativacao : materiaisInstalacao;
      const destinoMaoObra = ponto.operacao === "D"
        ? maoObraDesativacao
        : ponto.operacao === "R"
          ? maoObraReinstalacao
          : maoObraInstalacao;

      if (ponto.operacao !== "R") {
        this.adicionarEstrutura(destino, ponto, multiplicador);
        this.adicionarMaterial(destino, ponto.posteId, multiplicador);
        this.adicionarMaterial(destino, ponto.caboBTId, this.quantidadeCabosDoPonto(ponto));
        this.adicionarMaterial(destino, ponto.caboMTId, this.quantidadeCabosDoPonto(ponto));
      }

      this.aplicarRegras(destinoMaoObra, pendenciasMaoObraCabos, ponto, multiplicador);
    }

    this.consolidarPendenciasDeCabos(pendenciasMaoObraCabos);

    return {
      materiaisInstalacao: this.ordenar(materiaisInstalacao),
      materiaisDesativacao: this.ordenar(materiaisDesativacao),
      maoObraInstalacao: this.ordenar(maoObraInstalacao),
      maoObraDesativacao: this.ordenar(maoObraDesativacao),
      maoObraReinstalacao: this.ordenar(maoObraReinstalacao)
    };
  }

  private adicionarEstrutura(mapa: Map<string, LinhaResultado>, ponto: PontoMedicao, multiplicador: number): void {
    this.estruturasDoPonto(ponto).forEach((estrutura) => {
      estrutura.itens.forEach((item) => this.adicionarMaterial(mapa, item.materialId, item.quantidade * multiplicador));
    });
  }

  private adicionarMaterial(mapa: Map<string, LinhaResultado>, materialId: string, quantidade: number): void {
    const material = this.base.materiais.find((item) => item.id === materialId);
    if (!material || quantidade <= 0) return;
    this.somar(mapa, material.codigo, material.descricao, quantidade, material.unidade);
  }

  private aplicarRegras(
    mapa: Map<string, LinhaResultado>,
    pendenciasMaoObraCabos: Array<{
      chave: string;
      mapa: Map<string, LinhaResultado>;
      codigo: string;
      descricao: string;
      quantidadeBase: number;
      fatorRede: number;
    }>,
    ponto: PontoMedicao,
    multiplicadorPonto: number
  ): void {
    for (const regra of this.base.regrasMaoObra) {
      if (!this.regraAtendePonto(regra, ponto)) continue;
      const material = this.materialDoGatilho(regra, ponto);
      const estruturasContexto = this.tipoGatilhoRegra(regra) === "estrutura"
        ? this.estruturasDaRegraNoPonto(regra, ponto)
        : [this.estruturaDoPonto(ponto)];

      estruturasContexto.forEach((estrutura) => {
        regra.saidas.forEach((saida) => {
          const codigo = saida.codigo || "MO";
          const descricao = this.preencherDescricao(saida.descricao, material, estrutura, ponto.operacao, regra);
          if (material?.categoria === "cabo") {
            this.acumularRegraDeCabo(
              pendenciasMaoObraCabos,
              mapa,
              codigo,
              descricao,
              saida.quantidade * this.quantidadeBaseCabosDoPonto(ponto),
              this.multiplicadorRede(ponto.rede)
            );
            return;
          }

          this.somar(mapa, codigo, descricao, saida.quantidade * multiplicadorPonto, "un");
        });
      });
    }
  }

  private regraAtendePonto(regra: RegraMaoObra, ponto: PontoMedicao): boolean {
    if (regra.operacoes.length > 0 && !regra.operacoes.includes(ponto.operacao)) return false;
    const tipoGatilho = this.tipoGatilhoRegra(regra);
    if (tipoGatilho === "estrutura") {
      const estruturaIdsPonto = this.estruturaIdsDoPonto(ponto);
      if (!estruturaIdsPonto.length) return false;
      return !regra.estruturaId || estruturaIdsPonto.includes(regra.estruturaId);
    }
    if (tipoGatilho === "contexto") return Boolean(this.estruturaIdsDoPonto(ponto).length || ponto.posteId || ponto.caboBTId || ponto.caboMTId);

    const material = this.materialDoGatilho(regra, ponto);
    if (!material) return false;
    if (regra.materialId) return regra.materialId === material.id;
    return regra.categorias.includes(material.categoria);
  }

  private materialDoGatilho(regra: RegraMaoObra, ponto: PontoMedicao): Material | undefined {
    if (regra.materialId) return this.materiaisDoPonto(ponto).find((item) => item.id === regra.materialId);
    if (regra.categorias.includes("poste")) return this.base.materiais.find((item) => item.id === ponto.posteId);
    if (regra.categorias.includes("cabo")) return this.base.materiais.find((item) => item.id === ponto.caboBTId) || this.base.materiais.find((item) => item.id === ponto.caboMTId);
    if (regra.categorias.includes("geral")) return this.materiaisDoPonto(ponto).find((item) => item.categoria === "geral");
    return undefined;
  }

  private materiaisDoPonto(ponto: PontoMedicao): Material[] {
    const ids = [ponto.posteId, ponto.caboBTId, ponto.caboMTId].filter(Boolean);
    this.estruturasDoPonto(ponto).forEach((estrutura) => {
      estrutura.itens.forEach((item) => ids.push(item.materialId));
    });
    return ids
      .map((id) => this.base.materiais.find((item) => item.id === id))
      .filter((item): item is Material => Boolean(item));
  }

  private estruturaDoPonto(ponto: PontoMedicao): Estrutura | undefined {
    return this.base.estruturas.find((item) => item.id === ponto.estruturaId);
  }

  private estruturaIdsDoPonto(ponto: PontoMedicao): string[] {
    return [ponto.estruturaId, ponto.estrutura2Id, ponto.estrutura3Id].filter((id): id is string => Boolean(id));
  }

  private estruturasDoPonto(ponto: PontoMedicao): Estrutura[] {
    return this.estruturaIdsDoPonto(ponto)
      .map((id) => this.base.estruturas.find((item) => item.id === id))
      .filter((item): item is Estrutura => Boolean(item));
  }

  private estruturasDaRegraNoPonto(regra: RegraMaoObra, ponto: PontoMedicao): Array<Estrutura | undefined> {
    const estruturas = this.estruturasDoPonto(ponto);
    if (!regra.estruturaId) return estruturas;
    return estruturas.filter((estrutura) => estrutura.id === regra.estruturaId);
  }

  private tipoGatilhoRegra(regra: RegraMaoObra): string {
    return regra.tipoGatilho ?? "material";
  }

  private quantidadeCabosDoPonto(ponto: PontoMedicao): number {
    return this.quantidadeBaseCabosDoPonto(ponto) * this.multiplicadorRede(ponto.rede);
  }

  private quantidadeBaseCabosDoPonto(ponto: PontoMedicao): number {
    return ponto.quantidadeCabo;
  }

  private multiplicadorRede(rede?: string): number {
    const fatorPorRede: Record<string, number> = { a: 1, ab: 2, abc: 3, abcn: 4 };
    return fatorPorRede[rede ?? ""] ?? 1;
  }

  private preencherDescricao(
    texto: string,
    material: Material | undefined,
    estrutura: Estrutura | undefined,
    operacao: string,
    regra: RegraMaoObra
  ): string {
    const nomesOperacao: Record<string, string> = { I: "INST", D: "DESATIVA", R: "REINST" };
    let descricao = texto
      .replace("{material}", material?.descricao.toUpperCase() ?? "")
      .replace("{estrutura}", estrutura?.id ?? "")
      .replace("{estruturaDescricao}", estrutura?.descricao ?? "")
      .replace("{operacao}", nomesOperacao[operacao] ?? operacao);

    if (regra.tipoGatilho === "estrutura" && !regra.estruturaId && estrutura?.id && !texto.includes("{estrutura}")) {
      descricao = `${descricao} ${estrutura.id}`.trim();
    }

    return descricao;
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

  private acumularRegraDeCabo(
    pendencias: Array<{
      chave: string;
      mapa: Map<string, LinhaResultado>;
      codigo: string;
      descricao: string;
      quantidadeBase: number;
      fatorRede: number;
    }>,
    mapa: Map<string, LinhaResultado>,
    codigo: string,
    descricao: string,
    quantidadeBase: number,
    fatorRede: number
  ): void {
    if (quantidadeBase <= 0) return;
    const chave = `${codigo}::${descricao}::${fatorRede}`;
    const atual = pendencias.find((item) => item.chave === chave);
    if (atual) {
      atual.quantidadeBase += quantidadeBase;
      return;
    }

    pendencias.push({ chave, mapa, codigo, descricao, quantidadeBase, fatorRede });
  }

  private consolidarPendenciasDeCabos(
    pendencias: Array<{
      chave: string;
      mapa: Map<string, LinhaResultado>;
      codigo: string;
      descricao: string;
      quantidadeBase: number;
      fatorRede: number;
    }>
  ): void {
    pendencias.forEach((item) => this.somar(item.mapa, item.codigo, item.descricao, item.quantidadeBase * item.fatorRede, "un"));
  }
}
