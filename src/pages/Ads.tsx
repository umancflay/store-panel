import { useEffect, useState } from 'react'
import { Users, Globe2, Wallet, Clapperboard, Image, Target, Check, X, Link2Off, ShieldCheck, Sparkles, Video } from 'lucide-react'
import { adAccounts, gameById } from '../data/sample'
import { useData } from '../lib/data'
import Needs from '../components/Needs'
import { int, money, money2 } from '../lib/format'
import { supabase, isDemo } from '../lib/supabase'
import { useStore } from '../lib/store'
import { GameChip, GameLogo, SampleBanner } from '../components/ui'

const fitClass = { Yüksek: 'b-ok', Orta: 'b-warning', Düşük: 'b-muted' }

interface CampaignDay {
  platform: string
  external_id: string
  game_id: string | null
  name: string
  status: string | null
  date: string
  spend: number
  impressions: number
  clicks: number
  installs: number
}

const statusText: Record<string, [string, string]> = {
  ACTIVE: ['Yayında', 'b-ok'],
  PAUSED: ['Durduruldu', 'b-muted'],
  CAMPAIGN_PAUSED: ['Durduruldu', 'b-muted'],
  ADSET_PAUSED: ['Durduruldu', 'b-muted'],
  IN_PROCESS: ['İnceleniyor', 'b-warning'],
  WITH_ISSUES: ['Sorunlu', 'b-warning'],
  DISAPPROVED: ['Reddedildi', 'b-warning'],
  ARCHIVED: ['Arşivde', 'b-muted'],
  DELETED: ['Silindi', 'b-muted'],
}
const platformName: Record<string, string> = { meta: 'Meta', tiktok: 'TikTok', google_ads: 'Google Ads', apple_ads: 'Apple Ads' }

// Kampanyaların günlük satırları (USD saklanır; ekranda seçili para birimine her günün kuruyla çevrilir)
function useCampaigns(days: number) {
  const { fx, currency } = useData()
  const [rows, setRows] = useState<CampaignDay[]>([])
  useEffect(() => {
    if (isDemo) return
    const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10)
    supabase!.from('campaigns').select('*').gte('date', since).then(({ data }) => setRows((data as CampaignDay[]) ?? []))
  }, [days])
  const dates = Object.keys(fx).sort()
  const latest = dates.length ? fx[dates[dates.length - 1]] : 1
  const rate = (d: string) => (currency === 'TRY' ? fx[d] ?? latest : 1)
  // Kampanya başına topla
  const by = new Map<string, CampaignDay>()
  for (const r of rows) {
    const k = `${r.platform}:${r.external_id}`
    const a = by.get(k)
    const spend = Number(r.spend) * rate(r.date)
    if (!a) by.set(k, { ...r, spend, impressions: Number(r.impressions), clicks: Number(r.clicks) })
    else {
      a.spend += spend
      a.impressions += Number(r.impressions)
      a.clicks += Number(r.clicks)
      a.installs += r.installs
      if (r.date > a.date) Object.assign(a, { date: r.date, status: r.status, name: r.name })
    }
  }
  return [...by.values()].sort((a, b) => b.spend - a.spend)
}

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
  const [days, setDays] = useState(30)
  const campaigns = useCampaigns(days)
  const sum = campaigns.reduce((a, c) => ({ spend: a.spend + c.spend, impressions: a.impressions + c.impressions, clicks: a.clicks + c.clicks, installs: a.installs + c.installs }), { spend: 0, impressions: 0, clicks: 0, installs: 0 })
  const decided = recs.filter((r) => r.status !== 'pending')

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SampleBanner />
      <div className="page-head">
        <span className="eyebrow">Reklam</span>
        <h1>Kampanyalar ve planlar</h1>
        <p>Asistan reklam planı hazırlar. Para harcayan her adım senin “Onayla” demeni bekler.</p>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Reklam hesapları</div>
            <div className="card-sub">Sadece okuma izniyle bağlanır: panel kampanya açmaz, bütçe değiştirmez. Ne gerektiği için Ayarlar sayfasına bak.</div>
          </div>
        </div>
        <div className="grid g-4">
          {adAccounts.map((a) => (
            <div className="account" key={a.id}>
              <span className="icon-box sm" style={{ width: 38, height: 38, background: 'rgba(255,255,255,.05)', boxShadow: 'none', color: 'var(--muted)' }}><Link2Off size={16} /></span>
              <div style={{ minWidth: 0 }}>
                <b>{a.name}</b>
                <div className="muted small">{(!demo && connections.find((c) => c.source === a.id)?.message) || a.note}</div>
              </div>
              <span className={`badge ${connected[a.id] ? 'b-ok' : 'b-muted'}`} style={{ marginLeft: 'auto' }}>{connected[a.id] && !demo ? 'Bağlı' : 'Bağlı değil'}</span>
            </div>
          ))}
        </div>
      </section>

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

      {!plan && !demo && <Needs source="claude" title="Oyun başına reklam planları (kitle, ülke, bütçe, kreatif) Claude bağlanınca hazırlanacak" />}

      {plan && game && <>
      <div className="flex wrap">
        {planGames.map((g) => (
          <button key={g.id} className={`btn ${g.id === gameId ? 'btn-primary' : ''}`} onClick={() => setGameId(g.id)}>{g.name}</button>
        ))}
      </div>

      <div className="grid g-2 fade-in" key={gameId}>
        <section className="card span-2" style={{ overflow: 'hidden' }}>
          <div className="flex between wrap">
            <div className="flex">
              <GameChip id={gameId} />
              <span className="muted small">{game.genre}</span>
            </div>
            <span className="ai-tag"><Sparkles size={12} /> Claude'un reklam planı · haftalık güncellenir</span>
          </div>
        </section>

        <section className="card plan-section">
          <h4><Users size={15} /> Kime</h4>
          <div className="inner" style={{ marginBottom: 12 }}>
            <div className="muted small">Yaş aralığı</div>
            <div style={{ fontSize: 26, fontWeight: 300 }}>{plan.audience.age}</div>
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
          <div className="muted small mt">Toplam test maliyeti: <b style={{ color: '#fff' }}>{money(plan.budget.daily * plan.budget.days)}</b></div>
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

      </>}

      <section className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Kampanyalar</div>
            <div className="card-sub">Harcama, gösterim, tıklama ve kurulum. Her gün 08:00 ve 18:00'de, 6 saatte bir de son 3 gün güncellenir.</div>
          </div>
          <div className="seg">
            {[7, 30].map((d) => <button key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>Son {d} gün</button>)}
          </div>
        </div>
        {campaigns.length > 0 && (
          <div className="grid g-4" style={{ margin: '6px 0 14px' }}>
            <div className="inner"><div className="muted small">Harcama</div><div style={{ fontSize: 24, fontWeight: 300 }}>{money2(sum.spend)}</div></div>
            <div className="inner"><div className="muted small">Gösterim</div><div style={{ fontSize: 24, fontWeight: 300 }}>{int(sum.impressions)}</div></div>
            <div className="inner"><div className="muted small">Tıklama · TO</div><div style={{ fontSize: 24, fontWeight: 300 }}>{int(sum.clicks)} <span className="muted small">%{(sum.impressions ? (sum.clicks / sum.impressions) * 100 : 0).toFixed(2).replace('.', ',')}</span></div></div>
            <div className="inner"><div className="muted small">Kurulum · CPI</div><div style={{ fontSize: 24, fontWeight: 300 }}>{int(sum.installs)} <span className="muted small">{sum.installs ? money2(sum.spend / sum.installs) : '—'}</span></div></div>
          </div>
        )}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Kampanya</th><th>Platform</th><th className="num">Harcama</th><th className="num">Gösterim</th><th className="num">Tıklama</th><th className="num">Tıklama başı</th><th className="num">Kurulum</th><th className="num">Kurulum başı</th><th>Durum</th></tr></thead>
            <tbody>
              {campaigns.length === 0 && (
                <tr><td colSpan={9} className="empty" style={{ whiteSpace: 'normal' }}>
                  {connected.meta && !demo ? `Son ${days} günde harcama yapan kampanya yok.` : 'Henüz bağlı reklam hesabı yok. Ayarlar › Meta adımlarını izle.'}
                </td></tr>
              )}
              {campaigns.map((c) => {
                const [st, cls] = statusText[c.status ?? ''] ?? [c.status ?? '—', 'b-muted']
                return (
                  <tr key={c.platform + c.external_id}>
                    <td>{c.game_id ? <span className="game-chip"><GameLogo id={c.game_id} size={26} /> {c.name}</span> : c.name}</td>
                    <td>{platformName[c.platform] ?? c.platform}</td>
                    <td className="num">{money2(c.spend)}</td>
                    <td className="num">{int(c.impressions)}</td>
                    <td className="num">{int(c.clicks)}</td>
                    <td className="num">{c.clicks ? money2(c.spend / c.clicks) : '—'}</td>
                    <td className="num">{c.installs ? int(c.installs) : '—'}</td>
                    <td className="num">{c.installs ? money2(c.spend / c.installs) : '—'}</td>
                    <td><span className={`badge ${cls}`}>{st}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {campaigns.length > 0 && sum.installs === 0 && (
          <p className="muted small" style={{ marginTop: 10, lineHeight: 1.6 }}>
            Kurulum sütunu boşsa: Meta kurulumu ancak oyunda Meta SDK'sı (ya da AppsFlyer/Adjust gibi bir MMP) varsa sayabilir. O zamana kadar tıklama ve tıklama başı maliyete bak; gerçek kurulumu Play Console ve App Store'daki "kaynak" raporlarından görebilirsin.
          </p>
        )}
      </section>
    </div>
  )
}
