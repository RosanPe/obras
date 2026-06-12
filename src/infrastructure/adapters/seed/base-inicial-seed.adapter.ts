import type { BaseMedicao } from "../../../domain/ports/base-medicao.repository.port";

interface WindowWithSeed extends Window {
  baseInicial?: BaseMedicao;
}

export class BaseInicialSeedAdapter {
  obterSeed(): BaseMedicao | null {
    const globalWindow = window as WindowWithSeed;
    if (!globalWindow.baseInicial) return null;
    return JSON.parse(JSON.stringify(globalWindow.baseInicial));
  }
}
