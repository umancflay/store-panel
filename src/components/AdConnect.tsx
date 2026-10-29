import { useState } from 'react'
import { Check, Copy, ExternalLink, KeyRound, Link2, Link2Off, RefreshCw } from 'lucide-react'
import { supabase, isDemo } from '../lib/supabase'
import { useData } from '../lib/data'
import { useStore } from '../lib/store'
import { trDateTime, useSetting } from '../lib/rows'

// Reklam verilen platformları bağlama: her biri için durum ve adım adım kurulum.
// Google Ads: geliştirici izni beklemeden, hesabın içindeki betik (Araçlar › Betikler) her saat kampanya sonuçlarını
// panele gönderir (supabase/phase12-ads-ingest.sql › ingest_ads). Sadece okuma: kampanya açmaz, bütçe değiştirmez.

const SUPA = import.meta.env.VITE_SUPABASE_URL as string | undefined
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

function adsScript(key: string) {
  return `// Voo Game Studio paneli: kampanya sonuçlarını panele gönderir (sadece okur, hiçbir şeyi değiştirmez).
var PANEL = '${SUPA}/rest/v1/rpc/ingest_ads';
var APIKEY = '${ANON}';
var KEY = '${key}';

function main() {
  var q = 'SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, ' +
    'campaign.app_campaign_setting.app_id, segments.date, metrics.cost_micros, metrics.impressions, ' +
    'metrics.clicks, metrics.conversions FROM campaign WHERE segments.date DURING LAST_30_DAYS';
  var it = AdsApp.search(q);
  var rows = [];
  while (it.hasNext()) {
    var r = it.next();
    var app = r.campaign.appCampaignSetting || {};
    rows.push({
      id: String(r.campaign.id), name: r.campaign.name, status: r.campaign.status,
      channel: r.campaign.advertisingChannelType, appId: app.appId || null, date: r.segments.date,
      cost: Number(r.metrics.costMicros || 0) / 1e6, impressions: Number(r.metrics.impressions || 0),
      clicks: Number(r.metrics.clicks || 0), conversions: Number(r.metrics.conversions || 0),
      installs: r.campaign.advertisingChannelType === 'MULTI_CHANNEL' ? Number(r.metrics.conversions || 0) : 0
    });
  }
  var acc = AdsApp.currentAccount();
  var res = UrlFetchApp.fetch(PANEL, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: APIKEY },
    payload: JSON.stringify({ p_key: KEY, p_payload: { platform: 'google_ads', account: acc.getCustomerId(), currency: acc.getCurrencyCode(), rows: rows } })
  });
  Logger.log('Panel: ' + res.getResponseCode() + ' ' + res.getContentText());
}
`
}

type Guide = { id: string; name: string; why: string; steps: string[]; link: string; linkLabel: string }
const GUIDES: Guide[] = [
  {
    id: 'tiktok', name: 'TikTok Ads',
    why: 'Kişisel TikTok hesabın reklam için yetmez; ücretsiz bir TikTok for Business reklam hesabı gerekir (kişisel hesabınla açılır).',
    steps: [
      'ads.tiktok.com\'a gir, "Create an ad / Hemen başla"ya bas, TikTok hesabınla giriş yap.',
      'Ülke: Türkiye, saat dilimi: İstanbul, para birimi: TRY seç; şirket adı: Voo Game Studio.',
      'Ödeme yöntemi eklemen gerekmez; sadece hesap açılsın (reklam vermeden durur).',
      'Bitince bana "TikTok hesabı açıldı" yaz: veri bağlantısını (TikTok geliştirici izni, 1–3 gün) birlikte başlatalım.',
    ],
    link: 'https://ads.tiktok.com/', linkLabel: 'TikTok for Business',
  },
  {
    id: 'apple_ads', name: 'Apple Search Ads',
    why: 'App Store aramasında en üstte çıkmak için. Apple geliştirici hesabınla ücretsiz açılır; reklam vermedikçe para çekmez.',
    steps: [
      'ads.apple.com\'a gir, Apple geliştirici hesabındaki Apple ID ile giriş yap.',
      '"Apple Search Ads Advanced" seç (Basic değil), ülke Türkiye, para birimi TRY.',
      'Hesap açılınca: Hesap Ayarları › Kullanıcı Yönetimi › kendine "API Account Read Only" rolünü ver.',
      'Bana "Apple Ads açıldı" yaz: API anahtarını (sertifika) birlikte oluşturup panele bağlayalım.',
    ],
    link: 'https://ads.apple.com/', linkLabel: 'Apple Search Ads',
  },
  {
    id: 'unity_ads', name: 'Unity Ads (kullanıcı kazanımı)',
    why: 'Unity oyunlarında reklam vererek oyuncu kazanmak için. Unity hesabınla açılır.',
    steps: [
      'cloud.unity.com › Grow › Unity Ads User Acquisition\'a gir (Unity hesabınla).',
      'Organizasyonun Voo Game Studio olduğundan emin ol; kampanya açmadan durabilirsin.',
      'Kampanya açtığında bana yaz: istatistik API anahtarını panele bağlarız.',
    ],
    link: 'https://cloud.unity.com/', linkLabel: 'Unity Cloud',
  },
]

export default function AdConnect() {
  const { connections, demo } = useData()
  const { toast } = useStore()
  const [ingest, saveIngest] = useSetting<{ key: string; at: string | null }>('ads_ingest_key', { key: '', at: null })
  const [showScript, setShowScript] = useState(false)
  const conn = (id: string) => connections.find((c) => c.source === id)
  const google = conn('google_ads')
  const googleOn = google?.status === 'connected' && !demo

  async function prepare(renew = false) {
    if (isDemo || !supabase) return toast('Demo modda çalışmaz', 'info')
    if (!ingest.key || renew) {
      const bytes = crypto.getRandomValues(new Uint8Array(24))
      const key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
      await saveIngest({ key, at: new Date().toISOString() }).catch((e) => toast('Anahtar kaydedilemedi: ' + e.message, 'warn'))
      if (renew) toast('Yeni anahtar üretildi: Google Ads\'teki betiği yenisiyle değiştir', 'info')
    }
    setShowScript(true)
  }
  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast('Betik panoya kopyalandı'))

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <div className="card-title">Reklam hesapları</div>
          <div className="card-sub">Sadece okuma: panel kampanya açmaz, bütçe değiştirmez. Her platformun yanında ne yapman gerektiği yazıyor.</div>
        </div>
      </div>

      <div className="adc-list">
        <div className={`adc ${googleOn ? 'on' : ''}`}>
          <div className="adc-head">
            <span className="adc-ico">{googleOn ? <Link2 size={16} /> : <Link2Off size={16} />}</span>
            <div className="grow">
              <b>Google Ads</b>
              <div className="muted small">{googleOn ? `${google?.message ?? ''} · son veri ${google?.last_sync_at ? trDateTime(google.last_sync_at) : '—'}` : 'Hesabın var (voogamestudio@gmail.com). Bir betik yapıştırınca her saat veri gelir; Google onayı beklemek gerekmez.'}</div>
            </div>
            <span className={`badge ${googleOn ? 'b-ok' : 'b-warning'}`}>{googleOn ? 'Bağlı' : 'Kurulum bekliyor'}</span>
          </div>
          {!showScript ? (
            <button type="button" className="btn btn-primary sm" onClick={() => prepare()}><KeyRound size={13} /> {googleOn ? 'Betiği göster' : 'Kurulumu başlat'}</button>
          ) : (
            <div className="adc-setup">
              <ol>
                <li>Google Ads'te üstteki <b>Araçlar</b> (anahtar simgesi) › <b>Toplu işlemler</b> › <b>Betikler</b>'e gir.</li>
                <li>Mavi <b>+</b> › <b>Yeni betik</b>. İçindeki her şeyi sil, aşağıdaki betiği yapıştır; adını "Voo Panel" yap.</li>
                <li><b>Yetkilendir</b>'e bas, voogamestudio@gmail.com'u seç, izin ver.</li>
                <li><b>Çalıştır</b>'a bas; altta "Panel: 200" yazarsa tamam. Sonra <b>Sıklık: Saatlik</b> seçip kaydet.</li>
              </ol>
              <div className="flex" style={{ gap: 8 }}>
                <button type="button" className="btn btn-green sm" onClick={() => copy(adsScript(ingest.key))} disabled={!ingest.key}><Copy size={12} /> Betiği kopyala</button>
                <a className="btn sm" href="https://ads.google.com/aw/bulk/scripts" target="_blank" rel="noreferrer"><ExternalLink size={12} /> Betikler sayfasını aç</a>
                <button type="button" className="btn btn-ghost sm" onClick={() => prepare(true)} title="Eski betik çalışmaz olur"><RefreshCw size={12} /> Anahtarı yenile</button>
              </div>
              <div className="muted" style={{ fontSize: 10 }}>Betikteki anahtar sadece senin Google Ads hesabında durur; panel dışında kimse kullanamaz. Paylaşma.</div>
            </div>
          )}
        </div>

        <div className={`adc ${conn('meta')?.status === 'connected' && !demo ? 'on' : ''}`}>
          <div className="adc-head">
            <span className="adc-ico"><Link2 size={16} /></span>
            <div className="grow"><b>Meta (Facebook/Instagram)</b><div className="muted small">{conn('meta')?.message ?? 'Bağlı; her gün güncellenir.'}</div></div>
            <span className={`badge ${conn('meta')?.status === 'connected' ? 'b-ok' : 'b-muted'}`}>{conn('meta')?.status === 'connected' ? 'Bağlı' : 'Bağlı değil'}</span>
          </div>
        </div>

        {GUIDES.map((g) => {
          const on = conn(g.id)?.status === 'connected' && !demo
          return (
            <details key={g.id} className={`adc ${on ? 'on' : ''}`}>
              <summary className="adc-head">
                <span className="adc-ico">{on ? <Link2 size={16} /> : <Link2Off size={16} />}</span>
                <div className="grow"><b>{g.name}</b><div className="muted small">{on ? conn(g.id)?.message : g.why}</div></div>
                <span className={`badge ${on ? 'b-ok' : 'b-muted'}`}>{on ? 'Bağlı' : 'Hesap gerekli'}</span>
              </summary>
              <ol className="adc-steps">{g.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
              <a className="btn sm" href={g.link} target="_blank" rel="noreferrer"><ExternalLink size={12} /> {g.linkLabel}</a>
            </details>
          )
        })}
      </div>
      <div className="muted small flex" style={{ gap: 6, marginTop: 10 }}><Check size={12} /> Hesap açmak ve giriş yapmak senin işin; sonrasını ben bağlarım.</div>
    </section>
  )
}
