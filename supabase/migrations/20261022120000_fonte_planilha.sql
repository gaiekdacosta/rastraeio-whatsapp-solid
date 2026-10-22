-- Planilha online: em vez de (ou além de) publicar um arquivo CSV, o administrador cola o link de uma
-- planilha publicada na internet (Google Sheets) e o dashboard de cada pessoa lê o CSV desse link em
-- intervalos, direto do navegador. Linha única, como base_conversas.
--
-- Enquanto esta linha existe, ela tem prioridade sobre o arquivo publicado no bucket `conversas`, e o
-- recorte por número liberado (numeros_usuario) passa a acontecer no navegador: a planilha online é
-- acessível a qualquer pessoa com o link, por isso só vale para planilhas que podem ser vistas por
-- todos os usuários do painel.

create table public.fonte_planilha (
  id boolean primary key default true check (id),
  url text not null check (char_length(url) between 10 and 2000),
  intervalo_seg integer not null default 120 check (intervalo_seg between 30 and 3600),
  definida_em timestamptz not null default now(),
  definida_por uuid references public.perfis (id) on delete set null
);

comment on table public.fonte_planilha is 'Linha única com o link da planilha online lida pelo dashboard e o intervalo de atualização em segundos.';

revoke all on table public.fonte_planilha from anon, authenticated;
grant select, insert, update, delete on table public.fonte_planilha to authenticated;

alter table public.fonte_planilha enable row level security;

create policy "fonte_planilha: logados leem"
  on public.fonte_planilha for select to authenticated
  using (true);

create policy "fonte_planilha: admin define"
  on public.fonte_planilha for insert to authenticated
  with check ((select public.is_admin()));

create policy "fonte_planilha: admin altera"
  on public.fonte_planilha for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "fonte_planilha: admin desliga"
  on public.fonte_planilha for delete to authenticated
  using ((select public.is_admin()));
