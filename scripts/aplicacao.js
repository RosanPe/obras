class RepositorioSupabase {
  static chaveTema = "base_medicao_tema";

  constructor(configuracao) {
    this.url = String(configuracao?.supabaseUrl || "").replace(/\/$/, "");
    this.chaveAnonima = String(configuracao?.supabaseAnonKey || "");
    this.idBase = String(configuracao?.baseId || "principal");
    this.timerSalvar = null;
    this.ultimoConteudo = "";
    this.filaSalvar = Promise.resolve();
  }

  estaConfigurado() {
    return Boolean(this.url && this.chaveAnonima);
  }

  validarConfiguracao() {
    const temUrl = Boolean(this.url);
    const temChave = Boolean(this.chaveAnonima);
    if (temUrl === temChave) return;
    throw new Error("Configuracao incompleta do Supabase: informe supabaseUrl e supabaseAnonKey em scripts/config.js.");
  }

  basePersistente(base) {
    return {
      versao: base?.versao || "",
      materiais: Array.isArray(base?.materiais) ? base.materiais : [],
      maoObra: Array.isArray(base?.maoObra) ? base.maoObra : [],
      estruturas: Array.isArray(base?.estruturas) ? base.estruturas : [],
      regrasMaoObra: Array.isArray(base?.regrasMaoObra) ? base.regrasMaoObra : [],
      pontos: []
    };
  }

  cabecalhos(prefer = "") {
    const cabecalhos = {
      apikey: this.chaveAnonima,
      Authorization: `Bearer ${this.chaveAnonima}`,
      "Content-Type": "application/json"
    };
    if (prefer) cabecalhos.Prefer = prefer;
    return cabecalhos;
  }

  async carregar() {
    this.validarConfiguracao();
    if (!this.estaConfigurado()) return this.carregarBaseLocal();

    const resposta = await fetch(`${this.url}/rest/v1/bases_medicao?id=eq.${encodeURIComponent(this.idBase)}&select=dados`, {
      headers: this.cabecalhos()
    });
    if (!resposta.ok) throw new Error(`Falha ao carregar a base do Supabase (${resposta.status}).`);

    const registros = await resposta.json();
    if (registros[0]?.dados) {
      const base = this.basePersistente(registros[0].dados);
      this.ultimoConteudo = JSON.stringify(base);
      return base;
    }

    const baseInicial = await this.carregarBaseLocal();
    await this.salvarImediatamente(baseInicial);
    return baseInicial;
  }

  async carregarBaseLocal() {
    const resposta = await fetch("base-medicao.json", { cache: "no-store" });
    if (!resposta.ok) throw new Error("Nao foi possivel carregar base-medicao.json.");
    return this.basePersistente(await resposta.json());
  }

  salvar(base) {
    if (!this.estaConfigurado()) return;
    const persistente = this.basePersistente(base);
    const conteudo = JSON.stringify(persistente);
    if (conteudo === this.ultimoConteudo) return;

    window.clearTimeout(this.timerSalvar);
    this.timerSalvar = window.setTimeout(() => {
      this.filaSalvar = this.filaSalvar.then(() => this.salvarImediatamente(persistente)).catch((erro) => {
        console.error(erro);
        window.dispatchEvent(new CustomEvent("base-persistencia-erro", { detail: erro.message }));
      });
    }, 500);
  }

  async salvarImediatamente(base) {
    const persistente = this.basePersistente(base);
    const resposta = await fetch(`${this.url}/rest/v1/bases_medicao`, {
      method: "POST",
      headers: this.cabecalhos("resolution=merge-duplicates,return=minimal"),
      body: JSON.stringify({ id: this.idBase, dados: persistente })
    });
    if (!resposta.ok) throw new Error(`Falha ao salvar a base no Supabase (${resposta.status}).`);
    this.ultimoConteudo = JSON.stringify(persistente);
  }

  carregarTema() {
    return localStorage.getItem(RepositorioSupabase.chaveTema) || "claro";
  }

  salvarTema(tema) {
    localStorage.setItem(RepositorioSupabase.chaveTema, tema);
  }
}

function clonar(valor) {
  return JSON.parse(JSON.stringify(valor));
}

function criarIdentificadorUnico() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

const MAPA_REDE_LEGADA = { mono: "a", bi: "ab", tri: "abc" };

class MotorDeRegras {
  constructor(base) {
    this.base = base;
  }

  processar(pontos) {
    const materiaisInstalacao = new Map();
    const materiaisDesativacao = new Map();
    const maoObraInstalacao = new Map();
    const maoObraDesativacao = new Map();
    const maoObraReinstalacao = new Map();
    const pendenciasMaoObraCabos = [];

    for (const ponto of pontos) {
      const multiplicador = Number(ponto.quantidadePontos || 1);
      const destinoMaterial = ponto.operacao === "D" ? materiaisDesativacao : materiaisInstalacao;
      const destinoMaoObra = ponto.operacao === "D"
        ? maoObraDesativacao
        : ponto.operacao === "R"
          ? maoObraReinstalacao
          : maoObraInstalacao;

      if (ponto.operacao !== "R") {
        this.adicionarMateriaisDaEstrutura(destinoMaterial, ponto, multiplicador);
        this.adicionarMaterialDireto(destinoMaterial, ponto.posteId, multiplicador);
        this.adicionarCabosDoPonto(destinoMaterial, ponto);
      }

      this.aplicarRegras(destinoMaoObra, pendenciasMaoObraCabos, ponto, multiplicador);
    }

    this.consolidarPendenciasDeCabos(pendenciasMaoObraCabos);

    return {
      materiaisInstalacao: this.ordenarLinhas(materiaisInstalacao),
      materiaisDesativacao: this.ordenarLinhas(materiaisDesativacao),
      maoObraInstalacao: this.ordenarLinhas(maoObraInstalacao),
      maoObraDesativacao: this.ordenarLinhas(maoObraDesativacao),
      maoObraReinstalacao: this.ordenarLinhas(maoObraReinstalacao)
    };
  }

  adicionarMateriaisDaEstrutura(mapa, ponto, multiplicador) {
    for (const estrutura of this.estruturasDoPonto(ponto)) {
      for (const item of estrutura.itens) {
        this.adicionarMaterialDireto(mapa, item.materialId, Number(item.quantidade || 0) * multiplicador);
      }
    }
  }

  adicionarMaterialDireto(mapa, materialId, quantidade) {
    if (!materialId || quantidade <= 0) return;
    const material = this.base.materiais.find((item) => item.id === materialId);
    if (!material) return;
    this.somar(mapa, material.codigo, material.descricao, quantidade, material.unidade);
  }

  aplicarRegras(mapa, pendenciasMaoObraCabos, ponto, multiplicadorPonto) {
    for (const regra of this.base.regrasMaoObra) {
      if (!this.regraAtendePonto(regra, ponto)) continue;
      const materiaisGatilho = this.materiaisDeGatilho(regra, ponto);
      const estruturasContexto = this.tipoGatilhoRegra(regra) === "estrutura"
        ? this.estruturasDaRegraNoPonto(regra, ponto)
        : [this.estruturaDoPonto(ponto)];

      for (const estrutura of estruturasContexto) {
        for (const saida of regra.saidas) {
          const quantidadeSaida = Number(saida.quantidade || 0);
          const materiais = materiaisGatilho.length ? materiaisGatilho : [null];

          for (const material of materiais) {
            const descricaoBase = saida.templateDescricao || saida.descricao;
            const descricao = this.preencherDescricao(descricaoBase || "", material, estrutura, ponto.operacao, regra);

            if (material?.categoria === "cabo") {
              this.acumularRegraDeCabo(
                pendenciasMaoObraCabos,
                mapa,
                saida.codigo || "MO",
                descricao,
                quantidadeSaida * this.quantidadeBaseCabosDoPonto(ponto),
                1
              );
              continue;
            }

            this.somar(mapa, saida.codigo || "MO", descricao, quantidadeSaida * multiplicadorPonto, "un");
          }
        }
      }
    }
  }

  regraAtendePonto(regra, ponto) {
    if (regra.operacoes.length > 0 && !regra.operacoes.includes(ponto.operacao)) return false;
    const tipoGatilho = this.tipoGatilhoRegra(regra);
    if (tipoGatilho === "estrutura") {
      const estruturaIdsPonto = this.estruturaIdsDoPonto(ponto);
      if (!estruturaIdsPonto.length) return false;
      const ids = this.estruturaIdsDaRegra(regra);
      if (!ids.length) return true;
      return estruturaIdsPonto.some((id) => ids.includes(id));
    }
    if (tipoGatilho === "contexto") return Boolean(this.estruturaIdsDoPonto(ponto).length || ponto.posteId || ponto.caboBTId || ponto.caboMTId);

    const materiais = this.materiaisDeGatilho(regra, ponto);
    if (!materiais.length) return false;
    const materialIds = regra.gatilho?.materialIds ?? regra.materialIds ?? (regra.materialId ? [regra.materialId] : []);
    if (materialIds.length) return materiais.some((item) => materialIds.includes(item.id));
    if (regra.materialId) return materiais.some((item) => regra.materialId === item.id);
    return materiais.some((item) => regra.categorias?.includes(item.categoria));
  }

  materialDoGatilho(regra, ponto) {
    if (regra.materialId) {
      return this.materiaisDoPonto(ponto).find((item) => item.id === regra.materialId) || null;
    }

    if (regra.categorias?.includes("poste") && ponto.posteId) {
      return this.base.materiais.find((item) => item.id === ponto.posteId);
    }

    if (regra.categorias?.includes("cabo")) {
      return this.base.materiais.find((item) => item.id === ponto.caboBTId)
        || this.base.materiais.find((item) => item.id === ponto.caboMTId)
        || null;
    }

    if (regra.categorias?.includes("geral")) {
      return this.materiaisDoPonto(ponto).find((item) => item.categoria === "geral") || null;
    }

    return null;
  }

  materiaisDeGatilho(regra, ponto) {
    const idsMultiplos = regra.gatilho?.materialIds ?? regra.materialIds ?? [];
    if (idsMultiplos.length) {
      return this.materiaisDoPonto(ponto).filter((item) => idsMultiplos.includes(item.id));
    }

    if (regra.materialId) {
      const material = this.materiaisDoPonto(ponto).find((item) => item.id === regra.materialId);
      return material ? [material] : [];
    }

    const categorias = regra.gatilho?.categorias ?? regra.categorias ?? [];
    if (categorias.includes("cabo")) {
      const cabos = [ponto.caboBTId, ponto.caboMTId]
        .filter(Boolean)
        .map((id) => this.materialPorId(id))
        .filter((item) => item?.categoria === "cabo");
      return [...new Map(cabos.map((item) => [item.id, item])).values()];
    }

    const material = this.materialDoGatilho(regra, ponto);
    return material ? [material] : [];
  }

  materiaisDoPonto(ponto) {
    const ids = [];
    if (ponto.posteId) ids.push(ponto.posteId);
    if (ponto.caboBTId) ids.push(ponto.caboBTId);
    if (ponto.caboMTId) ids.push(ponto.caboMTId);

    for (const estrutura of this.estruturasDoPonto(ponto)) {
      ids.push(...estrutura.itens.map((item) => item.materialId));
    }

    const unicos = [...new Set(ids)];
    return unicos
      .map((id) => this.base.materiais.find((item) => item.id === id))
      .filter(Boolean);
  }

  estruturaDoPonto(ponto) {
    return this.base.estruturas.find((item) => item.id === ponto.estruturaId) || null;
  }

  estruturaIdsDoPonto(ponto) {
    return [ponto.estruturaId, ponto.estrutura2Id, ponto.estrutura3Id].filter(Boolean);
  }

  estruturasDoPonto(ponto) {
    return this.estruturaIdsDoPonto(ponto)
      .map((id) => this.base.estruturas.find((item) => item.id === id))
      .filter(Boolean);
  }

  estruturasDaRegraNoPonto(regra, ponto) {
    const ids = this.estruturaIdsDaRegra(regra);
    const estruturas = this.estruturasDoPonto(ponto);
    if (!ids.length) return estruturas;
    return estruturas.filter((estrutura) => ids.includes(estrutura.id));
  }

  estruturaIdsDaRegra(regra) {
    const ids = [
      ...(regra.gatilho?.estruturaIds || []),
      ...(regra.estruturaIds || []),
      regra.gatilho?.estruturaId,
      regra.estruturaId
    ].filter(Boolean);
    return [...new Set(ids)];
  }

  tipoGatilhoRegra(regra) {
    return regra.gatilho?.tipo || regra.tipoGatilho || "material";
  }

  quantidadeCabosDoPonto(ponto) {
    return this.quantidadeBaseCabosDoPonto(ponto);
  }

  quantidadeBaseCabosDoPonto(ponto) {
    return Number(ponto.quantidadeCabo || 0);
  }

  adicionarCabosDoPonto(mapa, ponto) {
    const quantidade = this.quantidadeBaseCabosDoPonto(ponto);
    const ids = [ponto.caboBTId, ponto.caboMTId].filter(Boolean);
    const unicos = [...new Set(ids)];
    unicos.forEach((id) => this.adicionarMaterialDireto(mapa, id, quantidade));
  }

  preencherDescricao(texto, material, estrutura, operacao, regra) {
    const nomesOperacao = { I: "INST", D: "DESATIVA", R: "REINST" };
    let descricao = texto
      .replace("{material}", material?.descricao?.toUpperCase() || "")
      .replace("{estrutura}", estrutura?.id || "")
      .replace("{estruturaDescricao}", estrutura?.descricao || "")
      .replace("{operacao}", nomesOperacao[operacao] || operacao);

    if (this.tipoGatilhoRegra(regra) === "estrutura" && !this.estruturaIdsDaRegra(regra).length && estrutura?.id && !texto.includes("{estrutura}")) {
      descricao = `${descricao} ${estrutura.id}`.trim();
    }

    return descricao;
  }

  somar(mapa, codigo, descricao, quantidade, unidade) {
    const chave = `${codigo}::${descricao}`;
    const atual = mapa.get(chave) || { codigo, descricao, quantidade: 0, unidade };
    atual.quantidade += quantidade;
    mapa.set(chave, atual);
  }

  ordenarLinhas(mapa) {
    return [...mapa.values()].sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR"));
  }

  acumularRegraDeCabo(pendencias, mapa, codigo, descricao, quantidadeBase, fatorRede) {
    if (quantidadeBase <= 0) return;
    const chave = `${codigo}::${descricao}::${fatorRede}`;
    const atual = pendencias.find((item) => item.chave === chave);
    if (atual) {
      atual.quantidadeBase += quantidadeBase;
      return;
    }

    pendencias.push({ chave, mapa, codigo, descricao, quantidadeBase, fatorRede });
  }

  consolidarPendenciasDeCabos(pendencias) {
    for (const item of pendencias) {
      this.somar(item.mapa, item.codigo, item.descricao, item.quantidadeBase * item.fatorRede, "un");
    }
  }
}

class CasosDeUsoApp {
  constructor(repositorio) {
    this.repositorio = repositorio;
  }

  carregarBase() {
    return this.repositorio.carregar();
  }

  salvarBase(base) {
    this.repositorio.salvar(base);
  }

  carregarTema() {
    return this.repositorio.carregarTema();
  }

  salvarTema(tema) {
    this.repositorio.salvarTema(tema);
  }

  gerarMedicao(base) {
    return new MotorDeRegras(base).processar(base.pontos);
  }
}

class AplicacaoMedicao {
  constructor(casosDeUso, baseInicial) {
    this.casosDeUso = casosDeUso;
    this.base = baseInicial;
    this.tema = this.casosDeUso.carregarTema();
    this.resultado = {
      materiaisInstalacao: [],
      materiaisDesativacao: [],
      maoObraInstalacao: [],
      maoObraDesativacao: [],
      maoObraReinstalacao: []
    };
    this.itensEstruturaTemporarios = [];
    this.saidasRegraPorOperacaoTemporarias = { I: [], D: [], R: [] };
    this.grupoRegraEdicaoId = "";
    this.regrasOriginaisGrupoEdicao = [];
    this.materiaisRegraSelecionados = [];
    this.filtrosResultado = { material: "I", maoObra: "I" };
    this.contextoSeletorItem = null;
    this.selecaoAtualSeletorItem = null;
    this.timersDebounce = {};
    this.pontoNovoEmFocoId = "";
    this.elementos = this.mapearElementos();
    this.normalizarBase();
    this.registrarEventos();
    window.addEventListener("base-persistencia-erro", (evento) => {
      this.mostrarAviso(evento.detail || "Nao foi possivel salvar no Supabase.");
    });
    this.renderizarTudo();
  }

  mapearElementos() {
    return {
      body: document.body,
      aviso: document.querySelector("#aviso"),
      abas: document.querySelectorAll(".aba"),
      acoesAbaMedicao: document.querySelector("#acoes-aba-medicao"),
      acoesAbaResultado: document.querySelector("#acoes-aba-resultado"),
      paineis: document.querySelectorAll(".painel-aba"),
      abasCadastro: document.querySelectorAll(".aba-cadastro"),
      paineisCadastro: document.querySelectorAll(".painel-cadastro"),
      listaPontos: document.querySelector("#lista-pontos"),
      adicionarPonto: document.querySelector("#adicionar-ponto"),
      zerarMedicao: document.querySelector("#zerar-medicao"),
      gerarMedicao: document.querySelector("#gerar-medicao"),
      totalPontos: document.querySelector("#total-pontos"),
      totalErros: document.querySelector("#total-erros"),
      alternarTema: document.querySelector("#alternar-tema"),
      formMaterial: document.querySelector("#form-material"),
      listaMateriais: document.querySelector("#lista-materiais"),
      filtroMateriais: document.querySelector("#filtro-materiais"),
      novoMaterial: document.querySelector("#novo-material"),
      formMaoObra: document.querySelector("#form-mao-obra"),
      listaMaoObra: document.querySelector("#lista-mao-obra"),
      filtroMaoObra: document.querySelector("#filtro-mao-obra"),
      novaMaoObra: document.querySelector("#nova-mao-obra"),
      formEstrutura: document.querySelector("#form-estrutura"),
      listaEstruturas: document.querySelector("#lista-estruturas"),
      filtroEstruturas: document.querySelector("#filtro-estruturas"),
      incluirItemEstrutura: document.querySelector("#incluir-item-estrutura"),
      itensEstrutura: document.querySelector("#itens-estrutura"),
      novaEstrutura: document.querySelector("#nova-estrutura"),
      formRegra: document.querySelector("#form-regra"),
      campoMaterialRegra: document.querySelector("#campo-material-regra"),
      itensMateriaisRegra: document.querySelector("#itens-materiais-regra"),
      buscaMaterialRegra: document.querySelector("#busca-material-regra"),
      opcoesMaterialRegra: document.querySelector("#opcoes-material-regra"),
      adicionarMaterialRegra: document.querySelector("#adicionar-material-regra"),
      buscaMaoObraRegra: document.querySelector("#busca-mao-obra-regra"),
      opcoesMaoObraRegra: document.querySelector("#opcoes-mao-obra-regra"),
      adicionarMaoObraRegra: document.querySelector("#adicionar-mao-obra-regra"),
      statusOperacaoRegra: document.querySelector("#status-operacao-regra"),
      saidasRegra: document.querySelector("#saidas-regra"),
      listaRegras: document.querySelector("#lista-regras"),
      filtroRegras: document.querySelector("#filtro-regras"),
      novaRegra: document.querySelector("#nova-regra"),
      resultadoMaterial: document.querySelector("#resultado-material"),
      resultadoMaoObra: document.querySelector("#resultado-mao-obra"),
      linhaResultadoMaterial: document.querySelector("#linha-resultado-material"),
      buscaResultadoMaterial: document.querySelector("#busca-resultado-material"),
      opcoesResultadoMaterial: document.querySelector("#opcoes-resultado-material"),
      quantidadeResultadoMaterial: document.querySelector("#quantidade-resultado-material"),
      confirmarResultadoMaterial: document.querySelector("#confirmar-resultado-material"),
      linhaResultadoMaoObra: document.querySelector("#linha-resultado-mao-obra"),
      buscaResultadoMaoObra: document.querySelector("#busca-resultado-mao-obra"),
      opcoesResultadoMaoObra: document.querySelector("#opcoes-resultado-mao-obra"),
      quantidadeResultadoMaoObra: document.querySelector("#quantidade-resultado-mao-obra"),
      confirmarResultadoMaoObra: document.querySelector("#confirmar-resultado-mao-obra"),
      abasResultado: document.querySelectorAll(".aba-resultado"),
      refreshResultado: document.querySelector("#refresh-resultado"),
      baixarJson: document.querySelector("#baixar-json"),
      baixarCsv: document.querySelector("#baixar-csv"),
      arquivoJson: document.querySelector("#arquivo-json"),
      modalMaterial: document.querySelector("#modal-material"),
      modalMaoObra: document.querySelector("#modal-mao-obra"),
      modalEstrutura: document.querySelector("#modal-estrutura"),
      modalRegra: document.querySelector("#modal-regra"),
      modalSeletorItem: document.querySelector("#modal-seletor-item"),
      tituloModalMaterial: document.querySelector("#titulo-modal-material"),
      tituloModalMaoObra: document.querySelector("#titulo-modal-mao-obra"),
      tituloModalEstrutura: document.querySelector("#titulo-modal-estrutura"),
      tituloModalRegra: document.querySelector("#titulo-modal-regra"),
      tituloModalSeletorItem: document.querySelector("#titulo-modal-seletor-item"),
      rotuloModalSeletorItem: document.querySelector("#rotulo-modal-seletor-item"),
      fecharModal: document.querySelectorAll("[data-fechar-modal]"),
      materialEstruturaStatus: document.querySelector("#material-estrutura-status"),
      datalistMateriaisEstrutura: document.querySelector("#materiais-estrutura"),
      formSeletorItem: document.querySelector("#form-seletor-item"),
      datalistSeletorItem: document.querySelector("#opcoes-seletor-item"),
      statusSeletorItem: document.querySelector("#status-seletor-item"),
      campoCodigoSeletorItem: document.querySelector("#campo-codigo-seletor-item"),
      campoDescricaoSeletorItem: document.querySelector("#campo-descricao-seletor-item"),
      campoQuantidadeSeletorItem: document.querySelector("#campo-quantidade-seletor-item"),
      confirmarSeletorItem: document.querySelector("#confirmar-seletor-item")
    };
  }

  registrarEventos() {
    this.elementos.abas.forEach((aba) => aba.addEventListener("click", () => this.abrirAba(aba.dataset.aba)));
    this.elementos.abasCadastro.forEach((aba) => aba.addEventListener("click", () => this.abrirAbaCadastro(aba.dataset.cadastro)));
    this.elementos.adicionarPonto.addEventListener("click", () => this.adicionarPonto());
    this.elementos.zerarMedicao.addEventListener("click", () => this.zerarMedicao());
    this.elementos.gerarMedicao.addEventListener("click", () => this.gerarMedicao());
    this.elementos.alternarTema.addEventListener("click", () => this.alternarTema());
    this.elementos.formMaterial.addEventListener("submit", (evento) => this.salvarMaterial(evento));
    this.elementos.formMaoObra.addEventListener("submit", (evento) => this.salvarMaoObra(evento));
    this.elementos.formEstrutura.addEventListener("submit", (evento) => this.salvarEstrutura(evento));
    this.elementos.formRegra.addEventListener("submit", (evento) => this.salvarRegra(evento));
    this.elementos.incluirItemEstrutura.addEventListener("click", () => this.incluirItemEstrutura());
    this.elementos.adicionarMaterialRegra.addEventListener("click", () => this.incluirMaterialRegraDireto());
    this.elementos.adicionarMaoObraRegra.addEventListener("click", () => this.incluirMaoObraRegraDireto());
    this.elementos.novoMaterial.addEventListener("click", () => this.abrirModalCadastro("material"));
    this.elementos.novaMaoObra.addEventListener("click", () => this.abrirModalCadastro("maoObra"));
    this.elementos.novaEstrutura.addEventListener("click", () => this.abrirModalCadastro("estrutura"));
    this.elementos.novaRegra.addEventListener("click", () => this.abrirModalCadastro("regra"));
    this.elementos.confirmarResultadoMaterial.addEventListener("click", () => this.incluirResultadoMaterialDireto());
    this.elementos.confirmarResultadoMaoObra.addEventListener("click", () => this.incluirResultadoMaoObraDireto());
    this.elementos.formMaterial.elements.categoria.addEventListener("change", () => this.atualizarFormularioMaterial());
    this.elementos.formRegra.elements.categoriaRegra.addEventListener("change", () => this.atualizarFormularioRegra());
    this.elementos.formRegra.querySelectorAll("input[name='operacoes']").forEach((item) => {
      item.addEventListener("change", () => this.renderizarItensTemporarios());
    });
    this.elementos.formEstrutura.elements.materialBusca.addEventListener("input", () => this.sincronizarBuscaMaterialEstrutura());
    this.elementos.formEstrutura.elements.materialBusca.addEventListener("change", () => this.sincronizarBuscaMaterialEstrutura());
    this.elementos.formEstrutura.elements.materialBusca.addEventListener("input", () => {
      this.atualizarDatalistInteligente(
        this.elementos.datalistMateriaisEstrutura,
        this.base.materiais,
        this.elementos.formEstrutura.elements.materialBusca.value
      );
    });
    this.elementos.buscaMaterialRegra?.addEventListener("input", () => this.atualizarOpcoesBuscaRegra());
    this.elementos.buscaMaoObraRegra?.addEventListener("input", () => this.atualizarOpcoesBuscaRegra());
    this.elementos.buscaResultadoMaterial?.addEventListener("input", () => this.atualizarOpcoesBuscaResultado());
    this.elementos.buscaResultadoMaoObra?.addEventListener("input", () => this.atualizarOpcoesBuscaResultado());
    this.elementos.buscaMaterialRegra?.addEventListener("keydown", (evento) => {
      if (evento.key === "Enter") {
        evento.preventDefault();
        this.incluirMaterialRegraDireto();
      }
    });
    this.elementos.buscaMaoObraRegra?.addEventListener("keydown", (evento) => {
      if (evento.key === "Enter") {
        evento.preventDefault();
        this.incluirMaoObraRegraDireto();
      }
    });
    this.elementos.buscaResultadoMaterial?.addEventListener("keydown", (evento) => {
      if (evento.key === "Enter") {
        evento.preventDefault();
        this.incluirResultadoMaterialDireto();
      }
    });
    this.elementos.buscaResultadoMaoObra?.addEventListener("keydown", (evento) => {
      if (evento.key === "Enter") {
        evento.preventDefault();
        this.incluirResultadoMaoObraDireto();
      }
    });
    this.elementos.formSeletorItem.addEventListener("submit", (evento) => this.confirmarSeletorItem(evento));
    this.elementos.formSeletorItem.elements.busca.addEventListener("input", () => {
      this.debounce("seletor-item", () => {
        this.atualizarDatalistSeletorItem(this.contextoSeletorItem);
        this.sincronizarSeletorItem();
      }, 120);
    });
    this.elementos.formSeletorItem.elements.busca.addEventListener("change", () => this.sincronizarSeletorItem());
    this.elementos.filtroMateriais?.addEventListener("input", () => {
      this.debounce("filtro-materiais", () => this.renderizarCadastros("materiais"), 120);
    });
    this.elementos.filtroEstruturas?.addEventListener("input", () => {
      this.debounce("filtro-estruturas", () => this.renderizarCadastros("estruturas"), 120);
    });
    this.elementos.filtroMaoObra?.addEventListener("input", () => {
      this.debounce("filtro-mao-obra", () => this.renderizarCadastros("maoObra"), 120);
    });
    this.elementos.filtroRegras?.addEventListener("input", () => {
      this.debounce("filtro-regras", () => this.renderizarCadastros("regras"), 120);
    });
    this.elementos.fecharModal.forEach((botao) => botao.addEventListener("click", () => this.fecharModalCadastro(botao.dataset.fecharModal)));
    [this.elementos.modalMaterial, this.elementos.modalMaoObra, this.elementos.modalEstrutura, this.elementos.modalRegra, this.elementos.modalSeletorItem].forEach((modal) => {
      modal.addEventListener("click", () => {
        // Modal nao fecha ao clicar fora. Fechamento apenas por botoes Fechar/Cancelar ou ESC.
      });
    });
    document.addEventListener("keydown", () => {
      // Modal nao fecha por ESC. Fechamento apenas por botoes Fechar/Cancelar.
    });
    this.elementos.abasResultado.forEach((aba) => aba.addEventListener("click", () => this.alterarResultado(aba)));
    this.elementos.refreshResultado?.addEventListener("click", () => this.atualizarMaoObraPorMateriaisResultado());
    this.elementos.baixarJson.addEventListener("click", () => {
      const baseExportada = { ...this.base, pontos: [] };
      this.baixarArquivo("base-medicao.json", JSON.stringify(baseExportada, null, 2), "application/json");
    });
    this.elementos.baixarCsv.addEventListener("click", () => this.baixarExcel());
    this.elementos.arquivoJson.addEventListener("change", (evento) => this.importarJson(evento));
    this.elementos.listaMateriais.addEventListener("click", (evento) => this.tratarCliqueCadastro(evento));
    this.elementos.listaEstruturas.addEventListener("click", (evento) => this.tratarCliqueCadastro(evento));
    this.elementos.listaMaoObra.addEventListener("click", (evento) => this.tratarCliqueCadastro(evento));
    this.elementos.listaRegras.addEventListener("click", (evento) => this.tratarCliqueCadastro(evento));
    const abaAtivaInicial = document.querySelector(".aba.ativa")?.dataset.aba || "medicao";
    this.abrirAba(abaAtivaInicial);
  }

  debounce(chave, callback, atraso = 100) {
    window.clearTimeout(this.timersDebounce[chave]);
    this.timersDebounce[chave] = window.setTimeout(callback, atraso);
  }

  tratarCliqueCadastro(evento) {
    const botaoEditar = evento.target.closest("[data-editar]");
    if (botaoEditar) {
      this.editarCadastro(botaoEditar.dataset.tipo, botaoEditar.dataset.editar);
      return;
    }
    const botaoExcluir = evento.target.closest("[data-excluir]");
    if (botaoExcluir) {
      this.excluirCadastro(botaoExcluir.dataset.tipo, botaoExcluir.dataset.excluir);
    }
  }

  abrirAba(nome) {
    this.elementos.abas.forEach((aba) => aba.classList.toggle("ativa", aba.dataset.aba === nome));
    this.elementos.paineis.forEach((painel) => painel.classList.toggle("ativo", painel.id === `aba-${nome}`));
    if (this.elementos.acoesAbaMedicao) {
      this.elementos.acoesAbaMedicao.classList.toggle("oculto", nome !== "medicao");
    }
    if (this.elementos.acoesAbaResultado) {
      this.elementos.acoesAbaResultado.classList.toggle("oculto", nome !== "resultado");
    }
  }

  abrirAbaCadastro(nome) {
    this.elementos.abasCadastro.forEach((aba) => aba.classList.toggle("ativa", aba.dataset.cadastro === nome));
    this.elementos.paineisCadastro.forEach((painel) => painel.classList.toggle("ativo", painel.dataset.cadastroPainel === nome));
    this.elementos.novoMaterial?.classList.toggle("oculto", nome !== "materiais");
    this.elementos.novaEstrutura?.classList.toggle("oculto", nome !== "estruturas");
    this.elementos.novaMaoObra?.classList.toggle("oculto", nome !== "mao-obra");
  }

  renderizarTudo() {
    this.aplicarTema();
    this.renderizarPontos();
    this.renderizarSelects();
    this.renderizarCadastros();
    this.renderizarItensTemporarios();
    this.renderizarResultado();
    this.atualizarFormularioMaterial();
    this.atualizarFormularioRegra();
    this.atualizarStatusMaterialEstrutura();
    this.casosDeUso.salvarBase(this.base);
  }

  renderizarPontos() {
    this.elementos.listaPontos.innerHTML = "";
    const erros = this.validarPontos();

    this.base.pontos.forEach((ponto, indice) => {
      const linha = document.createElement("tr");
      linha.dataset.pontoId = ponto.id;
      linha.className = [
        erros.has(ponto.id) ? "erro-linha" : "",
        ponto.id === this.pontoNovoEmFocoId ? "ponto-novo-evidencia" : ""
      ].filter(Boolean).join(" ");
      linha.innerHTML = `
        <td data-coluna="Ponto"><input data-campo="numero" data-indice="${indice}" type="text" inputmode="numeric" maxlength="5" value="${ponto.numero}"></td>
        <td data-coluna="Operacao">${this.selectOperacao(ponto.operacao, indice)}</td>
        <td data-coluna="Estrutura">${this.inputBuscaPonto("estruturaId", this.base.estruturas, ponto.estruturaId, indice, "opcoes-estruturas-ponto")}</td>
        <td data-coluna="Estrutura 2">${this.inputBuscaPonto("estrutura2Id", this.base.estruturas, ponto.estrutura2Id, indice, "opcoes-estruturas-ponto")}</td>
        <td data-coluna="Estrutura 3">${this.inputBuscaPonto("estrutura3Id", this.base.estruturas, ponto.estrutura3Id, indice, "opcoes-estruturas-ponto")}</td>
        <td data-coluna="Poste">${this.inputBuscaPonto("posteId", this.materiaisPorCategoria("poste"), ponto.posteId, indice, "opcoes-postes-ponto")}</td>
        <td data-coluna="Cabo BT">${this.inputBuscaPonto("caboBTId", this.materiaisPorCategoria("cabo"), ponto.caboBTId, indice, "opcoes-cabos-bt-ponto")}</td>
        <td data-coluna="Cabo MT">${this.inputBuscaPonto("caboMTId", this.materiaisPorCategoria("cabo"), ponto.caboMTId, indice, "opcoes-cabos-mt-ponto")}</td>
        <td data-coluna="Qtd. cabo"><input data-campo="quantidadeCabo" data-indice="${indice}" type="number" min="0" step="0.01" value="${ponto.quantidadeCabo || ""}"></td>
        <td data-coluna="Acao"><button class="botao perigo" data-remover-ponto="${indice}" type="button">Remover</button></td>
      `;
      this.elementos.listaPontos.append(linha);
    });

    this.elementos.listaPontos.querySelectorAll("[data-campo]").forEach((campo) => {
      campo.addEventListener("change", () => this.atualizarPonto(campo));
    });
    this.elementos.listaPontos.querySelectorAll("[data-busca-ponto]").forEach((campo) => {
      campo.addEventListener("change", () => {
        delete campo.dataset.confirmarBuscaComEnter;
        this.atualizarPontoPorBusca(campo);
      });
      campo.addEventListener("input", () => this.atualizarOpcoesBuscaPonto(campo));
      campo.addEventListener("keydown", (evento) => {
        if (evento.key === "Enter") campo.dataset.confirmarBuscaComEnter = "1";
      });
      campo.addEventListener("keyup", (evento) => {
        if (evento.key !== "Enter" || campo.dataset.confirmarBuscaComEnter !== "1") return;
        delete campo.dataset.confirmarBuscaComEnter;
        this.atualizarPontoPorBusca(campo);
      });
    });
    this.elementos.listaPontos.querySelectorAll("[data-remover-ponto]").forEach((botao) => {
      botao.addEventListener("click", () => this.removerPonto(Number(botao.dataset.removerPonto)));
    });

    if (this.elementos.totalPontos) this.elementos.totalPontos.textContent = String(this.base.pontos.length);
    if (this.elementos.totalErros) this.elementos.totalErros.textContent = String(erros.size);
    this.focarPontoNovo();
  }

  focarPontoNovo() {
    if (!this.pontoNovoEmFocoId) return;

    const linha = this.elementos.listaPontos.querySelector(`[data-ponto-id="${this.pontoNovoEmFocoId}"]`);
    this.pontoNovoEmFocoId = "";
    if (!linha) return;

    window.requestAnimationFrame(() => {
      const container = linha.closest(".tabela-container");
      if (container) container.scrollLeft = 0;
      linha.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });

      const campoPonto = linha.querySelector('[data-campo="numero"]');
      if (campoPonto) {
        campoPonto.focus({ preventScroll: true });
        campoPonto.select();
      }

      window.setTimeout(() => linha.classList.remove("ponto-novo-evidencia"), 2200);
    });
  }

  selectOperacao(valor, indice) {
    return `
      <select data-campo="operacao" data-indice="${indice}">
        ${["I", "D", "R"].map((opcao) => `<option value="${opcao}" ${valor === opcao ? "selected" : ""}>${opcao}</option>`).join("")}
      </select>
    `;
  }

  selectGenerico(campo, itens, valor, indice, label, vazio = false) {
    const opcoes = vazio ? [`<option value="">Selecione</option>`] : [];
    opcoes.push(...itens.map((item) => `<option value="${item.id}" ${valor === item.id ? "selected" : ""}>${item[label] || item.id}</option>`));
    return `<select data-campo="${campo}" data-indice="${indice}">${opcoes.join("")}</select>`;
  }

  inputBuscaPonto(campo, itens, valor, indice, datalistId) {
    const itemSelecionado = itens.find((item) => item.id === valor);
    const texto = itemSelecionado ? `${itemSelecionado.descricao || itemSelecionado.id}` : "";
    return `<input data-busca-ponto="${campo}" data-indice="${indice}" list="${datalistId}" value="${texto}" placeholder="Digite descricao" />`;
  }

  atualizarPonto(campo) {
    const indice = Number(campo.dataset.indice);
    const ponto = this.base.pontos[indice];
    const valor = campo.dataset.campo === "quantidadeCabo" ? Number(campo.value) : campo.value;
    ponto[campo.dataset.campo] = valor;

    if (campo.dataset.campo === "caboBTId" || campo.dataset.campo === "caboMTId") {
      const temCabo = ponto.caboBTId || ponto.caboMTId;
      if (!temCabo) {
        ponto.quantidadeCabo = 0;
        const campoQuantidade = campo.closest("tr")?.querySelector('[data-campo="quantidadeCabo"]');
        if (campoQuantidade) campoQuantidade.value = "";
      }
    }

    this.atualizarEstadoVisualPonto(indice);
    this.casosDeUso.salvarBase(this.base);
  }

  atualizarPontoPorBusca(campo) {
    const indice = Number(campo.dataset.indice);
    const ponto = this.base.pontos[indice];
    const campoId = campo.dataset.buscaPonto;
    const itens = this.opcoesBuscaPonto(campoId);
    const encontrado = this.itemPorBusca(itens, campo.value);
    if (encontrado) {
      ponto[campoId] = encontrado.id;
      campo.value = encontrado.descricao || encontrado.id;
    } else {
      ponto[campoId] = "";
    }

    if (campoId === "caboBTId" || campoId === "caboMTId") {
      const temCabo = ponto.caboBTId || ponto.caboMTId;
      if (!temCabo) {
        ponto.quantidadeCabo = 0;
        const campoQuantidade = campo.closest("tr")?.querySelector('[data-campo="quantidadeCabo"]');
        if (campoQuantidade) campoQuantidade.value = "";
      }
    }

    this.atualizarEstadoVisualPonto(indice);
    this.casosDeUso.salvarBase(this.base);
  }

  atualizarEstadoVisualPonto(indice) {
    const ponto = this.base.pontos[indice];
    const linha = this.elementos.listaPontos.querySelector(`[data-ponto-id="${ponto?.id}"]`);
    if (!ponto || !linha) return;

    const erros = this.validarPontos();
    linha.classList.toggle("erro-linha", erros.has(ponto.id));
    if (this.elementos.totalErros) this.elementos.totalErros.textContent = String(erros.size);
  }

  opcoesBuscaPonto(campoId) {
    if (["estruturaId", "estrutura2Id", "estrutura3Id"].includes(campoId)) return this.base.estruturas;
    if (campoId === "posteId") return this.materiaisPorCategoria("poste");
    if (campoId === "caboBTId" || campoId === "caboMTId") return this.materiaisPorCategoria("cabo");
    return [];
  }

  atualizarOpcoesBuscaPonto(campo) {
    const datalist = document.querySelector(`#${campo.getAttribute("list")}`);
    this.atualizarDatalistInteligente(datalist, this.opcoesBuscaPonto(campo.dataset.buscaPonto), campo.value);
  }

  adicionarPonto() {
    const id = criarIdentificadorUnico();
    this.base.pontos.push({
      id,
      numero: this.obterProximoNumeroPonto(),
      operacao: "I",
      estruturaId: "",
      estrutura2Id: "",
      estrutura3Id: "",
      posteId: "",
      caboBTId: "",
      caboMTId: "",
      quantidadeCabo: 0,
      rede: "",
      quantidadePontos: 1
    });
    this.pontoNovoEmFocoId = id;
    this.renderizarTudo();
  }

  zerarMedicao() {
    if (!this.base.pontos.length && !this.temResultadoGerado()) {
      this.mostrarAviso("A medicao ja esta zerada.");
      return;
    }

    const confirmar = window.confirm("Zerar a medicao? Todos os pontos e o resultado atual serao limpos.");
    if (!confirmar) return;

    this.base.pontos = [];
    this.pontoNovoEmFocoId = "";
    this.resultado = this.resultadoVazio();
    this.renderizarTudo();
    this.mostrarAviso("Medicao zerada com sucesso.");
  }

  resultadoVazio() {
    return {
      materiaisInstalacao: [],
      materiaisDesativacao: [],
      maoObraInstalacao: [],
      maoObraDesativacao: [],
      maoObraReinstalacao: []
    };
  }

  temResultadoGerado() {
    return Object.values(this.resultado || {}).some((linhas) => Array.isArray(linhas) && linhas.length > 0);
  }

  removerPonto(indice) {
    this.base.pontos.splice(indice, 1);
    this.renderizarTudo();
  }

  validarPontos() {
    const erros = new Set();
    for (const ponto of this.base.pontos) {
      if (!this.extrairNumeroBaseDoPonto(ponto.numero) || !ponto.operacao) erros.add(ponto.id);
      if ((ponto.caboBTId || ponto.caboMTId) && Number(ponto.quantidadeCabo || 0) <= 0) erros.add(ponto.id);
    }
    return erros;
  }

  extrairNumeroBaseDoPonto(valor) {
    const texto = String(valor || "").trim();
    const correspondente = texto.match(/\d+/);
    return correspondente ? Number(correspondente[0]) : 0;
  }

  obterProximoNumeroPonto() {
    if (!this.base.pontos.length) return "1";
    const ultimo = this.base.pontos[this.base.pontos.length - 1];
    const ultimoNumero = this.extrairNumeroBaseDoPonto(ultimo?.numero);
    const base = ultimoNumero > 0 ? ultimoNumero : this.base.pontos.length;
    return String(base + 1);
  }

  renderizarSelects() {
    this.atualizarDatalistInteligente(this.elementos.datalistMateriaisEstrutura, this.base.materiais);
    const datalistEstruturas = document.querySelector("#opcoes-estruturas-ponto");
    const datalistPostes = document.querySelector("#opcoes-postes-ponto");
    const datalistCabosBt = document.querySelector("#opcoes-cabos-bt-ponto");
    const datalistCabosMt = document.querySelector("#opcoes-cabos-mt-ponto");
    this.atualizarDatalistInteligente(datalistEstruturas, this.base.estruturas);
    this.atualizarDatalistInteligente(datalistPostes, this.materiaisPorCategoria("poste"));
    this.atualizarDatalistInteligente(datalistCabosBt, this.materiaisPorCategoria("cabo"));
    this.atualizarDatalistInteligente(datalistCabosMt, this.materiaisPorCategoria("cabo"));
    const materiaisGerais = this.materiaisPorCategoria("geral");
    this.elementos.formRegra.elements.materialId.innerHTML = `<option value="">Selecione</option>${materiaisGerais.map((item) => `<option value="${item.id}">${item.descricao}</option>`).join("")}`;
    this.atualizarOpcoesBuscaRegra();
    this.atualizarOpcoesBuscaResultado();
    this.renderizarSeletoresRegra();
  }

  renderizarSeletoresRegra() {
    const categoria = this.elementos.formRegra.elements.categoriaRegra.value;
    this.elementos.itensMateriaisRegra.innerHTML = this.materiaisRegraSelecionados.map((id, indice) => {
      if (categoria === "estrutura") {
        const estrutura = this.base.estruturas.find((item) => item.id === id);
        return `<div class="item-temporario"><span>${estrutura?.descricao || ""}</span><button data-remover-material-regra="${indice}" type="button">Remover</button></div>`;
      }
      const material = this.materialPorId(id);
      return `<div class="item-temporario"><span>${material?.descricao || ""}</span><button data-remover-material-regra="${indice}" type="button">Remover</button></div>`;
    }).join("");

    this.elementos.itensMateriaisRegra.querySelectorAll("[data-remover-material-regra]").forEach((botao) => {
      botao.addEventListener("click", () => {
        this.materiaisRegraSelecionados.splice(Number(botao.dataset.removerMaterialRegra), 1);
        this.renderizarSeletoresRegra();
      });
    });
  }

  atualizarFormularioMaterial() {
    // Sem configuracoes adicionais para categoria cabo.
  }

  atualizarFormularioRegra() {
    this.elementos.campoMaterialRegra.classList.remove("oculto");
    this.atualizarOpcoesBuscaRegra();
    this.renderizarSeletoresRegra();
    this.renderizarItensTemporarios();
  }

  operacoesRegraSelecionadas() {
    return [...this.elementos.formRegra.querySelectorAll("input[name='operacoes']:checked")].map((item) => item.value);
  }

  saidasRegraDaOperacao(operacao) {
    if (!this.saidasRegraPorOperacaoTemporarias[operacao]) this.saidasRegraPorOperacaoTemporarias[operacao] = [];
    return this.saidasRegraPorOperacaoTemporarias[operacao];
  }

  operacaoRegraAtiva() {
    const operacoes = this.operacoesRegraSelecionadas();
    return operacoes.length === 1 ? operacoes[0] : null;
  }

  itemPorBusca(itens, textoBusca) {
    const termo = this.normalizarTexto(textoBusca);
    if (!termo) return null;

    const correspondenciaExata = itens.find((item) => {
      const descricao = this.normalizarTexto(item.descricao);
      const codigo = this.normalizarTexto(item.codigo);
      const id = this.normalizarTexto(item.id);
      return descricao === termo || codigo === termo || id === termo;
    });
    if (correspondenciaExata) return correspondenciaExata;

    return itens.find((item) => this.correspondeBuscaCatalogo(item, termo)) || null;
  }

  atualizarOpcoesBuscaRegra() {
    const categoria = this.elementos.formRegra.elements.categoriaRegra.value;
    let itens = [];
    if (categoria === "estrutura") itens = this.base.estruturas;
    if (categoria === "poste") itens = this.materiaisPorCategoria("poste");
    if (categoria === "cabo") itens = this.materiaisPorCategoria("cabo");
    if (categoria === "geral") itens = this.materiaisPorCategoria("geral");
    this.atualizarDatalistInteligente(this.elementos.opcoesMaterialRegra, itens, this.elementos.buscaMaterialRegra?.value);
    this.atualizarDatalistInteligente(this.elementos.opcoesMaoObraRegra, this.base.maoObra, this.elementos.buscaMaoObraRegra?.value);
  }

  atualizarOpcoesBuscaResultado() {
    this.atualizarDatalistInteligente(this.elementos.opcoesResultadoMaterial, this.base.materiais, this.elementos.buscaResultadoMaterial?.value);
    this.atualizarDatalistInteligente(this.elementos.opcoesResultadoMaoObra, this.base.maoObra, this.elementos.buscaResultadoMaoObra?.value);
  }

  renderizarCadastros(alvo = "todos") {
    const termoMateriais = this.normalizarTexto(this.elementos.filtroMateriais?.value || "");
    const termoEstruturas = this.normalizarTexto(this.elementos.filtroEstruturas?.value || "");
    const termoMaoObra = this.normalizarTexto(this.elementos.filtroMaoObra?.value || "");
    const termoRegras = this.normalizarTexto(this.elementos.filtroRegras?.value || "");

    if (alvo === "todos" || alvo === "materiais") {
      const materiaisFiltrados = termoMateriais
        ? this.base.materiais.filter((material) => this.correspondeBuscaCatalogo(material, termoMateriais))
        : this.base.materiais;
      this.elementos.listaMateriais.innerHTML = materiaisFiltrados.map((material) => this.cartaoCadastro(
        material.id,
        material.descricao,
        `${material.codigo} | ${material.unidade} | ${material.categoria}`,
        "material"
      )).join("");
    }

    if (alvo === "todos" || alvo === "estruturas") {
      const estruturasFiltradas = termoEstruturas
        ? this.base.estruturas.filter((estrutura) => this.correspondeBuscaCatalogo(estrutura, termoEstruturas))
        : this.base.estruturas;
      this.elementos.listaEstruturas.innerHTML = estruturasFiltradas.map((estrutura) => this.cartaoCadastro(
        estrutura.id,
        estrutura.descricao,
        `${estrutura.itens.length} materiais vinculados`,
        "estrutura"
      )).join("");
    }

    if (alvo === "todos" || alvo === "maoObra") {
      const maoObraFiltrada = termoMaoObra
        ? this.base.maoObra.filter((item) => this.correspondeBuscaCatalogo(item, termoMaoObra))
        : this.base.maoObra;
      this.elementos.listaMaoObra.innerHTML = maoObraFiltrada.map((item) => this.cartaoCadastro(
        item.id,
        item.descricao,
        `${item.codigo} | ${item.unidade}`,
        "maoObra"
      )).join("");
    }

    if (alvo === "todos" || alvo === "regras") {
      const regrasFiltradas = termoRegras
        ? this.base.regrasMaoObra.filter((regra) => this.correspondeBuscaRegra(regra, termoRegras))
        : this.base.regrasMaoObra;
      this.elementos.listaRegras.innerHTML = regrasFiltradas.map((regra) => this.cartaoCadastro(
        regra.id,
        regra.nome,
        `${regra.operacoes.join(", ")} | ${this.resumoRegra(regra)} | ${regra.saidas.length} saidas`,
        "regra"
      )).join("");
    }
  }

  cartaoCadastro(id, titulo, detalhe, tipo) {
    return `
      <div class="cartao-item">
        <div><strong>${titulo}</strong><span>${detalhe}</span></div>
        <div class="mini-acoes">
          <button data-tipo="${tipo}" data-editar="${id}" type="button">Editar</button>
          <button data-tipo="${tipo}" data-excluir="${id}" type="button">Excluir</button>
        </div>
      </div>
    `;
  }

  salvarMaterial(evento) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    const material = {
      id: dados.get("id") || this.criarId(dados.get("descricao")),
      codigo: dados.get("codigo"),
      descricao: dados.get("descricao"),
      unidade: dados.get("unidade"),
      categoria: dados.get("categoria")
    };

    this.salvarPorId(this.base.materiais, material);
    this.limparFormularioMaterial();
    this.fecharModalCadastro("material");
    this.renderizarTudo();
    this.mostrarAviso("Material salvo.");
  }

  salvarMaoObra(evento) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    const descricao = String(dados.get("descricao") || "").trim();
    if (!descricao) return this.mostrarAviso("Informe a descricao da mao de obra.");

    this.salvarMaoObraCatalogo({
      id: String(dados.get("id") || "").trim(),
      codigo: String(dados.get("codigo") || "").trim(),
      descricao,
      unidade: String(dados.get("unidade") || "un").trim() || "un"
    });

    this.limparFormularioMaoObra();
    this.fecharModalCadastro("maoObra");
    this.renderizarTudo();
    this.mostrarAviso("Mao de obra salva.");
  }

  incluirItemEstrutura() {
    const form = this.elementos.formEstrutura;
    const materialId = form.elements.materialId.value;
    const quantidade = Number(form.elements.quantidade.value || 0);
    if (!materialId || quantidade <= 0) return this.mostrarAviso("Informe material e quantidade da estrutura.");
    this.itensEstruturaTemporarios.push({ materialId, quantidade });
    form.elements.materialBusca.value = "";
    form.elements.materialId.value = "";
    form.elements.quantidade.value = 1;
    this.atualizarStatusMaterialEstrutura();
    this.renderizarItensTemporarios();
  }

  salvarEstrutura(evento) {
    evento.preventDefault();
    const form = evento.currentTarget;
    const idOriginal = form.elements.idOriginal.value || form.elements.id.value;
    const estrutura = {
      id: form.elements.id.value.trim(),
      descricao: form.elements.descricao.value.trim(),
      itens: this.itensEstruturaTemporarios
    };
    if (!estrutura.itens.length) return this.mostrarAviso("Inclua pelo menos um material na estrutura.");
    this.base.estruturas = this.base.estruturas.filter((item) => item.id !== idOriginal);
    this.base.estruturas.push(estrutura);
    this.limparFormularioEstrutura();
    this.fecharModalCadastro("estrutura");
    this.renderizarTudo();
    this.mostrarAviso("Estrutura salva.");
  }

  incluirSaidaRegra() {
    if (!this.operacaoRegraAtiva()) {
      return this.mostrarAviso("Marque apenas uma operacao (I, D ou R) para incluir mao de obra.");
    }
    this.abrirSeletorItem("regra-mao-obra");
  }

  incluirMaterialRegraDireto() {
    const categoria = this.elementos.formRegra.elements.categoriaRegra.value;
    const texto = this.elementos.buscaMaterialRegra.value.trim();
    let itens = [];
    if (categoria === "estrutura") itens = this.base.estruturas;
    if (categoria === "poste") itens = this.materiaisPorCategoria("poste");
    if (categoria === "cabo") itens = this.materiaisPorCategoria("cabo");
    if (categoria === "geral") itens = this.materiaisPorCategoria("geral");
    const selecionado = this.itemPorBusca(itens, texto);
    if (!selecionado) return this.mostrarAviso("Selecione um item valido.");

    const nomeSelecionado = this.normalizarTexto(selecionado.descricao || "");
    const jaExisteMesmoNome = this.materiaisRegraSelecionados.some((id) => {
      const itemAtual = categoria === "estrutura"
        ? this.base.estruturas.find((estrutura) => estrutura.id === id)
        : this.materialPorId(id);
      return this.normalizarTexto(itemAtual?.descricao || "") === nomeSelecionado;
    });
    if (jaExisteMesmoNome) return this.mostrarAviso("Item com mesmo nome ja foi selecionado.");

    this.materiaisRegraSelecionados.push(selecionado.id);
    this.elementos.buscaMaterialRegra.value = "";
    this.renderizarSeletoresRegra();
    return this.mostrarAviso("Item adicionado na regra.");
  }

  incluirMaoObraRegraDireto() {
    const operacaoAtiva = this.operacaoRegraAtiva();
    if (!operacaoAtiva) return this.mostrarAviso("Marque apenas uma operacao (I, D ou R) para incluir mao de obra.");
    const texto = this.elementos.buscaMaoObraRegra.value.trim();
    const selecionado = this.itemPorBusca(this.base.maoObra, texto);
    if (!selecionado) return this.mostrarAviso("Selecione uma mao de obra valida.");
    const saidasOperacao = this.saidasRegraDaOperacao(operacaoAtiva);
    if (saidasOperacao.some((item) => item.maoObraId === selecionado.id)) {
      return this.mostrarAviso("Mao de obra ja adicionada na regra.");
    }
    const categoriaRegra = this.elementos.formRegra.elements.categoriaRegra.value;
    const quantidadeSaida = categoriaRegra === "cabo" ? 1 : 1;
    saidasOperacao.push({
      maoObraId: selecionado.id,
      codigo: selecionado.codigo,
      descricao: selecionado.descricao,
      quantidade: quantidadeSaida
    });
    this.elementos.buscaMaoObraRegra.value = "";
    this.renderizarItensTemporarios();
    return this.mostrarAviso("Mao de obra adicionada na regra.");
  }

  incluirResultadoMaterialDireto() {
    const texto = this.elementos.buscaResultadoMaterial.value.trim();
    const selecionado = this.itemPorBusca(this.base.materiais, texto);
    if (!selecionado) return this.mostrarAviso("Selecione um material valido.");
    const quantidade = Number(this.elementos.quantidadeResultadoMaterial.value || 0);
    if (quantidade <= 0) return this.mostrarAviso("Informe uma quantidade valida.");
    this.adicionarLinhaManualAoResultado(this.grupoResultadoMaterialAtual(), selecionado, quantidade);
    this.elementos.buscaResultadoMaterial.value = "";
    this.elementos.quantidadeResultadoMaterial.value = 1;
    this.renderizarResultado();
    return this.mostrarAviso("Material adicionado ao resultado.");
  }

  incluirResultadoMaoObraDireto() {
    const texto = this.elementos.buscaResultadoMaoObra.value.trim();
    const selecionado = this.itemPorBusca(this.base.maoObra, texto);
    if (!selecionado) return this.mostrarAviso("Selecione uma mao de obra valida.");
    const quantidade = Number(this.elementos.quantidadeResultadoMaoObra.value || 0);
    if (quantidade <= 0) return this.mostrarAviso("Informe uma quantidade valida.");
    this.adicionarLinhaManualAoResultado(this.grupoResultadoMaoObraAtual(), selecionado, quantidade);
    this.elementos.buscaResultadoMaoObra.value = "";
    this.elementos.quantidadeResultadoMaoObra.value = 1;
    this.renderizarResultado();
    return this.mostrarAviso("Mao de obra adicionada ao resultado.");
  }

  salvarRegra(evento) {
    evento.preventDefault();
    const form = evento.currentTarget;
    const nome = String(form.elements.nome.value || "").trim();
    if (!nome) return this.mostrarAviso("Nome da regra e obrigatorio.");
    const operacoes = this.operacoesRegraSelecionadas();
    const categoria = form.elements.categoriaRegra.value;
    const materialIds = [...new Set(this.materiaisRegraSelecionados)];
    const estruturaIds = categoria === "estrutura" ? [...new Set(this.materiaisRegraSelecionados)] : [];
    if (!operacoes.length) return this.mostrarAviso("Selecione ao menos uma operacao.");
    if ((categoria === "poste" || categoria === "cabo" || categoria === "geral") && !materialIds.length) return this.mostrarAviso("Selecione ao menos um material.");
    if (categoria === "estrutura" && !estruturaIds.length) return this.mostrarAviso("Selecione ao menos uma estrutura.");
    const saidasPorOperacao = {};
    for (const operacao of operacoes) {
      const saidasNormalizadas = clonar(this.saidasRegraDaOperacao(operacao)).map((saida) => ({
        ...saida,
        quantidade: categoria === "cabo" ? 1 : Number(saida.quantidade || 0)
      }));
      if (!saidasNormalizadas.length) return this.mostrarAviso(`Inclua pelo menos uma saida de mao de obra para ${operacao}.`);
      saidasPorOperacao[operacao] = saidasNormalizadas;
    }

    const grupoRegraId = this.grupoRegraEdicaoId || this.criarIdUnico(this.base.regrasMaoObra, `${nome}_grupo`);
    const regrasGrupoAnteriores = this.grupoRegraEdicaoId
      ? this.base.regrasMaoObra.filter((item) => item.grupoRegraId === this.grupoRegraEdicaoId)
      : [];
    const regraAntigaPorOperacao = Object.fromEntries(regrasGrupoAnteriores.map((regra) => [regra.operacoes?.[0], regra]));
    const regrasAtualizadas = [];

    operacoes.forEach((operacao) => {
      const regraAntiga = regraAntigaPorOperacao[operacao];
      const idRegra = regraAntiga?.id || this.criarIdUnico(this.base.regrasMaoObra, `${nome}_${operacao}`);
      regrasAtualizadas.push({
        id: idRegra,
        nome: `${nome} [${operacao}]`,
        nomeBaseGrupo: nome,
        grupoRegraId,
        tipoGatilho: categoria === "estrutura" ? "estrutura" : "material",
        materialId: categoria === "geral" ? (materialIds[0] || null) : null,
        materialIds: categoria === "estrutura" ? [] : materialIds,
        estruturaId: null,
        estruturaIds: categoria === "estrutura" ? estruturaIds : [],
        categorias: categoria === "estrutura" ? [] : [categoria],
        gatilho: {
          tipo: categoria === "estrutura" ? "estrutura" : "material",
          materialId: categoria === "geral" ? (materialIds[0] || undefined) : undefined,
          materialIds: categoria === "estrutura" ? [] : materialIds,
          estruturaIds: categoria === "estrutura" ? estruturaIds : [],
          categorias: categoria === "estrutura" ? [] : [categoria]
        },
        operacoes: [operacao],
        saidas: saidasPorOperacao[operacao]
      });
    });

    if (this.grupoRegraEdicaoId) {
      this.base.regrasMaoObra = this.base.regrasMaoObra.filter((item) => item.grupoRegraId !== this.grupoRegraEdicaoId);
    }
    regrasAtualizadas.forEach((regra) => this.salvarPorId(this.base.regrasMaoObra, regra));
    this.limparFormularioRegra();
    this.fecharModalCadastro("regra");
    this.renderizarTudo();
    this.mostrarAviso(`Pacote de regra salvo (${operacoes.join("/")}).`);
  }

  renderizarItensTemporarios() {
    this.elementos.itensEstrutura.innerHTML = this.itensEstruturaTemporarios.map((item, indice) => {
      const material = this.materialPorId(item.materialId);
      return `<div class="item-temporario"><span>${material?.descricao || item.materialId} | ${item.quantidade}</span><button data-remover-item-estrutura="${indice}" type="button">Remover</button></div>`;
    }).join("");

    const operacoesSelecionadas = this.operacoesRegraSelecionadas();
    const operacaoAtiva = this.operacaoRegraAtiva();
    const selecaoMultipla = operacoesSelecionadas.length > 1;
    const mapaRotulos = { I: "Instalacao", D: "Desativacao", R: "Reinstalacao" };
    const mapaClasses = { I: "tag-operacao-i", D: "tag-operacao-d", R: "tag-operacao-r" };

    this.elementos.buscaMaoObraRegra.disabled = selecaoMultipla || !operacaoAtiva;
    this.elementos.adicionarMaoObraRegra.disabled = selecaoMultipla || !operacaoAtiva;

    if (this.elementos.statusOperacaoRegra) {
      if (!operacoesSelecionadas.length) this.elementos.statusOperacaoRegra.textContent = "Selecione ao menos uma operacao.";
      else if (operacaoAtiva) this.elementos.statusOperacaoRegra.textContent = `Operacao ativa: ${operacaoAtiva} (${mapaRotulos[operacaoAtiva]}).`;
      else this.elementos.statusOperacaoRegra.textContent = "Multiplas operacoes selecionadas: lista consolidada por cor. Para incluir, deixe apenas uma operacao marcada.";
    }

    const saidasRender = selecaoMultipla
      ? operacoesSelecionadas.flatMap((operacao) => this.saidasRegraDaOperacao(operacao).map((item, indice) => ({ item, indice, operacao })))
      : (operacaoAtiva ? this.saidasRegraDaOperacao(operacaoAtiva).map((item, indice) => ({ item, indice, operacao: operacaoAtiva })) : []);

    this.elementos.saidasRegra.innerHTML = saidasRender.map(({ item, indice, operacao }) => {
      const maoObra = this.base.maoObra.find((atual) => atual.id === item.maoObraId);
      const codigo = maoObra?.codigo || item.codigo || "MO";
      const descricao = maoObra?.descricao || item.descricao || "";
      const categoria = this.elementos.formRegra.elements.categoriaRegra.value;
      const quantidadeCampo = categoria === "cabo"
        ? `<span class="texto-apoio">Qtd. automatica por metragem de cabo</span>`
        : `<input data-quantidade-saida-regra="${indice}" data-operacao-saida-regra="${operacao}" type="number" min="0" step="0.01" value="${Number(item.quantidade || 0)}" ${selecaoMultipla ? "disabled" : ""}>`;
      const acoes = selecaoMultipla
        ? ""
        : `<button data-remover-saida-regra="${indice}" data-operacao-saida-regra="${operacao}" type="button">Remover</button>`;
      return `
        <div class="item-temporario">
          <span><span class="tag-operacao ${mapaClasses[operacao] || ""}">${operacao}</span> ${descricao} <small>(${codigo})</small></span>
          <div class="campo-busca-regra-acoes">
            ${quantidadeCampo}
            ${acoes}
          </div>
        </div>
      `;
    }).join("");

    document.querySelectorAll("[data-remover-item-estrutura]").forEach((botao) => botao.addEventListener("click", () => {
      this.itensEstruturaTemporarios.splice(Number(botao.dataset.removerItemEstrutura), 1);
      this.renderizarItensTemporarios();
    }));
    document.querySelectorAll("[data-remover-saida-regra]").forEach((botao) => botao.addEventListener("click", () => {
      const operacao = botao.dataset.operacaoSaidaRegra;
      this.saidasRegraDaOperacao(operacao).splice(Number(botao.dataset.removerSaidaRegra), 1);
      this.renderizarItensTemporarios();
    }));
    document.querySelectorAll("[data-quantidade-saida-regra]").forEach((campo) => campo.addEventListener("change", () => {
      const indice = Number(campo.dataset.quantidadeSaidaRegra);
      const operacao = campo.dataset.operacaoSaidaRegra;
      this.saidasRegraDaOperacao(operacao)[indice].quantidade = Number(campo.value || 0);
    }));
  }

  gerarMedicao() {
    const erros = this.validarPontos();
    if (erros.size) return this.mostrarAviso("Corrija os pontos destacados antes de gerar a medicao.");
    this.resultado = this.casosDeUso.gerarMedicao(this.base);
    this.renderizarResultado();
    this.abrirAba("resultado");
    this.mostrarAviso("Medicao gerada com sucesso.");
  }

  renderizarResultado() {
    const grupoMaterial = this.filtrosResultado.material === "D" ? "materiaisDesativacao" : "materiaisInstalacao";
    const linhasMaoObra = [
      ...this.resultado.maoObraInstalacao.map((linha, indice) => ({ ...linha, __grupo: "maoObraInstalacao", __indice: indice })),
      ...this.resultado.maoObraReinstalacao.map((linha, indice) => ({ ...linha, __grupo: "maoObraReinstalacao", __indice: indice })),
      ...this.resultado.maoObraDesativacao.map((linha, indice) => ({ ...linha, __grupo: "maoObraDesativacao", __indice: indice }))
    ].sort((a, b) => {
      const descricaoA = String(a.descricao || "");
      const descricaoB = String(b.descricao || "");
      const comparacaoDescricao = descricaoA.localeCompare(descricaoB, "pt-BR");
      if (comparacaoDescricao !== 0) return comparacaoDescricao;
      return String(a.codigo || "").localeCompare(String(b.codigo || ""), "pt-BR");
    });
    this.elementos.resultadoMaterial.innerHTML = this.linhasResultado(this.resultado[grupoMaterial], grupoMaterial);
    this.elementos.resultadoMaoObra.innerHTML = this.linhasResultadoMaoObra(linhasMaoObra);
    this.elementos.abasResultado.forEach((aba) => {
      const ativa = this.filtrosResultado[aba.dataset.resultadoSecao] === aba.dataset.resultadoOperacao;
      aba.classList.toggle("ativa", ativa);
    });

    document.querySelectorAll("[data-resultado-grupo]").forEach((campo) => {
      campo.addEventListener("change", () => {
        this.resultado[campo.dataset.resultadoGrupo][Number(campo.dataset.resultadoIndice)].quantidade = Number(campo.value || 0);
      });
    });
    document.querySelectorAll("[data-remover-resultado]").forEach((botao) => {
      botao.addEventListener("click", () => this.removerLinhaResultado(botao.dataset.removerResultado, Number(botao.dataset.resultadoIndice)));
    });
  }

  alterarResultado(aba) {
    this.filtrosResultado[aba.dataset.resultadoSecao] = aba.dataset.resultadoOperacao;
    this.renderizarResultado();
  }

  linhasResultado(linhas, grupo) {
    if (!linhas.length) return `<div class="preview-vazio">Gere a medicao para visualizar.</div>`;
    return linhas.map((linha, indice) => `
      <div class="linha-resultado">
        <div><strong>${linha.descricao}</strong><span>${linha.codigo} | ${linha.unidade}</span></div>
        <div class="mini-acoes">
          <input class="quantidade-editavel" data-resultado-grupo="${grupo}" data-resultado-indice="${indice}" type="number" step="0.01" value="${linha.quantidade}">
          <button class="botao perigo" data-remover-resultado="${grupo}" data-resultado-indice="${indice}" type="button" aria-label="Remover item" title="Remover item">Remover</button>
        </div>
      </div>
    `).join("");
  }

  linhasResultadoMaoObra(linhas) {
    if (!linhas.length) return `<div class="preview-vazio">Gere a medicao para visualizar.</div>`;
    return linhas.map((linha) => `
      <div class="linha-resultado">
        <div><strong>${linha.descricao}</strong><span>${linha.codigo} | ${linha.unidade}</span></div>
        <div class="mini-acoes">
          <input class="quantidade-editavel" data-resultado-grupo="${linha.__grupo}" data-resultado-indice="${linha.__indice}" type="number" step="0.01" value="${linha.quantidade}">
          <button class="botao perigo" data-remover-resultado="${linha.__grupo}" data-resultado-indice="${linha.__indice}" type="button" aria-label="Remover item" title="Remover item">Remover</button>
        </div>
      </div>
    `).join("");
  }

  removerLinhaResultado(grupo, indice) {
    if (!this.resultado?.[grupo]) return;
    this.resultado[grupo].splice(indice, 1);
    this.renderizarResultado();
  }

  editarCadastro(tipo, id) {
    if (tipo === "material") {
      const material = this.base.materiais.find((item) => item.id === id);
      this.limparFormularioMaterial();
      this.elementos.tituloModalMaterial.textContent = "Editar material";
      this.elementos.formMaterial.elements.id.value = material.id;
      this.elementos.formMaterial.elements.codigo.value = material.codigo;
      this.elementos.formMaterial.elements.descricao.value = material.descricao;
      this.elementos.formMaterial.elements.unidade.value = material.unidade;
      this.elementos.formMaterial.elements.categoria.value = material.categoria;
      this.atualizarFormularioMaterial();
      this.abrirModal("material");
    }

    if (tipo === "estrutura") {
      const estrutura = this.base.estruturas.find((item) => item.id === id);
      this.limparFormularioEstrutura();
      this.elementos.tituloModalEstrutura.textContent = "Editar estrutura";
      this.elementos.formEstrutura.elements.idOriginal.value = estrutura.id;
      this.elementos.formEstrutura.elements.id.value = estrutura.id;
      this.elementos.formEstrutura.elements.descricao.value = estrutura.descricao;
      this.itensEstruturaTemporarios = clonar(estrutura.itens);
      this.elementos.formEstrutura.elements.materialBusca.value = "";
      this.elementos.formEstrutura.elements.materialId.value = "";
      this.atualizarStatusMaterialEstrutura();
      this.renderizarItensTemporarios();
      this.abrirModal("estrutura");
    }

    if (tipo === "maoObra") {
      const item = this.base.maoObra.find((atual) => atual.id === id);
      this.limparFormularioMaoObra();
      this.elementos.tituloModalMaoObra.textContent = "Editar mao de obra";
      this.elementos.formMaoObra.elements.id.value = item.id;
      this.elementos.formMaoObra.elements.codigo.value = item.codigo;
      this.elementos.formMaoObra.elements.descricao.value = item.descricao;
      this.elementos.formMaoObra.elements.unidade.value = item.unidade || "un";
      this.abrirModal("maoObra");
    }

    if (tipo === "regra") {
      const regra = this.base.regrasMaoObra.find((item) => item.id === id);
      const grupoRegraId = regra.grupoRegraId || regra.id;
      const regrasGrupo = this.base.regrasMaoObra.filter((item) => (item.grupoRegraId || item.id) === grupoRegraId);
      const regraBase = regrasGrupo[0] || regra;
      const tipoGatilho = regra.gatilho?.tipo || regra.tipoGatilho;
      const materialIdRegra = regra.gatilho?.materialId ?? regra.materialId;
      const materialIdsRegra = regra.gatilho?.materialIds ?? regra.materialIds ?? [];
      const estruturaIdsRegra = regra.gatilho?.estruturaIds ?? regra.estruturaIds ?? [];
      const categoriasRegra = regra.gatilho?.categorias ?? regra.categorias;
      const categoria = tipoGatilho === "estrutura"
        ? "estrutura"
        : materialIdRegra
          ? this.materialPorId(materialIdRegra)?.categoria || categoriasRegra?.[0] || "poste"
          : categoriasRegra?.[0] || "poste";
      this.limparFormularioRegra();
      this.elementos.tituloModalRegra.textContent = "Editar regra";
      this.grupoRegraEdicaoId = grupoRegraId;
      this.regrasOriginaisGrupoEdicao = regrasGrupo.map((item) => item.id);
      this.elementos.formRegra.elements.id.value = regraBase.id;
      this.elementos.formRegra.elements.nome.value = regraBase.nomeBaseGrupo || regraBase.nome?.replace(/\s\[[IDR]\]$/, "") || regraBase.nome;
      this.elementos.formRegra.elements.categoriaRegra.value = categoria;
      this.atualizarFormularioRegra();
      this.elementos.formRegra.elements.materialId.value = materialIdRegra || "";
      this.materiaisRegraSelecionados = categoria === "estrutura" ? [...estruturaIdsRegra] : [...materialIdsRegra];
      this.renderizarSeletoresRegra();
      const operacoesGrupo = [...new Set(regrasGrupo.flatMap((item) => item.operacoes || []))];
      this.elementos.formRegra.querySelectorAll("input[name='operacoes']").forEach((item) => item.checked = operacoesGrupo.includes(item.value));
      this.saidasRegraPorOperacaoTemporarias = { I: [], D: [], R: [] };
      regrasGrupo.forEach((regraGrupo) => {
        const operacao = regraGrupo.operacoes?.[0];
        if (!operacao) return;
        this.saidasRegraPorOperacaoTemporarias[operacao] = clonar(regraGrupo.saidas || []);
      });
      this.renderizarItensTemporarios();
      this.abrirModal("regra");
    }
  }

  excluirCadastro(tipo, id) {
    if (tipo === "material") this.base.materiais = this.base.materiais.filter((item) => item.id !== id);
    if (tipo === "maoObra") this.base.maoObra = this.base.maoObra.filter((item) => item.id !== id);
    if (tipo === "estrutura") this.base.estruturas = this.base.estruturas.filter((item) => item.id !== id);
    if (tipo === "regra") {
      const regra = this.base.regrasMaoObra.find((item) => item.id === id);
      const grupoRegraId = regra?.grupoRegraId;
      if (grupoRegraId) this.base.regrasMaoObra = this.base.regrasMaoObra.filter((item) => item.grupoRegraId !== grupoRegraId);
      else this.base.regrasMaoObra = this.base.regrasMaoObra.filter((item) => item.id !== id);
    }
    this.renderizarTudo();
  }

  escaparHtml(texto) {
    return String(texto ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;");
  }

  baixarExcel() {
    const gruposMateriais = [
      ["Instalacao", this.resultado.materiaisInstalacao],
      ["Desativacao", this.resultado.materiaisDesativacao]
    ];
    const gruposMaoObra = [
      ["Instalacao", this.resultado.maoObraInstalacao],
      ["Reinstalacao", this.resultado.maoObraReinstalacao],
      ["Desativacao", this.resultado.maoObraDesativacao]
    ];

    const linhasMateriais = gruposMateriais.flatMap(([operacao, itens]) => itens.map((item) => `
      <tr>
        <td>${this.escaparHtml(operacao)}</td>
        <td>${this.escaparHtml(item.codigo)}</td>
        <td>${this.escaparHtml(item.descricao)}</td>
        <td>${Number(item.quantidade || 0)}</td>
        <td>${this.escaparHtml(item.unidade || "un")}</td>
      </tr>
    `)).join("");
    const linhasMaoObra = gruposMaoObra.flatMap(([operacao, itens]) => itens.map((item) => `
      <tr>
        <td>${this.escaparHtml(operacao)}</td>
        <td>${this.escaparHtml(item.codigo)}</td>
        <td>${this.escaparHtml(item.descricao)}</td>
        <td>${Number(item.quantidade || 0)}</td>
        <td>${this.escaparHtml(item.unidade || "un")}</td>
      </tr>
    `)).join("");

    const conteudo = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="UTF-8" />
        <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Resultado</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
      </head>
      <body>
        <table border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td valign="top">
              <h3>Materiais</h3>
              <table border="1">
                <thead>
                  <tr>
                    <th>Operacao</th>
                    <th>Codigo</th>
                    <th>Descricao</th>
                    <th>Quantidade</th>
                    <th>Unidade</th>
                  </tr>
                </thead>
                <tbody>${linhasMateriais}</tbody>
              </table>
            </td>
            <td style="width:120px;"></td>
            <td style="width:120px;"></td>
            <td valign="top">
              <h3>Mao de Obra</h3>
              <table border="1">
                <thead>
                  <tr>
                    <th>Operacao</th>
                    <th>Codigo</th>
                    <th>Descricao</th>
                    <th>Quantidade</th>
                    <th>Unidade</th>
                  </tr>
                </thead>
                <tbody>${linhasMaoObra}</tbody>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
    this.baixarArquivo("resultado-medicao.xls", conteudo, "application/vnd.ms-excel;charset=utf-8");
  }

  chaveLinhaResultado(item) {
    return `${item.codigo || ""}||${item.descricao || ""}||${item.unidade || "un"}`;
  }

  somarNoMapaResultado(mapa, codigo, descricao, quantidade, unidade = "un") {
    const chave = `${codigo || ""}||${descricao || ""}||${unidade || "un"}`;
    if (!mapa[chave]) mapa[chave] = { codigo: codigo || "", descricao: descricao || "", quantidade: 0, unidade: unidade || "un" };
    mapa[chave].quantidade += Number(quantidade || 0);
  }

  adicionarQuantidadeLinhaResultado(linhas, item, quantidade) {
    const chaveItem = this.chaveLinhaResultado(item);
    const existente = linhas.find((linha) => this.chaveLinhaResultado(linha) === chaveItem);
    if (existente) {
      existente.quantidade = Number(existente.quantidade || 0) + Number(quantidade || 0);
      return;
    }

    linhas.push({
      codigo: item.codigo || "",
      descricao: item.descricao || "",
      quantidade: Number(quantidade || 0),
      unidade: item.unidade || "un"
    });
    linhas.sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR"));
  }

  materialPorLinhaResultado(linha) {
    const codigo = String(linha.codigo || "").trim();
    const descricao = this.normalizarTexto(linha.descricao || "");
    return this.base.materiais.find((item) => String(item.codigo || "").trim() === codigo)
      || this.base.materiais.find((item) => this.normalizarTexto(item.descricao || "") === descricao)
      || null;
  }

  regraAplicaAoMaterial(regra, operacao, material) {
    if (!material) return false;
    if (regra.operacoes?.length && !regra.operacoes.includes(operacao)) return false;
    const tipo = regra.gatilho?.tipo || regra.tipoGatilho;
    if (tipo === "estrutura" || tipo === "contexto") return false;
    const materialId = regra.gatilho?.materialId ?? regra.materialId;
    const materialIds = regra.gatilho?.materialIds ?? regra.materialIds ?? [];
    const categorias = regra.gatilho?.categorias ?? regra.categorias ?? [];
    if (materialId) return materialId === material.id;
    if (materialIds.length) return materialIds.includes(material.id);
    return categorias.includes(material.categoria);
  }

  atualizarMaoObraPorMateriaisResultado() {
    const operacoesMateriais = [
      { operacao: "I", grupoMaterial: "materiaisInstalacao", grupoMaoObra: "maoObraInstalacao" },
      { operacao: "D", grupoMaterial: "materiaisDesativacao", grupoMaoObra: "maoObraDesativacao" }
    ];
    let itensAdicionados = 0;

    operacoesMateriais.forEach(({ operacao, grupoMaterial, grupoMaoObra }) => {
      const atuaisMateriais = this.resultado[grupoMaterial] || [];
      const maoObraAtual = {};
      const linhasMaoObraAtuais = this.resultado[grupoMaoObra] || [];
      linhasMaoObraAtuais.forEach((item) => {
        this.somarNoMapaResultado(maoObraAtual, item.codigo, item.descricao, Number(item.quantidade || 0), item.unidade || "un");
      });

      const maoObraEsperada = {};
      atuaisMateriais.forEach((linhaAtual) => {
        const quantidadeMaterial = Number(linhaAtual.quantidade || 0);
        if (quantidadeMaterial <= 0) return;
        const material = this.materialPorLinhaResultado(linhaAtual);
        if (!material) return;
        const regrasAplicaveis = this.base.regrasMaoObra.filter((regra) => this.regraAplicaAoMaterial(regra, operacao, material));
        regrasAplicaveis.forEach((regra) => {
          (regra.saidas || []).forEach((saida) => {
            const quantidadeSaida = Number(saida.quantidade || 0);
            if (!quantidadeSaida) return;
            this.somarNoMapaResultado(
              maoObraEsperada,
              saida.codigo || "MO",
              saida.descricao || "",
              quantidadeMaterial * quantidadeSaida,
              "un"
            );
          });
        });
      });

      Object.entries(maoObraEsperada).forEach(([chave, itemEsperado]) => {
        const quantidadeAtual = Number(maoObraAtual[chave]?.quantidade || 0);
        const quantidadeFaltante = Number(itemEsperado.quantidade || 0) - quantidadeAtual;
        if (quantidadeFaltante <= 0) return;
        this.adicionarQuantidadeLinhaResultado(linhasMaoObraAtuais, itemEsperado, quantidadeFaltante);
        this.somarNoMapaResultado(maoObraAtual, itemEsperado.codigo, itemEsperado.descricao, quantidadeFaltante, itemEsperado.unidade || "un");
        itensAdicionados += 1;
      });
    });

    this.renderizarResultado();
    this.mostrarAviso(itensAdicionados
      ? "Mao de obra faltante adicionada com base nos materiais."
      : "Resultado analisado. Nenhuma mao de obra faltante foi encontrada.");
  }

  importarJson(evento) {
    const arquivo = evento.target.files[0];
    if (!arquivo) return;
    const leitor = new FileReader();
    leitor.onload = () => {
      this.base = JSON.parse(leitor.result);
      this.normalizarBase();
      this.renderizarTudo();
      this.mostrarAviso("Base carregada.");
    };
    leitor.readAsText(arquivo);
  }

  baixarArquivo(nome, conteudo, tipo) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
    link.download = nome;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  materiaisPorCategoria(categoria) {
    return this.base.materiais.filter((item) => item.categoria === categoria);
  }

  materiaisPorTipoCabo(tipoCabo) {
    return this.base.materiais.filter((item) => item.categoria === "cabo" && item.tipoCabo === tipoCabo);
  }

  materialPorId(id) {
    return this.base.materiais.find((item) => item.id === id);
  }

  salvarPorId(lista, item) {
    const indice = lista.findIndex((atual) => atual.id === item.id);
    if (indice >= 0) lista[indice] = item;
    else lista.push(item);
  }

  criarId(texto) {
    return this.normalizarTexto(texto)
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
  }

  criarIdUnico(lista, textoBase) {
    const base = this.criarId(textoBase) || "item";
    if (!lista.some((item) => item.id === base)) return base;
    let contador = 2;
    while (lista.some((item) => item.id === `${base}_${contador}`)) contador += 1;
    return `${base}_${contador}`;
  }

  normalizarTexto(texto) {
    return String(texto || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  alternarTema() {
    this.tema = this.tema === "escuro" ? "claro" : "escuro";
    this.casosDeUso.salvarTema(this.tema);
    this.aplicarTema();
  }

  aplicarTema() {
    document.body.dataset.tema = this.tema;
    const rotulo = this.tema === "escuro" ? "Ativar modo claro" : "Ativar modo escuro";
    const icone = this.tema === "escuro"
      ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.75a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V5.5a.75.75 0 0 1 .75-.75Zm0 10.5a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Zm7.25-4a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1 0-1.5h1.5ZM7.75 12a.75.75 0 0 1-.75.75H5.5a.75.75 0 0 1 0-1.5H7a.75.75 0 0 1 .75.75Zm8.376-4.876a.75.75 0 0 1 1.06 0l1.06 1.061a.75.75 0 0 1-1.06 1.06l-1.06-1.06a.75.75 0 0 1 0-1.06ZM6.814 16.126a.75.75 0 0 1 1.06 0l1.06 1.06a.75.75 0 1 1-1.06 1.061l-1.06-1.061a.75.75 0 0 1 0-1.06Zm10.372 1.06a.75.75 0 1 1-1.06-1.06l1.06-1.061a.75.75 0 1 1 1.06 1.06l-1.06 1.061ZM8.935 7.124a.75.75 0 1 1-1.06 1.06l-1.06-1.06a.75.75 0 0 1 1.06-1.061l1.06 1.061ZM12 17a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 12 17Z" fill="currentColor"/></svg>`
      : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 3.25a.75.75 0 0 1 .726.938 7.25 7.25 0 0 0 9.086 9.086.75.75 0 0 1 .938.726A9.75 9.75 0 1 1 14.5 3.25Z" fill="currentColor" transform="translate(-1.5 0)"/></svg>`;
    this.elementos.alternarTema.innerHTML = `<span class="icone-botao">${icone}</span><span class="texto-invisivel">${rotulo}</span>`;
    this.elementos.alternarTema.setAttribute("aria-label", rotulo);
    this.elementos.alternarTema.setAttribute("title", rotulo);
  }

  limparFormularioMaterial() {
    this.elementos.formMaterial.reset();
    this.elementos.formMaterial.elements.id.value = "";
    this.elementos.formMaterial.elements.categoria.value = "geral";
    this.elementos.tituloModalMaterial.textContent = "Novo material";
    this.atualizarFormularioMaterial();
  }

  limparFormularioMaoObra() {
    this.elementos.formMaoObra.reset();
    this.elementos.formMaoObra.elements.id.value = "";
    this.elementos.formMaoObra.elements.unidade.value = "un";
    this.elementos.tituloModalMaoObra.textContent = "Nova mao de obra";
  }

  limparFormularioEstrutura() {
    this.elementos.formEstrutura.reset();
    this.elementos.formEstrutura.elements.idOriginal.value = "";
    this.elementos.formEstrutura.elements.materialId.value = "";
    this.elementos.tituloModalEstrutura.textContent = "Nova estrutura";
    this.itensEstruturaTemporarios = [];
    this.atualizarStatusMaterialEstrutura();
    this.renderizarItensTemporarios();
  }

  limparFormularioRegra() {
    this.elementos.formRegra.reset();
    this.elementos.formRegra.elements.id.value = "";
    this.elementos.formRegra.elements.categoriaRegra.value = "poste";
    this.elementos.buscaMaterialRegra.value = "";
    this.elementos.buscaMaoObraRegra.value = "";
    this.materiaisRegraSelecionados = [];
    this.grupoRegraEdicaoId = "";
    this.regrasOriginaisGrupoEdicao = [];
    this.saidasRegraPorOperacaoTemporarias = { I: [], D: [], R: [] };
    this.elementos.tituloModalRegra.textContent = "Nova regra";
    this.renderizarItensTemporarios();
    this.atualizarFormularioRegra();
  }

  resumoRegra(regra) {
    const tipoGatilho = regra.gatilho?.tipo || regra.tipoGatilho;
    const estruturaId = regra.gatilho?.estruturaId ?? regra.estruturaId;
    const estruturaIds = regra.gatilho?.estruturaIds ?? regra.estruturaIds ?? [];
    const materialId = regra.gatilho?.materialId ?? regra.materialId;
    const materialIds = regra.gatilho?.materialIds ?? regra.materialIds ?? [];
    const categorias = regra.gatilho?.categorias ?? regra.categorias;

    if (tipoGatilho === "estrutura") {
      if (estruturaIds.length) return `${estruturaIds.length} estrutura(s)`;
      return estruturaId ? `Estrutura ${estruturaId}` : "Todas as estruturas";
    }

    if (materialIds.length) return `${materialIds.length} item(ns)`;
    if (materialId) return this.materialPorId(materialId)?.descricao || materialId;
    const categoria = categorias?.[0] || "poste";
    if (categoria === "poste" || categoria === "cabo" || categoria === "geral") return "Sem itens";
    return "Sem filtro";
  }

  abrirModalCadastro(tipo) {
    if (tipo === "material") this.limparFormularioMaterial();
    if (tipo === "maoObra") this.limparFormularioMaoObra();
    if (tipo === "estrutura") this.limparFormularioEstrutura();
    if (tipo === "regra") this.limparFormularioRegra();
    if (tipo === "seletorItem") this.limparSeletorItem();
    this.abrirModal(tipo);
  }

  abrirModal(tipo) {
    const modal = this.modalPorTipo(tipo);
    if (!modal) return;
    if (tipo === "seletorItem" && this.modalAberto && this.modalAberto !== tipo) {
      this.modalAnteriorSeletorItem = this.modalAberto;
      modal.classList.remove("oculto");
      this.modalAberto = tipo;
      this.elementos.body.classList.add("modal-aberto");
      return;
    }
    if (this.modalAberto && this.modalAberto !== tipo) this.fecharModalCadastro(this.modalAberto);
    this.modalAberto = tipo;
    modal.classList.remove("oculto");
    this.elementos.body.classList.add("modal-aberto");
  }

  fecharModalCadastro(tipo) {
    const modal = this.modalPorTipo(tipo);
    if (!modal) return;
    modal.classList.add("oculto");
    if (tipo === "seletorItem") this.limparSeletorItem();
    if (this.modalAberto === tipo) this.modalAberto = this.modalAnteriorSeletorItem || null;
    if (tipo === "seletorItem") this.modalAnteriorSeletorItem = null;
    if (!this.modalAberto) this.elementos.body.classList.remove("modal-aberto");
  }

  fecharModalAtual() {
    if (!this.modalAberto) return;
    this.fecharModalCadastro(this.modalAberto);
  }

  modalPorTipo(tipo) {
    if (tipo === "material") return this.elementos.modalMaterial;
    if (tipo === "maoObra") return this.elementos.modalMaoObra;
    if (tipo === "estrutura") return this.elementos.modalEstrutura;
    if (tipo === "regra") return this.elementos.modalRegra;
    if (tipo === "seletorItem") return this.elementos.modalSeletorItem;
    return null;
  }

  sincronizarBuscaMaterialEstrutura() {
    const campo = this.elementos.formEstrutura.elements.materialBusca;
    const termo = this.normalizarTexto(campo.value);
    const material = termo
      ? this.itemPorBusca(this.base.materiais, campo.value)
      : null;

    this.elementos.formEstrutura.elements.materialId.value = material?.id || "";
    this.atualizarStatusMaterialEstrutura(material);
  }

  atualizarStatusMaterialEstrutura(material = null) {
    const selecionado = material || this.materialPorId(this.elementos.formEstrutura.elements.materialId.value);
    this.elementos.materialEstruturaStatus.textContent = selecionado
      ? `Selecionado: ${selecionado.descricao} (${selecionado.codigo})`
      : "Nenhum material selecionado.";
  }

  abrirSeletorItem(contexto) {
    this.contextoSeletorItem = contexto;
    this.selecaoAtualSeletorItem = null;
    const form = this.elementos.formSeletorItem;
    form.reset();
    form.elements.quantidade.value = 1;
    form.elements.codigo.value = "";
    form.elements.descricao.value = "";

    const configuracoes = {
      "resultado-material": {
        rotulo: "Resultado",
        titulo: "Adicionar material",
        botao: "Adicionar material",
        mostrarCodigo: false,
        mostrarDescricao: false,
        mostrarQuantidade: true,
        placeholder: "Digite codigo ou descricao do material"
      },
      "resultado-mao-obra": {
        rotulo: "Resultado",
        titulo: "Adicionar mao de obra",
        botao: "Adicionar M.O.",
        mostrarCodigo: true,
        mostrarDescricao: true,
        mostrarQuantidade: true,
        placeholder: "Digite codigo ou descricao da mao de obra"
      },
      "regra-materiais": {
        rotulo: "Regras",
        titulo: "Selecionar item da regra",
        botao: "Salvar selecao",
        mostrarCodigo: false,
        mostrarDescricao: false,
        mostrarQuantidade: false,
        placeholder: "Digite a descricao do item"
      },
      "regra-mao-obra": {
        rotulo: "Regras",
        titulo: "Selecionar mao de obra da regra",
        botao: "Salvar selecao",
        mostrarCodigo: false,
        mostrarDescricao: false,
        mostrarQuantidade: false,
        placeholder: "Digite a descricao da mao de obra"
      }
    };

    const config = configuracoes[contexto];
    if (!config) return;
    const categoriaRegra = this.elementos.formRegra.elements.categoriaRegra.value;
    if (contexto === "regra-materiais") {
      const rotulos = {
        poste: "Selecionar postes",
        cabo: "Selecionar cabos",
        geral: "Selecionar itens gerais",
        estrutura: "Selecionar itens"
      };
      config.titulo = rotulos[categoriaRegra] || config.titulo;
    }
    if (contexto === "regra-mao-obra" && categoriaRegra === "cabo") {
      config.placeholder = "Digite a descricao da mao de obra (quantidade automatica por metragem)";
    }
    if (contexto === "regra-mao-obra") {
      const operacaoAtiva = this.operacaoRegraAtiva();
      config.titulo = operacaoAtiva
        ? `Selecionar mao de obra da regra (${operacaoAtiva})`
        : "Selecionar mao de obra da regra";
    }

    this.elementos.rotuloModalSeletorItem.textContent = config.rotulo;
    this.elementos.tituloModalSeletorItem.textContent = config.titulo;
    this.elementos.confirmarSeletorItem.textContent = config.botao;
    this.elementos.formSeletorItem.elements.busca.placeholder = config.placeholder;
    this.elementos.campoCodigoSeletorItem.classList.toggle("oculto", !config.mostrarCodigo);
    this.elementos.campoDescricaoSeletorItem.classList.toggle("oculto", !config.mostrarDescricao);
    this.elementos.campoQuantidadeSeletorItem.classList.toggle("oculto", !config.mostrarQuantidade);
    this.atualizarDatalistSeletorItem(contexto);

    this.sincronizarSeletorItem();
    this.abrirModal("seletorItem");
  }

  limparSeletorItem() {
    this.contextoSeletorItem = null;
    this.selecaoAtualSeletorItem = null;
    this.elementos.formSeletorItem.reset();
    this.elementos.formSeletorItem.elements.quantidade.value = 1;
    this.elementos.statusSeletorItem.textContent = "Nenhum item selecionado.";
    this.elementos.datalistSeletorItem.innerHTML = "";
  }

  sincronizarSeletorItem() {
    if (!this.contextoSeletorItem) return;
    const textoBusca = this.elementos.formSeletorItem.elements.busca.value;
    const termo = this.normalizarTexto(textoBusca);
    const itens = this.opcoesSeletorItem(this.contextoSeletorItem);
    const encontrado = termo ? this.itemPorBusca(itens, textoBusca) : null;
    this.selecaoAtualSeletorItem = encontrado;

    if (this.contextoSeletorItem === "resultado-mao-obra") {
      if (this.selecaoAtualSeletorItem) {
        this.elementos.formSeletorItem.elements.codigo.value = this.selecaoAtualSeletorItem.codigo || "";
        this.elementos.formSeletorItem.elements.descricao.value = this.selecaoAtualSeletorItem.descricao || "";
        this.elementos.statusSeletorItem.textContent = `Pre-selecionado: ${this.selecaoAtualSeletorItem.descricao} (${this.selecaoAtualSeletorItem.codigo})`;
      } else if (termo) {
        const descricaoDigitada = this.elementos.formSeletorItem.elements.busca.value.trim();
        this.elementos.formSeletorItem.elements.codigo.value = "";
        this.elementos.formSeletorItem.elements.descricao.value = descricaoDigitada;
        this.elementos.statusSeletorItem.textContent = "Nao encontrada. A mao de obra sera cadastrada ao adicionar.";
      } else {
        this.elementos.formSeletorItem.elements.codigo.value = "";
        this.elementos.formSeletorItem.elements.descricao.value = "";
        this.elementos.statusSeletorItem.textContent = "Nenhum item selecionado.";
      }
      return;
    }

    this.elementos.statusSeletorItem.textContent = this.selecaoAtualSeletorItem
      ? `Pre-selecionado: ${this.selecaoAtualSeletorItem.descricao} (${this.selecaoAtualSeletorItem.codigo})`
      : "Nenhum item selecionado.";
  }

  atualizarDatalistSeletorItem(contexto) {
    const itens = this.opcoesSeletorItem(contexto);
    this.atualizarDatalistInteligente(
      this.elementos.datalistSeletorItem,
      itens,
      this.elementos.formSeletorItem.elements.busca.value
    );
  }

  opcoesSeletorItem(contexto) {
    if (contexto === "resultado-material") return this.base.materiais;
    if (contexto === "resultado-mao-obra") return this.base.maoObra;
    if (contexto === "regra-materiais") {
      const categoria = this.elementos.formRegra.elements.categoriaRegra.value;
      if (categoria === "poste") return this.materiaisPorCategoria("poste");
      if (categoria === "cabo") return this.materiaisPorCategoria("cabo");
      if (categoria === "geral") return this.materiaisPorCategoria("geral");
      if (categoria === "estrutura") return this.base.estruturas;
      return [];
    }
    if (contexto === "regra-mao-obra") return this.base.maoObra;
    return [];
  }

  correspondeBuscaCatalogo(item, termo) {
    const materiaisVinculados = (item.itens || [])
      .map((vinculo) => {
        const material = this.materialPorId(vinculo.materialId);
        return `${material?.descricao || ""} ${material?.codigo || ""} ${vinculo.materialId || ""}`;
      })
      .join(" ");
    const combinado = `${item.descricao || ""} ${item.codigo || ""} ${item.id || ""} ${item.unidade || ""} ${materiaisVinculados}`;
    return this.correspondeBuscaTexto(combinado, termo);
  }

  correspondeBuscaRegra(regra, termo) {
    const idsMateriais = [
      regra.gatilho?.materialId,
      regra.materialId,
      ...(regra.gatilho?.materialIds || regra.materialIds || [])
    ].filter(Boolean);
    const idsEstruturas = [
      regra.gatilho?.estruturaId,
      regra.estruturaId,
      ...(regra.gatilho?.estruturaIds || regra.estruturaIds || [])
    ].filter(Boolean);
    const materiais = idsMateriais.map((id) => {
      const material = this.materialPorId(id);
      return `${id} ${material?.codigo || ""} ${material?.descricao || ""}`;
    }).join(" ");
    const estruturas = idsEstruturas.map((id) => {
      const estrutura = this.base.estruturas.find((item) => item.id === id);
      return `${id} ${estrutura?.descricao || ""}`;
    }).join(" ");
    const saidas = (regra.saidas || []).map((saida) => {
      const maoObra = this.base.maoObra.find((item) => item.id === saida.maoObraId);
      return `${saida.maoObraId || ""} ${maoObra?.codigo || ""} ${maoObra?.descricao || ""} ${saida.quantidade || ""}`;
    }).join(" ");
    const combinado = `${regra.id || ""} ${regra.nome || ""} ${(regra.operacoes || []).join(" ")} ${this.resumoRegra(regra)} ${materiais} ${estruturas} ${saidas}`;
    return this.correspondeBuscaTexto(combinado, termo);
  }

  correspondeBuscaTexto(texto, termo) {
    const textoNormalizado = this.normalizarTexto(texto);
    const textoCompacto = textoNormalizado.replace(/[^a-z0-9]+/g, "");
    const termos = this.normalizarTexto(termo).match(/[a-z0-9]+/g) || [];
    return termos.length > 0 && termos.every((parte) => {
      const parteCompacta = parte.replace(/[^a-z0-9]+/g, "");
      return textoNormalizado.includes(parte) || (parteCompacta && textoCompacto.includes(parteCompacta));
    });
  }

  atualizarDatalistInteligente(datalist, itens, termo = "") {
    if (!datalist) return;
    const itensFiltrados = termo
      ? itens.filter((item) => this.correspondeBuscaCatalogo(item, termo))
      : itens;
    const rotuloBusca = String(termo || "").trim();
    datalist.innerHTML = itensFiltrados
      .map((item) => {
        const rotuloItem = item.codigo || item.id || "";
        const rotulo = rotuloBusca ? `${rotuloBusca} | ${rotuloItem}` : rotuloItem;
        return `<option value="${this.escaparHtml(item.descricao || item.id)}" label="${this.escaparHtml(rotulo)}">${this.escaparHtml(rotulo)}</option>`;
      })
      .join("");
  }

  confirmarSeletorItem(evento) {
    evento.preventDefault();
    const form = evento.currentTarget;
    const quantidade = Number(form.elements.quantidade.value || 0);

    if (this.contextoSeletorItem === "resultado-material") {
      if (!this.selecaoAtualSeletorItem) return this.mostrarAviso("Selecione um material para adicionar.");
      if (quantidade <= 0) return this.mostrarAviso("Informe uma quantidade valida.");
      this.adicionarLinhaManualAoResultado(this.grupoResultadoMaterialAtual(), this.selecaoAtualSeletorItem, quantidade);
      this.fecharModalCadastro("seletorItem");
      this.renderizarResultado();
      return this.mostrarAviso("Material adicionado ao resultado.");
    }

    if (this.contextoSeletorItem === "resultado-mao-obra") {
      if (quantidade <= 0) return this.mostrarAviso("Informe uma quantidade valida.");
      const codigo = form.elements.codigo.value.trim();
      const descricao = form.elements.descricao.value.trim() || form.elements.busca.value.trim();
      let maoObra = this.selecaoAtualSeletorItem;
      if (!maoObra) {
        if (!descricao) return this.mostrarAviso("Informe a mao de obra para adicionar.");
        maoObra = this.salvarMaoObraCatalogo({ codigo, descricao, unidade: "un" });
      }
      this.adicionarLinhaManualAoResultado(this.grupoResultadoMaoObraAtual(), maoObra, quantidade);
      this.fecharModalCadastro("seletorItem");
      this.renderizarTudo();
      return this.mostrarAviso("Mao de obra adicionada ao resultado.");
    }

    if (this.contextoSeletorItem === "regra-materiais") {
      if (!this.selecaoAtualSeletorItem) return this.mostrarAviso("Selecione um material.");
      const categoria = this.elementos.formRegra.elements.categoriaRegra.value;
      const nomeSelecionado = this.normalizarTexto(this.selecaoAtualSeletorItem.descricao || "");
      const jaExisteMesmoNome = this.materiaisRegraSelecionados.some((id) => {
        const itemAtual = categoria === "estrutura"
          ? this.base.estruturas.find((estrutura) => estrutura.id === id)
          : this.materialPorId(id);
        return this.normalizarTexto(itemAtual?.descricao || "") === nomeSelecionado;
      });
      if (jaExisteMesmoNome) return this.mostrarAviso("Item com mesmo nome ja foi selecionado.");
      this.materiaisRegraSelecionados.push(this.selecaoAtualSeletorItem.id);
      this.renderizarSeletoresRegra();
      this.fecharModalCadastro("seletorItem");
      return this.mostrarAviso("Material adicionado na regra.");
    }

    if (this.contextoSeletorItem === "regra-mao-obra") {
      if (!this.selecaoAtualSeletorItem) return this.mostrarAviso("Selecione uma mao de obra.");
      const operacaoAtiva = this.operacaoRegraAtiva();
      if (!operacaoAtiva) {
        this.fecharModalCadastro("seletorItem");
        return this.mostrarAviso("Marque apenas uma operacao (I, D ou R) para incluir mao de obra.");
      }
      const saidasOperacao = this.saidasRegraDaOperacao(operacaoAtiva);
      if (saidasOperacao.some((item) => item.maoObraId === this.selecaoAtualSeletorItem.id)) {
        this.fecharModalCadastro("seletorItem");
        return this.mostrarAviso("Mao de obra ja adicionada na regra.");
      }
      const categoriaRegra = this.elementos.formRegra.elements.categoriaRegra.value;
      const quantidadeSaida = categoriaRegra === "cabo" ? 1 : 1;
      saidasOperacao.push({
        maoObraId: this.selecaoAtualSeletorItem.id,
        codigo: this.selecaoAtualSeletorItem.codigo,
        descricao: this.selecaoAtualSeletorItem.descricao,
        quantidade: quantidadeSaida
      });
      this.renderizarItensTemporarios();
      this.fecharModalCadastro("seletorItem");
      return this.mostrarAviso("Mao de obra adicionada na regra.");
    }
  }

  grupoResultadoMaterialAtual() {
    return this.filtrosResultado.material === "D" ? "materiaisDesativacao" : "materiaisInstalacao";
  }

  grupoResultadoMaoObraAtual() {
    return "maoObraInstalacao";
  }

  adicionarLinhaManualAoResultado(grupo, item, quantidade) {
    const linhas = this.resultado[grupo];
    const existente = linhas.find((linha) => linha.codigo === item.codigo && linha.descricao === item.descricao);
    if (existente) {
      existente.quantidade += quantidade;
      return;
    }

    linhas.push({
      codigo: item.codigo,
      descricao: item.descricao,
      quantidade,
      unidade: item.unidade || "un"
    });
    linhas.sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR"));
  }

  salvarMaoObraCatalogo(item, sincronizarRegras = true) {
    const descricao = String(item.descricao || "").trim();
    const codigo = String(item.codigo || "").trim() || this.criarCodigoMaoObra(descricao);
    const unidade = String(item.unidade || "un").trim() || "un";
    const id = item.id || this.criarId(`${codigo}_${descricao}`);
    const normalizado = { id, codigo, descricao, unidade };
    this.salvarPorId(this.base.maoObra, normalizado);
    if (sincronizarRegras) this.sincronizarMaoObraNasRegras(normalizado);
    return normalizado;
  }

  sincronizarMaoObraNasRegras(maoObra) {
    this.base.regrasMaoObra = this.base.regrasMaoObra.map((regra) => ({
      ...regra,
      saidas: (regra.saidas || []).map((saida) => (
        saida.maoObraId === maoObra.id
          ? {
            ...saida,
            codigo: maoObra.codigo,
            descricao: maoObra.descricao,
            unidade: maoObra.unidade || saida.unidade || "un"
          }
          : saida
      ))
    }));
  }

  criarCodigoMaoObra(descricao) {
    const base = this.criarId(descricao || "mao_obra").replace(/_/g, "-").toUpperCase();
    return base ? `MO-${base}` : "MO";
  }

  nomeBaseRegra(nome) {
    const texto = String(nome || "").trim();
    if (!texto) return "Regra";
    return texto
      .replace(/\s*\[[IDR]\]\s*$/i, "")
      .replace(/^\s*(instalar|instalacao|desativar|desativacao|reinstalar|reinstalacao)\s+/i, "")
      .trim() || texto;
  }

  assinaturaGatilhoRegra(regra) {
    const gatilho = regra.gatilho || {};
    const tipo = gatilho.tipo || regra.tipoGatilho || "material";
    const categorias = [...(gatilho.categorias || regra.categorias || [])].sort();
    const materialIds = [...(gatilho.materialIds || regra.materialIds || [])].sort();
    const estruturaIds = [...(gatilho.estruturaIds || regra.estruturaIds || [])].sort();
    const materialId = gatilho.materialId ?? regra.materialId ?? "";
    const estruturaId = gatilho.estruturaId ?? regra.estruturaId ?? "";
    return JSON.stringify({ tipo, categorias, materialIds, estruturaIds, materialId, estruturaId });
  }

  migrarRegrasParaPacotes(regras) {
    const regrasAtomicas = [];
    regras.forEach((regra) => {
      const operacoesOriginais = Array.isArray(regra.operacoes) && regra.operacoes.length ? regra.operacoes : [];
      if (operacoesOriginais.length <= 1) {
        regrasAtomicas.push({
          ...regra,
          operacoes: operacoesOriginais.length ? [operacoesOriginais[0]] : []
        });
        return;
      }

      operacoesOriginais.forEach((operacao) => {
        regrasAtomicas.push({
          ...regra,
          id: this.criarIdUnico(regrasAtomicas, `${regra.id || regra.nome || "regra"}_${operacao}`),
          operacoes: [operacao]
        });
      });
    });

    const gruposPorAssinatura = new Map();
    regrasAtomicas.forEach((regra) => {
      const chave = this.assinaturaGatilhoRegra(regra);
      if (!gruposPorAssinatura.has(chave)) gruposPorAssinatura.set(chave, []);
      gruposPorAssinatura.get(chave).push(regra);
    });

    gruposPorAssinatura.forEach((grupo) => {
      const porOperacao = { I: [], D: [], R: [] };
      grupo.forEach((regra) => {
        const operacao = regra.operacoes?.[0];
        if (!porOperacao[operacao]) return;
        porOperacao[operacao].push(regra);
      });

      const haOperacoesMultiplas = Object.values(porOperacao).filter((lista) => lista.length > 0).length > 1;
      const temConflitoMesmaOperacao = Object.values(porOperacao).some((lista) => lista.length > 1);
      if (!haOperacoesMultiplas || temConflitoMesmaOperacao) {
        grupo.forEach((regra) => {
          if (!regra.nomeBaseGrupo) regra.nomeBaseGrupo = this.nomeBaseRegra(regra.nome);
        });
        return;
      }

      const nomeBase = this.nomeBaseRegra(grupo[0]?.nome);
      const grupoRegraId = this.criarId(`grupo_${nomeBase}_${this.assinaturaGatilhoRegra(grupo[0])}`);
      grupo.forEach((regra) => {
        regra.grupoRegraId = grupoRegraId;
        regra.nomeBaseGrupo = nomeBase;
        regra.nome = `${nomeBase} [${regra.operacoes?.[0] || ""}]`.trim();
      });
    });

    return regrasAtomicas;
  }

  normalizarBase() {
    this.base.maoObra = Array.isArray(this.base.maoObra) ? this.base.maoObra : [];
    this.base.materiais = this.base.materiais.map((material) => ({
      ...material,
      tipoCabo: material.categoria === "cabo" ? (material.tipoCabo || "BT") : ""
    }));
    const catalogoMaoObraNormalizado = [];
    this.base.maoObra.forEach((item) => {
      const descricao = String(item.descricao || "").trim();
      if (!descricao) return;
      this.salvarPorId(catalogoMaoObraNormalizado, {
        id: item.id || this.criarId(`${item.codigo || ""}_${descricao}`),
        codigo: String(item.codigo || "").trim() || this.criarCodigoMaoObra(descricao),
        descricao,
        unidade: String(item.unidade || "un").trim() || "un"
      });
    });
    this.base.maoObra = catalogoMaoObraNormalizado;

    this.base.regrasMaoObra = this.base.regrasMaoObra.map((regra) => ({
      ...regra,
      gatilho: regra.gatilho || {
        tipo: regra.tipoGatilho || "material",
        materialId: regra.materialId || undefined,
        estruturaId: regra.estruturaId || undefined,
        categorias: regra.categorias || []
      },
      saidas: (regra.saidas || []).map((saida) => {
        const maoObra = this.base.maoObra.find((item) => item.id === saida.maoObraId)
          || this.salvarMaoObraCatalogo({
            id: saida.maoObraId || "",
            codigo: saida.codigo,
            descricao: saida.descricao,
            unidade: "un"
          }, false);
        return {
          ...saida,
          maoObraId: maoObra.id,
          codigo: maoObra.codigo,
          descricao: maoObra.descricao,
          templateDescricao: saida.templateDescricao || undefined,
          quantidade: Number(saida.quantidade || 0)
        };
      })
    }));
    this.base.regrasMaoObra = this.migrarRegrasParaPacotes(this.base.regrasMaoObra);

    this.base.pontos = this.base.pontos.map((ponto) => {
      const migrado = this.migrarCabosLegados(ponto);
      const redeNormalizada = String(ponto.rede || "").toLowerCase();
      return {
        ...ponto,
        ...migrado,
        estruturaId: ponto.estruturaId || "",
        estrutura2Id: ponto.estrutura2Id || "",
        estrutura3Id: ponto.estrutura3Id || "",
        caboBTId: ponto.caboBTId || migrado.caboBTId || "",
        caboMTId: ponto.caboMTId || migrado.caboMTId || "",
        quantidadeCabo: Number(ponto.quantidadeCabo || 0),
        rede: MAPA_REDE_LEGADA[redeNormalizada] || redeNormalizada || ""
      };
    });
  }

  migrarCabosLegados(ponto) {
    if (!ponto.caboId) return {};
    const material = this.base.materiais.find((item) => item.id === ponto.caboId);
    if (material?.tipoCabo === "MT") {
      return { caboMTId: ponto.caboId, caboBTId: ponto.caboBTId || "" };
    }
    return { caboBTId: ponto.caboId, caboMTId: ponto.caboMTId || "" };
  }

  mostrarAviso(texto) {
    this.elementos.aviso.textContent = texto;
    this.elementos.aviso.classList.remove("oculto");
    window.clearTimeout(this.avisoTimer);
    this.avisoTimer = window.setTimeout(() => this.elementos.aviso.classList.add("oculto"), 3500);
  }
}

async function iniciarAplicacao() {
  const repositorio = new RepositorioSupabase(window.APP_CONFIG || {});
  const casosDeUso = new CasosDeUsoApp(repositorio);

  try {
    const base = await casosDeUso.carregarBase();
    new AplicacaoMedicao(casosDeUso, base);
  } catch (erro) {
    console.error(erro);
    document.querySelector("#aviso").textContent = `${erro.message} Verifique scripts/config.js e o SQL do Supabase.`;
    document.querySelector("#aviso").classList.remove("oculto");
  }
}

iniciarAplicacao();
