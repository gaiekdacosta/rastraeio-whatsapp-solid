import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Database, FileDown, LayoutDashboard, Lightbulb, Lock, MessagesSquare, UsersRound } from 'lucide-react'
import type { ClientSheets, Conversation, ConvMeta, Dataset, Filters, Status } from './lib/types'
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
import { buildClients, clientMatcher, clientNameByKey, hasLooseUnknown, segmentByKey } from './lib/clients'
import type { Client } from './lib/clients'
import { loadMeta, saveMeta } from './lib/storage'
import type { MetaMap } from './lib/storage'
import { labelToStatus } from './lib/status'
import { CLASS_NONE, CLASS_NONE_LABEL, sortClasses } from './lib/classification'
import { DEFAULT_SEGMENTO, commonSegmento, vocabFor } from './lib/segment'
import type { Segmento } from './lib/segment'
import { fetchSheetCsv } from './lib/sheet'
import { empresaKey, mergeSheets, sortSources, sourceLabel, sourcesFor } from './lib/sources'
import { visibleInsights } from './lib/insights'
import { visibleOverview } from './lib/overview'
import { fmtInt } from './lib/format'
import { useTheme } from './theme'
import { useLineNames } from './lineNames'
import { VocabProvider } from './vocab'
import { useSession } from './auth/AuthProvider'
import type { AppUser, FonteInput, FonteOnline } from './auth/types'
import { ThemeToggle } from './components/ThemeToggle'
import { UserMenu } from './components/UserMenu'
import { BrandLogo } from './components/BrandLogo'
import { DEFAULT_FILTERS, FilterBar } from './components/FilterBar'
import type { LiveInfo } from './components/FilterBar'
import { OverviewView } from './views/OverviewView'
import { ConversationsView } from './views/ConversationsView'
import { InsightsView } from './views/InsightsView'
import { DataView } from './views/DataView'
import type { PublishState, SheetStatus } from './views/DataView'
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
  clientSheets?: ClientSheets
}

/** Última leitura válida de cada planilha online (para só reprocessar o que mudou). */
interface SheetCache {
  url: string
  text: string
  res: ParseResult
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
  // Planilhas online que esta pessoa lê, cada uma em seu intervalo (vazio = base vem do arquivo publicado).
  // Admin: todas; usuário: as do cliente dele ou, sem nenhuma, as de todos os clientes (lib/sources.ts).
  const [sources, setSources] = useState<FonteOnline[]>([])
  const [sheetStatus, setSheetStatus] = useState<Map<string, SheetStatus>>(() => new Map())
  const [baseVersion, setBaseVersion] = useState(0) // força recarregar a base publicada (ex.: ao remover a última planilha online)
  const sheetCache = useRef(new Map<string, SheetCache>())
  const sheetFetchedAt = useRef(new Map<string, number>())
  const sheetInflight = useRef(new Set<string>())
  const sheetCtrl = useRef<AbortController | null>(null)
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
      clientSheets: extra.clientSheets,
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
        const mine = base ? sourcesFor(base.fontes, user) : []
        if (mine.length) {
          delegated = true // a leitura das planilhas online (efeito abaixo) assume daqui
          setSources(sortSources(mine))
          return
        }
        setSources([])
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

  /*
   * Lê as planilhas online. Cada uma tem o próprio intervalo; só baixa as que venceram (ou todas, ao clicar em
   * Atualizar) e só refaz a base quando algum CSV mudou. Planilha com erro mantém a última leitura boa.
   *   rebuild: a lista de planilhas mudou (refaz a base mesmo sem CSV novo);
   *   tick: leitura periódica; force: botão Atualizar agora.
   */
  const refreshSheets = useCallback(
    async (list: FonteOnline[], signal: AbortSignal, mode: 'rebuild' | 'tick' | 'force') => {
      const inflight = sheetInflight.current
      const now = Date.now()
      const due = list.filter((f) => {
        if (inflight.has(f.id)) return false
        const cached = sheetCache.current.get(f.id)
        if (mode === 'force' || !cached || cached.url !== f.url) return true
        return now - (sheetFetchedAt.current.get(f.id) ?? 0) >= f.intervaloSeg * 1000 * 0.9
      })
      if (!due.length && mode !== 'rebuild') return
      for (const f of due) inflight.add(f.id)
      setSheetStatus((prev) => {
        const next = new Map(prev)
        for (const f of due) next.set(f.id, { status: 'loading', at: prev.get(f.id)?.at ?? null, message: null, messages: prev.get(f.id)?.messages ?? null })
        return next
      })
      try {
        const results = await Promise.all(
          due.map(async (f) => {
            try {
              return { f, text: (await fetchSheetCsv(f.url, signal)).text, error: null }
            } catch (e) {
              return { f, text: '', error: (e as Error).message }
            }
          }),
        )
        if (signal.aborted) return
        const at = new Date()
        let changed = mode === 'rebuild'
        const updates = new Map<string, SheetStatus>()
        for (const { f, text, error: fetchError } of results) {
          sheetFetchedAt.current.set(f.id, Date.now())
          const prev = sheetCache.current.get(f.id)
          const fail = (message: string) => updates.set(f.id, { status: 'error', at, message, messages: prev?.res.messages.length ?? null })
          if (fetchError) {
            fail(fetchError)
            continue
          }
          if (!prev || prev.text !== text || prev.url !== f.url) {
            const res = parseCsv(text)
            if (res.missingColumns.length) {
              fail(`A planilha não tem as colunas esperadas: ${res.missingColumns.join(', ')}.`)
              continue
            }
            if (!res.messages.length) {
              fail('A planilha não tem mensagens válidas.')
              continue
            }
            sheetCache.current.set(f.id, { url: f.url, text, res })
            changed = true
          }
          updates.set(f.id, { status: 'ok', at, message: null, messages: sheetCache.current.get(f.id)?.res.messages.length ?? null })
        }
        setSheetStatus((prev) => {
          const next = new Map([...prev].filter(([id]) => list.some((f) => f.id === id)))
          updates.forEach((v, id) => next.set(id, v))
          return next
        })
        if (!changed) return
        const parts = list.flatMap((f) => {
          const cached = sheetCache.current.get(f.id)
          return cached ? [{ fonte: f, res: cached.res }] : []
        })
        if (!parts.length) {
          const first = [...updates.values()].find((u) => u.message)?.message ?? 'sem resposta'
          hasDataset.current = false
          setDataset(null)
          setError(`Não foi possível ler ${list.length > 1 ? 'as planilhas online' : 'a planilha online'}: ${first}`)
          return
        }
        const merged = mergeSheets(parts)
        showDataset(merged.res, ONLINE_NAME, { origem: 'online', fetchedAt: at, keep: hasDataset.current, clientSheets: merged.clientSheets })
      } finally {
        for (const f of due) inflight.delete(f.id)
      }
    },
    [showDataset],
  )

  useEffect(() => {
    if (!sources.length) return
    const ctrl = new AbortController()
    sheetCtrl.current = ctrl
    sheetInflight.current = new Set() // leituras da lista anterior foram canceladas
    const ids = new Set(sources.map((f) => f.id))
    for (const id of [...sheetCache.current.keys()]) {
      if (ids.has(id)) continue
      sheetCache.current.delete(id)
      sheetFetchedAt.current.delete(id)
    }
    if (!hasDataset.current) setLoading(true)
    void refreshSheets(sources, ctrl.signal, 'rebuild').finally(() => {
      if (!ctrl.signal.aborted) setLoading(false)
    })
    const period = Math.min(...sources.map((f) => f.intervaloSeg)) * 1000
    const tick = () => {
      if (document.visibilityState === 'visible') void refreshSheets(sources, ctrl.signal, 'tick')
    }
    const id = setInterval(tick, Math.min(period, 30000))
    document.addEventListener('visibilitychange', tick)
    return () => {
      ctrl.abort()
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [sources, refreshSheets])

  const refreshNow = useCallback(() => {
    const ctrl = sheetCtrl.current
    if (sources.length && ctrl && !ctrl.signal.aborted) void refreshSheets(sources, ctrl.signal, 'force')
  }, [sources, refreshSheets])

  // Estado das planilhas juntas, para o botão de atualizar do topo.
  const live = useMemo<LiveInfo | null>(() => {
    if (!sources.length) return null
    const st = sources.map((f) => sheetStatus.get(f.id))
    const status = st.some((x) => x?.status === 'loading') ? 'loading' : st.some((x) => x?.status === 'error') ? 'error' : st.every((x) => x?.status === 'ok') ? 'ok' : 'idle'
    const times = st.map((x) => x?.at?.getTime() ?? 0).filter(Boolean)
    const errors = sources.flatMap((f, i) => (st[i]?.status === 'error' ? [`${sources.length > 1 ? `${sourceLabel(f)}: ` : ''}${st[i]?.message}`] : []))
    return {
      status,
      at: times.length ? new Date(Math.max(...times)) : null,
      message: errors.join(' · ') || null,
      intervaloSeg: Math.min(...sources.map((f) => f.intervaloSeg)),
    }
  }, [sources, sheetStatus])

  const saveSource = useCallback(
    async (fonte: FonteInput) => {
      const saved = await backend.saveSource(fonte)
      setSources((prev) => sortSources(prev.some((f) => f.id === saved.id) ? prev.map((f) => (f.id === saved.id ? saved : f)) : [...prev, saved]))
    },
    [backend],
  )

  const removeSource = useCallback(
    async (id: string) => {
      await backend.removeSource(id)
      const next = sources.filter((f) => f.id !== id)
      setSources(next)
      if (next.length) return
      // Sem planilha online: volta para o arquivo publicado (ou fica sem base).
      sheetCache.current.clear()
      sheetFetchedAt.current.clear()
      setSheetStatus(new Map())
      hasDataset.current = false
      setDataset(null)
      setBaseVersion((v) => v + 1)
    },
    [backend, sources],
  )

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
  const clientSheets = dataset?.clientSheets
  const segmentOf = useMemo<(key: string) => Segmento>(() => {
    if (!isAdmin) return () => user.segmento
    const byKey = segmentByKey(buildClients(users, [], clientSheets?.clients))
    return (key) => byKey.get(key) ?? DEFAULT_SEGMENTO
  }, [isAdmin, user.segmento, users, clientSheets])
  const baseConvs = useMemo(
    () => (dataset ? buildConversations(dataset.messages, refTime, dataset.clinicPhones, segmentOf) : []),
    [dataset, refTime, segmentOf],
  )
  // Leads sem resposta que só "Sem número" liberado alcança (os de planilha de cliente já são do cliente).
  const baseUnknown = useMemo(() => hasLooseUnknown(baseConvs, clientSheets), [baseConvs, clientSheets])
  // Clientes (só admin): as contas da aba Usuários agrupadas por empresa e os clientes com planilha online própria,
  // mais "Sem cliente" para o que ninguém tem.
  const clients = useMemo<Client[]>(
    () => (isAdmin && dataset ? buildClients(users, [...dataset.clinicPhones, ...(baseUnknown ? [SEM_NUMERO] : [])], clientSheets?.clients) : []),
    [isAdmin, dataset, users, baseUnknown, clientSheets],
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
  // Cliente escolhido: os números dele e, nos leads sem resposta, a planilha de onde vieram (lib/clients.ts).
  const belongs = useMemo<((c: Conversation) => boolean) | null>(() => {
    if (!isAdmin) return allowed ? (c) => allowed.has(accessKey(c)) : null
    return selectedClient ? clientMatcher(selectedClient, clientSheets) : null
  }, [isAdmin, allowed, selectedClient, clientSheets])
  const allConvs = useMemo(() => (belongs ? baseConvs.filter(belongs) : baseConvs), [baseConvs, belongs])
  const messages = useMemo(() => {
    if (!dataset) return []
    if (!belongs) return dataset.messages
    const keys = new Set(allConvs.map((c) => c.key))
    return dataset.messages.filter((m) => keys.has(m.convKey))
  }, [dataset, belongs, allConvs])
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
    for (const c of clients) counts.set(c.id, leads.filter(clientMatcher(c, clientSheets)).length)
    return { counts, total: leads.length }
  }, [clients, clientSheets, baseConvs, range, filters, meta])
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

  // Empresas conhecidas (contas e planilhas), para escolher o cliente de uma planilha e a empresa de uma conta.
  const empresas = useMemo(() => {
    const byKey = new Map<string, string>()
    for (const u of users) if (u.papel === 'usuario' && u.empresa.trim()) byKey.set(empresaKey(u.empresa), u.empresa.trim())
    for (const f of sources) if (f.empresa.trim() && !byKey.has(empresaKey(f.empresa))) byKey.set(empresaKey(f.empresa), f.empresa.trim())
    return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [users, sources])
  const empresasComConta = useMemo(
    () => new Set(users.filter((u) => u.papel === 'usuario' && u.empresa.trim()).map((u) => empresaKey(u.empresa))),
    [users],
  )

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
      sources={sources}
      sheetStatus={sheetStatus}
      empresas={empresas}
      empresasComConta={empresasComConta}
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
              empresas={empresas}
              onUsersChanged={setUsers}
            />
          ) : loading ? (
            <div className="loading-screen">
              <span className="spinner" aria-hidden />
              {sources.length > 1 ? 'Lendo as planilhas online…' : sources.length ? 'Lendo a planilha online…' : 'Carregando base de mensagens…'}
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
                  live={live}
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
