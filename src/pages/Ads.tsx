import { useState } from 'react'
import { Users, Globe2, Wallet, Clapperboard, Image, Target, Check, X, Link2, Link2Off, ShieldCheck, Sparkles, Video, Lightbulb } from 'lucide-react'
import { adAccounts, gameById } from '../data/sample'
import { useData } from '../lib/data'
import Needs from '../components/Needs'
import AdDashboard from '../components/AdDashboard'
import { money } from '../lib/format'
import { useStore } from '../lib/store'
import { trDateTime } from '../lib/rows'
import { GameLogo, SampleBanner } from '../components/ui'

const fitClass = { Yüksek: 'b-ok', Orta: 'b-warning', Düşük: 'b-muted' }

export default function Ads() {
  const { adPlans, demo, connected, connections } = useData()
  // Sadece reklam planı hazırlanmış oyunlar seçilebilir
  const planGames = adPlans.map((p) => gameById(p.gameId)).filter((g): g is NonNullable<typeof g> => !!g)
  const [picked, setGameId] = useState<string | null>(null)
  const gameId = picked ?? planGames[0]?.id ?? ''
  const plan = adPlans.find((p) => p.gameId === gameId)
  const game = gameById(gameId)
  const { recs, decide } = useStore()
  const pending = recs.filter((r) => r.status === 'pending')
  const decided = recs.filter((r) => r.status !== 'pending')

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SampleBanner />
      <div className="page-head">
        <span className="eyebrow">Reklam</span>
        <h1>Reklam panosu</h1>
        <p>Harcama, sonuçlar ve reklamına tepki veren kitle. Claude bu veriden oyun başına plan çıkarır; para harcayan her adım senin “Onayla” demeni bekler.</p>
      </div>

      <AdDashboard />

      <section className="card plan-hero">
        <div className="card-head">
          <div>
            <div className="card-title flex" style={{ gap: 8 }}><Sparkles size={16} color="var(--green)" /> Claude'un reklam planı</div>
            <div className="card-sub">
              Reklam verilerine, AdMob'un ülke gelirine ve mağaza rakamlarına bakarak hazırlanır · haftada bir güncellenir
              {plan?.createdAt && <> · son: {trDateTime(plan.createdAt)}</>}
            </div>
          </div>
        </div>
        {!plan && !demo && connected.claude && <div className="empty" style={{ padding: 18 }}>İlk planlar bir sonraki günlük toplamada (08:00 ya da 18:00) hazırlanacak.</div>}
        {!plan && !demo && !connected.claude && <Needs source="claude" title="Oyun başına reklam planları (kitle, ülke, bütçe, kreatif) Claude bağlanınca hazırlanacak" />}
        {plan && game && (
          <div className="flex wrap" style={{ gap: 8 }}>
            {planGames.map((g) => (
              <button key={g.id} className={`btn ${g.id === gameId ? 'btn-primary' : ''}`} onClick={() => setGameId(g.id)}><GameLogo id={g.id} size={20} /> {g.name}</button>
            ))}
          </div>
        )}
      </section>

      {plan && game && (
        <div className="grid g-2 fade-in" key={gameId}>
          {plan.learned && plan.learned.length > 0 && (
            <section className="card plan-section span-2">
              <h4><Lightbulb size={15} /> Veriden öğrendikleri</h4>
              <div className="learned">
                {plan.learned.map((l) => <div key={l} className="inner small" style={{ lineHeight: 1.6 }}>{l}</div>)}
              </div>
            </section>
          )}

          <section className="card plan-section">
            <h4><Users size={15} /> Kime</h4>
            <div className="grid g-2" style={{ gap: 12, marginBottom: 12 }}>
              <div className="inner">
                <div className="muted small">Yaş aralığı</div>
                <div style={{ fontSize: 26, fontWeight: 300 }}>{plan.audience.age}</div>
              </div>
              {plan.audience.gender && (
                <div className="inner">
                  <div className="muted small">Cinsiyet</div>
                  <div style={{ fontSize: 20, fontWeight: 300, marginTop: 4 }}>{plan.audience.gender}</div>
                </div>
              )}
            </div>
            <div className="muted small" style={{ marginBottom: 8 }}>İlgi alanları</div>
            <div className="tags" style={{ marginBottom: 14 }}>{plan.audience.interests.map((i) => <span key={i} className="badge b-primary">{i}</span>)}</div>
            <div className="muted small" style={{ marginBottom: 8 }}>Bu oyunları oynayan kitle</div>
            <div className="tags">{plan.audience.similarGames.map((i) => <span key={i} className="badge b-muted">{i}</span>)}</div>
          </section>

          <section className="card plan-section">
            <h4><Globe2 size={15} /> Nerede</h4>
            {plan.countries.map((c) => (
              <div className="tier" key={c.tier}>
                <span className="badge b-primary" style={{ alignSelf: 'start', justifySelf: 'start' }}>{c.tier}</span>
                <div>
                  <b>{c.list.join(', ')}</b>
                  <p className="muted small" style={{ marginTop: 4, lineHeight: 1.5 }}>{c.why}</p>
                </div>
              </div>
            ))}
          </section>

          <section className="card plan-section">
            <h4><Wallet size={15} /> Ne bütçeyle</h4>
            <div className="grid g-2" style={{ gap: 12, marginBottom: 14 }}>
              <div className="inner"><div className="muted small">Günlük test bütçesi</div><div style={{ fontSize: 26, fontWeight: 300 }}>{money(plan.budget.daily)}</div></div>
              <div className="inner"><div className="muted small">Test süresi</div><div style={{ fontSize: 26, fontWeight: 300 }}>{plan.budget.days} gün</div></div>
            </div>
            <div className="row"><X size={16} color="var(--orange)" /><div className="grow small"><b>Ne zaman durdur:</b> <span className="muted">{plan.budget.stopRule}</span></div></div>
            <div className="row"><Check size={16} color="var(--green)" /><div className="grow small"><b>Ne zaman büyüt:</b> <span className="muted">{plan.budget.scaleRule}</span></div></div>
            <div className="muted small mt">Toplam test maliyeti: <b style={{ color: '#fff' }}>{money(plan.budget.daily * plan.budget.days)}</b> · harcama senin onayınla başlar</div>
          </section>

          <section className="card plan-section">
            <h4><Target size={15} /> Hangi platform</h4>
            {plan.platforms.map((p) => (
              <div className="fit-row" key={p.name}>
                <b>{p.name}</b>
                <span className={`badge ${fitClass[p.fit]}`}>{p.fit}</span>
                <span className="muted small" style={{ lineHeight: 1.5 }}>{p.why}</span>
              </div>
            ))}
          </section>

          <section className="card plan-section span-2">
            <h4><Clapperboard size={15} /> Kreatif fikirleri</h4>
            <div className="grid g-3">
              {plan.creatives.map((c) => (
                <div className="inner" key={c.idea}>
                  <span className={`badge ${c.type === 'Video' ? 'b-primary' : 'b-info'}`}>{c.type === 'Video' ? <Video size={12} /> : <Image size={12} />} {c.type}</span>
                  <p className="small" style={{ marginTop: 10, lineHeight: 1.6, color: '#d0d0d0' }}>{c.idea}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      <section className="card">
        <div className="card-head">
          <div>
            <div className="card-title flex"><ShieldCheck size={18} color="var(--green)" /> Onayını bekleyen öneriler</div>
            <div className="card-sub">Para harcayan ya da ayar değiştiren hiçbir şey sen onaylamadan uygulanmaz.</div>
          </div>
          {pending.length > 0 && <span className="badge b-warning">{pending.length} bekliyor</span>}
        </div>
        {pending.map((r) => (
          <div className="rec fade-in" key={r.id}>
            <GameLogo id={r.gameId} size={40} />
            <div className="rec-body">
              <b>{r.title}</b>
              <div className="muted small" style={{ marginTop: 4 }}>{gameById(r.gameId)?.name} · {r.detail}</div>
            </div>
            <span className={`badge ${r.cost ? 'b-warning' : 'b-muted'}`}>{r.cost ? `Tahmini ${money(r.cost)}` : 'Para harcamaz'}</span>
            <div className="actions">
              <button className="btn btn-green" onClick={() => decide(r.id, 'approved')}><Check size={14} /> Onayla</button>
              <button className="btn btn-red" onClick={() => decide(r.id, 'rejected')}><X size={14} /> Reddet</button>
            </div>
          </div>
        ))}
        {pending.length === 0 && <div className="empty">Bekleyen öneri yok.</div>}
        {decided.length > 0 && (
          <div className="mt">
            <div className="eyebrow" style={{ marginBottom: 8 }}>Karar verilenler</div>
            {decided.map((r) => (
              <div className="flex small" key={r.id} style={{ padding: '6px 0' }}>
                <span className={`badge ${r.status === 'approved' ? 'b-ok' : 'b-muted'}`}>{r.status === 'approved' ? 'Onaylandı' : 'Reddedildi'}</span>
                {r.title}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Reklam hesapları</div>
            <div className="card-sub">Sadece okuma izniyle bağlanır: panel kampanya açmaz, bütçe değiştirmez. Ne gerektiği için Ayarlar sayfasına bak.</div>
          </div>
        </div>
        <div className="grid g-4">
          {adAccounts.map((a) => {
            const on = connected[a.id] && !demo
            return (
              <div className="account" key={a.id}>
                <span className="icon-box sm" style={{ width: 38, height: 38, background: 'rgba(255,255,255,.05)', boxShadow: 'none', color: on ? 'var(--green)' : 'var(--muted)' }}>{on ? <Link2 size={16} /> : <Link2Off size={16} />}</span>
                <div style={{ minWidth: 0 }}>
                  <b>{a.name}</b>
                  <div className="muted small">{(!demo && connections.find((c) => c.source === a.id)?.message) || a.note}</div>
                </div>
                <span className={`badge ${on ? 'b-ok' : 'b-muted'}`} style={{ marginLeft: 'auto' }}>{on ? 'Bağlı' : 'Bağlı değil'}</span>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
