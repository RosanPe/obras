import { LocalStorageBaseRepository } from "../src/infrastructure/adapters/storage/local-storage-base.repository";
import { LocalStorageTemaRepository } from "../src/infrastructure/adapters/storage/local-storage-tema.repository";
import { MaterialRepositoryAdapter } from "../src/infrastructure/adapters/storage/material.repository.adapter";
import { MaoObraRepositoryAdapter } from "../src/infrastructure/adapters/storage/mao-obra.repository.adapter";
import { EstruturaRepositoryAdapter } from "../src/infrastructure/adapters/storage/estrutura.repository.adapter";
import { RegraMaoObraRepositoryAdapter } from "../src/infrastructure/adapters/storage/regra-mao-obra.repository.adapter";
import { PontoMedicaoRepositoryAdapter } from "../src/infrastructure/adapters/storage/ponto-medicao.repository.adapter";

// Composition root parcial (Passo 3): instancia os adapters.
// A ligação com controller/DOM entra no Passo 4.
export function criarContainerInfraestrutura() {
  const baseRepo = new LocalStorageBaseRepository();
  const temaRepo = new LocalStorageTemaRepository();

  return {
    baseRepo,
    temaRepo,
    materialRepo: new MaterialRepositoryAdapter(baseRepo),
    maoObraRepo: new MaoObraRepositoryAdapter(baseRepo),
    estruturaRepo: new EstruturaRepositoryAdapter(baseRepo),
    regraRepo: new RegraMaoObraRepositoryAdapter(baseRepo),
    pontoRepo: new PontoMedicaoRepositoryAdapter(baseRepo)
  };
}
