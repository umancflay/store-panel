// 1. aşama için ÖRNEK veriler. Gerçek veriler sonraki aşamalarda Supabase'den gelecek.
// Sayılar sabit bir tohumla üretilir, böylece her açılışta aynı görünür.

export type Platform = 'android' | 'ios'

export interface Game {
  id: string
  name: string
  genre: string
  platforms: Platform[]
  color: string
  goal?: number | null // aylık gelir hedefi (USD)
  icon?: string | null // mağaza ikonu
  installs?: number | null // Play'deki toplam indirme
  installsLabel?: string | null // ör. "1K+"
  hidden?: boolean // panelde gizli
}

export interface DailyRow {
  date: string
  gameId: string
  platform: Platform
  downloads: number
  adRevenue: number
  iapRevenue: number
  impressions: number
  requests: number
  matched: number
  // Mağaza bağlı değilse ya da o gün veri yoksa null
  crashRate: number | null
  anrRate: number | null
  rating: number | null
}

export const sampleGames: Game[] = [
  { id: 'salgin', name: 'Salgın', genre: 'Hastane yönetimi / strateji', platforms: ['android', 'ios'], color: '#FFFFFF' },
  { id: 'tasinma-kaosu', name: 'Taşınma Kaosu', genre: 'Co-op nakliyat', platforms: ['android', 'ios'], color: '#8FD3AE' },
  { id: 'dropshipping', name: 'Dropshipping', genre: 'İşletme simülasyonu', platforms: ['android'], color: '#E8C07A' },
]

// Şu an panelde kullanılan oyun listesi (örnek ya da Supabase'den gelen).
// Veri katmanı (lib/data.tsx) gerçek liste gelince setGames ile günceller.
let registry: Game[] = sampleGames
export function setGames(list: Game[]) {
  registry = list
}
export const gameById = (id: string) => registry.find((g) => g.id === id)

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

const DAYS = 60
const today = new Date()
today.setHours(0, 0, 0, 0)

export function isoDay(offset: number) {
  const d = new Date(today)
  d.setDate(d.getDate() - offset)
  return d.toISOString().slice(0, 10)
}

const profiles: Record<string, { dl: number; ecpm: number; iap: number; crash: number; rating: number }> = {
  'salgin:android': { dl: 820, ecpm: 6.4, iap: 38, crash: 0.9, rating: 4.4 },
  'salgin:ios': { dl: 310, ecpm: 11.2, iap: 52, crash: 0.4, rating: 4.6 },
  'tasinma-kaosu:android': { dl: 1240, ecpm: 4.1, iap: 14, crash: 1.6, rating: 4.1 },
  'tasinma-kaosu:ios': { dl: 390, ecpm: 8.7, iap: 21, crash: 0.6, rating: 4.3 },
  'dropshipping:android': { dl: 460, ecpm: 3.2, iap: 6, crash: 0.7, rating: 3.8 },
}

export const sampleDaily: DailyRow[] = (() => {
  const r = rng(42)
  const rows: DailyRow[] = []
  for (let i = DAYS - 1; i >= 0; i--) {
    const date = isoDay(i + 1) // dün ve öncesi
    const weekday = new Date(date).getDay()
    const weekend = weekday === 0 || weekday === 6 ? 1.18 : 1
    for (const g of sampleGames) {
      for (const p of g.platforms) {
        const pr = profiles[`${g.id}:${p}`]
        const trend = 1 + (DAYS - i) * 0.004
        const downloads = Math.round(pr.dl * weekend * trend * (0.85 + r() * 0.3))
        const impressions = Math.round(downloads * (9 + r() * 4))
        // Dropshipping'de son 5 günde eCPM düşüşü (sorun örneği)
        const ecpmDrop = g.id === 'dropshipping' && i < 5 ? 0.62 : 1
        const ecpm = pr.ecpm * ecpmDrop * (0.88 + r() * 0.24)
        const requests = Math.round(impressions / (0.82 + r() * 0.12))
        // Taşınma Kaosu Android'de son günlerde çökme artışı (sorun örneği)
        const crashSpike = g.id === 'tasinma-kaosu' && p === 'android' && i < 6 ? 1.9 : 1
        rows.push({
          date,
          gameId: g.id,
          platform: p,
          downloads,
          impressions,
          requests,
          matched: Math.round(requests * (g.id === 'dropshipping' && i < 5 ? 0.71 : 0.9 + r() * 0.07)),
          adRevenue: +((impressions / 1000) * ecpm).toFixed(2),
          iapRevenue: +(pr.iap * weekend * (0.6 + r() * 0.8)).toFixed(2),
          crashRate: +(pr.crash * crashSpike * (0.85 + r() * 0.3)).toFixed(2),
          anrRate: p === 'android' ? +(0.18 + r() * 0.22).toFixed(2) : 0,
          rating: +(pr.rating + (r() - 0.5) * 0.06).toFixed(2),
        })
      }
    }
  }
  return rows
})()

// ---------- AdMob kırılımları ----------

export interface AdUnit {
  id: string
  gameId: string
  platform: Platform
  name: string
  format: string
  impressions: number
  revenue: number
  ecpm: number
  ecpmPrev: number
  fillRate: number
  fillPrev: number
}

export const sampleAdUnits: AdUnit[] = (() => {
  const r = rng(7)
  const formats = ['Banner', 'Geçiş (Interstitial)', 'Ödüllü (Rewarded)', 'Uygulama açılışı'] as const
  const base = { Banner: 0.9, 'Geçiş (Interstitial)': 7.5, 'Ödüllü (Rewarded)': 12.4, 'Uygulama açılışı': 5.1 }
  const out: AdUnit[] = []
  for (const g of sampleGames)
    for (const p of g.platforms)
      for (const f of formats) {
        const mult = p === 'ios' ? 1.6 : 1
        const ecpmPrev = base[f] * mult * (0.85 + r() * 0.3)
        const bad = g.id === 'dropshipping' && f !== 'Banner'
        const ecpm = ecpmPrev * (bad ? 0.6 + r() * 0.1 : 0.93 + r() * 0.14)
        const impressions = Math.round((f === 'Banner' ? 90000 : 14000) * (0.6 + r() * 0.8) * (g.id === 'tasinma-kaosu' ? 1.4 : 1))
        const fillPrev = f === 'Banner' ? 96 + r() * 3 : 88 + r() * 8
        out.push({
          id: `ca-app-pub-xxx/${g.id}-${p}-${f.slice(0, 3).toLowerCase()}`,
          gameId: g.id,
          platform: p,
          name: `${g.name} ${p === 'ios' ? 'iOS' : 'Android'} – ${f.split(' ')[0]}`,
          format: f,
          impressions,
          ecpm: +ecpm.toFixed(2),
          ecpmPrev: +ecpmPrev.toFixed(2),
          revenue: +((impressions / 1000) * ecpm).toFixed(2),
          fillRate: +(bad ? fillPrev - 14 - r() * 6 : fillPrev - r() * 2).toFixed(1),
          fillPrev: +fillPrev.toFixed(1),
        })
      }
  return out
})()

export interface Country {
  code: string
  name: string
  revenue: number
  ecpm: number
  ecpmPrev: number
  impressions: number
}

export const sampleCountries: Country[] = [
  { code: 'US', name: 'ABD', revenue: 1840, ecpm: 14.2, ecpmPrev: 14.8, impressions: 129600 },
  { code: 'TR', name: 'Türkiye', revenue: 612, ecpm: 2.1, ecpmPrev: 2.0, impressions: 291400 },
  { code: 'DE', name: 'Almanya', revenue: 548, ecpm: 10.6, ecpmPrev: 11.1, impressions: 51700 },
  { code: 'BR', name: 'Brezilya', revenue: 401, ecpm: 2.9, ecpmPrev: 3.3, impressions: 138300 },
  { code: 'GB', name: 'Birleşik Krallık', revenue: 376, ecpm: 11.8, ecpmPrev: 12.0, impressions: 31900 },
  { code: 'JP', name: 'Japonya', revenue: 322, ecpm: 13.4, ecpmPrev: 9.8, impressions: 24000 },
  { code: 'MX', name: 'Meksika', revenue: 188, ecpm: 2.4, ecpmPrev: 2.6, impressions: 78300 },
  { code: 'IN', name: 'Hindistan', revenue: 97, ecpm: 0.7, ecpmPrev: 0.8, impressions: 138600 },
]

export const admobAdvice = [
  {
    title: 'Dropshipping: eCPM ve fill rate 5 gündür düşüyor',
    body: 'Geçiş ve ödüllü reklamlarda eCPM %38, fill rate %15 düştü. Mediation\'da sadece AdMob ağı açık görünüyor. AppLovin ve Unity Ads\'i bidding olarak ekle; tek ağa bağımlılık fill rate\'i bu kadar düşürür.',
    tag: 'Mediation',
  },
  {
    title: 'Taşınma Kaosu: ödüllü reklamı daha görünür yap',
    body: 'Ödüllü reklam en yüksek eCPM\'li birim ama gösterimi geçiş reklamının 1/3\'ü. Bölüm sonunda "2x ödül" butonu ekle. Bu, oyuncuyu rahatsız etmeden geliri artırır.',
    tag: 'Yerleşim',
  },
  {
    title: 'Salgın: geçiş reklamı sıklığını sınırla',
    body: 'Yorumlarda "çok reklam" şikayeti var. Geçiş reklamları arasına en az 90 saniye koy ve ilk 2 bölümde hiç gösterme. Unity tarafında son gösterim zamanını tutan basit bir sayaç yeter.',
    tag: 'Sıklık',
  },
]

// ---------- Uyarılar ----------

export interface Alert {
  id: number
  level: 'critical' | 'warning' | 'info'
  source: 'play' | 'app_store' | 'admob' | 'system'
  gameId: string | null
  title: string
  body: string
  howToFix: string[]
  unity?: string[]
  consoleUrl: string
  deadline: string | null
  createdAt: string
  status: 'open' | 'resolved'
}

export const alerts: Alert[] = [
  {
    id: 1,
    level: 'critical',
    source: 'play',
    gameId: 'tasinma-kaosu',
    title: 'Hedef API seviyesi gereksinimi: Android 15 (API 35)',
    body: 'Uygulamanız yeni hedef API seviyesi gereksinimini karşılamıyor. Son tarihten sonra yeni güncelleme yayınlayamazsınız.',
    howToFix: [
      'Unity\'de projeyi aç ve aşağıdaki Unity adımlarını uygula.',
      'Yeni bir AAB oluştur (File › Build Settings › Build App Bundle).',
      'Play Console › Taşınma Kaosu › Test ve yayınla › Üretim › Yeni sürüm oluştur.',
      'AAB\'yi yükle, sürüm notunu yaz ve incelemeye gönder.',
    ],
    unity: [
      'Edit › Project Settings › Player › Android sekmesi › Other Settings.',
      'Target API Level\'ı "API level 35" yap.',
      'Android SDK 35 yüklü değilse Unity Hub › Installs › Add modules\'dan Android SDK\'yı güncelle.',
    ],
    consoleUrl: 'https://play.google.com/console',
    deadline: isoDay(-9),
    createdAt: isoDay(2),
    status: 'open',
  },
  {
    id: 2,
    level: 'critical',
    source: 'play',
    gameId: 'salgin',
    title: 'Veri güvenliği formu SDK ile uyuşmuyor',
    body: 'Uygulamanızın reklam kimliği (Advertising ID) topladığı tespit edildi, ancak Veri güvenliği bölümünde bu belirtilmemiş.',
    howToFix: [
      'Play Console › Salgın › Politika ve programlar › Uygulama içeriği › Veri güvenliği.',
      '"Cihaz veya diğer kimlikler" kategorisini işaretle; amaç olarak "Reklam veya pazarlama"yı seç.',
      'AdMob için "veriler üçüncü tarafla paylaşılıyor" seçeneğini işaretle.',
      'Kaydet ve incelemeye gönder. Yeni build gerekmez.',
    ],
    consoleUrl: 'https://play.google.com/console',
    deadline: isoDay(-4),
    createdAt: isoDay(1),
    status: 'open',
  },
  {
    id: 3,
    level: 'warning',
    source: 'app_store',
    gameId: 'salgin',
    title: 'Build 1.4.2 reddedildi: Guideline 2.1 (Uygulama tamlığı)',
    body: 'İnceleme ekibi, açılışta "Bağlanıyor…" ekranında takıldığını bildirdi (iPad Air, iPadOS 18).',
    howToFix: [
      'App Store Connect › Salgın › App Review\'daki mesajı ve ekran görüntüsünü incele.',
      'Hatayı iPad simülatöründe yeniden oluştur.',
      'Düzelttikten sonra yeni build yükle ve Resolution Center\'dan ne değiştirdiğini kısaca yaz.',
    ],
    unity: [
      'Ağ isteğine zaman aşımı ekle: bağlantı 10 sn içinde gelmezse oyunu çevrimdışı modda başlat.',
      'Player Settings › iOS › Requires Persistent WiFi kapalı olsun.',
    ],
    consoleUrl: 'https://appstoreconnect.apple.com',
    deadline: null,
    createdAt: isoDay(1),
    status: 'open',
  },
  {
    id: 4,
    level: 'warning',
    source: 'admob',
    gameId: 'dropshipping',
    title: 'Reklam sunumu sınırlandı: geçersiz trafik şüphesi',
    body: 'Hesabınızdaki bazı reklam birimlerinde reklam sunumu geçici olarak sınırlandı.',
    howToFix: [
      'AdMob › Politika merkezi\'nde ilgili uygulamayı kontrol et.',
      'Kendi cihazlarını test cihazı olarak ekle: AdMob › Ayarlar › Test cihazları.',
      'Reklamların yanlışlıkla tıklanabilecek yerlerde (butonların hemen yanında) olmadığından emin ol.',
      'Sınırlama genelde 30 gün içinde kendiliğinden kalkar; ek işlem gerekmez.',
    ],
    unity: ['Geliştirme build\'lerinde test reklam birimi ID\'lerini kullan (Debug.isDebugBuild kontrolü).'],
    consoleUrl: 'https://apps.admob.com',
    deadline: null,
    createdAt: isoDay(3),
    status: 'open',
  },
  {
    id: 5,
    level: 'info',
    source: 'app_store',
    gameId: null,
    title: 'Hatırlatma: Privacy manifest (PrivacyInfo.xcprivacy) gerekli',
    body: 'Üçüncü taraf SDK\'lar için gizlilik bildirimi dosyası olmayan build\'ler uyarı alır.',
    howToFix: ['Google Mobile Ads Unity eklentisini son sürüme güncelle; manifest dosyasını kendisi ekler.'],
    unity: ['Assets › External Dependency Manager › iOS Resolver › Install Cocoapods ile pod\'ları yenile.'],
    consoleUrl: 'https://appstoreconnect.apple.com',
    deadline: null,
    createdAt: isoDay(5),
    status: 'open',
  },
  {
    id: 6,
    level: 'info',
    source: 'play',
    gameId: 'salgin',
    title: 'İçerik derecelendirme anketi güncellendi',
    body: 'IARC anketi yeni sorular içeriyor.',
    howToFix: ['Play Console › Uygulama içeriği › İçerik derecelendirmeleri › Anketi yeniden doldur.'],
    consoleUrl: 'https://play.google.com/console',
    deadline: null,
    createdAt: isoDay(9),
    status: 'resolved',
  },
]

// ---------- Yorumlar ----------

export type ReviewCategory = 'crash' | 'bug' | 'ads' | 'suggestion' | 'praise' | 'performance'

export const categoryLabels: Record<ReviewCategory, string> = {
  crash: 'Çökme',
  bug: 'Hata',
  ads: 'Reklam şikayeti',
  suggestion: 'Öneri',
  praise: 'Övgü',
  performance: 'Performans',
}

export interface Review {
  id: number
  gameId: string
  platform: Platform
  author: string
  rating: number
  body: string
  date: string
  category: ReviewCategory | null
  version: string
  title?: string | null
  reply?: string | null
}

export const reviews: Review[] = [
  { id: 1, gameId: 'tasinma-kaosu', platform: 'android', author: 'Emre K.', rating: 1, body: 'Son güncellemeden sonra arkadaşımla oyuna girince oyun kapanıyor. Önceden çok iyiydi.', date: isoDay(1), category: 'crash', version: '2.3.0' },
  { id: 2, gameId: 'tasinma-kaosu', platform: 'android', author: 'Selin', rating: 2, body: 'Co-op lobisinde çöküyor, 3 kere denedim.', date: isoDay(1), category: 'crash', version: '2.3.0' },
  { id: 3, gameId: 'tasinma-kaosu', platform: 'android', author: 'MertGamer', rating: 1, body: 'Samsung A54 te açılır açılmaz kapanıyor.', date: isoDay(2), category: 'crash', version: '2.3.0' },
  { id: 4, gameId: 'salgin', platform: 'ios', author: 'drAyse', rating: 5, body: 'Hastane yönetimi çok iyi düşünülmüş, salgın dalgaları gerçekten heyecanlı. Daha fazla bölüm gelsin!', date: isoDay(1), category: 'praise', version: '1.4.1' },
  { id: 5, gameId: 'salgin', platform: 'android', author: 'Burak T.', rating: 3, body: 'Oyun güzel ama her bölümden sonra reklam çıkıyor, çok fazla.', date: isoDay(2), category: 'ads', version: '1.4.1' },
  { id: 6, gameId: 'salgin', platform: 'android', author: 'Zeynep', rating: 4, body: 'Doktorları eğitme özelliği olsa harika olur.', date: isoDay(3), category: 'suggestion', version: '1.4.1' },
  { id: 7, gameId: 'dropshipping', platform: 'android', author: 'ticaretci42', rating: 2, body: 'Siparişler bazen kayboluyor, para düşüyor ama ürün gelmiyor.', date: isoDay(2), category: 'bug', version: '0.9.4' },
  { id: 8, gameId: 'dropshipping', platform: 'android', author: 'Can', rating: 4, body: 'Fikir çok iyi. Depo genişletme gelsin.', date: isoDay(4), category: 'suggestion', version: '0.9.4' },
  { id: 9, gameId: 'tasinma-kaosu', platform: 'ios', author: 'Melis', rating: 5, body: 'Kardeşimle oynuyoruz, kahkahadan öldük 😂', date: isoDay(2), category: 'praise', version: '2.3.0' },
  { id: 10, gameId: 'salgin', platform: 'ios', author: 'Hakan', rating: 2, body: 'iPad\'de bağlanıyor ekranında kalıyor.', date: isoDay(3), category: 'bug', version: '1.4.1' },
  { id: 11, gameId: 'tasinma-kaosu', platform: 'android', author: 'Oğuz', rating: 3, body: 'Eski telefonlarda çok kasıyor, grafik ayarı olsa iyi olur.', date: isoDay(3), category: 'performance', version: '2.3.0' },
  { id: 12, gameId: 'salgin', platform: 'android', author: 'Elif', rating: 5, body: 'Türk yapımı olduğunu görünce daha çok sevdim. Tebrikler!', date: isoDay(4), category: 'praise', version: '1.4.1' },
  { id: 13, gameId: 'dropshipping', platform: 'android', author: 'Kaan', rating: 1, body: 'Ödüllü reklamı izledim ama ödül gelmedi.', date: isoDay(1), category: 'ads', version: '0.9.4' },
  { id: 14, gameId: 'tasinma-kaosu', platform: 'android', author: 'Deniz', rating: 1, body: 'Online modda sürekli kapanıyor, düzeltin lütfen.', date: isoDay(1), category: 'crash', version: '2.3.0' },
  { id: 15, gameId: 'salgin', platform: 'ios', author: 'Nurcan', rating: 4, body: 'Karanlık mod eklenebilir mi?', date: isoDay(5), category: 'suggestion', version: '1.4.1' },
  { id: 16, gameId: 'tasinma-kaosu', platform: 'ios', author: 'Batu', rating: 4, body: 'Yeni haritalar çok güzel, kamyon fiziği biraz garip.', date: isoDay(5), category: 'bug', version: '2.3.0' },
]

export const reviewClusters = [
  { title: 'Co-op modunda çökme (Taşınma Kaosu 2.3.0, Android)', count: 4, category: 'crash' as ReviewCategory, hint: 'Son güncellemeyle başlamış. Crash oranı da aynı günlerde 2 katına çıkmış; muhtemelen aynı sorun.' },
  { title: 'Reklam sıklığı / ödül gelmiyor', count: 2, category: 'ads' as ReviewCategory, hint: 'Salgın\'da geçiş reklamı sıklığı, Dropshipping\'de ödüllü reklam callback\'i kontrol edilmeli.' },
  { title: 'iPad\'de "Bağlanıyor" ekranında kalma', count: 1, category: 'bug' as ReviewCategory, hint: 'App Store red sebebiyle aynı. Önce bunu düzelt.' },
]

export function sampleReplyDraft(r: Review) {
  const name = r.author.split(' ')[0]
  if (r.category === 'crash' || r.category === 'bug')
    return `Merhaba ${name}, yaşadığın sorun için çok üzgünüz. Sorunu tespit ettik ve bir sonraki güncellemede düzelteceğiz. Cihaz modelini destek adresimize yazarsan daha hızlı yardımcı olabiliriz. Sabrın için teşekkürler!`
  if (r.category === 'ads')
    return `Merhaba ${name}, geri bildirimin için teşekkürler. Reklam sıklığını azaltan bir güncelleme üzerinde çalışıyoruz. Oyunu oynadığın için teşekkür ederiz!`
  if (r.category === 'suggestion')
    return `Merhaba ${name}, harika bir öneri! Not aldık, ileriki güncellemeler için değerlendireceğiz. Teşekkürler!`
  return `Merhaba ${name}, güzel sözlerin için çok teşekkür ederiz! Yeni içerikler yolda, takipte kal 🙌`
}

// ---------- Build ve inceleme durumu ----------

export interface Build {
  gameId: string
  platform: Platform
  version: string
  build: string
  status: string
  review: string
  date: string
}

export const builds: Build[] = [
  { gameId: 'salgin', platform: 'android' as Platform, version: '1.4.1', build: '57', status: 'Yayında', review: 'Onaylandı', date: isoDay(8) },
  { gameId: 'salgin', platform: 'ios' as Platform, version: '1.4.2', build: '61', status: 'Reddedildi', review: 'Reddedildi', date: isoDay(1) },
  { gameId: 'tasinma-kaosu', platform: 'android' as Platform, version: '2.3.0', build: '112', status: 'Yayında', review: 'Onaylandı', date: isoDay(6) },
  { gameId: 'tasinma-kaosu', platform: 'ios' as Platform, version: '2.3.0', build: '113', status: 'İncelemede', review: 'İnceleniyor', date: isoDay(2) },
  { gameId: 'dropshipping', platform: 'android' as Platform, version: '0.9.4', build: '23', status: 'Yayında', review: 'Onaylandı', date: isoDay(12) },
]

// ---------- Claude: günün özeti ----------

export const dailySummary = {
  headline: 'Gelir artışta, ama Taşınma Kaosu Android\'deki çökmeler acil.',
  changes: [
    'Toplam gelir önceki döneme göre arttı; artışın çoğu Salgın iOS\'tan (ödüllü reklamlar).',
    'Taşınma Kaosu Android\'de çökme oranı 2.3.0 sürümünden sonra %1,6\'dan %3\'e çıktı.',
    'Dropshipping\'de eCPM 5 gündür düşüyor, fill rate %90\'dan %71\'e indi.',
  ],
  attention: [
    'Taşınma Kaosu için Play hedef API son tarihi yaklaşıyor (kritik).',
    'Salgın iOS 1.4.2 reddedildi; iPad bağlantı sorunu yorumlarda da var.',
  ],
  actions: [
    'Co-op lobisindeki çökmeyi düzelten 2.3.1 hotfix\'i çıkar, aynı build\'de API 35\'e geç.',
    'Dropshipping mediation\'ına AppLovin ve Unity Ads ekle.',
    'Salgın\'da ağ zaman aşımı ekleyip iOS build\'i yeniden gönder.',
  ],
}

// ---------- Reklam planları ----------

export interface AdPlan {
  gameId: string
  audience: { age: string; interests: string[]; similarGames: string[] }
  countries: { tier: string; list: string[]; why: string }[]
  budget: { daily: number; days: number; stopRule: string; scaleRule: string }
  creatives: { type: 'Video' | 'Görsel'; idea: string }[]
  platforms: { name: string; fit: 'Yüksek' | 'Orta' | 'Düşük'; why: string }[]
}

export const adPlans: AdPlan[] = [
  {
    gameId: 'salgin',
    audience: {
      age: '25–44',
      interests: ['Strateji oyunları', 'Simülasyon', 'Sağlık / tıp dizileri', 'Yönetim oyunları'],
      similarGames: ['Two Point Hospital', 'Plague Inc.', 'Theme Hospital', 'Hospital Empire'],
    },
    countries: [
      { tier: '1. Test', list: ['Türkiye', 'Brezilya', 'Meksika'], why: 'Kurulum başı maliyet düşük; kreatifleri ucuza test etmek için.' },
      { tier: '2. Ölçek', list: ['ABD', 'Almanya', 'Birleşik Krallık'], why: 'iOS eCPM\'i yüksek; test kazanan kreatiflerle girilmeli.' },
      { tier: '3. Sonra', list: ['Japonya', 'Kore'], why: 'Strateji türü güçlü ama yerelleştirme gerekir.' },
    ],
    budget: { daily: 20, days: 7, stopRule: 'Kurulum başı maliyet 3 gün üst üste $0,60\'ı geçerse durdur.', scaleRule: '1. gün tutma (D1) %35\'in üstündeyse bütçeyi %30 artır.' },
    creatives: [
      { type: 'Video', idea: '15 sn: Boş koridor → salgın uyarısı → bekleme salonu taşar → oyuncu doğru odaları açar, sayaç yeşile döner. Son kare: "Hastaneni kurtarabilir misin?"' },
      { type: 'Video', idea: 'Başarısızlık videosu: Yanlış yerleşim yüzünden kuyruk patlar. "Senden daha iyi yönetebilir misin?" ile biter.' },
      { type: 'Görsel', idea: 'Kuşbakışı hastane planı, kırmızı enfeksiyon bölgeleri; büyük yazı: "%87 doluluk. Karar senin."' },
    ],
    platforms: [
      { name: 'Meta', fit: 'Yüksek', why: 'Yaş ve ilgi alanı hedeflemesi strateji kitlesi için çok iyi.' },
      { name: 'Apple Ads', fit: 'Yüksek', why: '"hospital game", "plague" aramaları yüksek niyetli.' },
      { name: 'Google Ads', fit: 'Orta', why: 'App kampanyası otomatik; Android hacmi için iyi.' },
      { name: 'TikTok', fit: 'Düşük', why: 'Yavaş tempolu strateji kreatifleri TikTok\'ta zor tutuyor.' },
    ],
  },
  {
    gameId: 'tasinma-kaosu',
    audience: {
      age: '16–30',
      interests: ['Co-op oyunlar', 'Parti oyunları', 'Arkadaşlarla oyun', 'Komik videolar'],
      similarGames: ['Moving Out', 'Overcooked', 'Unrailed!', 'PHOGS!'],
    },
    countries: [
      { tier: '1. Test', list: ['Türkiye', 'Brezilya', 'Endonezya'], why: 'Co-op/parti türü genç kitlede güçlü, maliyet düşük.' },
      { tier: '2. Ölçek', list: ['ABD', 'Kanada', 'Avustralya'], why: 'iOS kullanıcı oranı yüksek.' },
      { tier: '3. Sonra', list: ['Almanya', 'Fransa'], why: 'Önce çökme sorunu düzelmeli; kötü yorumlar dönüşümü düşürür.' },
    ],
    budget: { daily: 15, days: 7, stopRule: 'Önce 2.3.1 hotfix yayınlanmalı. Kurulum başı maliyet $0,40\'ı geçerse durdur.', scaleRule: 'Video izlenme oranı %25\'in üstündeyse aynı kreatiften 2 varyasyon daha çıkar.' },
    creatives: [
      { type: 'Video', idea: 'Gerçek oyun kaydı: İki oyuncu kanepeyi kapıdan sokamıyor, cam kırılıyor. Altta sesli tepki. "Arkadaşını etiketle."' },
      { type: 'Video', idea: 'Bölünmüş ekran: "Sen taşınırken" ve "arkadaşın taşınırken". Kaos farkını göster.' },
      { type: 'Görsel', idea: 'Kamyondan uçan buzdolabı, şaşkın karakterler: "Taşınmak hiç bu kadar kaotik olmamıştı."' },
    ],
    platforms: [
      { name: 'TikTok', fit: 'Yüksek', why: 'Komik co-op anları TikTok\'ta organik gibi duruyor.' },
      { name: 'Meta', fit: 'Yüksek', why: 'Reels yerleşimi aynı kreatiflerle çalışır.' },
      { name: 'Google Ads', fit: 'Orta', why: 'YouTube Shorts dahil; Android hacmi için.' },
      { name: 'Apple Ads', fit: 'Orta', why: '"co-op game" aramaları dar ama ucuz.' },
    ],
  },
  {
    gameId: 'dropshipping',
    audience: {
      age: '18–34',
      interests: ['E-ticaret', 'Girişimcilik', 'İdle / tycoon oyunlar', 'Para kazanma'],
      similarGames: ['Idle Miner Tycoon', 'Supermarket Simulator', 'Business Empire'],
    },
    countries: [
      { tier: '1. Test', list: ['Türkiye', 'Hindistan', 'Filipinler'], why: 'Ucuz kurulum; tycoon türü burada güçlü.' },
      { tier: '2. Ölçek', list: ['ABD', 'Birleşik Krallık'], why: 'Sadece Android olduğu için Google Ads ile.' },
      { tier: '3. Sonra', list: ['Almanya'], why: 'iOS sürümü çıkınca.' },
    ],
    budget: { daily: 10, days: 5, stopRule: 'Önce mediation düzelmeli; eCPM düşükken reklamdan kâr etmek zor. Kurulum başı maliyet $0,25\'i geçerse durdur.', scaleRule: 'Kullanıcı başı reklam geliri (ARPDAU) kurulum maliyetinin üstüne çıkarsa ölçekle.' },
    creatives: [
      { type: 'Video', idea: '"0 TL\'den ilk 1 milyona" hızlandırılmış ilerleme; depo dolar, kargo kamyonları çoğalır.' },
      { type: 'Görsel', idea: 'Telefonda sipariş bildirimleri yağıyor: "Uyurken bile satış yap."' },
    ],
    platforms: [
      { name: 'Google Ads', fit: 'Yüksek', why: 'Sadece Android var; App kampanyası en direkt yol.' },
      { name: 'TikTok', fit: 'Orta', why: '"Para kazanma" teması TikTok\'ta ilgi görüyor.' },
      { name: 'Meta', fit: 'Orta', why: 'Girişimcilik ilgi alanı hedeflenebilir.' },
      { name: 'Apple Ads', fit: 'Düşük', why: 'iOS sürümü yok.' },
    ],
  },
]

export interface Recommendation {
  id: number
  kind: 'ad_campaign' | 'mediation' | 'budget_change'
  gameId: string
  title: string
  detail: string
  cost: number | null
  status: 'pending' | 'approved' | 'rejected'
}

export const recommendations: Recommendation[] = [
  { id: 1, kind: 'ad_campaign', gameId: 'salgin', title: 'Meta test kampanyası başlat', detail: 'Türkiye, Brezilya, Meksika · 25–44 yaş · 3 video kreatif · 7 gün', cost: 140, status: 'pending' },
  { id: 2, kind: 'ad_campaign', gameId: 'salgin', title: 'Apple Ads arama kampanyası', detail: 'ABD · "hospital game", "plague", "hospital tycoon" anahtar kelimeleri · $10/gün', cost: 70, status: 'pending' },
  { id: 3, kind: 'mediation', gameId: 'dropshipping', title: 'Mediation\'a AppLovin ve Unity Ads ekle', detail: 'Geçiş ve ödüllü birimlerde bidding. Para harcamaz; AdMob ayarını değiştirir.', cost: null, status: 'pending' },
  { id: 4, kind: 'ad_campaign', gameId: 'tasinma-kaosu', title: 'TikTok test kampanyası (hotfix sonrası)', detail: 'Türkiye, Brezilya, Endonezya · 16–30 yaş · 2 video · 7 gün', cost: 105, status: 'pending' },
]

export const adAccounts = [
  { id: 'google_ads', name: 'Google Ads', note: 'Geliştirici token onayı bekleniyor' },
  { id: 'apple_ads', name: 'Apple Ads', note: 'Sonraki aşamada' },
  { id: 'meta', name: 'Meta', note: 'Sonraki aşamada' },
  { id: 'tiktok', name: 'TikTok', note: 'Sonraki aşamada' },
]
