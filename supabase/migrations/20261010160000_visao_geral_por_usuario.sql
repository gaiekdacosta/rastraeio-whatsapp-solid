-- Blocos da aba Visão geral que o administrador escolhe para cada usuário (mesmo modelo de perfis.insights).
--
-- visao_geral guarda os ids dos blocos (src/lib/overview.ts) que a pessoa vê. null = todos, que é o caso
-- de quem já existia antes desta migration e de quem nunca teve a seleção alterada.
-- É uma escolha de apresentação, não de acesso: quem limita as conversas continua sendo numeros_usuario.

alter table public.perfis
  add column visao_geral text[] check (visao_geral is null or cardinality(visao_geral) <= 50);

comment on column public.perfis.visao_geral is 'Blocos da aba Visão geral que o usuário vê (ids de src/lib/overview.ts). null = todos.';

-- Só o administrador edita perfis (política "perfis: admin edita"); aqui só liberamos a coluna nova.
grant update (visao_geral) on table public.perfis to authenticated;
