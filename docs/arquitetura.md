# Arquitetura da Aplicacao Web

## Decisao tecnica

A aplicacao foi criada como frontend estatico, sem backend e sem dependencias externas. O `index.html` pode ser aberto diretamente no navegador e tambem pode ser hospedado no GitHub Pages.

## Separacao de responsabilidades

- `dados/base-inicial.js`: base inicial em JSON JavaScript, usando IDs como referencia.
- `scripts/aplicacao.js`: estado da interface, eventos, renderizacao e persistencia local.
- `src/tipos/modelos.ts`: modelo de dados tipado para evolucao com TypeScript.
- `src/nucleo/motor-de-regras.ts`: versao TypeScript do motor puro de calculo.
- `estilos/principal.css`: layout responsivo e componentes visuais.

## Fluxo de dados

1. A base inicial e carregada no navegador.
2. O usuario edita pontos, materiais, estruturas e regras.
3. O estado fica em memoria e e salvo em `localStorage`.
4. Ao gerar a medicao, o motor percorre os pontos.
5. Estruturas adicionam materiais por ID.
6. Poste e cabo adicionam materiais diretos por ID.
7. Regras de mao de obra sao aplicadas conforme operacao, material, categoria ou estrutura.
8. O resultado e consolidado por codigo e descricao.

## Regras dinamicas

As atividades de mao de obra nao ficam fixas no codigo. Uma regra pode ter varias saidas, por exemplo:

- Instalacao de poste
- Abertura de cava
- Distribuicao de poste
- Alocacao de material

Novas atividades podem ser cadastradas na aba `Regras`, sem alterar o motor.

## Evolucao recomendada

- Adicionar build com Vite e TypeScript quando `node` estiver disponivel.
- Criar testes unitarios para `src/nucleo/motor-de-regras.ts` com Vitest.
- Trocar `localStorage` por IndexedDB apenas se a base crescer muito.
- Incluir exportacao XLSX quando o projeto aceitar dependencias externas.
