-- Login, perfis (admin / usuário) e acesso às conversas por número da empresa.
--
-- A planilha é uma só. Ao publicá-la, o administrador envia para o bucket privado `conversas`:
--   <versao>/completa.csv              planilha inteira (só administradores leem)
--   <versao>/numeros/<numero>.csv      conversas atribuídas a cada número da empresa
--   <versao>/numeros/sem-numero.csv    leads que nunca receberam resposta (a planilha não diz o número)
-- e a linha única de `base_conversas` passa a apontar para a nova versão.
-- Cada usuário só consegue baixar os arquivos dos números liberados para ele em `numeros_usuario`.

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  nome text not null default '',
  papel text not null default 'usuario' check (papel in ('admin', 'usuario')),
  criado_em timestamptz not null default now()
);

comment on table public.perfis is 'Um perfil por conta do Supabase Auth. papel = admin vê todos os números e gerencia usuários.';

create table public.numeros_usuario (
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  numero text not null check (numero ~ '^[0-9]+$' or numero = 'sem-numero'),
  primary key (usuario_id, numero)
);

comment on table public.numeros_usuario is 'Números da empresa (coluna Telefone das mensagens enviadas) liberados para cada usuário. sem-numero = leads sem resposta.';

create table public.base_conversas (
  id boolean primary key default true check (id),
  versao text not null,
  nome_arquivo text not null,
  numeros text[] not null default '{}',
  ultima_mensagem timestamptz,
  publicada_em timestamptz not null default now(),
  publicada_por uuid references public.perfis (id) on delete set null
);

comment on table public.base_conversas is 'Linha única com a planilha publicada: pasta da versão no bucket conversas e todos os números da empresa, do mais ao menos ativo.';

-- ---------------------------------------------------------------------------
-- Funções de acesso (security definer: leem perfis sem passar pela RLS e evitam recursão)
-- ---------------------------------------------------------------------------

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfis
    where id = (select auth.uid()) and papel = 'admin'
  )
$$;

create function public.pode_ver_numero(p_numero text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1 from public.numeros_usuario
    where usuario_id = (select auth.uid()) and numero = p_numero
  )
$$;

-- Troca os números de um usuário de uma vez (numa transação só). Roda com as permissões de quem
-- chama, então a RLS abaixo garante que só administradores conseguem.
create function public.definir_numeros_usuario(p_usuario uuid, p_numeros text[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem liberar números.' using errcode = '42501';
  end if;
  delete from public.numeros_usuario
  where usuario_id = p_usuario and not (numero = any (p_numeros));
  insert into public.numeros_usuario (usuario_id, numero)
  select distinct p_usuario, n from unnest(p_numeros) as n
  on conflict do nothing;
end;
$$;

-- Toda conta nova do Auth ganha um perfil de usuário comum. O papel nunca vem dos metadados
-- (que o próprio usuário consegue escrever); quem promove a admin é a Edge Function ou o SQL do README.
create function public.criar_perfil_para_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfis (id, email, nome)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'nome', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.criar_perfil_para_novo_usuario();

-- Impede ficar sem nenhum administrador (rebaixar ou excluir o último).
create function public.proteger_ultimo_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.papel = 'admin'
     and (tg_op = 'DELETE' or new.papel <> 'admin')
     and not exists (select 1 from public.perfis where papel = 'admin' and id <> old.id) then
    raise exception 'É preciso manter pelo menos um administrador.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger perfis_proteger_ultimo_admin
  before update of papel or delete on public.perfis
  for each row execute function public.proteger_ultimo_admin();

-- ---------------------------------------------------------------------------
-- Permissões e RLS
-- ---------------------------------------------------------------------------

revoke all on table public.perfis, public.numeros_usuario, public.base_conversas from anon, authenticated;
grant select, update (nome, papel) on table public.perfis to authenticated;
grant select, insert, delete on table public.numeros_usuario to authenticated;
grant select, insert, update on table public.base_conversas to authenticated;

revoke execute on function public.is_admin(), public.pode_ver_numero(text), public.definir_numeros_usuario(uuid, text[]) from public, anon;
grant execute on function public.is_admin(), public.pode_ver_numero(text), public.definir_numeros_usuario(uuid, text[]) to authenticated;
revoke execute on function public.criar_perfil_para_novo_usuario(), public.proteger_ultimo_admin() from public, anon, authenticated;

alter table public.perfis enable row level security;
alter table public.numeros_usuario enable row level security;
alter table public.base_conversas enable row level security;

create policy "perfis: o próprio ou admin lê"
  on public.perfis for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy "perfis: admin edita"
  on public.perfis for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "numeros_usuario: o próprio ou admin lê"
  on public.numeros_usuario for select to authenticated
  using (usuario_id = (select auth.uid()) or (select public.is_admin()));

create policy "numeros_usuario: admin libera"
  on public.numeros_usuario for insert to authenticated
  with check ((select public.is_admin()));

create policy "numeros_usuario: admin remove"
  on public.numeros_usuario for delete to authenticated
  using ((select public.is_admin()));

create policy "base_conversas: logados leem"
  on public.base_conversas for select to authenticated
  using (true);

create policy "base_conversas: admin publica"
  on public.base_conversas for insert to authenticated
  with check ((select public.is_admin()));

create policy "base_conversas: admin atualiza"
  on public.base_conversas for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Storage: bucket privado com a planilha
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('conversas', 'conversas', false)
on conflict (id) do nothing;

-- Admin lê tudo; usuário lê só <versao>/numeros/<numero>.csv dos números liberados.
create policy "conversas: ler arquivos dos números liberados"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'conversas'
    and public.pode_ver_numero(coalesce(substring(name from '^[^/]+/numeros/([^/]+)\.csv$'), ''))
  );

create policy "conversas: admin envia"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'conversas' and public.is_admin());

create policy "conversas: admin substitui"
  on storage.objects for update to authenticated
  using (bucket_id = 'conversas' and public.is_admin())
  with check (bucket_id = 'conversas' and public.is_admin());

create policy "conversas: admin apaga"
  on storage.objects for delete to authenticated
  using (bucket_id = 'conversas' and public.is_admin());
