import { useState } from 'react'
import { Flag, Pencil } from 'lucide-react'
import { useData } from '../lib/data'
import { useSetting } from '../lib/rows'
import { useStore } from '../lib/store'
import { localIso, money } from '../lib/format'
import { Toggle } from './ui'

// Stüdyonun aylık gelir hedefi (TL saklanır). Ay sonu tahmini ve "günde ne lazım" burada;
// düşüş uyarısı ve haftalık hedef bildirimi her sabah GitHub'da çalışır (scripts/goals.mjs).
export type RevenueGoal = { monthly: number; dropAlert: boolean; dropPct: number; minAvg: number; reached: string | null }
const DEFAULTS: RevenueGoal = { monthly: 0, dropAlert: true, dropPct: 50, minAvg: 5, reached: null }
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

export function useGoal() {
  const { daily, currency, fx } = useData()
  const [goal, save] = useSetting<RevenueGoal>('revenue_goal', DEFAULTS)
  const fxDays = Object.keys(fx).sort()
  const k = currency === 'TRY' ? 1 : 1 / (fx[fxDays[fxDays.length - 1]] || 1) // hedef TL; panel USD gösteriyorsa çevir
  const target = goal.monthly * k

  const now = new Date()
  const today = localIso(now)
  const month = today.slice(0, 7)
  const elapsed = now.getDate() - 1
  const length = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const byDate = new Map<string, number>()
  for (const r of daily) byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.adRevenue + r.iapRevenue)
  const sofar = [...byDate].filter(([d]) => d.startsWith(month) && d < today).reduce((a, [, v]) => a + v, 0)
  const last7 = [...byDate].filter(([d]) => d < today).sort().slice(-7).map(([, v]) => v)
  const pace = elapsed > 0 ? sofar / elapsed : last7.length ? last7.reduce((a, b) => a + b, 0) / last7.length : 0
  const left = length - elapsed
  const projected = sofar + pace * left
  return {
    goal, save, target, sofar, pace, projected, left,
    need: target > 0 ? Math.max(0, (target - sofar) / left) : 0,
    ratio: target > 0 ? sofar / target : 0,
    monthName: MONTHS[now.getMonth()],
  }
}

export default function GoalCard() {
  const g = useGoal()
  const { toast } = useStore()
  const [edit, setEdit] = useState(false)
  const [draft, setDraft] = useState('')
  const suggestion = Math.max(100, Math.ceil((g.projected * 1.2) / (g.projected > 1000 ? 500 : 50)) * (g.projected > 1000 ? 500 : 50))

  const store = (v: Partial<RevenueGoal>) => g.save({ ...g.goal, ...v }).catch((e) => toast('Kaydedilemedi: ' + e.message, 'warn'))
  const submit = () => {
    const n = Number(draft.replace(/\./g, '').replace(',', '.'))
    if (!(n > 0)) return toast('Bir tutar yaz (TL)', 'warn')
    store({ monthly: n, reached: null }).then(() => toast(`${g.monthName} hedefi: ₺${n.toLocaleString('tr-TR')}`))
    setEdit(false)
  }
  const onTrack = g.projected >= g.target

  return (
    <section className="card goal-card">
      <div className="card-head wrap">
        <div className="flex" style={{ gap: 10 }}>
          <span className="menu-ico"><Flag size={16} /></span>
          <div>
            <div className="card-title">{g.monthName} gelir hedefi</div>
            <div className="card-sub">{g.target > 0 ? `${money(g.sofar)} / ${money(g.target)}` : 'Hedef koy; panel gidişatı hesaplar, sapınca telefonuna haber verir.'}</div>
          </div>
        </div>
        {!edit && (
          <button type="button" className="btn sm" onClick={() => { setDraft(String(g.goal.monthly || suggestion)); setEdit(true) }}>
            <Pencil size={12} /> {g.goal.monthly ? 'Değiştir' : 'Hedef koy'}
          </button>
        )}
      </div>

      {edit && (
        <form className="goal-edit" onSubmit={(e) => (e.preventDefault(), submit())}>
          <label className="small muted" htmlFor="goal-in">Aylık hedef (TL)</label>
          <input id="goal-in" className="input" inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
          <span className="muted small">Bu hızla ay sonu ~{money(g.projected)}; öneri ₺{suggestion.toLocaleString('tr-TR')}</span>
          <div className="flex" style={{ gap: 8 }}>
            <button type="button" className="btn btn-ghost sm" onClick={() => setEdit(false)}>Vazgeç</button>
            <button type="submit" className="btn btn-primary sm">Kaydet</button>
          </div>
        </form>
      )}

      {g.target > 0 && (
        <>
          <div className="goal-bar" aria-label={`Hedefin %${Math.round(g.ratio * 100)}'i`}>
            <i style={{ width: `${Math.min(100, g.ratio * 100)}%` }} />
            <b style={{ left: `${Math.min(100, (g.projected / g.target) * 100)}%` }} title="Ay sonu tahmini" />
          </div>
          <div className="goal-stats">
            <div><span>Şimdiye kadar</span><b>%{Math.round(g.ratio * 100)}</b></div>
            <div><span>Ay sonu tahmini</span><b className={onTrack ? 'up' : 'down'}>{money(g.projected)}</b></div>
            <div><span>Günlük hız</span><b>{money(g.pace)}</b></div>
            <div><span>Hedef için günde</span><b>{g.ratio >= 1 ? '✓' : money(g.need)}</b></div>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            {g.ratio >= 1 ? 'Hedefe ulaştın, tebrikler! Gelecek ay için çıtayı yükseltebilirsin.'
              : onTrack ? `Yolundasın: bu hızla hedefi ${g.left} gün içinde geçersin.`
              : `Bu hızla hedefin %${Math.round((g.projected / g.target) * 100)}'inde kalırsın. Günlük geliri ${money(g.need - g.pace)} artırmak lazım.`}
          </p>
        </>
      )}

      <div className="row" style={{ paddingTop: 6 }}>
        <div className="grow">
          <div className="small">Gelir ani düşerse telefonuma haber ver</div>
          <div className="muted" style={{ fontSize: 10 }}>Dün, son 7 günün ortalamasından %{g.goal.dropPct} fazla düşerse. Pazartesi sabahı hedef özeti de gelir.</div>
        </div>
        <Toggle on={g.goal.dropAlert} onChange={(v) => store({ dropAlert: v })} label="Gelir düşüş bildirimi" />
      </div>
    </section>
  )
}
