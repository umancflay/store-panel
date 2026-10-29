// Mağaza sayfası koçu (ASO). Senin Play sayfanı API'den okur (değiştirmez), aynı türde en çok indirilen oyunlarla
// karşılaştırır, kurallarla "ne eksik" der; kendi modelin başlık/kısa açıklama/giriş paragrafı önerir ve sürüm notu yazar.
// Hiçbir öneri Play'e otomatik yazılmaz; kullanıcı panelden kopyalayıp kendisi koyar.

import { saToken } from '../play.mjs'
import { MODEL } from './llm.mjs'

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications'
const OLLAMA = process.env.OLLAMA_URL || 'http://127.0.0.1:11434'
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept-Language': 'en-US,en;q=0.9' }

// Play politikası: başlıkta ve ikonda performans/fiyat/sıralama iddiası yasak
// (Türkçe harfler için \b yetmez: harf olmayan sınırlar kullanılır, metin Türkçe küçük harfe çevrilir)
const PROMO_RE = /(?<!\p{L})(best|#1|no\.? ?1|top|free|sale|discount|new|hot|en iyi|bedava|ücretsiz|indirim|yeni|bir numara)(?!\p{L})|[🔥⭐💥🎉🏆✨]/u
export const PROMO = { test: (s) => PROMO_RE.test(String(s).toLocaleLowerCase('tr')) }
const LIMITS = { title: 30, short: 80, full: 4000, notes: 500 }

// Senin sayfan: düzenleme açılır, okunur, kaydetmeden silinir
export async function readListing(pkg, { fetchImpl = fetch, tokenImpl = saToken } = {}) {
  const call = async (url, method = 'GET') => {
    const res = await fetchImpl(url, { method, headers: { Authorization: `Bearer ${await tokenImpl()}` } })
    const text = await res.text()
    if (!res.ok) throw new Error(`Play mağaza sayfası okunamadı (${res.status}): ${text.slice(0, 200)}`)
    return text ? JSON.parse(text) : {}
  }
  const edit = await call(`${API}/${pkg}/edits`, 'POST')
  const base = `${API}/${pkg}/edits/${edit.id}`
  try {
    const details = await call(`${base}/details`)
    const lang = details.defaultLanguage || 'en-US'
    const listings = (await call(`${base}/listings`)).listings ?? []
    const count = async (type) => ((await call(`${base}/listings/${lang}/${type}`).catch(() => ({}))).images ?? []).length
    const images = {
      phone: await count('phoneScreenshots'),
      tablet7: await count('sevenInchScreenshots'),
      tablet10: await count('tenInchScreenshots'),
      feature: await count('featureGraphic'),
    }
    return { defaultLanguage: lang, listings, images }
  } finally {
    await call(base, 'DELETE').catch(() => {})
  }
}

// Herkese açık Play araması: sıralamaya göre paket adları
export function parseSearch(html, exclude = []) {
  const seen = new Set(exclude)
  const out = []
  for (const m of html.matchAll(/\/store\/apps\/details\?id=([A-Za-z0-9._]+)/g)) {
    if (seen.has(m[1])) continue
    seen.add(m[1])
    out.push(m[1])
  }
  return out
}

// Rakibin herkese açık sayfası
export function parseStorePage(html, pkg) {
  const title = (html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ?? '').replace(/ - Apps on Google Play$/, '').replace(/&amp;/g, '&')
  const desc = (html.match(/data-g-id="description"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  const idx = [...html.matchAll(/data-screenshot-index="(\d+)"/g)].map((m) => Number(m[1]))
  const inst = html.match(/\["([\d,]+\+)",(\d+),(\d+),"([^"]+)"\]/)
  return {
    pkg, title, titleLength: title.length,
    descLength: desc.length, intro: desc.slice(0, 167).trim(),
    screenshots: idx.length ? Math.max(...idx) + 1 : 0,
    video: /youtube\.com\/embed\//.test(html),
    installs: inst ? Number(inst[3]) : null, installsLabel: inst?.[4] ?? null,
  }
}

export async function competitors(query, exclude, { fetchImpl = fetch, limit = 5 } = {}) {
  const res = await fetchImpl(`https://play.google.com/store/search?q=${encodeURIComponent(query)}&c=apps&hl=en&gl=US`, { headers: UA })
  if (!res.ok) return []
  const out = []
  for (const pkg of parseSearch(await res.text(), exclude).slice(0, limit)) {
    const page = await fetchImpl(`https://play.google.com/store/apps/details?id=${pkg}&hl=en&gl=US`, { headers: UA }).catch(() => null)
    if (page?.ok) out.push(parseStorePage(await page.text(), pkg))
  }
  return out
}

const median = (list) => {
  const v = list.filter((x) => x != null).sort((a, b) => a - b)
  return v.length ? v[Math.floor(v.length / 2)] : null
}
const find = (id, severity, title, detail, fix) => ({ id, severity, title, detail, fix })

// Kurallar: Play sınırları + politika + rakiplerin ortası
export function asoRules({ listing, images, competitors: rivals = [], languages = [], topCountries = [] }) {
  const out = []
  const title = listing?.title ?? ''
  const short = listing?.shortDescription ?? ''
  const full = listing?.fullDescription ?? ''
  const shots = median(rivals.map((r) => r.screenshots))
  const descLen = median(rivals.map((r) => r.descLength))
  const videoShare = rivals.length ? rivals.filter((r) => r.video).length / rivals.length : null

  if (PROMO.test(title))
    out.push(find('title-promo', 'block', 'Başlıkta yasak kelime ya da emoji var', `"${title}" başlığında "en iyi, #1, ücretsiz, yeni" gibi bir iddia ya da emoji var. Play bunu politika ihlali sayıp güncellemeni reddedebilir.`,
      ['Play Console › Mağazada varlık › Ana mağaza girişi › Uygulama adı.', 'İddia kelimesini ve emojiyi çıkar; oyunun adı + türü yeterli (ör. "Salgın: Zombi Hayatta Kalma").']))
  if (title.length && title.length < 20)
    out.push(find('title-short', 'warn', `Başlık kısa (${title.length}/30 karakter)`, 'Başlık aramada en güçlü yer. Oyunun adının yanına türünü ya da ana anahtar kelimeyi ekleyebilirsin.',
      ['Ad + iki nokta + tür kalıbını dene: "Oyun Adı: Idle Tycoon".', 'Rakiplerin başlıklarına aşağıdaki listeden bak.']))
  if (short.length < 50)
    out.push(find('short-weak', 'warn', `Kısa açıklama zayıf (${short.length}/80 karakter)`, 'Kısa açıklama sayfa açılınca ilk görülen cümle ve aramada da sayılır. 80 karakterin çoğunu kullan.',
      ['Oyunun ne olduğunu ve neden eğlenceli olduğunu tek cümlede söyle.', 'Ana anahtar kelimeyi bir kez geçir; büyük harf ve emoji yağdırma.']))
  if (/[🔥⭐💥🎉🏆✨]/u.test(short))
    out.push(find('short-emoji', 'info', 'Kısa açıklamada emoji var', 'Play kısa açıklamada emoji ve tümü büyük harfi önermiyor; bazı ülkelerde öne çıkarılma şansını düşürür.', ['Emojileri çıkar ya da en fazla bire indir.']))
  if (full.length < 1000 || (descLen && full.length < descLen * 0.4))
    out.push(find('full-short', 'warn', `Uzun açıklama kısa (${full.length} karakter${descLen ? `, rakiplerde ortalama ${descLen}` : ''})`, 'Play aramada uzun açıklamadaki kelimeleri de okur. Kısa açıklama aramada görünmeni zorlaştırır.',
      ['İlk paragraf: oyunun kancası (2–3 cümle).', 'Sonra madde madde özellikler (5–8 madde).', 'Ana anahtar kelimeyi metinde 3–5 kez doğal şekilde geçir.']))
  if (images.phone < 4 || (shots && images.phone < Math.min(8, shots) - 2))
    out.push(find('few-shots', images.phone < 2 ? 'block' : 'warn', `Az ekran görüntüsü (${images.phone}${shots ? `, rakiplerde ${shots}` : ''})`, 'Oyuncuların çoğu sadece ilk 2–3 görsele bakıp karar veriyor. Play telefon için en fazla 8 görsel alıyor.',
      ['En heyecanlı oyun anını ilk görsele koy, üstüne 3–5 kelimelik büyük yazı ekle.', 'Toplam 6–8 görsel: her biri tek bir özelliği anlatsın.', 'Dikey oyunsa 1080×1920, yataysa 1920×1080 kullan.']))
  if (!images.feature)
    out.push(find('no-feature', 'block', 'Öne çıkan görsel yok', 'Öne çıkan görsel (1024×500) olmadan Play seni hiçbir listede öne çıkarmaz.', ['Play Console › Ana mağaza girişi › Öne çıkan görsel: 1024×500 PNG/JPG yükle.']))
  if (!listing?.video && (videoShare == null || videoShare >= 0.4))
    out.push(find('no-video', 'warn', `Tanıtım videosu yok${videoShare != null ? ` (rakiplerin %${Math.round(videoShare * 100)}'inde var)` : ''}`, 'Video ekranın en üstünde oynar; oyun türlerinde indirmeyi belirgin artırır.',
      ['15–30 saniyelik oyun içi kayıt yap (ilk 5 saniye en iyi an).', 'YouTube\'a "liste dışı" yükle, linki Play Console › Ana mağaza girişi › Video\'ya yapıştır.']))
  if (!images.tablet7 && !images.tablet10)
    out.push(find('no-tablet', 'info', 'Tablet ekran görüntüsü yok', 'Tablet görselleri olmadan Play oyunu tablet listelerinde öne çıkarmaz.', ['Telefon görsellerini 16:9 tablet boyutunda da dışa aktarıp 7" ve 10" bölümlerine yükle.']))
  const missing = topCountries.filter((c) => !languages.some((l) => l.toLowerCase().startsWith(c.lang)))
  if (missing.length)
    out.push(find('languages', 'info', `Eksik dil: ${missing.map((c) => c.name).join(', ')}`, 'Gelirin geldiği ülkelerin dilinde mağaza sayfası olmayınca o ülkelerde aramada geride kalırsın.',
      ['Play Console › Mağazada varlık › Mağaza girişleri › Çeviri ekle.', 'Aşağıdaki önerileri o dile çevirip yapıştırabilirsin.']))
  const order = { block: 0, warn: 1, info: 2 }
  return out.sort((a, b) => order[a.severity] - order[b.severity])
}

async function generate(prompt, system, { fetchImpl = fetch, timeoutMs = 300000, json = true } = {}) {
  let timer
  try {
    const res = await Promise.race([
      fetchImpl(`${OLLAMA}/api/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, system, prompt, stream: false, ...(json ? { format: 'json' } : {}), options: { temperature: 0.6, num_ctx: 8192 } }),
      }),
      new Promise((_, rej) => (timer = setTimeout(() => rej(new Error('zaman aşımı')), timeoutMs))),
    ])
    if (!res.ok) return null
    const text = String((await res.json()).response ?? '').trim()
    return json ? JSON.parse(text) : text
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const clean = (list, max) => [...new Set((Array.isArray(list) ? list : []).map((s) => String(s).trim()).filter((s) => s && s.length <= max && !PROMO.test(s)))].slice(0, 3)

// Model önerileri, sınırlara ve politikaya uymayan atılır
export async function suggest({ listing, rivals, language, fetchImpl }) {
  const out = await generate([
    `Dil: ${language}. Önerileri bu dilde yaz.`,
    `Şu anki başlık: ${listing?.title ?? ''}`,
    `Şu anki kısa açıklama: ${listing?.shortDescription ?? ''}`,
    `Şu anki açıklamanın başı: ${(listing?.fullDescription ?? '').slice(0, 600)}`,
    `En çok indirilen benzer oyunların başlıkları: ${rivals.map((r) => r.title).join(' | ')}`,
    `Onların açıklama girişleri: ${rivals.slice(0, 3).map((r) => r.intro).join(' | ')}`,
    'JSON döndür: {"titles": [3 başlık, her biri en fazla 30 karakter, oyunun adı korunur], "shorts": [3 kısa açıklama, her biri en fazla 80 karakter], "intro": "uzun açıklama için 2-3 cümlelik giriş paragrafı, en fazla 400 karakter"}',
  ].join('\n'), 'Sen mobil oyunlar için Google Play mağaza sayfası (ASO) uzmanısın. "best, #1, free, new, top" gibi iddia kelimeleri ve emoji kullanma. Oyunun adını değiştirme. Abartma, oyunda olmayan özellik uydurma.', { fetchImpl })
  if (!out) return null
  // Başlık önerisi oyunun adını (mevcut başlığın ilk kelimesi) içermeli; mevcut metni tekrar etmemeli
  const name = (listing?.title ?? '').split(/[:\-–|]/)[0].trim().toLocaleLowerCase('tr')
  const same = (a, b) => a.toLocaleLowerCase('tr') === String(b ?? '').trim().toLocaleLowerCase('tr')
  const titles = clean(out.titles, LIMITS.title).filter((t) => (!name || t.toLocaleLowerCase('tr').includes(name)) && !same(t, listing?.title))
  const shorts = clean(out.shorts, LIMITS.short).filter((s) => !same(s, listing?.shortDescription))
  const intro = typeof out.intro === 'string' && out.intro.length <= 600 && !PROMO.test(out.intro) ? out.intro.trim() : null
  return titles.length || shorts.length || intro ? { titles, shorts, intro } : null
}

// Sürüm notu ("Yenilikler"): kullanıcının maddelerinden Türkçe + İngilizce, her biri en fazla 500 karakter
export async function whatsNew(bullets, { fetchImpl } = {}) {
  const items = String(bullets).split('\n').map((s) => s.replace(/^[-•*\s]+/, '').trim()).filter(Boolean)
  const fallback = { tr: items.map((s) => `• ${s}`).join('\n').slice(0, LIMITS.notes), en: null, ai: false }
  if (!items.length) return fallback
  const out = await generate([
    'Bu sürümdeki değişiklikler:', ...items.map((s) => `- ${s}`), '',
    'JSON döndür: {"tr": "Türkçe Yenilikler metni", "en": "English what\'s new text"}. Her biri en fazla 450 karakter, kısa maddeler, samimi ve heyecanlı ama abartısız. Listede olmayan değişiklik ekleme.',
  ].join('\n'), 'Sen mobil oyunlar için Google Play "Yenilikler" metni yazan bir editörsün.', { fetchImpl })
  const ok = (s) => typeof s === 'string' && s.trim().length >= 10 && s.length <= LIMITS.notes
  return out && ok(out.tr) ? { tr: out.tr.trim(), en: ok(out.en) ? out.en.trim() : null, ai: true } : fallback
}
