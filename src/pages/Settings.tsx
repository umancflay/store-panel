import { useEffect, useState } from 'react'
import { Link2, Link2Off, Clock, BellRing, Gamepad2, Plug, UserRound } from 'lucide-react'
import { currencySymbol, platformLabel } from '../lib/format'
import { useData, usePeople } from '../lib/data'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { enablePush, pushConfigured, pushState, sendTestPush } from '../lib/push'
import { GameChip, SampleBanner, Seg, Toggle, initials } from '../components/ui'
import { requirements } from '../data/requirements'
import Needs from '../components/Needs'

const sources = ['admob', 'google_play', 'app_store', 'gmail', 'claude', 'google_ads', 'apple_ads', 'meta', 'tiktok'].map((id) => requirements[id])

export default function Settings() {
  const { toast } = useStore()
  const { allGames, connections, lastRun, demo, reload, setGameHidden, currency, setCurrencyPref, fx } = useData()
  const { me } = usePeople()
  const [name, setName] = useState(me.name)
  const [role, setRole] = useState(me.role)
  useEffect(() => {
    setName(me.name)
    setRole(me.role)
  }, [me.name, me.role])
  const conn = (id: string) => connections.find((c) => c.source === id)
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }) : '')
  const [critical, setCritical] = useState(true)
  const [daily, setDaily] = useState(false)

  // Bildirim tercihleri kişiye özel; telefon bildirimi gönderilirken bunlara bakılır
  useEffect(() => {
    if (demo || !supabase) return
    supabase.from('user_settings').select('notify_critical,notify_daily').maybeSingle().then(({ data }) => {
      if (!data) return
      setCritical(data.notify_critical)
      setDaily(data.notify_daily)
    })
  }, [demo])
  const saveNotify = async (patch: { notify_critical?: boolean; notify_daily?: boolean }) => {
    if (patch.notify_critical !== undefined) setCritical(patch.notify_critical)
    if (patch.notify_daily !== undefined) setDaily(patch.notify_daily)
    if (demo || !supabase) return
    const { data: user } = await supabase.auth.getUser()
    const { error } = await supabase.from('user_settings').upsert({
      user_id: user.user?.id,
      notify_critical: patch.notify_critical ?? critical,
      notify_daily: patch.notify_daily ?? daily,
      updated_at: new Date().toISOString(),
    })
    if (error) toast('Kaydedilemedi: ' + error.message, 'warn')
  }

  // Bu cihazın bildirim durumu; "Test gönder" kuyruğa yazar, Asistan işi 10 dakika içinde gönderir
  const [device, setDevice] = useState<Awaited<ReturnType<typeof pushState>>>('off')
  useEffect(() => {
    pushState().then(setDevice)
  }, [])
  const turnOnPush = async () => {
    const err = await enablePush()
    toast(err ?? 'Bildirimler açıldı, bu cihaz kaydedildi.', err ? 'warn' : 'ok')
    pushState().then(setDevice)
  }
  const testPush = async () => {
    const err = await sendTestPush(me.email)
    toast(err ?? 'Test bildirimi sıraya alındı, 10 dakika içinde telefonuna gelir.', err ? 'warn' : 'info')
  }
  const deviceText = {
    unsupported: 'Bu tarayıcı desteklemiyor. iPhone\'da Safari › Paylaş › Ana Ekrana Ekle, sonra paneli ana ekrandaki simgeden aç.',
    denied: 'Bu cihazda bildirim izni kapalı. iPhone: Ayarlar › Bildirimler › Voo Panel › Bildirimlere İzin Ver.',
    off: 'Bu cihaz kayıtlı değil. "Aç"a bas ve izin ver.',
    on: 'Bu cihaz kayıtlı ✓ Bildirim gelmiyorsa "Test gönder"e bas; yine gelmezse iPhone\'da Odak / Rahatsız Etme kapalı mı bak.',
  }

  // Profil adı: menüde ve ana sayfadaki karşılamada görünür
  const saveProfile = async () => {
    if (demo || !supabase) return toast('Demo modda kaydedilmez.', 'info')
    const { error } = await supabase.from('admins').update({ display_name: name.trim() || null, role: role.trim() || null }).eq('email', me.email)
    if (error) return toast('Kaydedilemedi: ' + error.message + ' (features.sql çalıştırıldı mı?)', 'warn')
    toast('Profil kaydedildi')
    reload()
  }

  // Aylık gelir hedefi: Gelir › Oyun sağlığı halkası
  const saveGoal = async (id: string, v: string) => {
    if (demo || !supabase) return toast('Demo modda kaydedilmez.', 'info')
    const goal = v.trim() === '' ? null : Number(v)
    const { error } = await supabase.from('games').update({ monthly_goal: goal }).eq('id', id)
    if (error) return toast('Kaydedilemedi: ' + error.message, 'warn')
    toast('Hedef kaydedildi')
    reload()
  }

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="page-head">
        <span className="eyebrow">Ayarlar</span>
        <h1>Profil ve bağlantılar</h1>
      </div>
      {!connections.some((c) => c.status === 'connected') && <SampleBanner>Henüz hiçbir hesap bağlı değil. Bağlantılar aşama aşama eklenecek.</SampleBanner>}

      <section className="card">
        <div className="card-title flex" style={{ gap: 8, marginBottom: 12 }}><UserRound size={16} /> Profil</div>
        <div className="flex wrap" style={{ gap: 12, alignItems: 'flex-end' }}>
          <span className="avatar" style={{ width: 44, height: 44, fontSize: 14 }}>{initials(name || me.name)}</span>
          <div className="field" style={{ marginBottom: 0, flex: '1 1 180px' }}>
            <label htmlFor="p-name">Görünen ad</label>
            <input id="p-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="ör. Umut" />
          </div>
          <div className="field" style={{ marginBottom: 0, flex: '1 1 180px' }}>
            <label htmlFor="p-role">Rol</label>
            <input id="p-role" className="input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="ör. Stüdyo sahibi" />
          </div>
          <button type="button" className="btn btn-primary" onClick={saveProfile} disabled={name === me.name && role === me.role}>Kaydet</button>
        </div>
        <p className="muted small" style={{ marginTop: 10 }}>{me.email}</p>
      </section>

      <div className="grid g-2">
        <section className="card">
          <div className="card-title flex" style={{ marginBottom: 6 }}><Plug size={18} color="var(--muted)" /> Bağlı hesaplar</div>
          {sources.map((s) => {
            const c = conn(s.id)
            const ok = c?.status === 'connected'
            const bad = c?.status === 'error'
            return (
              <div className="row" key={s.id}>
                <span className="icon-box sm" style={ok ? { width: 36, height: 36 } : { width: 36, height: 36, background: 'rgba(255,255,255,.05)', boxShadow: 'none', color: 'var(--muted)' }}>
                  {ok ? <Link2 size={15} /> : <Link2Off size={15} />}
                </span>
                <div className="grow">
                  <b>{s.name}</b>
                  <div className="muted small">
                    {ok || bad ? `${when(c!.last_sync_at)}${c!.message ? ' · ' + c!.message : ''}` : `${s.phase}. aşamada bağlanacak`}
                  </div>
                </div>
                <span className={`badge ${ok ? 'b-ok' : bad ? 'b-critical' : 'b-muted'}`}>{ok ? 'Bağlı' : bad ? 'Hata' : 'Bağlı değil'}</span>
              </div>
            )
          })}
        </section>

        <div className="grid" style={{ alignContent: 'start' }}>
          <section className="card">
            <div className="card-title flex" style={{ marginBottom: 6 }}><Clock size={18} color="var(--muted)" /> Veri çekme</div>
            <div className="row">
              <div className="grow">
                <b>Son veri çekme</b>
                <div className="muted small">{lastRun ? `${when(lastRun.finished_at) || 'Çalışıyor…'}${lastRun.message ? ' · ' + lastRun.message : ''}` : 'Henüz çalışmadı'}</div>
              </div>
              {lastRun && <span className={`badge ${lastRun.status === 'success' ? 'b-ok' : lastRun.status === 'failed' ? 'b-critical' : 'b-warning'}`}>{lastRun.status === 'success' ? 'Başarılı' : lastRun.status === 'failed' ? 'Hata' : 'Çalışıyor'}</span>}
            </div>
            <div className="row"><div className="grow"><b>Her sabah 08:00</b><div className="muted small">Tüm veriler + Claude analizi</div></div><span className="badge b-muted">Hazır</span></div>
            <div className="row"><div className="grow"><b>Her 6 saatte bir</b><div className="muted small">Politika mailleri ve inceleme durumları</div></div><span className="badge b-muted">Hazır</span></div>
            <div className="row"><div className="grow"><b>Haftada bir (Pazartesi)</b><div className="muted small">Reklam planlarını güncelle</div></div><span className="badge b-muted">Hazır</span></div>
          </section>

          <section className="card">
            <div className="card-title" style={{ marginBottom: 6 }}>Para birimi</div>
            <div className="row">
              <div className="grow">
                <b>Tutarları göster</b>
                <div className="muted small">
                  {Object.keys(fx).length
                    ? `Her gün kendi kuruyla çevrilir · son kur 1 $ = ${Object.entries(fx).sort(([a], [b]) => b.localeCompare(a))[0][1].toFixed(2).replace('.', ',')} ₺`
                    : 'Kur bilgisi bir sonraki veri toplamada gelir; o zamana kadar dolar gösterilir.'}
                </div>
              </div>
              <Seg value={currency} onChange={setCurrencyPref} options={[{ value: 'TRY', label: '₺ TL' }, { value: 'USD', label: '$ USD' }]} />
            </div>
          </section>

          <section className="card">
            <div className="card-title flex" style={{ marginBottom: 6 }}><BellRing size={18} color="var(--muted)" /> Bildirimler</div>
            <div className="row"><div className="grow"><b>Kritik uyarılarda bildir</b><div className="muted small">Politika ihlali, reddedilen build</div></div><Toggle on={critical} onChange={(v) => saveNotify({ notify_critical: v })} /></div>
            <div className="row"><div className="grow"><b>Günün özeti hazır olunca bildir</b><div className="muted small">Her sabah</div></div><Toggle on={daily} onChange={(v) => saveNotify({ notify_daily: v })} /></div>
            <div className="row">
              <div className="grow">
                <b>Bu cihazda bildirimleri aç</b>
                <div className="muted small">
                  {pushConfigured ? deviceText[device] : 'Bildirim anahtarı (VAPID) henüz girilmemiş. README › 4. aşama.'}
                </div>
              </div>
              <div className="flex" style={{ gap: 6 }}>
                {device === 'on' && <button className="btn sm" onClick={testPush}>Test gönder</button>}
                <button className="btn btn-primary" onClick={turnOnPush}>{device === 'on' ? 'Yenile' : 'Aç'}</button>
              </div>
            </div>
          </section>
        </div>
      </div>

      <section className="card">
        <div className="card-title flex" style={{ marginBottom: 6 }}><Gamepad2 size={18} color="var(--muted)" /> Oyun listesi</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Oyun</th><th>Platformlar</th><th>Aylık hedef ({currencySymbol()})</th><th>Panelde göster</th></tr></thead>
            <tbody>
              {allGames.map((g) => (
                <tr key={g.id} style={{ opacity: g.hidden ? 0.5 : 1 }}>
                  <td><GameChip id={g.id} /></td>
                  <td><div className="flex" style={{ gap: 6 }}>{g.platforms.map((p) => <span key={p} className="chip">{platformLabel(p)}</span>)}</div></td>
                  <td>
                    <input
                      className="input"
                      style={{ width: 110, height: 32 }}
                      type="number"
                      min={0}
                      defaultValue={g.goal ?? ''}
                      key={g.id + String(g.goal)}
                      placeholder="—"
                      aria-label={`${g.name} aylık hedef`}
                      onBlur={(e) => e.target.value !== String(g.goal ?? '') && saveGoal(g.id, e.target.value)}
                    />
                  </td>
                  <td>
                    <Toggle
                      on={!g.hidden}
                      label={`${g.name} panelde görünsün`}
                      onChange={(v) =>
                        setGameHidden(g.id, !v)
                          .then(() => toast(v ? `${g.name} panelde gösteriliyor` : `${g.name} gizlendi`, 'info'))
                          .catch((e) => toast('Kaydedilemedi: ' + e.message + ' (features.sql çalıştırıldı mı?)', 'warn'))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small mt">Boş ya da takip etmek istemediğin oyunları kapat; gizlenen oyun panelin hiçbir yerinde görünmez ve hesaplara katılmaz. İstediğin zaman buradan geri açabilirsin.</p>
      </section>

      {!demo && (
        <>
          <div className="card-title" style={{ marginTop: 8 }}>Bağlantı rehberleri</div>
          <div className="grid g-2">
            {sources.filter((r) => conn(r.id)?.status !== 'connected').map((r) => <Needs key={r.id} source={r.id} />)}
          </div>
        </>
      )}
    </div>
  )
}
