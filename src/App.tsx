import { useCallback, useEffect, useMemo, useState } from 'react'
import { Database, LayoutDashboard, Lightbulb, Lock, MessagesSquare, UsersRound } from 'lucide-react'
import type { ConvMeta, Dataset, Filters } from './lib/types'
import { parseCsv } from './lib/parse'
import type { ParseResult } from './lib/parse'
import { applyFilters, attendantsByLine, buildConversations, leadConversations, presetRange, referenceTime } from './lib/analytics'
import { accessKey, SEM_NUMERO, splitCsvByAccess } from './lib/access'
import { loadMeta, saveMeta } from './lib/storage'
import type { MetaMap } from './lib/storage'
import { labelToStatus } from './lib/status'
import { fmtInt } from './lib/format'
import { useTheme } from './theme'
import { useLineNames } from './lineNames'
import { useSession } from './auth/AuthProvider'
import { ThemeToggle } from './components/ThemeToggle'
import { UserMenu } from './components/UserMenu'
import { BrandLogo } from './components/BrandLogo'
import { DEFAULT_FILTERS, FilterBar } from './components/FilterBar'
import { OverviewView } from './views/OverviewView'
import { ConversationsView } from './views/ConversationsView'
import { InsightsView } from './views/InsightsView'
import { DataView } from './views/DataView'
import type { PublishState } from './views/DataView'
import { UsersView } from './views/UsersView'

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

export default function App() {
  const { palette } = useTheme()
  const { backend, user } = useSession()
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

  const showDataset = useCallback(
    (res: ParseResult, fileName: string, extra: { clinicPhones?: string[]; refTime?: Date | null; publishedAt?: Date | null } = {}) => {
      setDataset({
        fileName,
        messages: res.messages,
        // O usuário recebe só parte da planilha; números e referência vêm da planilha inteira.
        clinicPhones: extra.clinicPhones?.length ? extra.clinicPhones : res.clinicPhones,
        refTime: extra.refTime ?? referenceTime(res.messages),
        loadedAt: new Date(),
        publishedAt: extra.publishedAt ?? null,
      })
      setSkipped(res.skipped)
      setError(null)
      setEmpty(null)
      setSelectedKey(null)
      setFilters((f) => ({ ...f, line: 'all' })) // os números mudam de uma base para outra
    },
    [],
  )

  useEffect(() => {
    let alive = true
    if (!isAdmin && user.numeros.length === 0) {
      setEmpty('sem-numeros')
      setLoading(false)
      return
    }
    setLoading(true)
    backend
      .loadBase(user)
      .then((base) => {
        if (!alive) return
        if (!base) return setEmpty('sem-base')
        if (!base.text.trim()) return setEmpty('vazio')
        const res = parseChecked(base.text, base.fileName)
        if (res) showDataset(res, base.fileName, base)
      })
      .catch((e: Error) => {
        if (alive) setError(`Não foi possível carregar a planilha: ${e.message}`)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [backend, user, isAdmin, parseChecked, showDataset])

  useEffect(() => {
    saveMeta(meta)
  }, [meta])

  // Recorte por usuário: admin vê tudo; usuário, só as conversas dos números liberados. No Supabase o
  // servidor já entrega só esses arquivos; aqui o filtro se repete (e é o único no modo demonstração).
  const allowed = useMemo(() => (isAdmin ? null : new Set(user.numeros)), [isAdmin, user.numeros])
  const refTime = useMemo(() => dataset?.refTime ?? new Date(), [dataset])
  const baseConvs = useMemo(() => (dataset ? buildConversations(dataset.messages, refTime, dataset.clinicPhones) : []), [dataset, refTime])
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
  const minTime = useMemo(() => messages[0]?.at ?? refTime, [messages, refTime])
  const attendants = useMemo(() => attendantsByLine(messages), [messages])

  // Status já preenchidos na planilha viram status manual quando ainda não há classificação local.
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
  const hasUnknownLine = useMemo(() => allConvs.some((c) => !c.line && !c.isGroup), [allConvs])
  // Contagem de cada botão do filtro de número: os outros filtros valem, o de número não.
  const lineCounts = useMemo(() => {
    const counts = new Map<string, number>()
    if (clinicPhones.length < 2) return counts
    const { convs } = applyFilters(allConvs, [], range, { ...filters, line: 'all' }, meta)
    for (const c of leadConversations(convs, meta)) counts.set(c.line, (counts.get(c.line) ?? 0) + 1)
    return counts
  }, [clinicPhones, allConvs, range, filters, meta])
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
        showDataset(res, file.name, { refTime: ref, publishedAt: new Date() })
        setPublish({ status: 'done', at: new Date() })
      } catch (e) {
        setPublish({ status: 'error', message: (e as Error).message })
      }
    },
    [backend, parseChecked, showDataset],
  )

  const tabs = TABS.filter((t) => !t.adminOnly || isAdmin)

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
    />
  )

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <BrandLogo />
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
          <UsersView lines={dataset?.clinicPhones ?? []} hasUnknownLine={hasUnknownLine} counts={accessCounts} attendants={attendants} hasBase={!!dataset} />
        ) : loading ? (
          <div className="loading-screen">Carregando base de mensagens…</div>
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
                lines={clinicPhones}
                hasUnknownLine={hasUnknownLine}
                lineCounts={lineCounts}
                attendants={attendants}
                refTime={refTime}
                range={range}
              />
            )}
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
            {tab === 'insights' && <InsightsView convs={filtered.convs} msgs={filtered.messages} meta={meta} palette={palette} onOpenConv={openConv} />}
            {tab === 'dados' && dataView}
          </>
        )}
      </main>
    </div>
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
