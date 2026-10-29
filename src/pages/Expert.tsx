import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Rocket, ShieldCheck, UploadCloud } from 'lucide-react'
import { useData, usePeople } from '../lib/data'
import { useStore } from '../lib/store'
import { supabase, isDemo } from '../lib/supabase'
import { useRows, useSetting } from '../lib/rows'
import { uploadFile, logActivity } from '../lib/files'
import { triggerWorkflow } from '../lib/trigger'
import { demoActions, demoBuilds } from '../data/demo'
import type { DataSafety, ExpertAction, StoreBuild } from '../lib/types'
import BuildCard from '../components/BuildCard'
import Select from '../components/Select'
import { GameChip, SampleBanner, Seg, Toggle } from '../components/ui'
import ReleasePage from './Release'
import AsoCoach from '../components/AsoCoach'

// Yayın Uzmanı: build'i bırak, uzman incelesin, raporlasın, dahili teste yüklesin; oyunculara açmak senin onayınla.
// Claude kullanmaz: kurallar + stüdyonun kendi modeli GitHub'da çalışır (scripts/expert.mjs).

type Tab = 'builds' | 'aso' | 'surum' | 'beyan'
const BEYAN: { key: keyof DataSafety; label: string; hint: string }[] = [
  { key: 'ads', label: 'Reklam gösteriyor', hint: 'AdMob, Unity Ads, AppLovin…' },
  { key: 'ad_id', label: 'Reklam kimliği (cihaz veya diğer kimlikler)', hint: 'Reklam ve analiz SDK\'ları toplar' },
  { key: 'device_id', label: 'Cihaz kimlikleri', hint: 'AdMob toplar' },
  { key: 'analytics', label: 'Uygulama etkinliği / analiz', hint: 'Firebase, GameAnalytics, Unity Analytics…' },
  { key: 'crash_logs', label: 'Kilitlenme günlükleri', hint: 'Crashlytics' },
  { key: 'location', label: 'Konum', hint: '' },
  { key: 'personal', label: 'Kişisel bilgiler (ad, e-posta…)', hint: '' },
]

export default function Expert() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'builds'
  const setTab = (t: Tab) => setParams(t === 'builds' ? {} : { tab: t })
  const { games } = useData()
  const { me } = usePeople()
  const { toast } = useStore()
  const builds = useRows<StoreBuild>('store_builds', demoBuilds, { order: 'created_at', ascending: false })
  const actions = useRows<ExpertAction>('expert_actions', demoActions, { order: 'created_at', ascending: false })
  const [safety, saveSafety] = useSetting<Record<string, DataSafety>>('data_safety', {})
  const android = games.filter((g) => g.platforms.includes('android'))
  const [picked, setGameId] = useState('')
  // Oyunlar sonradan yüklenir; seçim yapılmadıysa ilk Android oyunu kullan
  const gameId = picked || android[0]?.id || ''
  const [progress, setProgress] = useState<number | null>(null)
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const nameOf = (id: string | null) => games.find((g) => g.id === id)?.name ?? id ?? 'Oyun'

  async function upload(file: File) {
    const ext = file.name.toLowerCase().split('.').pop()
    if (!['aab', 'apk'].includes(ext ?? '')) return toast('Şimdilik Android build\'i (.aab ya da .apk) bırakabilirsin. iOS incelemesi sonraki aşamada.', 'warn')
    if (!gameId) return toast('Önce oyunu seç', 'warn')
    if (isDemo) return toast('Demo modda yüklenmez', 'info')
    try {
      setProgress(0)
      const stored = await uploadFile(file, setProgress)
      const { data: f, error: fe } = await supabase!.from('files').insert({ folder: 'Build', game_id: gameId, ...stored, uploaded_by: me.email } as never).select('id').single()
      if (fe) throw new Error(fe.message)
      await builds.insert({ game_id: gameId, platform: 'android', file_id: (f as { id: number }).id, file_name: file.name, status: 'uploaded', created_by: me.email })
      logActivity(me.email, `${nameOf(gameId)} için ${file.name} build'ini Yayın Uzmanı'na bıraktı`, '/yayin').catch(() => {})
      const err = await triggerWorkflow('expert.yml')
      toast(err ? 'Build yüklendi; uzman en geç 15 dakikada başlar.' : 'Build yüklendi, uzman inceliyor. Bitince telefonuna bildirim gelir.')
    } catch (e) {
      toast('Yüklenemedi: ' + (e as Error).message, 'warn')
    } finally {
      setProgress(null)
    }
  }

  async function approve(a: ExpertAction, fraction: number) {
    try {
      const halt = a.kind === 'halt'
      await actions.update(a.id, { status: 'approved', params: halt ? a.params : { userFraction: fraction }, approved_by: me.email, approved_at: new Date().toISOString() })
      triggerWorkflow('expert.yml')
      toast(halt ? 'Onaylandı: yayın durduruluyor' : `Onaylandı: oyuncuların %${Math.round(fraction * 100)}'una açılıyor`)
    } catch (e) {
      toast('Onaylanamadı: ' + (e as Error).message, 'warn')
    }
  }
  async function reject(a: ExpertAction) {
    await actions.update(a.id, { status: 'rejected', approved_by: me.email, approved_at: new Date().toISOString() }).catch(() => {})
    toast(a.kind === 'halt' ? 'Tamam, yayın devam ediyor' : 'Tamam, dahili testte kalıyor', 'info')
  }
  // Yayındaki sürüm için panelden verilen komut zaten onaydır
  async function rollout(b: StoreBuild, fraction: number | 'halt') {
    try {
      await actions.insert({
        build_id: b.id, kind: fraction === 'halt' ? 'halt' : 'increase_rollout', params: fraction === 'halt' ? {} : { userFraction: fraction },
        status: 'approved', approved_by: me.email, approved_at: new Date().toISOString(),
      })
      triggerWorkflow('expert.yml')
      toast(fraction === 'halt' ? 'Yayın durduruluyor' : fraction === 1 ? 'Herkese açılıyor' : `%${Math.round(fraction * 100)}'a çıkarılıyor`)
    } catch (e) {
      toast('Yapılamadı: ' + (e as Error).message, 'warn')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SampleBanner />
      <div className="page-head flex between wrap" style={{ gap: 14 }}>
        <div>
          <span className="eyebrow">Yayın Uzmanı</span>
          <h1>Build'i bırak, gerisini uzman yapsın</h1>
          <p>İnceler, sorunları "ne yapmalısın" diye söyler, dahili teste yükler. Oyunculara açmak senin onayınla. Claude kullanmaz; stüdyonun kendi modeli çalışır.</p>
        </div>
        <Seg value={tab} onChange={setTab} options={[{ value: 'builds', label: 'Build\'ler' }, { value: 'aso', label: 'Mağaza sayfası' }, { value: 'surum', label: 'Sürüm çıkar' }, { value: 'beyan', label: 'Veri güvenliği' }]} />
      </div>

      {tab === 'builds' && (
        <>
          <section
            className={`card dropzone${drag ? ' drag' : ''}`}
            onDragOver={(e) => (e.preventDefault(), setDrag(true))}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDrag(false)
              const f = e.dataTransfer.files[0]
              if (f) upload(f)
            }}
          >
            <UploadCloud size={30} className="dz-icon" />
            <div className="grow">
              <b>Android build'ini buraya bırak</b>
              <div className="muted small">.aab (önerilen) ya da .apk · 500 MB'a kadar · oyun başına son 2 build saklanır</div>
              {progress !== null && <div className="dz-bar"><div style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
            </div>
            <Select className="select" value={gameId} onChange={(e) => setGameId(e.target.value)} aria-label="Oyun">
              {android.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
            <button type="button" className="btn btn-primary" onClick={() => input.current?.click()} disabled={progress !== null}><Rocket size={14} /> Dosya seç</button>
            <input ref={input} type="file" accept=".aab,.apk" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </section>

          {builds.rows.length === 0 && <div className="card empty">Henüz build yok. Unity'den aldığın AAB'yi yukarı bırak; uzman birkaç dakikada raporlar.</div>}
          {builds.rows.map((b) => (
            <BuildCard key={b.id} b={b} gameName={nameOf(b.game_id)} actions={actions.rows} onApprove={approve} onReject={reject} onRollout={rollout} />
          ))}
        </>
      )}

      {tab === 'aso' && (
        <>
          <div className="flex" style={{ gap: 10 }}>
            <span className="small muted">Oyun</span>
            <Select className="select" style={{ width: 'auto' }} value={gameId} onChange={(e) => setGameId(e.target.value)} aria-label="Oyun">
              {android.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </div>
          {gameId && <AsoCoach key={gameId} gameId={gameId} gameName={nameOf(gameId)} />}
        </>
      )}

      {tab === 'surum' && <ReleasePage />}

      {tab === 'beyan' && (
        <section className="card">
          <div className="card-title flex" style={{ gap: 8 }}><ShieldCheck size={16} /> Play'e ne beyan ettin?</div>
          <div className="card-sub" style={{ marginBottom: 14 }}>Play Console › Uygulama içeriği › Veri güvenliği formunda işaretlediklerini burada da işaretle. Uzman her build'de, build'in içindekilerle karşılaştırır.</div>
          <div className="beyan-grid">
            {android.map((g) => (
              <div key={g.id} className="beyan-game">
                <GameChip id={g.id} />
                {BEYAN.map((k) => (
                  <div key={k.key} className="row" style={{ padding: '8px 0' }}>
                    <div className="grow"><div className="small">{k.label}</div>{k.hint && <div className="muted" style={{ fontSize: 10 }}>{k.hint}</div>}</div>
                    <Toggle
                      on={Boolean(safety[g.id]?.[k.key])}
                      onChange={(v) => saveSafety({ ...safety, [g.id]: { ...safety[g.id], [k.key]: v } }).catch((e) => toast('Kaydedilemedi: ' + e.message, 'warn'))}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
