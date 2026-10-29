import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Apple, Bot, ListChecks, Package, Rocket, ShieldCheck, Smartphone, Store, UploadCloud } from 'lucide-react'
import { useData, usePeople } from '../lib/data'
import { useStore } from '../lib/store'
import { supabase, isDemo } from '../lib/supabase'
import { useRows, useSetting } from '../lib/rows'
import { deleteStored, uploadFile, logActivity } from '../lib/files'
import { triggerWorkflow } from '../lib/trigger'
import { demoActions, demoBuilds } from '../data/demo'
import type { DataSafety, ExpertAction, StoreBuild } from '../lib/types'
import BuildCard from '../components/BuildCard'
import Select from '../components/Select'
import { GameChip, SampleBanner, Toggle } from '../components/ui'
import ReleasePage from './Release'
import AsoCoach from '../components/AsoCoach'
import AppStoreReview from '../components/AppStoreReview'
import { enqueue } from '../lib/expertQueue'

// Yayın Uzmanı: build'i bırak, uzman incelesin, raporlasın, dahili teste yüklesin; oyunculara açmak senin onayınla.
// Claude kullanmaz: kurallar + stüdyonun kendi modeli GitHub'da çalışır (scripts/expert.mjs).

type Tab = 'builds' | 'aso' | 'appstore' | 'surum' | 'beyan'
const TABS: { value: Tab; label: string; icon: typeof Rocket }[] = [
  { value: 'builds', label: 'Build\'ler', icon: Package },
  { value: 'aso', label: 'Mağaza sayfası', icon: Store },
  { value: 'appstore', label: 'App Store', icon: Apple },
  { value: 'surum', label: 'Sürüm çıkar', icon: ListChecks },
  { value: 'beyan', label: 'Veri güvenliği', icon: ShieldCheck },
]
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
  const ios = games.filter((g) => g.platforms.includes('ios'))
  const storeGames = games.filter((g) => g.platforms.includes('android') || g.platforms.includes('ios'))
  const [picked, setGameId] = useState('')
  // Oyunlar sonradan yüklenir; seçim yapılmadıysa ilk mağaza oyununu kullan
  const gameId = picked || storeGames[0]?.id || ''
  const asoGame = android.some((g) => g.id === gameId) ? gameId : android[0]?.id ?? ''
  const iosGame = ios.some((g) => g.id === gameId) ? gameId : ios[0]?.id ?? ''
  const [progress, setProgress] = useState<number | null>(null)
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const nameOf = (id: string | null) => games.find((g) => g.id === id)?.name ?? id ?? 'Oyun'
  const count = (...s: StoreBuild['status'][]) => builds.rows.filter((b) => s.includes(b.status)).length
  const stats = { running: count('uploaded', 'inspecting', 'publishing'), waiting: count('awaiting_approval'), blocked: count('blocked', 'failed'), live: count('live') }

  async function upload(file: File) {
    const ext = file.name.toLowerCase().split('.').pop()
    if (!['aab', 'apk', 'ipa'].includes(ext ?? '')) return toast('Android için .aab ya da .apk, iOS için .ipa bırakabilirsin.', 'warn')
    if (!gameId) return toast('Önce oyunu seç', 'warn')
    const platform = ext === 'ipa' ? 'ios' : 'android'
    if (isDemo) return toast('Demo modda yüklenmez', 'info')
    try {
      setProgress(0)
      const stored = await uploadFile(file, setProgress)
      const { data: f, error: fe } = await supabase!.from('files').insert({ folder: 'Build', game_id: gameId, ...stored, uploaded_by: me.email } as never).select('id').single()
      if (fe) throw new Error(fe.message)
      await builds.insert({ game_id: gameId, platform, file_id: (f as { id: number }).id, file_name: file.name, status: 'uploaded', created_by: me.email })
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
  // Build'i tamamen sil: dosyası, test ekran görüntüleri ve kaydı (eylemleri de birlikte silinir)
  async function removeBuild(b: StoreBuild) {
    if (isDemo) return builds.setRows((r) => r.filter((x) => x.id !== b.id))
    try {
      if (b.file_id != null) {
        const { data: f } = await supabase!.from('files').select('id,path,parts').eq('id', b.file_id).maybeSingle()
        if (f) {
          await deleteStored(f as { path: string; parts: number }).catch(() => {})
          await supabase!.from('files').delete().eq('id', (f as { id: number }).id)
        }
      }
      const shots = b.report?.device?.shots ?? []
      if (shots.length) await supabase!.storage.from('files').remove(shots).catch(() => {})
      await builds.remove(b.id)
      toast(`${nameOf(b.game_id)} ${b.version_name ?? ''} silindi`.replace(/\s+silindi/, ' silindi'))
    } catch (e) {
      toast('Silinemedi: ' + (e as Error).message, 'warn')
    }
  }

  // Hızlı cihaz testi: build'in dosyası sanal telefonda açılır, sonuç kartta görünür
  async function deviceTest(b: StoreBuild) {
    if (isDemo) return toast('Demo modda çalışmaz', 'info')
    const { error, started } = await enqueue({ kind: 'devicetest', gameId: b.game_id ?? '', buildId: b.id, by: me.email })
    if (error) return toast('Başlatılamadı: ' + error, 'warn')
    toast(started ? 'Telefonda deneniyor; 3–5 dakikada sonuç gelir.' : 'Sıraya alındı; uzman en geç 15 dakikada başlar.')
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
      <section className="expert-hero">
        <div className="expert-hero-text">
          <span className="eyebrow"><Bot size={11} /> Yayın Uzmanı · kendi modelin</span>
          <h1>Build'i bırak,<br /><span>gerisini uzman yapsın.</span></h1>
          <p>İnceler, telefonda dener, sorunları "ne yapmalısın" diye söyler, dahili teste yükler. Oyunculara açmak senin onayınla.</p>
        </div>
        <div className="expert-stats">
          <div><span>İnceleniyor</span><b>{stats.running}</b></div>
          <div className={stats.waiting ? 'hot' : ''}><span>Onayını bekliyor</span><b>{stats.waiting}</b></div>
          <div className={stats.blocked ? 'bad' : ''}><span>Düzeltme gerekli</span><b>{stats.blocked}</b></div>
          <div className="ok"><span>Yayında</span><b>{stats.live}</b></div>
        </div>
      </section>

      <nav className="expert-tabs" aria-label="Yayın Uzmanı bölümleri">
        {TABS.map((t) => (
          <button key={t.value} type="button" className={tab === t.value ? 'on' : ''} onClick={() => setTab(t.value)}>
            <t.icon size={14} /> {t.label}
            {t.value === 'builds' && stats.waiting > 0 && <span className="menu-badge">{stats.waiting}</span>}
          </button>
        ))}
      </nav>

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
            <span className="dz-orb"><UploadCloud size={26} /></span>
            <div className="grow">
              <b>Build'i buraya sürükle</b>
              <div className="dz-plats">
                <span className="plat android"><Smartphone size={11} /> Android · .aab / .apk</span>
                <span className="plat ios"><Apple size={11} /> iOS · .ipa</span>
                <span className="muted small">500 MB'a kadar</span>
              </div>
              {progress !== null && <div className="dz-bar"><div style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
            </div>
            <Select className="select" value={gameId} onChange={(e) => setGameId(e.target.value)} aria-label="Oyun">
              {storeGames.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
            <button type="button" className="btn btn-primary" onClick={() => input.current?.click()} disabled={progress !== null}><Rocket size={14} /> Dosya seç</button>
            <input ref={input} type="file" accept=".aab,.apk,.ipa" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </section>

          {builds.rows.length === 0 && <div className="card empty">Henüz build yok. Unity'den aldığın AAB'yi ya da Xcode'dan aldığın IPA'yı yukarı bırak; uzman birkaç dakikada raporlar.</div>}
          {builds.rows.map((b, i) => (
            <BuildCard key={b.id} b={b} gameName={nameOf(b.game_id)} actions={actions.rows} onApprove={approve} onReject={reject} onRollout={rollout} onDeviceTest={deviceTest} onDelete={removeBuild} startOpen={i === 0 || ['uploaded', 'inspecting', 'awaiting_approval', 'publishing', 'live'].includes(b.status)} />
          ))}
        </>
      )}

      {tab === 'aso' && (
        <>
          <div className="flex" style={{ gap: 10 }}>
            <span className="small muted">Oyun</span>
            <Select className="select" style={{ width: 'auto' }} value={asoGame} onChange={(e) => setGameId(e.target.value)} aria-label="Oyun">
              {android.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </div>
          {asoGame && <AsoCoach key={asoGame} gameId={asoGame} gameName={nameOf(asoGame)} />}
        </>
      )}

      {tab === 'appstore' && (
        <>
          <div className="flex" style={{ gap: 10 }}>
            <span className="small muted">Oyun</span>
            <Select className="select" style={{ width: 'auto' }} value={iosGame} onChange={(e) => setGameId(e.target.value)} aria-label="Oyun">
              {ios.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </div>
          {iosGame ? <AppStoreReview key={iosGame} gameId={iosGame} gameName={nameOf(iosGame)} /> : <div className="card empty">iOS'ta olan oyun yok.</div>}
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
