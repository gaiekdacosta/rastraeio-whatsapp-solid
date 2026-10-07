import { useRef, useState } from 'react'
import { CircleHelp, Download, FileSpreadsheet, Lock, Phone, Trash2, Upload } from 'lucide-react'
import type { Conversation, Dataset } from '../lib/types'
import type { MetaMap } from '../lib/storage'
import { buildLeadsCsv, buildMessagesCsv, downloadText } from '../lib/export'
import { useLineNames } from '../lineNames'
import { fmtDateTime, fmtInt, fmtLine, fmtTime, toDateKey } from '../lib/format'
import { SEM_NUMERO } from '../lib/access'

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
}

export function DataView({ dataset, skipped, allConvs, attendants, meta, error, isAdmin, demo, allowed, publish, onFile, onClearMeta }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { label, isRenamed } = useLineNames()
  const [drag, setDrag] = useState(false)
  const classified = allConvs.filter((c) => meta[c.key]?.status).length
  const withNotes = allConvs.filter((c) => meta[c.key]?.notes?.trim()).length
  const withFollow = allConvs.filter((c) => meta[c.key]?.followUp).length
  const stamp = toDateKey(new Date()).replace(/-/g, '')

  return (
    <div className="grid grid-2">
      <section className="card" aria-label="Base atual">
        <div className="card-head">
          <div>
            <h3 className="card-title">Base atual</h3>
            <p className="card-sub">{isAdmin ? 'Planilha publicada para os usuários' : 'Conversas dos números liberados para você'}</p>
          </div>
        </div>
        {error && <div className="callout warn" style={{ marginBottom: 12 }}>{error}</div>}
        {dataset ? (
          <dl className="kv">
            <dt>Arquivo</dt>
            <dd>{dataset.fileName}</dd>
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
            {dataset.publishedAt ? (
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
          <div className="empty">{isAdmin ? 'Nenhuma planilha publicada ainda. Envie o CSV ao lado.' : 'Nenhuma base carregada.'}</div>
        )}
      </section>

      {isAdmin ? (
        <section className="card" aria-label="Publicar planilha">
          <div className="card-head">
            <div>
              <h3 className="card-title">Publicar nova planilha</h3>
              <p className="card-sub">
                Substitui a planilha de todos os usuários; cada um recebe só as conversas dos números liberados para ele. CSV com as colunas Data, Hora, Lead, Telefone, Tipo,
                É resposta, Respondendo para, Mensagem, status_manual.
              </p>
            </div>
          </div>
          {publish.status === 'publishing' && (
            <div className="callout" role="status" style={{ marginBottom: 12 }}>
              Publicando a planilha…
            </div>
          )}
          {publish.status === 'done' && (
            <div className="callout" role="status" style={{ marginBottom: 12 }}>
              Planilha publicada às {fmtTime(publish.at)}.{demo ? ' No modo demonstração ela vale só até recarregar a página.' : ' Os usuários a recebem no próximo acesso.'}
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
            <button type="button" className="btn primary" disabled={publish.status === 'publishing'} onClick={() => inputRef.current?.click()}>
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
            <p className="card-sub">Leve a classificação de volta para a planilha</p>
          </div>
        </div>
        <div className="stack">
          <div className="row-between">
            <div>
              <b>Mensagens com status_manual preenchido</b>
              <div className="small muted">Mesmas colunas da planilha original; cada linha recebe o status da sua conversa.</div>
            </div>
            <button
              type="button"
              className="btn"
              disabled={!dataset}
              onClick={() => dataset && downloadText(`rastreio-whatsapp-mensagens-${stamp}.csv`, buildMessagesCsv(dataset.messages, allConvs, meta))}
            >
              <Download size={14} aria-hidden /> CSV
            </button>
          </div>
          <div className="row-between">
            <div>
              <b>Resumo por lead</b>
              <div className="small muted">Uma linha por conversa: procedimento, canal, estágio, tempos de resposta, status, follow-up e notas.</div>
            </div>
            <button type="button" className="btn" disabled={!allConvs.length} onClick={() => downloadText(`rastreio-whatsapp-leads-${stamp}.csv`, buildLeadsCsv(allConvs, meta, label))}>
              <Download size={14} aria-hidden /> CSV
            </button>
          </div>
        </div>
      </section>

      <section className="card" aria-label="Classificações">
        <div className="card-head">
          <div>
            <h3 className="card-title">Classificações salvas</h3>
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
          <Trash2 size={14} aria-hidden /> Limpar todas as classificações
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
            <b>Procedimento</b>: extraído da mensagem padrão do anúncio (“tenho interesse no…”); na falta dela, de palavras-chave nas mensagens do lead e, por último, nas respostas da clínica.
          </li>
          <li>
            <b>Estágio inferido</b>: pagamento (Pix, sinal, comprovante) &gt; agendamento (clínica confirma horário) &gt; pediu agendamento (lead cita agendar, avaliação, horário) &gt; em
            conversa (lead voltou a escrever após a resposta) &gt; contato inicial. É uma heurística: o status manual é a fonte oficial.
          </li>
          <li>
            <b>Tempo de resposta</b>: intervalo entre a primeira mensagem do lead sem resposta e a próxima mensagem da clínica. Inclui horários fora do expediente.
          </li>
          <li>
            <b>Espera e silêncio</b>: calculados em relação à última mensagem da base, não ao relógio do computador, para a leitura ser estável em bases antigas.
          </li>
        </ul>
      </section>
    </div>
  )
}
