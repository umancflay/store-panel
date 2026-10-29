import { useEffect, useState } from 'react'
import { AlertOctagon, AlertTriangle, Apple, Check, CheckCircle2, ChevronDown, ExternalLink, HeartPulse, Info, Loader2, MinusCircle, Pause, Play, Rocket, Smartphone, X, XCircle } from 'lucide-react'
import { isDemo } from '../lib/supabase'
import { fileUrls } from '../lib/files'
import { trDateTime } from '../lib/rows'
import type { BuildStatus, ExpertAction, Finding, StoreBuild } from '../lib/types'
import { GameLogo, Seg } from './ui'

// Tek bir build: ilerleme çizgisi, uzmanın özeti, bulgular ("ne yapmalısın" adımlarıyla), cihaz testi ve onay kartı.

const STEPS: { key: string; label: string; of: BuildStatus[] }[] = [
  { key: 'up', label: 'Yüklendi', of: ['uploaded'] },
  { key: 'insp', label: 'İnceleniyor', of: ['inspecting'] },
  { key: 'rep', label: 'Rapor', of: ['blocked', 'ready', 'failed'] },
  { key: 'int', label: 'Dahili test', of: ['internal'] },
  { key: 'ok', label: 'Onay', of: ['awaiting_approval', 'publishing'] },
  { key: 'live', label: 'Yayında', of: ['live'] },
]
// iOS: uzman inceler; yükleme Mac'te yapılır, inceleme App Store sekmesinden izlenir
const IOS_STEPS: typeof STEPS = [
  ...STEPS.slice(0, 3),
  { key: 'mac', label: "Mac'ten yükle", of: [] },
  { key: 'review', label: 'Apple incelemesi', of: [] },
  { key: 'live', label: 'Yayında', of: [] },
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
const tone = (s: BuildStatus) => (s === 'blocked' || s === 'failed' ? 'bad' : s === 'live' || s === 'ready' || s === 'internal' ? 'ok' : s === 'awaiting_approval' ? 'wait' : 'run')

export function FindingRow({ f }: { f: Finding }) {
  const [open, setOpen] = useState(f.severity === 'block')
  return (
    <div className={`finding ${f.severity}`}>
      <button type="button" className="finding-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="finding-icon">{sevIcon[f.severity]}</span>
        <span className="grow" style={{ textAlign: 'left' }}><b>{f.title}</b> <span className="muted small">· {sevLabel[f.severity]}</span></span>
        <ChevronDown size={14} className={`finding-chev${open ? ' open' : ''}`} />
      </button>
      {open && (
        <div className="finding-body">
          <p>{f.detail}</p>
          {f.fix.length > 0 && <ol>{f.fix.map((s, i) => <li key={i}>{s}</li>)}</ol>}
          {f.policy && <a href={f.policy} target="_blank" rel="noreferrer" className="linkish">Politika <ExternalLink size={10} /></a>}
        </div>
      )}
    </div>
  )
}

// Sanal telefonda deneme sonucu: net cevap (açıldı mı, çöktü mü), cihaz, süre ve Robo'nun gezdiği ekranlar
function DeviceTest({ b, onTest }: { b: StoreBuild; onTest?: (b: StoreBuild) => void }) {
  const d = b.report?.device
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [big, setBig] = useState<string | null>(null)
  useEffect(() => {
    if (d?.shots?.length && !isDemo) fileUrls(d.shots).then(setUrls).catch(() => {})
  }, [d?.shots?.join()]) // eslint-disable-line react-hooks/exhaustive-deps
  const running = d?.outcome === 'RUNNING'
  const view = !d ? null
    : running ? { icon: <Loader2 size={22} className="spin" />, tone: 'run', title: 'Telefonda deneniyor…', text: 'Sanal telefonda açılıp 3 dakika oynatılıyor; birkaç dakikada sonuç gelir.' }
    : d.outcome === 'SUCCESS' ? { icon: <CheckCircle2 size={22} />, tone: 'ok', title: 'Sorunsuz açıldı ve oynandı', text: 'Çökme ya da donma yok.' }
    : d.outcome === 'FAILURE' ? { icon: <XCircle size={22} />, tone: 'bad', title: 'Çöktü ya da dondu', text: 'Bu haliyle oyunculara gitmemeli; kayıtlara bak.' }
    : d.outcome === 'SKIPPED' || d.outcome === 'ERROR' ? { icon: <MinusCircle size={22} />, tone: 'muted', title: 'Test yapılamadı', text: d.reason ?? '' }
    : { icon: <MinusCircle size={22} />, tone: 'muted', title: 'Sonuçsuz', text: 'Test Lab bir sonuca varamadı.' }
  return (
    <div className={`devtest ${view?.tone ?? 'empty'}`}>
      <div className="devtest-head">
        <Smartphone size={14} /> <b>Cihaz testi</b>
        {d && !running && <span className="muted" style={{ fontSize: 10 }}>· {trDateTime(d.at)}</span>}
        <span className="grow" />
        {onTest && b.file_id != null && !running && (
          <button type="button" className="btn sm" onClick={() => onTest(b)}><Play size={11} /> {d ? 'Yeniden dene' : 'Cihazda dene'}</button>
        )}
      </div>
      {view ? (
        <div className="devtest-result">
          <span className="devtest-icon">{view.icon}</span>
          <div>
            <b>{view.title}</b>
            <div className="muted small">{view.text}{d?.name ? ` · ${d.name}` : ''}{d?.minutes ? ` · ${d.minutes} dk sürdü` : ''}</div>
          </div>
        </div>
      ) : (
        <div className="muted small">{b.file_id == null
          ? 'Bu build\'in dosyası artık yok (Dosyalar\'dan silinmiş ya da eski build temizlenmiş). Telefonda denemek için build\'i yeniden bırak.'
          : 'Build\'i sanal bir telefonda açıp 3 dakika kendi kendine oynatır; çöküyor mu net söyler.'}</div>
      )}
      {d?.shots && d.shots.length > 0 && (
        <div className="devtest-shots">
          {d.shots.map((p) => (urls[p]
            ? <button type="button" key={p} onClick={() => setBig(urls[p])} aria-label="Büyüt"><img src={urls[p]} alt="Test ekran görüntüsü" loading="lazy" /></button>
            : <span key={p} className="shot-ph" />))}
        </div>
      )}
      {d?.url && <a className="linkish small" href={d.url} target="_blank" rel="noreferrer">Videoyu ve kayıtları aç <ExternalLink size={10} /></a>}
      {big && <div className="shot-big" onClick={() => setBig(null)} role="presentation"><img src={big} alt="Test ekran görüntüsü" /></div>}
    </div>
  )
}

export default function BuildCard({
  b, gameName, actions, onApprove, onReject, onRollout, onDeviceTest,
}: {
  b: StoreBuild
  gameName: string
  actions: ExpertAction[]
  onApprove: (a: ExpertAction, fraction: number) => void
  onReject: (a: ExpertAction) => void
  onRollout: (b: StoreBuild, fraction: number | 'halt') => void
  onDeviceTest?: (b: StoreBuild) => void
}) {
  const [fraction, setFraction] = useState('0.1')
  const ios = b.platform === 'ios'
  const steps = ios ? IOS_STEPS : STEPS
  const step = steps.findIndex((s) => s.of.includes(b.status))
  const pending = actions.find((a) => a.build_id === b.id && a.status === 'pending')
  const last = actions.filter((a) => a.build_id === b.id && a.status !== 'pending').sort((x, y) => y.created_at.localeCompare(x.created_at))[0]
  const r = b.report
  const [label, cls] = statusText[b.status]

  return (
    <section className={`card build-card tone-${tone(b.status)}`}>
      <div className="card-head wrap">
        <div className="flex" style={{ gap: 14, minWidth: 0 }}>
          {b.game_id && <GameLogo id={b.game_id} size={46} />}
          <div style={{ minWidth: 0 }}>
            <div className="build-title">
              <span>{gameName}</span>
              {b.version_name && <span className="ver-pill">v{b.version_name} · {r?.build?.buildNumber ?? b.version_code}</span>}
            </div>
            <div className="build-meta">
              <span className={`plat ${ios ? 'ios' : 'android'}`}>{ios ? <Apple size={11} /> : <Smartphone size={11} />} {ios ? 'iOS' : 'Android'}</span>
              <span>{trDateTime(b.created_at)}</span>
              {r?.build && <span>{r.build.sizeMb} MB</span>}
              {r?.build && <span>{r.build.kind === 'ipa' ? `iOS SDK ${r.build.iosSdk ?? '?'}` : `API ${r.build.targetSdk}`}</span>}
              {!b.version_name && b.file_name && <span>{b.file_name}</span>}
            </div>
          </div>
        </div>
        <span className={`badge ${cls}`}>{label}</span>
      </div>

      <div className="stepper" aria-label="İlerleme">
        {steps.map((s, i) => (
          <div key={s.key} className={`step${i < step ? ' done' : i === step ? ' now' : ''}${i === step && (b.status === 'blocked' || b.status === 'failed') ? ' bad' : ''}`}>
            <span className="step-dot">{i < step ? <Check size={10} /> : null}</span>
            <span className="step-label">{s.label}</span>
          </div>
        ))}
      </div>

      {b.status === 'inspecting' && <div className="muted small flex" style={{ gap: 6 }}><Loader2 size={12} className="spin" /> {b.summary ?? 'Uzman build\'i inceliyor; birkaç dakika sürer.'}</div>}
      {b.status === 'uploaded' && <div className="muted small">Sırada. Uzman birazdan başlayacak.</div>}
      {b.error && <div className="expert-error">{b.error}</div>}
      {ios && b.status === 'ready' && (
        <div className="hint-box"><Apple size={14} /> Hazır. Xcode Organizer ya da Transporter ile App Store Connect'e yükleyip incelemeye gönder; inceleme durumunu App Store sekmesinden izlerim, değişince telefonuna haber veririm.</div>
      )}

      {b.status !== 'inspecting' && (b.summary || r?.text) && (
        <div className="expert-summary">
          <div className="flex" style={{ gap: 8, marginBottom: 6 }}><span className="avatar ai sm">AI</span><b className="small">Uzmanın özeti</b>{r?.aiSummary && <span className="muted" style={{ fontSize: 10 }}>· kendi modelin yazdı</span>}</div>
          <p>{b.summary ?? r?.text.split('\n')[0]}</p>
        </div>
      )}

      {r && (
        <div className={`build-body${ios ? ' one' : ''}`}>
          <div className="build-findings">
            <div className="count-chips">
              {r.counts.block > 0 && <span className="cchip block"><AlertOctagon size={11} /> {r.counts.block} engelleyici</span>}
              {r.counts.warn > 0 && <span className="cchip warn"><AlertTriangle size={11} /> {r.counts.warn} uyarı</span>}
              {r.counts.block === 0 && r.counts.warn === 0 && <span className="cchip ok"><Check size={11} /> Kontrollerin hepsi geçti</span>}
              {r.counts.info > 0 && <span className="cchip"><Info size={11} /> {r.counts.info} bilgi</span>}
            </div>
            {r.findings.length > 0 && <div className="findings">{r.findings.map((f) => <FindingRow key={f.id} f={f} />)}</div>}
          </div>
          {!ios && <DeviceTest b={b} onTest={onDeviceTest} />}
        </div>
      )}

      {pending && pending.kind === 'publish_production' && (
        <div className="approve">
          <div className="grow">
            <b>Oyunculara açılsın mı?</b>
            <div className="muted small">Dahili testte. Onaylarsan seçtiğin oranda oyuncuya açılır; sorun çıkarsa hemen haber veririm.</div>
          </div>
          <Seg value={fraction} onChange={setFraction} options={[{ value: '0.1', label: '%10' }, { value: '0.2', label: '%20' }, { value: '0.5', label: '%50' }, { value: '1', label: 'Herkes' }]} />
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

      {b.status === 'live' && (
        <div className="approve">
          <div className="grow">
            <b>Yayında</b>
            <div className="muted small">{last?.result ?? 'Kademeli yayın sürüyor.'}</div>
            {r?.watch && r.watch.verdict !== 'wait' && <div className={`watch-line ${r.watch.verdict}`}><HeartPulse size={12} /> {r.watch.text}</div>}
          </div>
          <button type="button" className="btn sm" onClick={() => onRollout(b, 0.5)}>%50'ye çıkar</button>
          <button type="button" className="btn sm btn-green" onClick={() => onRollout(b, 1)}>Herkese aç</button>
          <button type="button" className="btn sm btn-red" onClick={() => onRollout(b, 'halt')}><Pause size={12} /> Durdur</button>
        </div>
      )}
      {last?.status === 'failed' && <div className="expert-error">Son işlem yapılamadı: {last.result}</div>}
    </section>
  )
}
