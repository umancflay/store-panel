import { useState } from 'react'
import { ChevronDown, ExternalLink, CheckCircle2, RotateCcw, Sparkles, Box, CalendarClock } from 'lucide-react'
import { gameById, type Alert } from '../data/sample'
import { useStore } from '../lib/store'
import { dateLong, daysUntil } from '../lib/format'
import { GameLogo, SampleBanner, Seg, levelLabel, sourceLabel } from '../components/ui'
import { useData } from '../lib/data'
import Needs from '../components/Needs'
import Select from '../components/Select'

type Filter = 'open' | 'critical' | 'resolved' | 'all'

export default function Alerts() {
  const { alerts } = useStore()
  const { demo, connected } = useData()
  const [filter, setFilter] = useState<Filter>('open')
  const [source, setSource] = useState<'all' | Alert['source']>('all')

  const order = { critical: 0, warning: 1, info: 2 }
  const list = alerts
    .filter((a) =>
      filter === 'all' ? true : filter === 'resolved' ? a.status === 'resolved' : filter === 'critical' ? a.level === 'critical' && a.status === 'open' : a.status === 'open',
    )
    .filter((a) => source === 'all' || a.source === source)
    .sort((a, b) => order[a.level] - order[b.level])

  const count = (f: Filter) =>
    alerts.filter((a) => (f === 'all' ? true : f === 'resolved' ? a.status === 'resolved' : f === 'critical' ? a.level === 'critical' && a.status === 'open' : a.status === 'open')).length

  return (
    <>
      <SampleBanner />

      <div className="flex between wrap">
        <Seg<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'open', label: `Açık (${count('open')})` },
            { value: 'critical', label: `Kritik (${count('critical')})` },
            { value: 'resolved', label: `Çözüldü (${count('resolved')})` },
            { value: 'all', label: 'Tümü' },
          ]}
        />
        <Select className="select" value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
          <option value="all">Tüm kaynaklar</option>
          <option value="play">Google Play</option>
          <option value="app_store">App Store</option>
          <option value="admob">AdMob</option>
        </Select>
      </div>

      <div className="grid">
        {list.map((a) => <AlertCard key={a.id} alert={a} />)}
        {list.length === 0 && (
          <div className="card empty">
            <CheckCircle2 size={36} color="var(--green)" />
            <p style={{ marginTop: 10 }}>Bu filtrede uyarı yok. Her şey yolunda görünüyor.</p>
            {!demo && <p className="small" style={{ marginTop: 6 }}>Uyarılar çökme/ANR eşiği aşılınca ve App Store bir sürümü reddedince otomatik oluşur.</p>}
          </div>
        )}
      </div>

      {!demo && (
        <section className="grid g-2">
          {!connected.google_play && <Needs source="google_play" title="Çökme/ANR uyarıları için Google Play bağlantısı gerekiyor" />}
          {!connected.app_store && <Needs source="app_store" title="Reddedilen sürüm uyarıları için App Store bağlantısı gerekiyor" />}
          {!connected.gmail && <Needs source="gmail" title="Politika ihlali uyarıları için Gmail bağlantısı gerekiyor" />}
          {!connected.claude && <Needs source="claude" title="Uyarılara özel 'nasıl düzeltilir' açıklamaları Claude bağlanınca gelecek" />}
        </section>
      )}
    </>
  )
}

function AlertCard({ alert: a }: { alert: Alert }) {
  const { resolveAlert, reopenAlert } = useStore()
  const [open, setOpen] = useState(a.level === 'critical' && a.status === 'open')
  const game = a.gameId ? gameById(a.gameId) : null
  const left = a.deadline ? daysUntil(a.deadline) : null

  return (
    <div className={`card alert-card ${a.level} ${a.status}`}>
      <div className="alert-top" onClick={() => setOpen(!open)}>
        {game ? <GameLogo id={game.id} size={40} /> : <span className="game-logo" style={{ width: 40, height: 40, background: 'rgba(255,255,255,.05)' }}>⚙</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="alert-meta">
            <span className={`badge b-${a.level}`}>{levelLabel[a.level]}</span>
            <span className="badge b-muted">{sourceLabel[a.source]}</span>
            {game && <span className="badge b-muted">{game.name}</span>}
            {a.status === 'resolved' && <span className="badge b-ok">Çözüldü</span>}
            {left !== null && a.status === 'open' && (
              <span className={`deadline ${left <= 7 ? 'bad' : ''}`}>
                <CalendarClock size={13} /> Son tarih: {dateLong(a.deadline!)} ({left} gün)
              </span>
            )}
          </div>
          <div className="alert-title">{a.title}</div>
          <div className="alert-body">{a.body}</div>
        </div>
        <ChevronDown className={`chev ${open ? 'open' : ''}`} />
      </div>

      {open && (
        <div className="fix">
          <div className="inner">
            <h4><Sparkles size={15} color="var(--green)" /> Nasıl düzeltilir <span className="ai-tag">Claude</span></h4>
            <ol className="steps">{a.howToFix.map((s) => <li key={s}>{s}</li>)}</ol>
          </div>
          {a.unity && a.unity.length > 0 && (
            <div className="inner">
              <h4><Box size={15} color="var(--silver)" /> Unity tarafında</h4>
              <ol className="steps unity">{a.unity.map((s) => <li key={s}>{s}</li>)}</ol>
            </div>
          )}
          <div className="actions">
            {a.consoleUrl && (
              <a className="btn" href={a.consoleUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={14} /> {sourceLabel[a.source]} konsolunu aç
              </a>
            )}
            {a.status === 'open' ? (
              <button className="btn btn-green" onClick={() => resolveAlert(a.id)}><CheckCircle2 size={14} /> Çözüldü işaretle</button>
            ) : (
              <button className="btn" onClick={() => reopenAlert(a.id)}><RotateCcw size={14} /> Yeniden aç</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
