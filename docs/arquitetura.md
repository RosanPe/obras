# Arquitetura da Aplicacao Web

## Decisao tecnica

A aplicacao usa um frontend estatico no GitHub Pages e o Supabase como banco e API REST para os catalogos.

## Separacao de responsabilidades

- `base-medicao.json`: seed inicial dos catalogos, usando IDs como referencia.
- `scripts/config.js`: URL, chave publica e identificador da base no Supabase.
- `scripts/aplicacao.js`: estado da interface, eventos, renderizacao e acesso a API.
- `supabase/schema.sql`: tabela JSONB, trigger de protecao dos pontos e politicas RLS.
- `src/tipos/modelos.ts`: modelo de dados tipado para evolucao com TypeScript.
- `src/nucleo/motor-de-regras.ts`: versao TypeScript do motor puro de calculo.
- `estilos/principal.css`: layout responsivo e componentes visuais.

## Fluxo de dados

1. A base inicial e carregada no navegador.
2. O usuario edita pontos, materiais, estruturas e regras.
3. Materiais, mao de obra, estruturas e regras sao salvos no Supabase.
4. Pontos e resultados da medicao ficam somente em memoria no navegador.
5. Ao gerar a medicao, o motor percorre os pontos.
6. Estruturas adicionam materiais por ID.
7. Poste e cabo adicionam materiais diretos por ID.
8. Regras de mao de obra sao aplicadas conforme operacao, material, categoria ou estrutura.
9. O resultado e consolidado por codigo e descricao.

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
- Adicionar Supabase Auth antes de expor a tela de cadastros publicamente.
- Incluir exportacao XLSX quando o projeto aceitar dependencias externas.
