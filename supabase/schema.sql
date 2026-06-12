create table if not exists public.bases_medicao (
  id text primary key,
  dados jsonb not null default '{"versao":"","materiais":[],"maoObra":[],"estruturas":[],"regrasMaoObra":[],"pontos":[]}'::jsonb,
  atualizado_em timestamptz not null default now()
);

create or replace function public.atualizar_data_base_medicao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em = now();
  new.dados = jsonb_set(new.dados, '{pontos}', '[]'::jsonb, true);
  return new;
end;
$$;

drop trigger if exists bases_medicao_atualizar_data on public.bases_medicao;
create trigger bases_medicao_atualizar_data
before insert or update on public.bases_medicao
for each row execute function public.atualizar_data_base_medicao();

alter table public.bases_medicao enable row level security;

drop policy if exists "base_medicao_leitura_publica" on public.bases_medicao;
create policy "base_medicao_leitura_publica"
on public.bases_medicao for select
to anon, authenticated
using (true);

-- Esta politica permite editar pelo GitHub Pages usando a anon key.
-- Para um site publico, substitua-a por autenticacao antes de publicar o link.
drop policy if exists "base_medicao_escrita_publica" on public.bases_medicao;
create policy "base_medicao_escrita_publica"
on public.bases_medicao for all
to anon, authenticated
using (true)
with check (true);

grant select, insert, update, delete on public.bases_medicao to anon, authenticated;
