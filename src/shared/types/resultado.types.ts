export interface LinhaResultado {
  codigo: string;
  descricao: string;
  quantidade: number;
  unidade: string;
}

export interface ResultadoMedicao {
  materiaisInstalacao: LinhaResultado[];
  materiaisDesativacao: LinhaResultado[];
  maoObraInstalacao: LinhaResultado[];
  maoObraDesativacao: LinhaResultado[];
  maoObraReinstalacao: LinhaResultado[];
}
