import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Database, FileDown, LayoutDashboard, Lightbulb, Lock, MessagesSquare, UsersRound } from 'lucide-react'
import type { ConvMeta, Dataset, Filters, Status } from './lib/types'
import { parseCsv } from './lib/parse'
import type { ParseResult } from './lib/parse'
import {
  AD_NONE,
  AD_NONE_LABEL,
  LINE_NONE,
  applyFilters,
  attendantsByLine,
  buildConversations,
  leadConversations,
  presetRange,
  referenceTime,
} from './lib/analytics'
import { accessKey, SEM_NUMERO, splitCsvByAccess } from './lib/access'
import { buildClients, clientNameByKey, segmentByKey } from './lib/clients'
import type { Client } from './lib/clients'
import { loadMeta, saveMeta } from './lib/storage'
import type { MetaMap } from './lib/storage'
import { labelToStatus } from './lib/status'
import { CLASS_NONE, CLASS_NONE_LABEL, sortClasses } from './lib/classification'
import { DEFAULT_SEGMENTO, commonSegmento, vocabFor } from './lib/segment'
import type { Segmento } from './lib/segment'
import { fetchSheetCsv } from './lib/sheet'
import { visibleInsights } from './lib/insights'
import { visibleOverview } from './lib/overview'
import { fmtInt } from './lib/format'
import { useTheme } from './theme'
import { useLineNames } from './lineNames'
import { VocabProvider } from './vocab'
import { useSession } from './auth/AuthProvider'
import type { AppUser, FonteOnline } from './auth/types'
import { ThemeToggle } from './components/ThemeToggle'
import { UserMenu } from './components/UserMenu'
import { BrandLogo } from './components/BrandLogo'
import { DEFAULT_FILTERS, FilterBar } from './components/FilterBar'
import type { LiveInfo } from './components/FilterBar'
import { OverviewView } from './views/OverviewView'
import { ConversationsView } from './views/ConversationsView'
import { InsightsView } from './views/InsightsView'
import { DataView } from './views/DataView'
import type { PublishState } from './views/DataView'
import { UsersView } from './views/UsersView'
import { ReportView } from './views/ReportView'

type Tab = 'overview' | 'conversas' | 'insights' | 'dados' | 'usuarios'

/** Por que não há conversas para mostrar. */
type Empty = 'sem-numeros' | 'sem-base' | 'vazio' | null

const TABS: { id: Tab; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean }[] = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'conversas', label: 'Conversas', icon: MessagesSquare },
  { id: 'insights', label: 'Insights', icon: Lightbulb },
  { id: 'dados', label: 'Dados', icon: Database },
  { id: 'usuarios', label: 'Usuários', icon: UsersRound, adminOnly: true },
]

const ONLINE_NAME = 'Planilha online'

interface ShowExtra {
  clinicPhones?: string[]
  refTime?: Date | null
  publishedAt?: Date | null
  origem: Dataset['origem']
  fetchedAt?: Date | null
  /** Releitura da mesma planilha: mantém filtros e conversa aberta. */
  keep?: boolean
}

export default function App() {
  const { palette } = useTheme()
  const { backend, user } = useSession()
  const { label: lineLabel } = useLineNames()
  const isAdmin = user.papel === 'admin'
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [skipped, setSkipped] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [empty, setEmpty] = useState<Empty>(null)
  const [loading, setLoading] = useState(true)
  const [publish, setPublish] = useState<PublishState>({ status: 'idle' })
  const [meta, setMeta] = useState<MetaMap>(() => loadMeta())
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [tab, setTab] = useState<Tab>('overview')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [users, setUsers] = useState<AppUser[]>([]) // contas (só admin): base do filtro Clientes
  const [report, setReport] = useState(false)
  // Planilha online: link lido em intervalos (null = base vem do arquivo publicado).
  const [source, setSource] = useState<FonteOnline | null>(null)
  const [live, setLive] = useState<LiveInfo | null>(null)
  const [baseVersion, setBaseVersion] = useState(0) // força recarregar a base publicada (ex.: ao desligar a planilha online)
  const lastText = useRef('') // último CSV lido da planilha online, para não reprocessar o que não mudou
  const lastFetch = useRef(0)
  const hasDataset = useRef(false)
  // Usuário comum: empresa no topo e só os blocos da Visão geral e dos Insights que o administrador escolheu para ele.
  const empresa = isAdmin ? '' : user.empresa.trim()
  const overview = useMemo(() => visibleOverview(user), [user])
  const insights = useMemo(() => visibleInsights(user), [user])

  const parseChecked = useCallback((text: string, fileName: string): ParseResult | null => {
    const res = parseCsv(text)
    if (res.missingColumns.length) {
      setError(`O arquivo "${fileName}" não tem as colunas esperadas: ${res.missingColumns.join(', ')}.`)
      return null
    }
    if (!res.messages.length) {
      setError(`O arquivo "${fileName}" não tem mensagens válidas.`)
      return null
    }
    return res
  }, [])

  const showDataset = useCallback((res: ParseResult, fileName: string, extra: ShowExtra) => {
    setDataset({
      fileName,
      messages: res.messages,
      // O usuário recebe só parte da planilha; números e referência vêm da planilha inteira.
      clinicPhones: extra.clinicPhones?.length ? extra.clinicPhones : res.clinicPhones,
      refTime: extra.refTime ?? referenceTime(res.messages),
      loadedAt: new Date(),
      publishedAt: extra.publishedAt ?? null,
      origem: extra.origem,
      fetchedAt: extra.fetchedAt ?? null,
      columns: res.columns,
    })
    hasDataset.current = true
    setSkipped(res.skipped)
    setError(null)
    setEmpty(null)
    if (!extra.keep) {
      setSelectedKey(null)
      setFilters((f) => ({ ...f, line: 'all' })) // os números mudam de uma base para outra
    }
  }, [])

  // Base publicada (arquivo) ou planilha online: o que o servidor diz que vale para esta pessoa.
  useEffect(() => {
    let alive = true
    if (!isAdmin && user.numeros.length === 0) {
      setEmpty('sem-numeros')
      setLoading(false)
      return
    }
    setLoading(true)
    let delegated = false
    backend
      .loadBase(user)
      .then((base) => {
        if (!alive) return
        if (base?.fonte) {
          delegated = true // a leitura da planilha online (efeito abaixo) assume daqui
          setSource(base.fonte)
          return
        }
        setSource(null)
        setLive(null)
        if (!base) return setEmpty('sem-base')
        if (!base.text.trim()) return setEmpty('vazio')
        const res = parseChecked(base.text, base.fileName)
        if (res) showDataset(res, base.fileName, { ...base, origem: 'arquivo' })
      })
      .catch((e: Error) => {
        if (alive) setError(`Não foi possível carregar a planilha: ${e.message}`)
      })
      .finally(() => {
        if (alive && !delegated) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [backend, user, isAdmin, parseChecked, showDataset, baseVersion])

  // Lê a planilha online; só reprocessa quando o CSV mudou.
  const refreshLive = useCallback(
    async (fonte: FonteOnline, signal: AbortSignal, first: boolean) => {
      setLive((l) => ({ status: 'loading', at: l?.at ?? null, message: null, intervaloSeg: fonte.intervaloSeg }))
      try {
        const { text } = await fetchSheetCsv(fonte.url, signal)
        if (signal.aborted) return
        lastFetch.current = Date.now()
        if (text !== lastText.current) {
          const res = parseChecked(text, ONLINE_NAME)
          if (!res) {
            setLive({ status: 'error', at: new Date(), message: 'A planilha não tem as colunas esperadas.', intervaloSeg: fonte.intervaloSeg })
            return
          }
          lastText.current = text
          showDataset(res, ONLINE_NAME, { origem: 'online', fetchedAt: new Date(), keep: !first })
        }
        setLive({ status: 'ok', at: new Date(), message: null, intervaloSeg: fonte.intervaloSeg })
      } catch (e) {
        if (signal.aborted) return
        const message = (e as Error).message
        setLive({ status: 'error', at: new Date(), message, intervaloSeg: fonte.intervaloSeg })
        if (!hasDataset.current) setError(`Não foi possível ler a planilha online: ${message}`)
      }
    },
    [parseChecked, showDataset],
  )

  useEffect(() => {
    if (!source) return
    const ctrl = new AbortController()
    lastText.current = ''
    if (!hasDataset.current) setLoading(true)
    void refreshLive(source, ctrl.signal, true).finally(() => {
      if (!ctrl.signal.aborted) setLoading(false)
    })
    const period = source.intervaloSeg * 1000
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastFetch.current < period * 0.9) return
      void refreshLive(source, ctrl.signal, false)
    }
    const id = setInterval(tick, Math.min(period, 30000))
    document.addEventListener('visibilitychange', tick)
    return () => {
      ctrl.abort()
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [source, refreshLive])

  const refreshNow = useCallback(() => {
    if (!source) return
    lastFetch.current = 0
    void refreshLive(source, new AbortController().signal, false)
  }, [source, refreshLive])

  const saveSource = useCallback(
    async (fonte: { url: string; intervaloSeg: number }) => {
      await backend.setSource(fonte)
      setSource({ ...fonte, definidaEm: new Date() })
    },
    [backend],
  )

  const removeSource = useCallback(async () => {
    await backend.setSource(null)
    setSource(null)
    setLive(null)
    lastText.current = ''
    hasDataset.current = false
    setDataset(null)
    setBaseVersion((v) => v + 1)
  }, [backend])

  useEffect(() => {
    saveMeta(meta)
  }, [meta])

  // Contas dos clientes, para o filtro Clientes do topo; a aba Usuários avisa quando elas mudam.
  useEffect(() => {
    if (!isAdmin) return
    let alive = true
    backend
      .listUsers()
      .then((list) => {
        if (alive) setUsers(list)
      })
      .catch(() => undefined) // sem a lista, o topo volta ao filtro por número
    return () => {
      alive = false
    }
  }, [backend, isAdmin])

  useEffect(() => {
    if (!empresa) return
    const previous = document.title
    document.title = `${empresa} · Rastreio WhatsApp`
    return () => {
      document.title = previous
    }
  }, [empresa])

  const refTime = useMemo(() => dataset?.refTime ?? new Date(), [dataset])
  // Tipo de negócio de cada número (decide o que as heurísticas procuram: procedimento × produto, agendamento × pedido).
  // Usuário: o dele. Admin: o do cliente dono do número; número sem cliente fica como clínica.
  const segmentOf = useMemo<(key: string) => Segmento>(() => {
    if (!isAdmin) return () => user.segmento
    const byKey = segmentByKey(buildClients(users, []))
    return (key) => byKey.get(key) ?? DEFAULT_SEGMENTO
  }, [isAdmin, user.segmento, users])
  const baseConvs = useMemo(
    () => (dataset ? buildConversations(dataset.messages, refTime, dataset.clinicPhones, segmentOf) : []),
    [dataset, refTime, segmentOf],
  )
  const baseUnknown = useMemo(() => baseConvs.some((c) => !c.line && !c.isGroup), [baseConvs])
  // Clientes (só admin): as contas da aba Usuários agrupadas por empresa, mais "Sem cliente" para o que nenhuma conta tem.
  const clients = useMemo<Client[]>(
    () => (isAdmin && dataset ? buildClients(users, [...dataset.clinicPhones, ...(baseUnknown ? [SEM_NUMERO] : [])]) : []),
    [isAdmin, dataset, users, baseUnknown],
  )
  const selectedClient = useMemo(
    () => (isAdmin && filters.cliente !== 'all' ? (clients.find((c) => c.id === filters.cliente) ?? null) : null),
    [isAdmin, filters.cliente, clients],
  )
  const clientNames = useMemo(() => clientNameByKey(clients), [clients])
  // Termos da tela: os do usuário ou, para o admin, os do cliente escolhido; com clientes de tipos diferentes juntos, neutros.
  const vocab = useMemo(() => {
    if (!isAdmin) return vocabFor(user.segmento)
    if (selectedClient) return vocabFor(selectedClient.segmento)
    return vocabFor(commonSegmento(clients.filter((c) => !c.pseudo).map((c) => c.segmento)))
  }, [isAdmin, user.segmento, selectedClient, clients])
  // Recorte: usuário comum vê só os números liberados (no Supabase com arquivo publicado o servidor já entrega só esses
  // arquivos; aqui o filtro se repete, e é o único no modo demonstração e com a planilha online). Admin vê tudo ou, com um
  // cliente escolhido no topo, só os números dele.
  const allowed = useMemo(
    () => (isAdmin ? (selectedClient ? new Set(selectedClient.numeros) : null) : new Set(user.numeros)),
    [isAdmin, selectedClient, user.numeros],
  )
  const allConvs = useMemo(() => (allowed ? baseConvs.filter((c) => allowed.has(accessKey(c))) : baseConvs), [baseConvs, allowed])
  const messages = useMemo(() => {
    if (!dataset) return []
    if (!allowed) return dataset.messages
    const keys = new Set(allConvs.map((c) => c.key))
    return dataset.messages.filter((m) => keys.has(m.convKey))
  }, [dataset, allowed, allConvs])
  const clinicPhones = useMemo(() => {
    const all = dataset?.clinicPhones ?? []
    return allowed ? all.filter((p) => allowed.has(p)) : all
  }, [dataset, allowed])
  const scoped = useMemo(() => (dataset ? { ...dataset, messages, clinicPhones } : null), [dataset, messages, clinicPhones])
  // Início do período "Tudo": a planilha inteira, para o período não encolher ao trocar de cliente (ou num cliente sem conversas).
  const minTime = useMemo(() => dataset?.messages[0]?.at ?? refTime, [dataset, refTime])
  const attendants = useMemo(() => attendantsByLine(messages), [messages])

  // Status já preenchidos na planilha viram status manual quando ainda não há status salvo neste navegador.
  useEffect(() => {
    if (!allConvs.length) return
    setMeta((prev) => {
      let changed = false
      const next: MetaMap = { ...prev }
      for (const c of allConvs) {
        if (!c.csvStatus || prev[c.key]?.status) continue
        const st = labelToStatus(c.csvStatus)
        if (st) {
          next[c.key] = { ...prev[c.key], status: st }
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [allConvs])

  const range = useMemo(
    () => presetRange(filters.preset, refTime, minTime, { from: filters.from, to: filters.to }),
    [filters.preset, filters.from, filters.to, refTime, minTime],
  )
  const filtered = useMemo(
    () => (dataset ? applyFilters(allConvs, messages, range, filters, meta) : { convs: [], messages: [] }),
    [dataset, allConvs, messages, range, filters, meta],
  )
  const procedures = useMemo(() => [...new Set(allConvs.map((c) => c.procedure))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [allConvs])
  const channels = useMemo(() => [...new Set(allConvs.map((c) => c.channel))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [allConvs])
  // Classificações da base (coluna Classificação), escala quente/morno/frio primeiro: ordem e cores fixas, que não mudam com os filtros.
  const classes = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of allConvs) if (c.classification) counts.set(c.classification, (counts.get(c.classification) ?? 0) + 1)
    return sortClasses(counts)
  }, [allConvs])
  const ads = useMemo(() => [...new Set(allConvs.filter((c) => c.ad).map((c) => c.ad))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [allConvs])
  const hasNoAd = useMemo(() => allConvs.some((c) => !c.ad && !c.isGroup && !c.isInternal), [allConvs])
  const hasUnknownLine = useMemo(() => allConvs.some((c) => !c.line && !c.isGroup), [allConvs])
  // Contagem de cada botão do filtro de número: os outros filtros valem, o de número não.
  const lineCounts = useMemo(() => {
    const counts = new Map<string, number>()
    if (clinicPhones.length < 2) return counts
    const { convs } = applyFilters(allConvs, [], range, { ...filters, line: 'all' }, meta)
    for (const c of leadConversations(convs, meta)) counts.set(c.line, (counts.get(c.line) ?? 0) + 1)
    return counts
  }, [clinicPhones, allConvs, range, filters, meta])
  // Contagem de cada cartão do filtro Clientes: os outros filtros valem, o de cliente e o de número não.
  const clientCounts = useMemo(() => {
    const counts = new Map<string, number>()
    if (!clients.length) return { counts, total: 0 }
    const { convs } = applyFilters(baseConvs, [], range, { ...filters, line: 'all' }, meta)
    const leads = leadConversations(convs, meta)
    for (const c of clients) {
      const keys = new Set(c.numeros)
      counts.set(c.id, leads.filter((l) => keys.has(accessKey(l))).length)
    }
    return { counts, total: leads.length }
  }, [clients, baseConvs, range, filters, meta])
  // Cliente escolhido que deixou de existir (conta excluída ou empresa renomeada): volta para todos.
  useEffect(() => {
    if (filters.cliente !== 'all' && clients.length > 0 && !selectedClient) setFilters((f) => ({ ...f, cliente: 'all' }))
  }, [filters.cliente, clients.length, selectedClient])
  // Para a aba Usuários: conversas de leads de cada número na planilha inteira.
  const accessCounts = useMemo(() => {
    const counts = new Map<string, number>()
    if (!isAdmin) return counts
    for (const c of leadConversations(baseConvs, meta)) counts.set(accessKey(c), (counts.get(accessKey(c)) ?? 0) + 1)
    return counts
  }, [isAdmin, baseConvs, meta])

  const updateMeta = useCallback((key: string, patch: Partial<ConvMeta>) => {
    setMeta((prev) => ({ ...prev, [key]: { ...prev[key], ...patch, updatedAt: new Date().toISOString() } }))
  }, [])

  const filterLine = useCallback((line: string) => setFilters((f) => ({ ...f, line: f.line === line ? 'all' : line })), [])

  const openConv = useCallback((key: string) => {
    setSelectedKey(key)
    setTab('conversas')
  }, [])

  // Só o admin envia planilha: ela substitui a base de todos e é dividida por número antes de subir.
  const onFile = useCallback(
    async (file: File) => {
      let text: string
      try {
        text = await file.text()
      } catch {
        setError(`Não foi possível ler o arquivo "${file.name}".`)
        return
      }
      const res = parseChecked(text, file.name)
      if (!res) return
      if (
        !window.confirm(
          `Publicar "${file.name}" (${fmtInt(res.messages.length)} mensagens) para todos os usuários?\n\nA planilha atual será substituída. Cada usuário passa a ver as conversas desta planilha dos números liberados para ele.`,
        )
      )
        return
      setPublish({ status: 'publishing' })
      try {
        const ref = referenceTime(res.messages)
        const convs = buildConversations(res.messages, ref, res.clinicPhones)
        await backend.publishBase({ text, fileName: file.name, clinicPhones: res.clinicPhones, refTime: ref, parts: splitCsvByAccess(text, convs) })
        showDataset(res, file.name, { refTime: ref, publishedAt: new Date(), origem: 'arquivo' })
        setPublish({ status: 'done', at: new Date() })
      } catch (e) {
        setPublish({ status: 'error', message: (e as Error).message })
      }
    },
    [backend, parseChecked, showDataset],
  )

  const tabs = TABS.filter((t) => (!t.adminOnly || isAdmin) && (t.id !== 'insights' || insights.size > 0))

  // Para o relatório: para quem é e que recorte está ativo além do período.
  const reportClient = empresa || selectedClient?.nome || (isAdmin ? 'Todos os clientes' : user.nome.trim() || user.email)
  const reportScope = useMemo(() => {
    const s: string[] = []
    if (filters.line !== 'all') s.push(`Número: ${filters.line === LINE_NONE ? 'não identificado' : lineLabel(filters.line)}`)
    if (filters.procedure !== 'all') s.push(`${vocab.Item}: ${filters.procedure}`)
    if (filters.status !== 'all') s.push(`Status: ${filters.status === 'sem_status' ? 'Sem status' : vocab.status[filters.status as Status]}`)
    if (filters.channel !== 'all') s.push(`Canal: ${filters.channel}`)
    if (filters.classification !== 'all') s.push(`Classificação: ${filters.classification === CLASS_NONE ? CLASS_NONE_LABEL : filters.classification}`)
    if (filters.ad !== 'all') s.push(`Anúncio: ${filters.ad === AD_NONE ? AD_NONE_LABEL : filters.ad}`)
    return s
  }, [filters, lineLabel, vocab])

  const dataView = (
    <DataView
      dataset={scoped}
      skipped={skipped}
      allConvs={allConvs}
      attendants={attendants}
      meta={meta}
      error={error}
      isAdmin={isAdmin}
      demo={backend.kind === 'demo'}
      allowed={user.numeros}
      publish={publish}
      onFile={(f) => void onFile(f)}
      onClearMeta={() => setMeta({})}
      source={source}
      live={live}
      onSaveSource={saveSource}
      onRemoveSource={removeSource}
      onRefresh={refreshNow}
      onReport={() => setReport(true)}
    />
  )

  return (
    <VocabProvider value={vocab}>
      <div className="app">
        <header className="topbar">
          <div className="topbar-inner">
            <BrandLogo empresa={empresa} />
            <nav className="tabs" role="tablist" aria-label="Seções">
              {tabs.map((t) => {
                const Icon = t.icon
                return (
                  <button key={t.id} type="button" role="tab" className="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
                    <Icon size={15} aria-hidden />
                    {t.label}
                    {t.id === 'conversas' && dataset && <span className="count">{fmtInt(filtered.convs.length)}</span>}
                  </button>
                )
              })}
            </nav>
            {dataset && (
              <button type="button" className="btn sm report-btn" onClick={() => setReport(true)} title="Relatório em PDF com as métricas do período e dos filtros atuais">
                <FileDown size={14} aria-hidden /> <span>PDF</span>
              </button>
            )}
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>

        <main className="main">
          {backend.kind === 'demo' && (
            <div className="callout demo-banner">
              <b>Modo demonstração</b> — sem Supabase configurado. Contas, senhas e números liberados ficam só neste navegador; configure o <code>.env</code> para usar o
              login de verdade.
            </div>
          )}
          {tab === 'usuarios' && isAdmin ? (
            <UsersView
              lines={dataset?.clinicPhones ?? []}
              hasUnknownLine={hasUnknownLine}
              counts={accessCounts}
              attendants={attendants}
              hasBase={!!dataset}
              onUsersChanged={setUsers}
            />
          ) : loading ? (
            <div className="loading-screen">
              <span className="spinner" aria-hidden />
              {source ? 'Lendo a planilha online…' : 'Carregando base de mensagens…'}
            </div>
          ) : !dataset ? (
            isAdmin ? (
              dataView
            ) : (
              <NoAccess reason={empty} error={error} />
            )
          ) : (
            <>
              {tab !== 'dados' && (
                <FilterBar
                  filters={filters}
                  onChange={setFilters}
                  procedures={procedures}
                  channels={channels}
                  classes={classes}
                  ads={ads}
                  hasNoAd={hasNoAd}
                  lines={clinicPhones}
                  hasUnknownLine={hasUnknownLine}
                  lineCounts={lineCounts}
                  attendants={attendants}
                  refTime={refTime}
                  range={range}
                  clients={clients}
                  clientCounts={clientCounts.counts}
                  clientTotal={clientCounts.total}
                  live={source ? live : null}
                  onRefresh={refreshNow}
                />
              )}
              {selectedClient && allConvs.length === 0 ? (
                <section className="card no-access" aria-label="Cliente sem conversas">
                  <Lock size={28} aria-hidden />
                  <h2>Nenhuma conversa para mostrar</h2>
                  <p>
                    {selectedClient.numeros.length === 0
                      ? `${selectedClient.nome} ainda não tem número liberado. Libere os números dele na aba Usuários.`
                      : `A planilha atual não tem conversas dos números de ${selectedClient.nome}.`}
                  </p>
                </section>
              ) : (
                <>
                  {tab === 'overview' && (
                    <OverviewView
                      convs={filtered.convs}
                      msgs={filtered.messages}
                      range={range}
                      meta={meta}
                      palette={palette}
                      clinicPhones={clinicPhones}
                      attendants={attendants}
                      activeLine={filters.line}
                      columns={dataset.columns}
                      classes={classes}
                      visible={overview}
                      clientOf={isAdmin ? (line) => clientNames.get(line || SEM_NUMERO) : undefined}
                      onFilterLine={filterLine}
                      onOpenConv={openConv}
                    />
                  )}
                  {tab === 'conversas' && (
                    <ConversationsView
                      convs={filtered.convs}
                      allConvs={allConvs}
                      meta={meta}
                      onMeta={updateMeta}
                      selectedKey={selectedKey}
                      onSelect={setSelectedKey}
                      refTime={refTime}
                      multiLine={clinicPhones.length > 1}
                    />
                  )}
                  {tab === 'insights' && insights.size > 0 && (
                    <InsightsView convs={filtered.convs} msgs={filtered.messages} meta={meta} palette={palette} classes={classes} visible={insights} onOpenConv={openConv} />
                  )}
                </>
              )}
              {tab === 'dados' && dataView}
            </>
          )}
        </main>

        {report && dataset && (
          <ReportView
            convs={filtered.convs}
            msgs={filtered.messages}
            range={range}
            meta={meta}
            palette={palette}
            client={reportClient}
            scope={reportScope}
            refTime={refTime}
            classes={classes}
            overview={overview}
            insights={insights}
            onClose={() => setReport(false)}
          />
        )}
      </div>
    </VocabProvider>
  )
}

function NoAccess({ reason, error }: { reason: Empty; error: string | null }) {
  const { user } = useSession()
  const { label } = useLineNames()
  const text =
    error ??
    (reason === 'sem-numeros'
      ? 'Nenhum número foi liberado para você ainda. Peça ao administrador para liberar os números que você atende.'
      : reason === 'sem-base'
        ? 'O administrador ainda não publicou a planilha de conversas.'
        : 'A planilha atual não tem conversas dos números liberados para você.')
  return (
    <section className="card no-access" aria-label="Sem conversas">
      <Lock size={28} aria-hidden />
      <h2>Nenhuma conversa para mostrar</h2>
      <p>{text}</p>
      {user.numeros.length > 0 && (
        <p className="small muted">
          Números liberados para você: {user.numeros.map((n) => (n === SEM_NUMERO ? 'sem número identificado' : label(n))).join(', ')}
        </p>
      )}
    </section>
  )
}
