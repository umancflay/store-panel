import { useState } from 'react'
import { AlertOctagon, AlertTriangle, Check, ChevronDown, ExternalLink, HeartPulse, Info, Pause, Rocket, X } from 'lucide-react'
import { trDateTime } from '../lib/rows'
import type { BuildStatus, ExpertAction, Finding, StoreBuild } from '../lib/types'
import { GameLogo, Seg } from './ui'

// Tek bir build: ilerleme çizgisi, uzmanın özeti, bulgular ("ne yapmalısın" adımlarıyla) ve onay kartı.

const STEPS: { key: string; label: string; of: BuildStatus[] }[] = [
  { key: 'up', label: 'Yüklendi', of: ['uploaded'] },
  { key: 'insp', label: 'İnceleniyor', of: ['inspecting'] },
  { key: 'rep', label: 'Rapor', of: ['blocked', 'ready', 'failed'] },
  { key: 'int', label: 'Dahili test', of: ['internal'] },
  { key: 'ok', label: 'Onay', of: ['awaiting_approval', 'publishing'] },
  { key: 'live', label: 'Yayında', of: ['live'] },
]
const statusText: Record<BuildStatus, [string, string]> = {
  uploaded: ['Sırada', 'b-muted'],
  inspecting: ['İnceleniyor', 'b-warning'],
  blocked: ['Düzeltme gerekli', 'b-critical'],
  ready: ['Hazır', 'b-ok'],
  internal: ['Dahili testte', 'b-ok'],
  awaiting_approval: ['Onay bekliyor', 'b-warning'],
  publishing: ['Yayınlanıyor', 'b-warning'],
  live: ['Yayında', 'b-ok'],
  failed: ['Hata', 'b-critical'],
}
const sevIcon = { block: <AlertOctagon size={15} />, warn: <AlertTriangle size={15} />, info: <Info size={15} /> }
const sevLabel = { block: 'Engelleyici', warn: 'Uyarı', info: 'Bilgi' }

export function FindingRow({ f }: { f: Finding }) {
  const [open, setOpen] = useState(f.severity === 'block')
  return (
    <div className={`finding ${f.severity}`}>
      <button type="button" className="finding-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="finding-icon">{sevIcon[f.severity]}</span>
        <span className="grow" style={{ textAlign: 'left' }}><b>{f.title}</b> <span className="muted small">· {sevLabel[f.severity]}</span></span>
        <ChevronDown size={14} className="finding-chev" />
      </button>
      {open && (
        <div className="finding-body">
          <p>{f.detail}</p>
          <ol>{f.fix.map((s, i) => <li key={i}>{s}</li>)}</ol>
          {f.policy && <a href={f.policy} target="_blank" rel="noreferrer" className="linkish">Politika <ExternalLink size={10} /></a>}
        </div>
      )}
    </div>
  )
}

export default function BuildCard({
  b, gameName, actions, onApprove, onReject, onRollout,
}: {
  b: StoreBuild
  gameName: string
  actions: ExpertAction[]
  onApprove: (a: ExpertAction, fraction: number) => void
  onReject: (a: ExpertAction) => void
  onRollout: (b: StoreBuild, fraction: number | 'halt') => void
}) {
  const [fraction, setFraction] = useState('0.1')
  const step = STEPS.findIndex((s) => s.of.includes(b.status))
  const pending = actions.find((a) => a.build_id === b.id && a.status === 'pending')
  const last = actions.filter((a) => a.build_id === b.id && a.status !== 'pending').sort((x, y) => y.created_at.localeCompare(x.created_at))[0]
  const r = b.report
  const [label, cls] = statusText[b.status]

  return (
    <section className="card build-card">
      <div className="card-head wrap">
        <div className="flex" style={{ gap: 12, minWidth: 0 }}>
          {b.game_id && <GameLogo id={b.game_id} size={40} />}
          <div style={{ minWidth: 0 }}>
            <div className="card-title">{gameName} <span className="muted">{b.version_name ? `v${b.version_name} (${b.version_code})` : b.file_name}</span></div>
            <div className="card-sub">{b.platform === 'ios' ? 'iOS' : 'Android'} · {trDateTime(b.created_at)}{r?.build ? ` · ${r.build.sizeMb} MB · hedef API ${r.build.targetSdk}` : ''}</div>
          </div>
        </div>
        <span className={`badge ${cls}`}>{label}</span>
      </div>

      <div className="stepper" aria-label="İlerleme">
        {STEPS.map((s, i) => (
          <div key={s.key} className={`step${i < step ? ' done' : i === step ? ' now' : ''}${i === step && (b.status === 'blocked' || b.status === 'failed') ? ' bad' : ''}`}>
            <span className="step-dot">{i < step ? <Check size={10} /> : null}</span>
            <span className="step-label">{s.label}</span>
          </div>
        ))}
      </div>

      {b.status === 'inspecting' && <div className="muted small">Uzman build'i inceliyor; birkaç dakika sürer, bitince telefonuna bildirim gelir.</div>}
      {b.status === 'uploaded' && <div className="muted small">Sırada. Uzman birazdan başlayacak.</div>}
      {b.error && <div className="expert-error">{b.error}</div>}

      {(b.summary || r?.text) && (
        <div className="expert-summary">
          <div className="flex" style={{ gap: 8, marginBottom: 6 }}><span className="avatar ai sm">AI</span><b className="small">Uzmanın özeti</b>{r?.aiSummary && <span className="muted" style={{ fontSize: 10 }}>· kendi modelin yazdı</span>}</div>
          <p>{b.summary ?? r?.text.split('\n')[0]}</p>
        </div>
      )}

      {r && r.findings.length > 0 && (
        <div className="findings">
          {r.findings.map((f) => <FindingRow key={f.id} f={f} />)}
        </div>
      )}
      {r && r.findings.length === 0 && <div className="up small">✓ Kontrollerin hepsi geçti.</div>}

      {pending && pending.kind === 'publish_production' && (
        <div className="approve">
          <div className="grow">
            <b>Oyunculara açılsın mı?</b>
            <div className="muted small">Dahili testte. Onaylarsan önce seçtiğin oranda oyuncuya açılır; uzman 48 saat çökmeleri izler.</div>
          </div>
          <Seg value={fraction} onChange={setFraction} options={[{ value: '0.1', label: '%10' }, { value: '0.2', label: '%20' }, { value: '0.5', label: '%50' }]} />
          <button type="button" className="btn btn-ghost" onClick={() => onReject(pending)}><X size={13} /> Şimdi değil</button>
          <button type="button" className="btn btn-green" onClick={() => onApprove(pending, Number(fraction))}><Rocket size={13} /> Onayla</button>
        </div>
      )}

      {pending && pending.kind === 'halt' && (
        <div className="approve danger">
          <div className="grow">
            <b>Yayın durdurulsun mu?</b>
            <div className="muted small">{pending.params.reason ?? 'Çökmeler arttı.'} Durdurursan yeni oyunculara gitmez; mevcut oyuncular etkilenmez.</div>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => onReject(pending)}><X size={13} /> Devam etsin</button>
          <button type="button" className="btn btn-red" onClick={() => onApprove(pending, 0)}><Pause size={13} /> Durdur</button>
        </div>
      )}

      {b.status === 'live' && r?.watch && (
        <div className={`watch ${r.watch.verdict}`}>
          <HeartPulse size={14} />
          <span className="grow">{r.watch.done ? '48 saatlik nöbet bitti. ' : 'İlk 48 saat nöbette. '}{r.watch.text}</span>
          <span className="muted" style={{ fontSize: 10 }}>{trDateTime(r.watch.at)}</span>
        </div>
      )}

      {b.status === 'live' && (
        <div className="approve">
          <div className="grow"><b>Yayında</b><div className="muted small">{last?.result ?? 'Kademeli yayın sürüyor.'}</div></div>
          <button type="button" className="btn sm" onClick={() => onRollout(b, 0.5)}>%50'ye çıkar</button>
          <button type="button" className="btn sm btn-green" onClick={() => onRollout(b, 1)}>Herkese aç</button>
          <button type="button" className="btn sm btn-red" onClick={() => onRollout(b, 'halt')}><Pause size={12} /> Durdur</button>
        </div>
      )}
      {last?.status === 'failed' && <div className="expert-error">Son işlem yapılamadı: {last.result}</div>}
    </section>
  )
}
