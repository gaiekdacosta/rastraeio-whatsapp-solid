-- Tipo de negócio de cada conta (clínica, loja, outro): muda os termos do painel (procedimento → produto,
-- agendamento → pedido, "da clínica" → "da loja") e as palavras que as heurísticas procuram nas conversas.
--
-- Contas que já existiam ficam como clínica, que era o único tipo até aqui. É uma escolha de apresentação,
-- não de acesso: quem limita as conversas continua sendo numeros_usuario.

alter table public.perfis
  add column segmento text not null default 'clinica' check (segmento in ('clinica', 'loja', 'outro'));

comment on column public.perfis.segmento is 'Tipo de negócio (clinica, loja, outro): termos e heurísticas do painel. Contas da mesma empresa usam o mesmo.';

-- Só o administrador edita perfis (política "perfis: admin edita"); aqui só liberamos a coluna nova.
grant update (segmento) on table public.perfis to authenticated;
