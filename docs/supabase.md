# Supabase

O Supabase armazena somente os catalogos da aplicacao. Pontos da medicao e o
resultado calculado permanecem na memoria do navegador e nunca sao enviados.

## Configuracao

1. Crie um projeto no Supabase.
2. Abra o SQL Editor e execute `supabase/schema.sql`.
3. Em Project Settings > API, copie a Project URL e a chave `anon`.
4. Preencha `scripts/config.js`:

```js
window.APP_CONFIG = {
  supabaseUrl: "https://SEU-PROJETO.supabase.co",
  supabaseAnonKey: "SUA-CHAVE-ANON",
  baseId: "principal"
};
```

No primeiro acesso, se a tabela estiver vazia, o app envia automaticamente o
conteudo de `base-medicao.json`. Depois disso, alteracoes em materiais, mao de
obra, estruturas e regras sao gravadas pela API REST do Supabase.

## Seguranca

A chave `anon` pode ficar no frontend; a seguranca real e feita por RLS. O SQL
inicial permite escrita anonima para o app funcionar sem login. Portanto, nao
publique a URL de administracao dessa versao para pessoas nao autorizadas.
Antes de uso publico, adicione Supabase Auth e restrinja a politica de escrita
ao papel `authenticated`.
