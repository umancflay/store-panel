import { Check, Loader2, Sparkles, X } from 'lucide-react'
import { usePeople } from '../lib/data'
import { useStore } from '../lib/store'
import { isDemo } from '../lib/supabase'
import { useInsight, useRows, useSetting, trDate, trDateTime } from '../lib/rows'
import { logActivity } from '../lib/files'
import { demoSuggestions, demoWorkPlan } from '../data/demo'
import { ASSISTANT, taskCode, type Task, type WorkPlan, type WorkSuggestion } from '../lib/types'
import { GameLogo, initials } from './ui'
import { triggerWorkflow } from '../lib/trigger'

const levelColor = { critical: '#FF7A55', medium: '#E8C07A', low: '#8FD3AE' }

// Claude'un haftalık iş bölümü: haftanın özeti, kişi başı odak ve "kabul et / geç" önerileri.
// Kabul edilmeden hiçbir görev açılmaz, sorumlu değişmez. "Haftayı planla" isteği 10 dakika içinde işlenir.
export default function ClaudePlan({ tasks }: { tasks: ReturnType<typeof useRows<Task>> }) {
  const { me, people, nameOf } = usePeople()
  const { toast } = useStore()
  const insight = useInsight<WorkPlan>('work_plan')
  const plan = isDemo ? { content: demoWorkPlan, created_at: new Date().toISOString() } : insight
  const sugg = useRows<WorkSuggestion>('work_suggestions', demoSuggestions, { order: 'created_at', ascending: false, filter: ['status', 'pending'] })
  const [req, setReq] = useSetting<{ requested_at: string }>('work_plan', { requested_at: '' })
  const waiting = Boolean(req.requested_at && (!plan || plan.created_at < req.requested_at))

  async function decide(s: WorkSuggestion, accept: boolean) {
    try {
      if (accept) {
        if (s.kind === 'assign' && s.task_id) {
          await tasks.update(s.task_id, { assignee: s.assignee, updated_at: new Date().toISOString() })
          logActivity(me.email, `${taskCode(s.task_id)} ${s.title} · Claude önerisiyle ${nameOf(s.assignee)} üstlendi`, `/gorevler?id=${s.task_id}`).catch(() => {})
        } else {
          const row = await tasks.insert({
            title: s.title, status: 'open', level: s.level, game_id: s.game_id, assignee: s.assignee, due_date: s.due_date,
            notes: s.why, tags: ['Claude'], subtasks: [], created_by: me.email,
            history: [{ what: 'Claude\'un haftalık planından eklendi', at: new Date().toISOString() }],
          })
          logActivity(me.email, `${taskCode(row.id)} ${row.title} görevini Claude önerisinden açtı → ${nameOf(s.assignee)}`, `/gorevler?id=${row.id}`).catch(() => {})
        }
      }
      if (accept && s.assignee === ASSISTANT) triggerWorkflow('assistant.yml')
      await sugg.update(s.id, { status: accept ? 'accepted' : 'dismissed', decided_by: me.email, decided_at: new Date().toISOString() })
      sugg.setRows((r) => r.filter((x) => x.id !== s.id))
      toast(accept ? (s.kind === 'assign' ? `${nameOf(s.assignee)} üstlendi` : 'Görev açıldı') : 'Öneri geçildi', accept ? 'ok' : 'info')
    } catch (err) {
      toast('Kaydedilemedi: ' + (err as Error).message, 'warn')
    }
  }

  async function requestPlan() {
    try {
      await setReq({ requested_at: new Date().toISOString() })
      triggerWorkflow('assistant.yml')
      toast(isDemo ? 'Demo: gerçek modda Claude 10 dakika içinde planlar' : 'Claude haftayı planlıyor, 10-15 dakika içinde burada ve telefonunda', 'info')
    } catch (err) {
      toast('İstenemedi: ' + (err as Error).message, 'warn')
    }
  }

  const pending = sugg.rows.filter((s) => s.status === 'pending')
  const myFocus = plan?.content.focus.find((f) => f.email.toLowerCase() === me.email.toLowerCase())
  const otherFocus = plan?.content.focus.filter((f) => f.email.toLowerCase() !== me.email.toLowerCase()) ?? []

  return (
    <section className="card cplan">
      <div className="card-head wrap">
        <div className="flex" style={{ gap: 10 }}>
          <span className="avatar ai">AI</span>
          <div>
            <div className="card-title">Claude'un haftalık planı</div>
            <div className="card-sub">{plan ? `${trDateTime(plan.created_at)} · işler, uyarılar, yorumlar ve kimin ne yaptığına göre` : 'Pazartesi sabahı kendiliğinden hazırlanır'}</div>
          </div>
        </div>
        <button type="button" className="btn sm" onClick={requestPlan} disabled={waiting}>
          {waiting ? <><Loader2 size={13} className="spin" /> Planlanıyor…</> : <><Sparkles size={13} /> {plan ? 'Yeniden planla' : 'Haftayı planla'}</>}
        </button>
      </div>

      {plan ? (
        <>
          <p className="cplan-summary">{plan.content.week_summary}</p>
          <div className="cplan-focus">
            {myFocus && (
              <div className="cplan-person">
                <span className="avatar sm">{initials(me.name)}</span>
                <div><b>Sen</b><span>{myFocus.summary}</span></div>
              </div>
            )}
            {otherFocus.map((f) => (
              <div key={f.email} className="cplan-person">
                <span className="avatar sm alt">{initials(nameOf(f.email))}</span>
                <div><b>{nameOf(f.email)}</b><span>{f.summary}</span></div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="empty" style={{ padding: 16 }}>
          Henüz plan yok. "Haftayı planla"ya bas: Claude açık işlere, uyarılara ve kimin ne yaptığına bakıp haftanın işlerini {people.length > 1 ? 'ikinize' : 'size'} böler.
        </div>
      )}

      {pending.length > 0 && (
        <div className="cplan-list">
          <div className="muted small" style={{ margin: '4px 0 6px' }}>Onay bekleyen öneriler · kabul edersen görev açılır</div>
          {pending.map((s) => (
            <div key={s.id} className="cplan-item">
              <span className="dot" style={{ background: levelColor[s.level] }} />
              {s.game_id && <GameLogo id={s.game_id} size={22} />}
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="small">{s.kind === 'assign' && <span className="muted">Sorumlu öner: </span>}{s.title}</div>
                <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                  <span className={`avatar sm ${s.assignee === ASSISTANT ? 'ai' : s.assignee === me.email ? '' : 'alt'}`} style={{ display: 'inline-grid', width: 16, height: 16, fontSize: 7, verticalAlign: 'middle', marginRight: 5 }}>
                    {s.assignee === ASSISTANT ? 'AI' : initials(nameOf(s.assignee))}
                  </span>
                  {nameOf(s.assignee)}{s.due_date ? ` · ${trDate(s.due_date)}` : ''}{s.why ? ` · ${s.why}` : ''}
                </div>
              </div>
              <div className="cplan-actions">
                <button type="button" className="icon-btn" title="Geç" aria-label="Öneriyi geç" onClick={() => decide(s, false)}><X size={13} /></button>
                <button type="button" className="btn sm btn-green" onClick={() => decide(s, true)}><Check size={12} /> Kabul</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
