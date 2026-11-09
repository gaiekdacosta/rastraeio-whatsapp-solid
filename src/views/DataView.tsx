import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, CircleHelp, Cloud, Download, ExternalLink, FileDown, FileSpreadsheet, Lock, Pencil, Phone, Plus, RefreshCw, Trash2, Upload, Users } from 'lucide-react'
import type { Conversation, Dataset } from '../lib/types'
import type { MetaMap } from '../lib/storage'
import type { FonteInput, FonteOnline } from '../auth/types'
import { buildLeadsCsv, buildMessagesCsv, downloadText } from '../lib/export'
import { parseCsv } from '../lib/parse'
import { DEFAULT_SHEET_INTERVAL, SHEET_INTERVALS, fetchSheetCsv, isGoogleSheet } from '../lib/sheet'
import { useLineNames } from '../lineNames'
import { useVocab } from '../vocab'
import { fmtDateTime, fmtInt, fmtLine, fmtTime, toDateKey } from '../lib/format'
import { SEM_NUMERO } from '../lib/access'
import { SEGMENTO_LABEL } from '../lib/segment'
import { TODOS_LABEL, empresaKey, isTodos, sourceLabel } from '../lib/sources'
import type { LiveInfo } from '../components/FilterBar'

/** Última leitura de uma planilha online. */
export interface SheetStatus {
  status: 'loading' | 'ok' | 'error'
  at: Date | null
  message: string | null
  /** Mensagens na última leitura boa (null = ainda não leu). */
  messages: number | null
}

export type PublishState =
  | { status: 'idle' }
  | { status: 'publishing' }
  | { status: 'done'; at: Date }
  | { status: 'error'; message: string }

interface Props {
  dataset: Dataset | null
  skipped: number
  allConvs: Conversation[]
  attendants: Map<string, string[]>
  meta: MetaMap
  error: string | null
  isAdmin: boolean
  demo: boolean
  /** Números liberados para o usuário logado (para quem não é admin). */
  allowed: string[]
  publish: PublishState
  onFile: (file: File) => void
  onClearMeta: () => void
  /** Planilhas online lidas por quem está logado (admin: todas); vazio = base vem do arquivo publicado. */
  sources: FonteOnline[]
  sheetStatus: Map<string, SheetStatus>
  /** Empresas conhecidas (contas e planilhas), para escolher o cliente de uma planilha. */
  empresas: string[]
  /** Empresas (chave de comparação) que têm pelo menos uma conta: planilha de cliente sem conta não chega a ninguém. */
  empresasComConta: Set<string>
  live: LiveInfo | null
  onSaveSource: (fonte: FonteInput) => Promise<void>
  onRemoveSource: (id: string) => Promise<void>
  onRefresh: () => void
  onReport: () => void
}


export function DataView({
  dataset,
  skipped,
  allConvs,
  attendants,
  meta,
  error,
  isAdmin,
  demo,
  allowed,
  publish,
  onFile,
  onClearMeta,
  sources,
  sheetStatus,
  empresas,
  empresasComConta,
  live,
  onSaveSource,
  onRemoveSource,
  onRefresh,
  onReport,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { label, isRenamed } = useLineNames()
  const v = useVocab()
  const [drag, setDrag] = useState(false)
  const classified = allConvs.filter((c) => meta[c.key]?.status).length
  const withNotes = allConvs.filter((c) => meta[c.key]?.notes?.trim()).length
  const withFollow = allConvs.filter((c) => meta[c.key]?.followUp).length
  const stamp = toDateKey(new Date()).replace(/-/g, '')
  const columns = dataset?.columns ?? {}

  return (
    <div className="grid grid-2">
      {isAdmin && (
        <SheetsCard
          sources={sources}
          sheetStatus={sheetStatus}
          empresas={empresas}
          empresasComConta={empresasComConta}
          live={live}
          onSave={onSaveSource}
          onRemove={onRemoveSource}
          onRefresh={onRefresh}
        />
      )}

      <section className="card" aria-label="Base atual">
        <div className="card-head">
          <div>
            <h3 className="card-title">Base atual</h3>
            <p className="card-sub">{isAdmin ? 'Tudo o que o painel está lendo agora, de todos os clientes' : 'Conversas dos números liberados para você'}</p>
          </div>
        </div>
        {error && <div className="callout warn" style={{ marginBottom: 12 }}>{error}</div>}
        {dataset ? (
          <dl className="kv">
            <dt>Origem</dt>
            <dd>
              {dataset.origem === 'online' ? (
                <>
                  {sources.length > 1 ? `${sources.length} planilhas online` : 'Planilha online'}
                  {live ? `, lida${sources.length > 1 ? 's' : ''} a cada ${Math.round(live.intervaloSeg / 60)} min${sources.length > 1 ? ' (a mais frequente)' : ''}` : ''}
                  {sources.length === 1 && isGoogleSheet(sources[0].url) ? ' (Google Sheets)' : ''}
                  {!isAdmin && (
                    <button type="button" className="btn ghost sm" style={{ marginLeft: 8 }} onClick={onRefresh} disabled={live?.status === 'loading'}>
                      <RefreshCw size={13} className={live?.status === 'loading' ? 'spin' : undefined} aria-hidden /> Atualizar agora
                    </button>
                  )}
                </>
              ) : (
                `Arquivo: ${dataset.fileName}`
              )}
            </dd>
            <dt>Mensagens</dt>
            <dd>{fmtInt(dataset.messages.length)}{skipped ? ` (${fmtInt(skipped)} linhas ignoradas por data/tipo inválidos)` : ''}</dd>
            <dt>Conversas</dt>
            <dd>{fmtInt(allConvs.length)}</dd>
            <dt>Período</dt>
            <dd>
              {dataset.messages.length ? `${fmtDateTime(dataset.messages[0].at)} → ${fmtDateTime(dataset.messages[dataset.messages.length - 1].at)}` : '—'}
            </dd>
            <dt>{dataset.clinicPhones.length > 1 ? `Números da empresa (${dataset.clinicPhones.length})` : 'Número da empresa'}</dt>
            <dd>
              {dataset.clinicPhones.length === 0
                ? 'não detectado'
                : dataset.clinicPhones.map((p) => {
                    const n = allConvs.filter((c) => c.line === p && !c.isGroup && !c.isInternal).length
                    const names = attendants.get(p) ?? []
                    return (
                      <div key={p}>
                        {isRenamed(p) ? `${label(p)} (${fmtLine(p)})` : fmtLine(p)} · {fmtInt(n)} conversas
                        {names.length > 0 && <span className="muted"> · {names.join(', ')}</span>}
                      </div>
                    )
                  })}
            </dd>
            <dt>Classificação e anúncio</dt>
            <dd>
              {columns.classification ? `Classificação: coluna “${columns.classification}”` : 'Sem coluna Classificação'}
              {' · '}
              {columns.ad ? `Anúncio: coluna “${columns.ad}”` : allConvs.some((c) => c.ad) ? 'Anúncio: pela mensagem inicial do lead (sem coluna Anúncio)' : 'Sem coluna Anúncio'}
            </dd>
            {dataset.origem === 'online' ? (
              <>
                <dt>Última leitura</dt>
                <dd>{dataset.fetchedAt ? fmtDateTime(dataset.fetchedAt) : '—'}</dd>
              </>
            ) : dataset.publishedAt ? (
              <>
                <dt>Publicada em</dt>
                <dd>{fmtDateTime(dataset.publishedAt)}</dd>
              </>
            ) : (
              <>
                <dt>Carregado em</dt>
                <dd>{fmtDateTime(dataset.loadedAt)}</dd>
              </>
            )}
          </dl>
        ) : (
          <div className="empty">{isAdmin ? 'Nenhuma planilha ainda. Adicione uma planilha online acima ou envie um CSV ao lado.' : 'Nenhuma base carregada.'}</div>
        )}
      </section>

      {isAdmin ? (
        <section className="card" aria-label="Publicar planilha">
          <div className="card-head">
            <div>
              <h3 className="card-title">Publicar arquivo CSV</h3>
              <p className="card-sub">
                Alternativa à planilha online: substitui a planilha de todos os usuários; cada um recebe só as conversas dos números liberados para ele. CSV com as colunas Data,
                Hora, Lead, Telefone, Tipo, É resposta, Respondendo para, Mensagem, status_manual (e, se quiser, Classificação e Anúncio).
              </p>
            </div>
          </div>
          {sources.length > 0 && (
            <div className="callout" style={{ marginBottom: 12 }}>
              As planilhas online têm prioridade sobre o arquivo. Remova-as acima para voltar a publicar um arquivo.
            </div>
          )}
          {publish.status === 'publishing' && (
            <div className="callout" role="status" style={{ marginBottom: 12 }}>
              Publicando a planilha…
            </div>
          )}
          {publish.status === 'done' && (
            <div className="callout" role="status" style={{ marginBottom: 12 }}>
              Planilha publicada às {fmtTime(publish.at)}.{demo ? ' No modo demonstração ela fica salva só neste navegador.' : ' Os usuários a recebem no próximo acesso.'}
            </div>
          )}
          {publish.status === 'error' && (
            <div className="callout warn" role="alert" style={{ marginBottom: 12 }}>
              A planilha não foi publicada: {publish.message}
            </div>
          )}
          <div
            className={`dropzone${drag ? ' active' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDrag(false)
              const f = e.dataTransfer.files?.[0]
              if (f) onFile(f)
            }}
          >
            <FileSpreadsheet size={28} style={{ color: 'var(--muted)' }} aria-hidden />
            <p style={{ margin: '8px 0 10px' }}>Arraste o CSV aqui ou</p>
            <button type="button" className="btn primary" disabled={publish.status === 'publishing' || sources.length > 0} onClick={() => inputRef.current?.click()}>
              <Upload size={14} aria-hidden /> Escolher arquivo
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onFile(f)
                e.target.value = ''
              }}
            />
            <p className="small muted" style={{ marginTop: 10 }}>
              Status, notas e follow-ups ficam salvos neste navegador por telefone, então continuam valendo ao publicar uma exportação mais nova.
            </p>
          </div>
        </section>
      ) : (
        <section className="card" aria-label="Seu acesso">
          <div className="card-head">
            <div>
              <h3 className="card-title">Seu acesso</h3>
              <p className="card-sub">Números da empresa cujas conversas você pode ver</p>
            </div>
          </div>
          <ul className="list-plain">
            {allowed.map((n) => (
              <li key={n} className="access-item">
                {n === SEM_NUMERO ? <CircleHelp size={15} aria-hidden /> : <Phone size={15} aria-hidden />}
                <span className="who">
                  <b>{n === SEM_NUMERO ? 'Sem número identificado' : label(n)}</b>
                  <span>{n === SEM_NUMERO ? 'Leads que nunca receberam resposta' : isRenamed(n) ? fmtLine(n) : (attendants.get(n) ?? []).join(', ')}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="small muted" style={{ marginTop: 10 }}>
            <Lock size={12} aria-hidden /> A planilha é publicada pelo administrador. Para ver outros números, fale com ele.
          </p>
        </section>
      )}

      <section className="card" aria-label="Exportar">
        <div className="card-head">
          <div>
            <h3 className="card-title">Exportar</h3>
            <p className="card-sub">Relatório para o cliente e status de volta para a planilha</p>
          </div>
        </div>
        <div className="stack">
          <div className="row-between">
            <div>
              <b>Relatório em PDF</b>
              <div className="small muted">Métricas principais, gráficos e destaques do período e dos filtros atuais, prontos para enviar ao cliente.</div>
            </div>
            <button type="button" className="btn primary" disabled={!dataset} onClick={onReport}>
              <FileDown size={14} aria-hidden /> PDF
            </button>
          </div>
          <div className="row-between">
            <div>
              <b>Mensagens com status_manual preenchido</b>
              <div className="small muted">Mesmas colunas da planilha original (inclusive Classificação e Anúncio); cada linha recebe o status da sua conversa.</div>
            </div>
            <button
              type="button"
              className="btn"
              disabled={!dataset}
              onClick={() => dataset && downloadText(`rastreio-whatsapp-mensagens-${stamp}.csv`, buildMessagesCsv(dataset.messages, allConvs, meta, v, dataset.columns))}
            >
              <Download size={14} aria-hidden /> CSV
            </button>
          </div>
          <div className="row-between">
            <div>
              <b>Resumo por lead</b>
              <div className="small muted">Uma linha por conversa: {v.item}, canal, classificação, anúncio, estágio, tempos de resposta, status, follow-up e notas.</div>
            </div>
            <button type="button" className="btn" disabled={!allConvs.length} onClick={() => downloadText(`rastreio-whatsapp-leads-${stamp}.csv`, buildLeadsCsv(allConvs, meta, v, label))}>
              <Download size={14} aria-hidden /> CSV
            </button>
          </div>
        </div>
      </section>

      <section className="card" aria-label="Status salvos">
        <div className="card-head">
          <div>
            <h3 className="card-title">Status, notas e follow-ups salvos</h3>
            <p className="card-sub">Armazenadas localmente neste navegador</p>
          </div>
        </div>
        <div className="inline-stats" style={{ marginBottom: 14 }}>
          <div>
            <span>Com status</span>
            <b>{fmtInt(classified)}</b>
          </div>
          <div>
            <span>Com notas</span>
            <b>{fmtInt(withNotes)}</b>
          </div>
          <div>
            <span>Com follow-up</span>
            <b>{fmtInt(withFollow)}</b>
          </div>
        </div>
        <button
          type="button"
          className="btn danger"
          disabled={!Object.keys(meta).length}
          onClick={() => {
            if (window.confirm('Apagar todos os status, notas e follow-ups salvos neste navegador? Esta ação não pode ser desfeita.')) onClearMeta()
          }}
        >
          <Trash2 size={14} aria-hidden /> Limpar status, notas e follow-ups
        </button>
      </section>

      <section className="card span-2" aria-label="Como calculamos">
        <div className="card-head">
          <div>
            <h3 className="card-title">Como os insights são calculados</h3>
          </div>
        </div>
        <ul className="small" style={{ margin: 0, paddingLeft: 18, color: 'var(--ink-2)', lineHeight: 1.7 }}>
          <li>
            <b>Conversa</b>: mensagens recebidas são agrupadas pelo telefone do lead; mensagens enviadas, pelo campo “Respondendo para”. IDs longos (grupos do WhatsApp) são
            marcados como grupo e ficam fora das métricas de leads.
          </li>
          <li>
            <b>Número da empresa</b>: toda mensagem enviada traz o número que a enviou (coluna Telefone). A conversa é atribuída ao número que mais respondeu nela; as recebidas
            não informam o número de destino, então leads que nunca receberam resposta aparecem como “não identificado” quando a base tem mais de um número. Conversas entre dois
            números da empresa são marcadas como internas e ficam fora das métricas de leads.
          </li>
          <li>
            <b>Acesso por número</b>: cada usuário vê só as conversas atribuídas aos números liberados para ele pelo administrador (inclusive nos totais e exportações).
            As conversas “não identificadas” só aparecem para quem tem “Sem número” liberado.
          </li>
          <li>
            <b>Planilha online</b>: o dashboard lê o CSV do link no intervalo escolhido e recalcula tudo quando a planilha muda; a referência de tempo é sempre a última mensagem da
            planilha, igual para todos.
          </li>
          <li>
            <b>Classificação</b>: coluna Classificação da planilha (a que as automações preenchem; planilhas antigas com a coluna Temperatura também valem). Frio, morno e
            quente, em qualquer grafia, viram a escala Quente › Morno › Frio; outros valores aparecem como vieram. Vale o último valor preenchido nas linhas da conversa; sem a
            coluna, o lead fica “sem classificação”.
          </li>
          <li>
            <b>Tipo de negócio</b>: cada cliente é marcado na aba Usuários como clínica, loja ou outro negócio ({SEGMENTO_LABEL[v.segmento].toLowerCase()} nesta tela). Ele muda os
            termos (procedimento ou produto, agendamento ou pedido) e as palavras procuradas nas conversas abaixo.
          </li>
          <li>
            <b>Anúncio</b>: coluna Anúncio da planilha (também aceita “Campanha” ou “Ad”). Sem ela, vale a mensagem padrão com que o lead chegou (“tenho interesse no…”, ou um texto
            inicial idêntico ao de pelo menos 5 outros leads). No ranking, “{v.fechados.toLowerCase()}” = {v.fechamento} ou pagamento sinalizado na conversa, ou status{' '}
            {v.status.agendado}/Convertido; “vendas” = conversas com status Convertido (dado na aba Conversas ou vindo da coluna status_manual da planilha).
          </li>
          <li>
            <b>Procedimento ou produto</b>: extraído da mensagem padrão do anúncio (“tenho interesse no…”); na falta dela, de palavras-chave nas mensagens do lead (clínica:
            procedimentos estéticos; loja: categorias como camisas, calças, calçados, kits) e, só em clínicas, nas respostas da clínica. Em “outro negócio”, só pela mensagem do
            anúncio.
          </li>
          <li>
            <b>Canal</b>: anúncio (mensagem padrão do anúncio ou coluna Anúncio), Instagram (lead citou a rede), prospecção ativa (a empresa escreveu primeiro) ou orgânico.
          </li>
          <li>
            <b>Estágio inferido</b>: pagamento (Pix, sinal, comprovante) &gt; {v.fechamento} sinalizado &gt; {v.intencao.toLowerCase()} &gt; em conversa (lead voltou a escrever após
            a resposta) &gt; contato inicial. Clínica: agendamento = clínica confirma horário; pediu agendamento = lead cita agendar, avaliação, horário. Loja: pedido = loja
            confirma separação, reserva ou entrega (motoboy, “seu pedido”); interesse de compra = lead pergunta tamanho, estoque ou entrega, ou diz que vai levar. É uma
            heurística: o status manual é a fonte oficial.
          </li>
          <li>
            <b>Tempo de resposta</b>: intervalo entre a primeira mensagem do lead sem resposta e a próxima mensagem da {v.empresa}. Inclui horários fora do expediente.
          </li>
          <li>
            <b>Espera e silêncio</b>: calculados em relação à última mensagem da base, não ao relógio do computador, para a leitura ser estável em bases antigas.
          </li>
        </ul>
      </section>
    </div>
  )
}

const NOVO_CLIENTE = '__novo__'

type Test = { status: 'idle' } | { status: 'testing' } | { status: 'ok'; summary: string } | { status: 'error'; message: string }

/** Planilhas online (só admin): uma por cliente ou uma de todos os clientes, cada uma com o próprio intervalo. */
function SheetsCard({
  sources,
  sheetStatus,
  empresas,
  empresasComConta,
  live,
  onSave,
  onRemove,
  onRefresh,
}: {
  sources: FonteOnline[]
  sheetStatus: Map<string, SheetStatus>
  empresas: string[]
  empresasComConta: Set<string>
  live: LiveInfo | null
  onSave: (fonte: FonteInput) => Promise<void>
  onRemove: (id: string) => Promise<void>
  onRefresh: () => void
}) {
  // null = só a lista; 'new' = formulário de inclusão; FonteOnline = editando essa planilha.
  const [editing, setEditing] = useState<FonteOnline | 'new' | null>(sources.length ? null : 'new')
  const [test, setTest] = useState<Test>({ status: 'idle' })
  const [removing, setRemoving] = useState<string | null>(null)

  const open = (f: FonteOnline | 'new') => {
    setEditing(f)
    setTest({ status: 'idle' })
  }

  const remove = async (f: FonteOnline) => {
    const last = sources.length === 1
    const msg = last
      ? 'Remover a única planilha online? O painel volta a usar o último arquivo publicado (ou fica sem base até você publicar um).'
      : isTodos(f)
        ? 'Remover a planilha de todos os clientes? Quem não tem planilha própria deixa de ver conversas até ganhar uma (ou até você publicar um arquivo).'
        : `Remover a planilha de ${f.empresa.trim()}? As contas desse cliente passam a ler a planilha de todos os clientes, se houver.`
    if (!window.confirm(msg)) return
    setRemoving(f.id)
    try {
      await onRemove(f.id)
      if (editing !== 'new' && editing?.id === f.id) setEditing(null)
      setTest({ status: 'idle' })
    } catch (err) {
      setTest({ status: 'error', message: (err as Error).message })
    } finally {
      setRemoving(null)
    }
  }

  const loading = live?.status === 'loading'
  return (
    <section className="card span-2 sheets-card" aria-label="Planilhas online">
      <div className="card-head">
        <div>
          <h3 className="card-title">
            <Cloud size={15} aria-hidden style={{ verticalAlign: '-3px', marginRight: 6 }} />
            Planilhas online (tempo real)
          </h3>
          <p className="card-sub">
            Ligue a planilha do Google Sheets de cada cliente: as contas do cliente recebem só a planilha dele, e o painel lê o CSV sozinho no intervalo escolhido. Uma
            planilha com vários clientes também funciona (escolha “{TODOS_LABEL}”): aí a divisão é pelos números liberados de cada conta.
          </p>
        </div>
        {sources.length > 0 && (
          <div className="card-actions">
            <button type="button" className="btn ghost sm" onClick={onRefresh} disabled={loading}>
              <RefreshCw size={13} className={loading ? 'spin' : undefined} aria-hidden /> Atualizar agora
            </button>
            {editing === null && (
              <button type="button" className="btn sm" onClick={() => open('new')}>
                <Plus size={13} aria-hidden /> Adicionar planilha
              </button>
            )}
          </div>
        )}
      </div>

      {sources.length > 0 && (
        <ul className="sheet-list" aria-label="Planilhas ligadas">
          {sources.map((f) => (
            <SheetRow
              key={f.id}
              fonte={f}
              status={sheetStatus.get(f.id)}
              semConta={!isTodos(f) && !empresasComConta.has(empresaKey(f.empresa))}
              editing={editing !== 'new' && editing?.id === f.id}
              removing={removing === f.id}
              onEdit={() => open(f)}
              onRemove={() => void remove(f)}
            />
          ))}
        </ul>
      )}

      {test.status === 'ok' && (
        <div className="callout" role="status" style={{ marginTop: 12 }}>
          Planilha lida e salva: {test.summary}
        </div>
      )}
      {test.status === 'error' && editing === null && (
        <div className="callout warn" role="alert" style={{ marginTop: 12 }}>
          {test.message}
        </div>
      )}

      {editing !== null && (
        <SheetForm
          key={editing === 'new' ? 'new' : editing.id}
          fonte={editing === 'new' ? null : editing}
          empresas={empresas}
          test={test}
          setTest={setTest}
          canCancel={sources.length > 0}
          onCancel={() => {
            setEditing(null)
            setTest({ status: 'idle' })
          }}
          onSave={async (f) => {
            await onSave(f)
            setEditing(null)
          }}
        />
      )}

      <details className="source-help" open={!sources.length}>
        <summary>Como liberar a planilha para o painel</summary>
        <ol>
          <li>
            Abra a planilha no Google Sheets, na aba com as conversas (ex.: <i>Conversas WhatsApp</i>).
          </li>
          <li>
            Em <b>Compartilhar</b> → <b>Acesso geral</b>, escolha <b>Qualquer pessoa com o link</b> como <b>Leitor</b>. Ou use <b>Arquivo → Compartilhar → Publicar na web</b>, escolha
            a aba e o formato <b>CSV</b>.
          </li>
          <li>Copie o endereço do navegador (com a aba aberta) ou o link publicado e cole acima, escolhendo o cliente.</li>
          <li>
            Na aba <b>Usuários</b>, crie as contas do cliente com a <b>mesma Empresa</b> e marque os números que cada conta vê.
          </li>
        </ol>
        <p className="small muted">
          A planilha precisa ter as colunas Data, Hora, Lead, Telefone, Tipo, É resposta, Respondendo para e Mensagem. Se tiver também <b>Classificação</b> (ex.: frio, morno, quente) e{' '}
          <b>Anúncio</b> (de qual anúncio o lead veio), o painel usa as duas. O Google demora até 5 minutos para refletir mudanças em planilhas publicadas na web.
        </p>
        <p className="small muted">
          <Lock size={12} aria-hidden /> <b>Planilha de um cliente</b>: só as contas com aquela Empresa recebem o link; contas de outros clientes não conseguem ler. Cliente com
          planilha própria usa só ela. <b>Planilha de {TODOS_LABEL.toLowerCase()}</b>: vai para todas as contas sem planilha própria, e o recorte por número acontece no navegador
          (quem tiver o link consegue abrir a planilha inteira). Se um cliente tem planilha própria e também aparece na de todos, o painel não conta as conversas dele duas vezes.
        </p>
      </details>
    </section>
  )
}

function SheetRow({
  fonte,
  status,
  semConta,
  editing,
  removing,
  onEdit,
  onRemove,
}: {
  fonte: FonteOnline
  status: SheetStatus | undefined
  semConta: boolean
  editing: boolean
  removing: boolean
  onEdit: () => void
  onRemove: () => void
}) {
  const state = status?.status ?? 'loading'
  const parts = [`a cada ${Math.round(fonte.intervaloSeg / 60)} min`]
  if (status?.at) parts.push(`${state === 'error' ? 'falhou' : 'lida'} às ${fmtTime(status.at)}`)
  if (status?.messages != null) parts.push(`${fmtInt(status.messages)} mensagens`)
  return (
    <li className={`sheet-item${editing ? ' editing' : ''}`}>
      <span className={`source-dot ${state}`} aria-hidden />
      <div className="sheet-main">
        <div className="sheet-title">
          {isTodos(fonte) ? <Users size={14} aria-hidden /> : null}
          <b>{sourceLabel(fonte)}</b>
          {isTodos(fonte) && <span className="badge sm">uma planilha com vários clientes</span>}
          {semConta && (
            <span className="badge sm warning" title="Crie em Usuários uma conta com esta Empresa para o cliente ver a planilha">
              nenhuma conta com esta empresa
            </span>
          )}
        </div>
        <div className="small muted">
          {state === 'loading' && !status?.at ? 'lendo…' : parts.join(' · ')}
        </div>
        <a className="small sheet-url" href={fonte.url} target="_blank" rel="noreferrer" title={fonte.url}>
          <ExternalLink size={11} aria-hidden /> <span>{fonte.url}</span>
        </a>
        {state === 'error' && status?.message && <div className="small sheet-error">{status.message}</div>}
      </div>
      <span className="row-actions">
        <button type="button" className="btn ghost sm" onClick={onEdit} disabled={editing}>
          <Pencil size={13} aria-hidden /> Editar
        </button>
        <button type="button" className="btn ghost sm danger" onClick={onRemove} disabled={removing}>
          <Trash2 size={13} aria-hidden /> Remover
        </button>
      </span>
    </li>
  )
}

function SheetForm({
  fonte,
  empresas,
  test,
  setTest,
  canCancel,
  onCancel,
  onSave,
}: {
  fonte: FonteOnline | null
  empresas: string[]
  test: Test
  setTest: (t: Test) => void
  canCancel: boolean
  onCancel: () => void
  onSave: (f: FonteInput) => Promise<void>
}) {
  const known = (e: string) => empresas.find((x) => empresaKey(x) === empresaKey(e))
  const initial = fonte ? (isTodos(fonte) ? '' : (known(fonte.empresa) ?? NOVO_CLIENTE)) : empresas.length ? (empresas[0] ?? '') : ''
  const [cliente, setCliente] = useState(initial)
  const [novo, setNovo] = useState(fonte && initial === NOVO_CLIENTE ? fonte.empresa : '')
  const [url, setUrl] = useState(fonte?.url ?? '')
  const [intervalo, setIntervalo] = useState(fonte?.intervaloSeg ?? DEFAULT_SHEET_INTERVAL)
  const empresa = cliente === NOVO_CLIENTE ? novo.trim() : cliente

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (cliente === NOVO_CLIENTE && !empresa) return setTest({ status: 'error', message: 'Informe o nome do cliente.' })
    setTest({ status: 'testing' })
    try {
      const { text } = await fetchSheetCsv(url)
      const res = parseCsv(text)
      if (res.missingColumns.length) throw new Error(`A planilha não tem as colunas esperadas: ${res.missingColumns.join(', ')}. Confira se o link aponta para a aba certa.`)
      if (!res.messages.length) throw new Error('A planilha não tem mensagens válidas.')
      await onSave({ id: fonte?.id, empresa: known(empresa) ?? empresa, url: url.trim(), intervaloSeg: intervalo })
      const extras = [res.columns.classification ? `Classificação (${res.columns.classification})` : '', res.columns.ad ? `Anúncio (${res.columns.ad})` : ''].filter(Boolean)
      setTest({
        status: 'ok',
        summary: `${empresa || TODOS_LABEL}: ${fmtInt(res.messages.length)} mensagens e ${res.clinicPhones.length} ${res.clinicPhones.length === 1 ? 'número da empresa' : 'números da empresa'}. ${
          extras.length ? `Colunas extras: ${extras.join(', ')}.` : 'Sem as colunas Classificação e Anúncio.'
        }`,
      })
    } catch (err) {
      setTest({ status: 'error', message: (err as Error).message })
    }
  }

  return (
    <form className="sheet-form" onSubmit={(e) => void submit(e)} aria-label={fonte ? 'Editar planilha' : 'Adicionar planilha'}>
      <div className="sheet-form-title">{fonte ? `Editar planilha de ${sourceLabel(fonte)}` : 'Adicionar planilha'}</div>
      <div className="sheet-form-grid">
        <label className="field">
          <span className="field-label">Cliente</span>
          <select value={cliente} onChange={(e) => setCliente(e.target.value)}>
            {empresas.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
            <option value={NOVO_CLIENTE}>Novo cliente…</option>
            <option value="">{TODOS_LABEL} (uma planilha com vários)</option>
          </select>
        </label>
        {cliente === NOVO_CLIENTE && (
          <label className="field">
            <span className="field-label">Nome do cliente</span>
            <input value={novo} onChange={(e) => setNovo(e.target.value)} maxLength={80} placeholder="Ex.: Loja Centro" autoFocus required />
          </label>
        )}
        <label className="field sheet-form-url">
          <span className="field-label">Link da planilha</span>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=…" required spellCheck={false} />
        </label>
        <label className="field">
          <span className="field-label">Ler a cada</span>
          <select value={intervalo} onChange={(e) => setIntervalo(Number(e.target.value))}>
            {SHEET_INTERVALS.map((i) => (
              <option key={i.seg} value={i.seg}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="small muted">
        {cliente === ''
          ? 'Vai para todas as contas que não têm planilha própria; cada uma vê só os números liberados para ela.'
          : cliente === NOVO_CLIENTE
            ? 'Use o mesmo nome que vai no campo Empresa das contas desse cliente, na aba Usuários.'
            : `Só as contas de ${cliente} recebem esta planilha.`}
      </p>
      {test.status === 'error' && (
        <div className="callout warn" role="alert">
          {test.message}
        </div>
      )}
      <div className="form-actions">
        {canCancel && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button type="submit" className="btn primary" disabled={test.status === 'testing' || !url.trim()}>
          {test.status === 'testing' ? <RefreshCw size={14} className="spin" aria-hidden /> : <Check size={14} aria-hidden />}
          {test.status === 'testing' ? 'Testando…' : fonte ? 'Testar e salvar' : 'Testar e adicionar'}
        </button>
      </div>
    </form>
  )
}
