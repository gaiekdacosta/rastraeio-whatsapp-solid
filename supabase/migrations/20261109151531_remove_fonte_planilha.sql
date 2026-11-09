-- O link único da planilha online (fonte_planilha) foi copiado para planilhas_online como planilha de todos os
-- clientes (20261109145557_planilhas_por_cliente.sql) e o site não usa mais esta tabela. Ela sai porque qualquer
-- conta logada consegue lê-la: manter o link antigo aqui o deixaria visível mesmo depois de ligado a um cliente.
drop table if exists public.fonte_planilha;
