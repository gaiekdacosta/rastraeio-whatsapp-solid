-- Empresa do usuário (mostrada no topo do painel) e insights que o administrador escolhe para ele.
--
-- insights guarda os ids dos blocos da aba Insights (src/lib/insights.ts). null = todos, que é o caso
-- de quem já existia antes desta migration e de quem nunca teve a seleção alterada.
-- É uma escolha de apresentação, não de acesso: quem controla quais conversas a pessoa recebe
-- continua sendo numeros_usuario.

alter table public.perfis
  add column empresa text not null default '' check (char_length(empresa) <= 80),
  add column insights text[] check (insights is null or cardinality(insights) <= 50);

comment on column public.perfis.empresa is 'Nome da empresa do usuário, mostrado no topo do painel. Vazio = só a marca.';
comment on column public.perfis.insights is 'Blocos da aba Insights que o usuário vê (ids de src/lib/insights.ts). null = todos.';

-- Só o administrador edita perfis (política "perfis: admin edita"); aqui só liberamos as colunas novas.
grant update (nome, papel, empresa, insights) on table public.perfis to authenticated;
