# Solid Marketing Digital · Rastreio WhatsApp

Dashboard em React para analisar e gerenciar as conversas de WhatsApp exportadas na planilha de rastreio
(**“Rastreio WhatsApp – Conversas WhatsApp”**). Todas as conversas vêm de uma planilha só; o acesso
é por login (Supabase) e cada usuário vê apenas as conversas dos **números da empresa** que o administrador liberou para ele.

A planilha pode ser lida **em tempo real** (link do Google Sheets, relido em intervalos) ou publicada como arquivo CSV.
Se ela tiver as colunas **Classificação** (a que as automações já preenchem: frio, morno, quente ou outros valores) e **Anúncio**,
o painel ganha filtros, gráficos e o ranking de anúncios por leads, classificação, agendamentos (ou pedidos) e vendas. Cada cliente
tem um **tipo de negócio** (clínica, loja ou outro) que ajusta os termos e as métricas: loja fala em produtos e pedidos, não em
procedimentos e agendamentos. Qualquer tela gera um **relatório em PDF** com as métricas principais.

## Rodar

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # gera dist/ (site estático, pode ser hospedado em qualquer lugar)
npm run preview    # serve o build em http://localhost:4173
```

Sem as variáveis do Supabase (ou com os valores de exemplo do `.env.example`), o site abre em **modo demonstração**,
tanto no `npm run dev` quanto no build publicado: login de mentira guardado no navegador (`admin@demo.local` /
`admin1234` e `usuario@demo.local` / `usuario1234`, mostrados na tela de login) e a planilha publicada pelo admin em
**Dados** guardada no IndexedDB do navegador. No `npm run dev`, enquanto nada foi publicado, vale o primeiro `.csv` de
`data/` (ele nunca vai para o build nem para o git: `data/*.csv` está no `.gitignore`, porque são conversas reais, com
nomes e telefones). Serve para ver as telas antes de configurar o Supabase; não use com dados reais
num site público, porque as senhas de demonstração estão na própria tela.

## Login, perfis e números liberados

| Perfil | O que vê e faz |
|---|---|
| **Administrador** | Todas as conversas e todos os blocos do painel. No topo, o filtro **Clientes** troca o painel inteiro para um cliente. Aba **Usuários**: cria contas (e-mail + senha), define o perfil, a empresa e o painel de cada usuário (quais indicadores, gráficos e listas ele vê), redefine senha, exclui e marca os números que cada usuário vê. Aba **Dados**: liga a planilha online ou publica um arquivo. |
| **Usuário** | Só as conversas dos números marcados para ele, em todas as abas, totais e exportações. Vê o nome da **empresa** dele no topo e, nas abas Visão geral e Insights, só os blocos que o administrador escolheu. Pode trocar a própria senha. |

Com o [login com Google](#login-com-google-opcional) ligado, qualquer conta pode entrar também pelo Google, com o mesmo e-mail.

Os números da aba Usuários são os **números da empresa encontrados no CSV** (coluna `Telefone` das mensagens *Enviadas*),
com os atendentes e o total de conversas de cada um. Há também a coluna **Sem número**: leads que nunca receberam
resposta, que a planilha não liga a nenhum número. Só os vê quem tem essa coluna marcada.
A conversa pertence ao número que mais respondeu nela, o mesmo critério do filtro “Número da empresa”.

Mudanças de números valem no próximo acesso da pessoa (ou quando ela recarrega a página).

### Empresa e painel por usuário

- **Empresa**: definida ao criar o usuário ou no lápis (Editar). Aparece no topo do painel dele, ao lado da marca Solid,
  e no título da aba do navegador. Sem empresa, o topo fica só com a marca.
- **Negócio**: coluna **Negócio** da matriz (ou “Tipo de negócio” ao criar): clínica / estética, loja / varejo ou outro negócio.
  Vale para todas as contas da mesma empresa; veja [Tipo de negócio](#tipo-de-negócio-clínica-loja-outro).
- **Painel**: coluna **Painel** da matriz de usuários (ou o bloco “Painel que a pessoa vê” ao criar). O administrador marca,
  para cada usuário, o que aparece em cada aba:
  - **Visão geral**: cada indicador separadamente (conversas de leads, novos leads, mensagens recebidas, enviadas, mediana da
    1ª resposta, aguardando resposta, sem status, leads quentes ou classificados), a tabela de atendimento por número, mensagens
    por dia, novos leads por semana, procedimentos (ou produtos), estágio inferido, status manual, classificação dos leads,
    anúncios e a lista de leads aguardando resposta.
  - **Insights**: destaques, indicadores, funil, tempo de 1ª resposta, mapa de calor, perfil horário, pedidos, taxa de
    agendamento (ou de pedido) por procedimento (ou produto), canal de origem, taxa por anúncio, aguardando resposta e leads esfriando.

  Os nomes dos blocos no seletor seguem o tipo de negócio da pessoa (ex.: “Produtos de interesse” para uma loja).

  O botão da coluna mostra “todos” ou quantos blocos estão marcados (ex.: “12 de 29”). “Todos” vale também para blocos
  criados no futuro. Sem nenhum bloco de Insights marcado, a aba Insights some do painel; sem nenhum da Visão geral, a aba
  mostra um aviso. É uma escolha de apresentação: quem limita os dados continua sendo a liberação de números.

## Planilha online (tempo real)

Em **Dados → Planilha online**, o administrador cola o link da planilha do Google Sheets (a aba com as conversas) e
escolhe o intervalo (1 a 15 minutos). A partir daí o dashboard de **cada pessoa** lê o CSV da planilha sozinho, no
intervalo escolhido e sempre que a aba do navegador volta a ficar visível; só reprocessa quando o conteúdo mudou. Na barra de
filtros aparece “Atualizado às HH:MM” com um botão para atualizar na hora. A planilha pode ter vários números de atendimento:
a divisão por número e por cliente continua automática, como no arquivo.

Para o navegador conseguir ler a planilha, ela precisa estar **compartilhada com “Qualquer pessoa com o link” (Leitor)** ou
**publicada na web em CSV** (Arquivo → Compartilhar → Publicar na web → a aba → CSV). Vale colar o endereço do navegador com a
aba aberta (`…/edit#gid=…`), o link publicado (`…/pub?output=csv`) ou qualquer URL que devolva um CSV. O Google Sheets
responde com os cabeçalhos CORS necessários nos dois casos; planilhas publicadas na web levam até 5 minutos para refletir
mudanças. “Testar e ligar” lê a planilha, confere as colunas e mostra quantas mensagens, números e colunas extras encontrou.

No Supabase, o link fica na tabela `fonte_planilha` (linha única; migration `20261022120000_fonte_planilha.sql`) e tem
prioridade sobre o arquivo publicado enquanto existir; **Desligar** apaga a linha e o painel volta ao último arquivo. No modo
demonstração ele fica no `localStorage` do navegador.

**Atenção à privacidade**: quem tiver o link consegue abrir a planilha inteira, e com a planilha online o recorte por número
liberado acontece no navegador de cada usuário, não no servidor. Use-a quando todos os usuários do painel podem ver a planilha
toda (ex.: a equipe da agência). Para entregar a cada cliente só as conversas dele com garantia no servidor, publique um arquivo.

## Classificação e anúncio

Além das colunas obrigatórias, a planilha pode ter (em qualquer ordem; maiúsculas e acentos não importam):

| Coluna | Conteúdo | O que muda no painel |
|---|---|---|
| **Classificação** (ou `Classificação do lead`; planilhas antigas com `Temperatura` também valem) | A classificação que as automações gravam. `frio`, `morno` e `quente` (aceita “Quente 🔥”, “fria”, “hot”…) viram a escala Quente › Morno › Frio, com cores e ícones próprios; qualquer outro valor (ex.: “Qualificado”) aparece como veio. Vale o último valor preenchido nas linhas da conversa. | Filtro **Classificação**, indicador **Leads quentes** (ou **Leads classificados**, quando os valores não são de temperatura), gráfico **Classificação dos leads**, badge em cada conversa e uma coluna por classificação no ranking de anúncios. |
| **Anúncio** (ou `Campanha`, `Ad`) | De qual anúncio o lead veio. | Filtro **Anúncio**, bloco **Anúncios** na Visão geral, **Taxa de agendamento (ou de pedido) por anúncio** nos Insights e badge na conversa. |

O painel só lê a coluna Classificação; não escreve nela nem muda o nome dela. O export “Mensagens com status_manual
preenchido” devolve a coluna com o mesmo nome e os mesmos valores da planilha.

Sem a coluna Anúncio, o painel ainda identifica o anúncio pela **mensagem padrão** com que o lead chegou: a frase do CTA
(“tenho interesse no…”) ou, quando a primeira mensagem é idêntica à de pelo menos 5 outros leads, o texto inicial (sem a
saudação). A coluna, quando existe, tem prioridade.

O bloco **Anúncios** responde “quais anúncios geraram mais leads frios / quentes / vendas”: um seletor ordena o ranking por
leads, por cada classificação da planilha, por agendamentos (pedidos, numa loja) ou por vendas; com classificação na planilha,
as barras de leads são divididas por ela. A tabela (botão **Tabela**) traz todos os anúncios com todas as colunas. **Agendados**
(**Pedidos** numa loja) = agendamento (pedido) ou pagamento sinalizado na conversa, ou status Agendado (Pedido feito)/Convertido;
**Vendas** = conversas com status **Convertido** (dado na aba Conversas ou vindo da coluna `status_manual` da planilha).

## Tipo de negócio (clínica, loja, outro)

Cada conta de cliente tem um tipo de negócio, escolhido na coluna **Negócio** da aba Usuários (vale para todas as contas da mesma
empresa; contas antigas ficam como clínica). Ele troca os termos do painel, do relatório em PDF e dos exports, e o que as
heurísticas procuram nas conversas:

| | Clínica / estética | Loja / varejo | Outro negócio |
|---|---|---|---|
| Quem atende | clínica | loja | empresa |
| O que o lead procura | **Procedimento** (botox, facetas, harmonização…) | **Produto** (camisas e blusas, polos, calças, calçados, conjuntos e kits, acessórios…) | Produto ou serviço (só pela mensagem do anúncio) |
| Intenção do lead | **Pediu agendamento** (agendar, avaliação, horário) | **Interesse de compra** (tamanho, estoque, entrega, “vou levar”) | Pediu horário ou compra (os dois) |
| Fechamento | **Agendamento sinalizado** (clínica confirma horário) | **Pedido sinalizado** (loja separa, reserva, manda o motoboy) | Fechamento sinalizado (os dois) |
| Status manual | Agendado | Pedido feito | Agendado / pedido |
| Métricas | Taxa de agendamento, Agendados | Taxa de pedido, Pedidos | Taxa de fechamento, Fechados |

Pagamento sinalizado (Pix, comprovante), vendas (status Convertido), tempos de resposta, mapa de calor e anúncios funcionam igual
nos três. O status Agendado/Pedido feito é o mesmo por baixo: trocar o tipo de negócio não perde o que já foi marcado, e a coluna
`status_manual` da planilha aceita qualquer um dos rótulos.

O administrador vê cada cliente com os termos dele ao escolher o cliente no topo; em **Todos os clientes**, se todos forem do mesmo
tipo, usa esse tipo, e se houver tipos diferentes, usa os termos neutros de “outro negócio” (cada conversa continua sendo lida com
as regras do cliente dono do número).

## Relatório em PDF

O botão **PDF** no topo (ou em **Dados → Exportar**) abre um relatório com as métricas do período e dos filtros atuais: cliente,
período, indicadores, destaques, novos leads por semana, procedimentos (ou produtos), mensagens por dia, classificação, canal, funil
e o ranking de anúncios, com os termos do tipo de negócio do cliente. **Salvar PDF** usa a impressão do navegador (escolha “Salvar como PDF”); o relatório é sempre no tema claro, em A4,
e respeita os blocos que o administrador liberou para o usuário. O nome do cliente é a empresa do usuário, o cliente escolhido no
filtro **Clientes** ou “Todos os clientes”.

### Como o acesso é garantido

A planilha não fica mais em `public/`, porque tudo ali vai para o build e poderia ser baixado sem login. Ao publicar,
o navegador do administrador divide o CSV e envia para o bucket **privado** `conversas` do Supabase Storage:

```
<versao>/completa.csv              planilha inteira: só administradores leem
<versao>/numeros/<numero>.csv      conversas atribuídas a cada número da empresa
<versao>/numeros/sem-numero.csv    leads sem resposta
```

As políticas de RLS do Storage só entregam a um usuário os arquivos dos números liberados para ele em
`numeros_usuario`. O filtro não acontece no navegador: os outros arquivos nem chegam até ele. Cada publicação vai
para uma pasta nova; os usuários passam para ela de uma vez (linha única de `base_conversas`) e as versões antigas
são apagadas.

## Configurar o Supabase

1. **Crie o projeto** em [supabase.com](https://supabase.com).
2. **Rode as migrations** de `supabase/migrations/`, em ordem: cole cada uma no **SQL Editor** ou use a CLI
   (`npx supabase login`, `npx supabase link --project-ref <ref>`, `npx supabase db push`). Elas criam as tabelas
   `perfis` (com empresa, tipo de negócio e painel de cada usuário), `numeros_usuario` e `base_conversas`, as políticas de RLS, o bucket
   privado `conversas` e as travas (perfil criado automaticamente para toda conta nova; ninguém rebaixa nem exclui o
   último administrador).
3. **Publique a Edge Function** `admin-usuarios`, que cria contas, redefine senhas e exclui usuários com a chave de serviço,
   que nunca vai para o navegador:
   ```bash
   npx supabase functions deploy admin-usuarios
   ```
   O `supabase/config.toml` já desliga o *Verify JWT* do gateway para ela, porque a função confere o token e o perfil de
   admin por conta própria (e assim funciona com as chaves novas `sb_publishable_`). Se publicar pelo painel, desligue
   **Verify JWT** na função.
4. **Feche o cadastro aberto**: *Authentication → Sign In / Providers* → desligue **Allow new users to sign up**.
   Deixe o provedor **Email** ligado: desligá-lo desliga também o login por e-mail.
5. **Crie o primeiro administrador**: *Authentication → Users → Add user → Create new user* (marque *Auto Confirm User*)
   e rode no SQL Editor:
   ```sql
   update public.perfis set papel = 'admin' where email = 'voce@empresa.com.br';
   ```
6. **Configure o site**: copie `.env.example` para `.env` e preencha com *Project Settings → API*:
   ```
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   # ou VITE_SUPABASE_ANON_KEY em projetos antigos
   ```
   Nunca coloque a *secret* / *service_role* key no `.env` do site: tudo que começa com `VITE_` vai para o navegador.
7. Rode `npm run build`, publique o `dist/`, entre como administrador, publique o CSV em **Dados** e libere os números
   em **Usuários**.

### Login com Google (opcional)

O botão **Entrar com Google** só aparece na tela de login quando o provedor Google está ligado no Supabase: não precisa
mudar o site nem publicar de novo. Com o cadastro aberto desligado (passo 4), **só entra quem já tem conta**: o Supabase liga
o Google à conta de mesmo e-mail criada na aba Usuários. Um e-mail do Google sem conta vê “Este e-mail do Google não tem
conta no painel”. A senha da conta continua valendo.

1. No [Google Cloud Console](https://console.cloud.google.com/apis/credentials), crie (ou escolha) um projeto e configure a
   **tela de consentimento OAuth** (*Google Auth Platform → Branding*): nome do app, e-mail de suporte e, em *Audience*,
   **External** (ou **Internal**, se todos usam o Google Workspace da mesma empresa). Publique o app (*Publish app*) para
   não ficar restrito aos usuários de teste.
2. Em *Clients → Create client*: tipo **Web application**.
   - **Authorized JavaScript origins**: a URL do site (ex.: `https://rastraeio-whatsapp-solid.vercel.app`) e
     `http://localhost:5173` para desenvolvimento.
   - **Authorized redirect URIs**: `https://<ref>.supabase.co/auth/v1/callback`.
3. No Supabase, *Authentication → Sign In / Providers → Google*: ligue, cole o **Client ID** e o **Client Secret** e salve.
4. Em *Authentication → URL Configuration*: **Site URL** = a URL do site; em **Redirect URLs**, adicione
   `https://<seu-site>/**` e `http://localhost:5173/**`. Sem isso, o Supabase devolve o login para a Site URL padrão
   (`http://localhost:3000`) e o login não termina.

**Atualizando um projeto que já estava no ar**: rode também as migrations `20261010120000_empresa_e_insights.sql`,
`20261010160000_visao_geral_por_usuario.sql` (empresa e painel por usuário), `20261022120000_fonte_planilha.sql` (planilha
online) e `20261108173011_segmento.sql` (tipo de negócio; `npx supabase db push` aplica só as que faltam) e publique a função de
novo (`npx supabase functions deploy admin-usuarios`), antes de subir o site novo. Sem as duas primeiras, o login mostra um aviso
dizendo qual falta; sem a terceira, o painel funciona só com arquivo e avisa ao tentar ligar a planilha online; sem a do tipo de
negócio, o painel continua funcionando com todo mundo como clínica e avisa ao tentar trocar o tipo na aba Usuários.

### Supabase local (opcional)

Com Docker, `npx supabase start` sobe um Supabase local com a migration e a função já aplicadas. As portas são 553xx
(API em `http://127.0.0.1:55321`) para não colidir com outro projeto local nas portas padrão. Use a URL e a
*Publishable key* que o `npx supabase status` mostrar num `.env.local`, crie o admin pelo Studio (`http://127.0.0.1:55323`)
e promova com o SQL do passo 5.

## O que tem

| Aba | Conteúdo |
|---|---|
| **Visão geral** | Blocos escolhidos pelo administrador para cada usuário (admin vê todos): KPIs do período (conversas, novos leads, mensagens, mediana da 1ª resposta, leads aguardando resposta, sem status, leads quentes ou classificados), atendimento por número, **anúncios** (ranking por leads, classificação, agendamentos ou pedidos e vendas), mensagens por dia, novos leads por semana, classificação dos leads, procedimentos (ou produtos) de interesse, estágio inferido, status manual e lista de leads aguardando resposta. |
| **Conversas** | Lista pesquisável (nome, telefone, texto, anúncio, classificação) com ordenação e filtros rápidos; detalhe em formato de chat com classificação e anúncio; **status manual, data de follow-up e notas** por conversa; link “Abrir no WhatsApp”. |
| **Insights** | Blocos escolhidos pelo administrador para cada usuário (admin vê todos): destaques automáticos (inclusive classificação e anúncios), funil inferido, distribuição do tempo de 1ª resposta, mapa de calor dia × hora, perfil horário, pedidos mais comuns (valor, agendamento ou compra, endereço), taxa de agendamento (ou de pedido) por procedimento (ou produto) e por anúncio, canal de origem, leads aguardando resposta e leads esfriando. |
| **Dados** | Planilha online (admin), informações da base e colunas encontradas, publicação de arquivo (admin) ou números liberados (usuário), exportação (relatório em PDF, CSV original com `status_manual` preenchido e resumo por lead), limpeza dos status salvos no navegador e explicação dos cálculos. |
| **Usuários** (admin) | Matriz usuários × números da planilha, perfil, tipo de negócio e painel de cada um, novo usuário com senha gerada, edição de nome/empresa/senha e exclusão. |

Os filtros de período, procedimento (ou produto), status, canal, classificação, anúncio e número da empresa ficam numa única barra e
valem para todas as abas (e para o relatório em PDF). Classificação e anúncio só aparecem quando a base tem esses dados.

**Clientes (administrador)**: no topo do painel do administrador aparece o filtro **Clientes**, um cartão por cliente. Cliente é a
**empresa** das contas da aba Usuários, com todos os números liberados para ela (duas contas com a mesma empresa são o mesmo
cliente; conta sem empresa vira um cliente com o próprio nome). Ao escolher um cliente, todas as abas, totais, gráficos e
insights passam a mostrar só as conversas dos números dele, como ele mesmo vê; **Todos os clientes** volta à planilha inteira.
Números da planilha que nenhuma conta tem liberados ficam em **Sem cliente**. Dentro de um cliente com mais de um número
aparece ainda o filtro por número descrito abaixo. Sem nenhuma conta de cliente, o topo mostra direto o filtro por número.

**Bases com mais de um número**: quando o CSV (ou o recorte liberado para o usuário, ou o cliente escolhido) tem mais de um número da
empresa, aparece o filtro **Número da empresa** no topo, com dois visuais (cartões com contagem e participação de cada número, ou uma linha
compacta de botões; o ícone à direita alterna). Em **Renomear** dá para dar um nome a cada número (ex.: “Loja Centro”),
que passa a aparecer em todo o dashboard e no export por lead; nomes e visual ficam salvos no navegador. Também aparecem a tabela **Atendimento por número** na Visão geral (clique numa linha para filtrar), o número em cada conversa
da lista e, no chat, o atendente e o número de cada mensagem enviada. Com um número só, nada disso aparece.
Todo gráfico tem um botão **Tabela** com os mesmos números.

## Como status, follow-ups e notas são guardados

Status, follow-up e notas são salvos no `localStorage` do navegador, indexados pelo telefone do lead. Ou seja,
continuam locais a cada computador, não são compartilhados entre usuários, e continuam valendo quando uma
exportação mais recente é publicada. Se a planilha já vier com a coluna `status_manual` preenchida com um dos rótulos do app (Novo, Em atendimento, Aguardando lead,
Agendado, Convertido, Perdido, Não é lead), esse valor é usado como ponto de partida.

Para levar o status de volta à planilha: **Dados → Exportar → Mensagens com status_manual preenchido**.

## Heurísticas (resumo)

- **Conversa**: mensagens *Recebidas* agrupam pelo `Telefone`; *Enviadas* agrupam pelo `Respondendo para`.
  IDs longos (grupos) são marcados como grupo e ficam fora das métricas de leads.
- **Número da empresa**: o `Telefone` das linhas *Enviadas*. A conversa conta para o número que mais respondeu nela.
  As *Recebidas* não dizem para qual número foram, então leads sem nenhuma resposta ficam como “não identificado”
  quando há mais de um número. Conversas entre dois números da empresa são marcadas como internas e ficam fora das métricas.
- **Procedimento / produto**: mensagem padrão do anúncio (“Olá, tenho interesse no …!”) → palavras-chave do lead (procedimentos
  numa clínica, categorias de produto numa loja) → só em clínicas, palavras-chave nas respostas da clínica → “Não identificado”.
- **Canal**: Anúncio (CTA, mensagem padrão do anúncio ou coluna Anúncio), Instagram, Prospecção ativa (a empresa iniciou) ou
  Orgânico / outro.
- **Classificação**: coluna Classificação da planilha (ou Temperatura); último valor preenchido na conversa. **Anúncio**: coluna
  Anúncio ou, sem ela, a mensagem padrão com que o lead chegou (CTA ou texto inicial idêntico ao de 5+ leads).
- **Estágio inferido**: pagamento › agendamento (pedido) sinalizado › pediu agendamento (interesse de compra) › em conversa ›
  contato inicial, além de “sem resposta da clínica (loja)” e “prospecção sem retorno”. As palavras procuradas dependem do tipo
  de negócio (tabela em [Tipo de negócio](#tipo-de-negócio-clínica-loja-outro)).
- **Tempo de resposta**: da primeira mensagem do lead sem resposta até a próxima mensagem da clínica.
- **Espera / silêncio**: calculados em relação à última mensagem da planilha inteira (não ao relógio atual), a mesma
  referência para todos os usuários.

## Stack

Vite + React 18 + TypeScript, Recharts, PapaParse, lucide-react, Supabase (Auth, Postgres com RLS, Storage e uma Edge Function).
Paleta e regras de visualização seguem a skill `dataviz` (cores validadas para daltonismo nos modos claro e escuro).

## Estrutura

```
src/
  auth/       types.ts (contrato do backend), supabaseBackend.ts, demoBackend.ts (só dev), backend.ts (escolhe), AuthProvider.tsx
  lib/        parse.ts (CSV, colunas Classificação/Anúncio), sheet.ts (planilha online: link → CSV), classification.ts, segment.ts (tipo de negócio: termos e regras), access.ts (divisão por número), clients.ts (clientes = contas por empresa), analytics.ts (conversas, funil, métricas, ranking de anúncios), blocks.ts + overview.ts + insights.ts + panel.ts (blocos do painel por usuário), export.ts, storage.ts, status.ts
  components/ FilterBar (filtros + botão de atualizar da planilha online), ChoiceFilter (cartões/linha compacta), ClientFilter (clientes), LineFilter (filtro/renomear números), UserMenu, BlockPicker + PanelPicker (seleção dos blocos), PasswordField, Modal, ThemeToggle, StatTile, ChartCard, StatusBadge (+ ClassificationBadge), charts/ (inclui StackedHBars)
  views/      LoginView, OverviewView, ConversationsView, InsightsView, DataView, UsersView, ReportView (relatório em PDF)
  AuthGate.tsx   login / erro de acesso / dashboard
  theme.tsx      tema claro/escuro + paleta para os gráficos
  lineNames.tsx  nomes dados aos números da empresa
  vocab.tsx      termos do tipo de negócio que está na tela (clínica, loja, outro)
supabase/
  migrations/    tabelas, RLS, bucket e travas; empresa, insights e visão geral por usuário; fonte_planilha (planilha online); segmento (tipo de negócio)
  functions/admin-usuarios/   criar conta, redefinir senha, excluir conta (só admin)
  config.toml    Supabase local (portas 553xx, cadastro aberto desligado)
data/            CSV exportado para testar no modo demonstração (só no seu computador: fora do git)
```
