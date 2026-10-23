// Otomasyon kuralları: toplanan veriye bakıp sorun varsa uyarı ve görev oluşturur.
// Kurallar paneldeki Otomasyon sayfasından (automations tablosu) gelir; tablo yoksa varsayılanlar kullanılır.
// Google'ın "kötü davranış" eşikleri: çökme %1,09, ANR %0,47 (son 28 gün ortalaması).
// Aynı sorun için ayda bir uyarı/görev açılır; çözüldü işaretlenen uyarı o ay tekrar açılmaz.
// Kurallar sadece uyarı, görev ve taslak üretir; para harcamaz, mağazada hiçbir şey değiştirmez.

import { db, upsert } from './db.mjs'

const DEFAULTS = [
  { id: null, name: 'Çökme oranı', enabled: true, trigger: 'crash_rate', threshold: 1.09, actions: ['task'] },
  { id: null, name: 'ANR oranı', enabled: true, trigger: 'anr_rate', threshold: 0.47, actions: ['task'] },
]

// Supabase bir istekte en fazla 1000 satır verir; hepsini sayfa sayfa al
async function all(path) {
  const out = []
  for (let off = 0; ; off += 1000) {
    const page = await db(`${path}&limit=1000&offset=${off}`)
    out.push(...page)
    if (page.length < 1000) return out
  }
}

const avg = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null)
const trNum = (v, d = 2) => v.toFixed(d).replace('.', ',')

const fixSteps = {
  crash_rate: [
    'Play Console › Android vitals › Çökmeler ve ANR\'ler bölümüne gir, en çok kullanıcıyı etkileyen çökmeyi aç.',
    'Yığın izinde (stack trace) hangi sınıfın geçtiğine bak; hangi cihaz ve Android sürümlerinde olduğunu not al.',
    'Düzeltmeyi yapıp yeni bir sürümü önce dahili test kanalına, sonra üretime gönder.',
    'Unity: Project Settings › Player › Android › Other Settings\'te Scripting Backend IL2CPP ve Target Architectures ARM64 açık olsun.',
    'Unity: Çökme Unity sınıfındaysa Unity sürümünü güncel LTS\'e yükselt; yerel (native) çökmelerde symbols.zip dosyasını Play Console\'a yükle ki satır numaraları görünsün.',
  ],
  anr_rate: [
    'Play Console › Android vitals › Çökmeler ve ANR\'ler bölümünde ANR listesini aç.',
    'ANR çoğunlukla ana iş parçacığında uzun süren işlerden olur: dosya okuma, ağ isteği, büyük sahne yükleme.',
    'Düzeltmeyi yapıp yeni sürüm gönder.',
    'Unity: Sahneleri SceneManager.LoadSceneAsync ile yükle; büyük dosya ve ağ işlerini coroutine ya da async içine taşı.',
    'Unity: Reklam SDK\'sını (Google Mobile Ads) son sürüme güncelle; eski sürümler açılışta ANR yapabiliyor.',
  ],
  rating: [
    'Yorumlar sayfasında 1–2 yıldızlı son yorumları oku; en sık tekrar eden şikayeti bul.',
    'Kötü yorumlara kısa ve nazik cevap yaz; düzeltme geldiğinde haber vereceğini söyle.',
    'Şikayet edilen sorunu bir sonraki sürümde düzelt ve sürüm notunda belirt.',
  ],
  fill_rate: [
    'AdMob › Mediation bölümünde bu oyunun reklam birimleri için bir mediation grubu oluştur.',
    'Bidding ile en az bir ağ daha ekle (ör. AppLovin, Unity Ads, Meta Audience Network).',
    'Unity: Google Mobile Ads mediation adaptörlerini Package Manager / External Dependency Manager ile ekle.',
  ],
  rejected: [
    'App Store Connect › Uygulama › App Review bölümünde Apple\'ın mesajını oku.',
    'Belirtilen kuralı (Guideline) düzelt; gerekirse inceleme ekibine Resolution Center\'dan cevap yaz.',
    'Yeni build yükleyip tekrar incelemeye gönder.',
  ],
}

export async function applyRules() {
  let rules = DEFAULTS
  try {
    rules = (await db('automations?select=*&enabled=eq.true')) ?? []
  } catch {
    console.log('Otomasyon tablosu yok (features.sql çalıştırılmamış); varsayılan kurallar kullanılıyor.')
  }
  const games = await db('games?select=id,name,android_package,ios_app_id&active=eq.true&hidden=is.false')
  const name = (id) => games.find((g) => g.id === id)?.name ?? id
  const month = new Date().toISOString().slice(0, 7)
  const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

  // Gerekli veriyi bir kere çek
  const need = new Set(rules.map((r) => r.trigger))
  const store = need.has('crash_rate') || need.has('anr_rate') || need.has('rating')
    ? await all(`store_daily?date=gte.${day(28)}&select=date,game_id,platform,crash_rate,anr_rate,rating&order=date`)
    : []
  const admob = need.has('fill_rate') ? await all(`admob_daily?date=gte.${day(7)}&select=game_id,requests,matched_requests&order=date`) : []
  const builds = need.has('rejected') ? await db('builds?select=game_id,platform,version,review_status') : []

  const alerts = []
  const tasks = []
  const runs = new Map()
  const active = new Set() // şu an süren sorunlar: "crash_rate-salgin", "auto:rejected-salgin-ios-1.2" …

  for (const rule of rules) {
    const hits = [] // { gameId, value, title, body, level, source, url }
    const th = rule.threshold == null ? null : Number(rule.threshold)

    if (rule.trigger === 'crash_rate' || rule.trigger === 'anr_rate') {
      const metric = rule.trigger
      const limit = th ?? (metric === 'crash_rate' ? 1.09 : 0.47)
      for (const g of games) {
        const v = avg(store.filter((r) => r.game_id === g.id && r.platform === 'android' && r[metric] != null).map((r) => Number(r[metric])))
        if (v == null || v <= limit) continue
        const crash = metric === 'crash_rate'
        hits.push({
          gameId: g.id, level: 'critical', source: 'play',
          title: `${g.name}: ${crash ? 'çökme' : 'ANR'} oranı eşiğin üstünde (%${trNum(v)})`,
          body: `Son 28 günde ortalama ${crash ? 'çökme' : 'ANR'} oranı %${trNum(limit)} eşiğini aştı. Bu devam ederse Google Play oyunun görünürlüğünü düşürür ve mağaza sayfasında uyarı gösterebilir.`,
          url: g.android_package ? `https://play.google.com/console/developers/app/vitals/overview?package=${g.android_package}` : 'https://play.google.com/console',
        })
      }
    }

    if (rule.trigger === 'rating') {
      const limit = th ?? 4
      for (const g of games) {
        const latest = new Map()
        for (const r of store.filter((r) => r.game_id === g.id && r.rating != null)) {
          if (!latest.has(r.platform) || latest.get(r.platform).date < r.date) latest.set(r.platform, r)
        }
        const v = avg([...latest.values()].map((r) => Number(r.rating)))
        if (v == null || v >= limit) continue
        hits.push({
          gameId: g.id, level: 'warning', source: 'system',
          title: `${g.name}: mağaza puanı ${trNum(v, 1)} (hedef ${trNum(limit, 1)})`,
          body: `Oyunun mağaza puanı ${trNum(limit, 1)} altına düştü. Düşük puan mağazada daha az gösterilmeye ve daha az indirmeye yol açar.`,
          url: '#/yorumlar',
        })
      }
    }

    if (rule.trigger === 'fill_rate') {
      const limit = th ?? 85
      for (const g of games) {
        const rows = admob.filter((r) => r.game_id === g.id)
        const req = rows.reduce((a, r) => a + Number(r.requests ?? 0), 0)
        const mat = rows.reduce((a, r) => a + Number(r.matched_requests ?? 0), 0)
        if (req < 1000) continue
        const v = (mat / req) * 100
        if (v >= limit) continue
        hits.push({
          gameId: g.id, level: 'warning', source: 'admob',
          title: `${g.name}: AdMob fill rate %${trNum(v, 0)} (hedef %${trNum(limit, 0)})`,
          body: `Son 7 günde reklam isteklerinin %${trNum(100 - v, 0)} kadarı boş döndü. Bu doğrudan gelir kaybı demek.`,
          url: 'https://admob.google.com/v2/mediation/groups/list',
        })
      }
    }

    if (rule.trigger === 'rejected') {
      for (const b of builds.filter((b) => ['REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY'].includes(b.review_status))) {
        // Uyarıyı App Store toplayıcısı zaten açıyor; burada sadece görev açılır
        hits.push({ gameId: b.game_id, key: `${b.platform}-${b.version}`, alertExists: true, title: `${name(b.game_id)} ${b.version}: inceleme reddedildi`, level: 'critical' })
      }
    }

    if (!hits.length) continue
    runs.set(rule, hits.length)
    for (const h of hits) {
      const key = `${rule.trigger}-${h.gameId}-${h.key ?? month}`
      active.add(`${rule.trigger}-${h.gameId}`)
      active.add(`auto:${key}`)
      if (!h.alertExists) {
        alerts.push({
          external_id: key, level: h.level, source: h.source, game_id: h.gameId, title: h.title, body: h.body,
          how_to_fix: (fixSteps[rule.trigger] ?? []).join('\n'), console_url: h.url,
        })
      }
      if (rule.actions?.includes('task')) {
        tasks.push({
          title: h.title, level: h.level === 'critical' ? 'critical' : 'medium', status: 'open', game_id: h.gameId,
          source: `auto:${key}`, advice: (fixSteps[rule.trigger] ?? [])[0] ?? null, tags: ['Otomasyon'],
          subtasks: (fixSteps[rule.trigger] ?? []).slice(0, 4).map((t) => ({ title: t.split(';')[0].slice(0, 90), done: false })),
          history: [{ what: `Otomasyon açtı: ${rule.name}`, at: new Date().toISOString() }], created_by: 'assistant',
        })
      }
    }
  }

  if (alerts.length) await upsert('alerts', alerts, 'external_id')

  // Aynı sorun için ikinci görev açma
  let newTasks = 0
  if (tasks.length) {
    try {
      const sources = tasks.map((t) => `"${t.source}"`).join(',')
      const existing = new Set((await db(`tasks?select=source&source=in.(${encodeURIComponent(sources)})`)).map((t) => t.source))
      const fresh = tasks.filter((t, i) => !existing.has(t.source) && tasks.findIndex((x) => x.source === t.source) === i)
      if (fresh.length) await db('tasks', 'POST', fresh, 'return=minimal')
      newTasks = fresh.length
    } catch (e) {
      console.log('Görevler yazılamadı (features.sql çalıştırılmamış olabilir):', e.message)
    }
  }

  const closed = await closeFixed(rules.map((r) => r.trigger), active)

  for (const [rule, n] of runs) {
    if (rule.id == null) continue
    await db(`automations?id=eq.${rule.id}`, 'PATCH', { runs: (rule.runs ?? 0) + 1, last_run_at: new Date().toISOString() }, 'return=minimal')
    console.log(`Kural "${rule.name}": ${n} eşleşme`)
  }
  console.log(`Otomasyon: ${alerts.length} uyarı, ${newTasks} yeni görev, ${closed} kendiliğinden kapandı`)
}

// Sorun düzeldiyse: kuralın açtığı uyarıyı çözüldü yap, ilgili görevi (otomasyon ya da Komuta'dan açılan) bitir.
// Sadece bu çalışmada kontrol edilen kurallara bakılır; kapalı kuralların kayıtlarına dokunulmaz.
const komutaKey = { crash_rate: 'crash', anr_rate: 'anr', rating: 'rating', fill_rate: 'fill' }
async function closeFixed(checked, active) {
  const now = new Date().toISOString()
  let n = 0
  const metric = checked.filter((t) => komutaKey[t])

  const openAlerts = await db('alerts?status=eq.open&external_id=not.is.null&select=id,external_id')
  for (const a of openAlerts) {
    const m = a.external_id.match(/^(crash_rate|anr_rate|rating|fill_rate)-(.+)-\d{4}-\d{2}$/)
    if (!m || !metric.includes(m[1]) || active.has(`${m[1]}-${m[2]}`)) continue
    await db(`alerts?id=eq.${a.id}`, 'PATCH', { status: 'resolved', resolved_at: now, resolved_by: 'otomasyon' }, 'return=minimal')
    n++
  }

  let openTasks = []
  try {
    openTasks = await db('tasks?status=neq.done&source=not.is.null&select=id,source,history')
  } catch {
    return n // görev tablosu yok
  }
  for (const t of openTasks) {
    let fixed = false
    const auto = t.source.match(/^auto:(crash_rate|anr_rate|rating|fill_rate|rejected)-/)
    if (auto && checked.includes(auto[1])) fixed = !active.has(t.source)
    const sig = t.source.match(/^(crash|anr|rating|fill):(.+)$/)
    if (sig) {
      const trigger = Object.keys(komutaKey).find((k) => komutaKey[k] === sig[1])
      if (metric.includes(trigger)) fixed = !active.has(`${trigger}-${sig[2]}`)
    }
    if (!fixed) continue
    const history = [...(t.history ?? []), { what: 'Sorun düzeldi, otomatik kapandı', at: now }]
    await db(`tasks?id=eq.${t.id}`, 'PATCH', { status: 'done', history, updated_at: now }, 'return=minimal')
    n++
  }
  return n
}
