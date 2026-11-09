-- Planilha online por cliente: em vez de um link só para todos (fonte_planilha), o administrador liga uma
-- planilha a cada cliente. Cliente = empresa das contas da aba Usuários (perfis.empresa, sem diferenciar
-- maiúsculas nem espaços nas pontas). empresa vazia = planilha de todos os clientes (o comportamento antigo).
--
-- Quem lê o quê (RLS):
--   admin           → todas;
--   usuário comum   → as do cliente dele e as de todos os clientes. O app usa as do cliente quando existem;
--                     senão, as de todos, recortadas por número no navegador.
-- Assim, a planilha de um cliente nunca chega ao navegador das contas de outro cliente.
--
-- Usuário comum não altera perfis.empresa (só o admin edita perfis), então não consegue se passar por
-- outro cliente para ler a planilha dele.

create table public.planilhas_online (
  id uuid primary key default gen_random_uuid(),
  empresa text not null default '' check (char_length(empresa) <= 80),
  url text not null check (char_length(url) between 10 and 2000),
  intervalo_seg integer not null default 120 check (intervalo_seg between 30 and 3600),
  definida_em timestamptz not null default now(),
  definida_por uuid references public.perfis (id) on delete set null
);

comment on table public.planilhas_online is 'Planilhas online (CSV publicado na internet) lidas pelo dashboard. empresa = cliente dono da planilha; vazia = de todos os clientes.';
comment on column public.planilhas_online.empresa is 'Empresa do cliente (igual a perfis.empresa, sem diferenciar maiúsculas); vazia = planilha de todos os clientes.';

-- O mesmo link duas vezes no mesmo cliente não tem uso e duplicaria as conversas.
create unique index planilhas_online_empresa_url on public.planilhas_online (lower(btrim(empresa)), url);

-- Empresa de quem está logado, na forma usada para comparar ('' sem empresa ou sem perfil).
create function public.minha_empresa()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select lower(btrim(empresa)) from public.perfis where id = (select auth.uid())), '')
$$;

revoke all on function public.minha_empresa() from public, anon;
grant execute on function public.minha_empresa() to authenticated;

revoke all on table public.planilhas_online from anon, authenticated;
grant select, insert, update, delete on table public.planilhas_online to authenticated;

alter table public.planilhas_online enable row level security;

create policy "planilhas_online: admin, a do cliente ou a de todos"
  on public.planilhas_online for select to authenticated
  using (
    (select public.is_admin())
    or btrim(empresa) = ''
    or (lower(btrim(empresa)) = (select public.minha_empresa()) and (select public.minha_empresa()) <> '')
  );

create policy "planilhas_online: admin inclui"
  on public.planilhas_online for insert to authenticated
  with check ((select public.is_admin()));

create policy "planilhas_online: admin altera"
  on public.planilhas_online for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "planilhas_online: admin remove"
  on public.planilhas_online for delete to authenticated
  using ((select public.is_admin()));

-- O link único de antes vira a planilha de todos os clientes: ninguém perde acesso.
insert into public.planilhas_online (empresa, url, intervalo_seg, definida_em, definida_por)
select '', url, intervalo_seg, definida_em, definida_por from public.fonte_planilha;
