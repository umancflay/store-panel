// Tasarım rehberi: türündeki popüler oyunların Play Store görsellerine bakar (ikon + ekran görüntüleri indirilir,
// Claude görüntülere bakar), tasarım dilini çıkarır ve senin oyunun için ChatGPT'ye yapıştırılacak hazır görsel promptları yazar.
// Görsel üretmez; promptları sen ChatGPT'de (aboneliğinle) kullanırsın. app_settings.design_guides › items[oyun].

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { db } from './db.mjs'
import { parse, runClaude } from './ai.mjs'
import { parseSearch, parseStorePage } from './expert/aso.mjs'
import { profileText, profiles } from './gameprofile.mjs'

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept-Language': 'en-US,en;q=0.9' }
const MAX_REFS = 5
const SHOTS_PER_REF = 3

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['references', 'style', 'doThis', 'avoid', 'prompts'],
  properties: {
    references: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['title', 'notes'], properties: { title: { type: 'string' }, notes: { type: 'string' } } },
    },
    style: {
      type: 'object',
      additionalProperties: false,
      required: ['colors', 'typography', 'layout', 'captions', 'characters', 'icon'],
      properties: { colors: { type: 'string' }, typography: { type: 'string' }, layout: { type: 'string' }, captions: { type: 'string' }, characters: { type: 'string' }, icon: { type: 'string' } },
    },
    doThis: { type: 'array', items: { type: 'string' } },
    avoid: { type: 'array', items: { type: 'string' } },
    prompts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'title', 'size', 'prompt', 'tip'],
        properties: {
          kind: { type: 'string', enum: ['feature', 'screenshot', 'poster', 'icon', 'background'] },
          title: { type: 'string' },
          size: { type: 'string' },
          prompt: { type: 'string' },
          tip: { type: 'string' },
        },
      },
    },
  },
}

// Sayfadaki ekran görüntüsü bağlantıları (sırayla); boyut parametresi küçültülür
export function screenshotUrls(html) {
  const out = []
  for (const m of html.matchAll(/<img[^>]*src="(https:\/\/play-lh\.googleusercontent\.com\/[^"=]+)[^"]*"[^>]*alt="Screenshot image"/g)) {
    if (!out.includes(m[1])) out.push(m[1])
  }
  return out
}
export const iconUrl = (html) => html.match(/<meta property="og:image" content="(https:\/\/play-lh\.googleusercontent\.com\/[^"=]+)/)?.[1] ?? null

async function setting(key) {
  try {
    return (await db(`app_settings?select=value&key=eq.${key}`))[0]?.value ?? null
  } catch {
    return null
  }
}
async function patchGuide(gameId, patch) {
  const cur = (await setting('design_guides')) ?? { items: {} }
  const items = { ...(cur.items ?? {}), [gameId]: { ...(cur.items?.[gameId] ?? {}), ...patch, updatedAt: new Date().toISOString() } }
  await db('app_settings?on_conflict=key', 'POST', { key: 'design_guides', value: { items }, updated_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal')
}

export async function guidesDue() {
  return Object.values((await setting('design_guides'))?.items ?? {}).some((g) => g.status === 'requested')
}

async function get(url, bin = false) {
  const res = await fetch(url, { headers: UA })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return bin ? Buffer.from(await res.arrayBuffer()) : res.text()
}

// Örnek oyunlar: panelde yazılan adlar/paketler, yoksa türüyle Play araması
async function pickRefs(game, refsText, ownPkg) {
  const asked = String(refsText ?? '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
  const pkgs = []
  for (const a of asked) {
    if (/^[a-z][\w]*(\.[\w]+)+$/i.test(a)) pkgs.push(a)
    else {
      const found = parseSearch(await get(`https://play.google.com/store/search?q=${encodeURIComponent(a)}&c=apps&hl=en&gl=US`).catch(() => ''), [ownPkg])
      if (found[0]) pkgs.push(found[0])
    }
  }
  if (pkgs.length < 3) {
    const q = `${game.genre || game.name} game`
    pkgs.push(...parseSearch(await get(`https://play.google.com/store/search?q=${encodeURIComponent(q)}&c=apps&hl=en&gl=US`).catch(() => ''), [ownPkg, ...pkgs]))
  }
  return [...new Set(pkgs)].slice(0, MAX_REFS)
}

async function build(gameId, g) {
  const [game] = await db(`games?select=id,name,genre,android_package&id=eq.${encodeURIComponent(gameId)}`)
  if (!game) throw new Error('Oyun bulunamadı')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-'))
  const refs = []
  for (const pkg of await pickRefs(game, g.refs_input, game.android_package)) {
    try {
      const html = await get(`https://play.google.com/store/apps/details?id=${pkg}&hl=en&gl=US`)
      const page = parseStorePage(html, pkg)
      const files = []
      const icon = iconUrl(html)
      // "-rj" sonu Play'den JPEG ister: Claude dosya türünü uzantıdan anlar, uzantı içerikle aynı olsun
      const save = async (url, f) => {
        fs.writeFileSync(path.join(dir, f), await get(`${url}-rj`, true))
        files.push(f)
      }
      if (icon) await save(`${icon}=w256`, `${refs.length + 1}-ikon.jpg`)
      for (const [i, u] of screenshotUrls(html).slice(0, SHOTS_PER_REF).entries()) await save(`${u}=w720`, `${refs.length + 1}-ekran${i + 1}.jpg`)
      refs.push({ pkg, title: page.title, installs: page.installsLabel, files })
    } catch (e) {
      console.warn(`Örnek oyun okunamadı: ${pkg} (${e.message})`)
    }
  }
  if (!refs.length) throw new Error('Örnek oyunların mağaza sayfası okunamadı')

  const prompt = [
    `Oyunumuz: ${game.name}${game.genre ? ` (tür: ${game.genre})` : ''}.`,
    'Görev: aşağıdaki popüler oyunların Play Store ikonlarına ve ekran görüntülerine (bu klasördeki dosyalar, Read ile her birine bak) bakıp mağaza görsellerinin tasarım dilini çıkar; sonra BİZİM oyunumuz için o kalitede görsel üretecek promptlar yaz.',
    '- references: her örnek oyun için 1-2 cümle: ne yapıyor (renk, kompozisyon, başlık yazısı, karakter kullanımı).',
    '- style (Türkçe, somut): colors (hangi renkler ve kontrast), typography (yazı tipi tarzı, kalınlık, kontur/gölge), layout (ekran görüntüsünde çerçeve, oyun görüntüsü oranı, başlık yeri), captions (başlık uzunluğu ve dili, ör. 2-4 kelime, fiille başlıyor), characters (karakter/nesne nasıl öne çıkarılıyor), icon (ikon tarzı).',
    '- doThis: oyunumuz için 4-6 somut tavsiye. avoid: 3-5 yaygın hata.',
    '- prompts: ChatGPT görsel üretimi için İNGİLİZCE, ayrıntılı, tek paragraf promptlar: 1 feature (1024x500 Play tanıtım görseli), 3 screenshot (her biri farklı özellik; dikey 9:16, üstte başlık yazısı alanı; "Use the attached gameplay screenshot of our game as the main image, do not invent gameplay" de), 1 poster (reklam afişi 4:5), 1 icon (512x512), 1 background (ekran görüntüleri için yazısız arka plan). Promptlarda örnek oyunların ADINI ya da karakterlerini kopyalama; sadece tarzı tarif et (renk, ışık, kompozisyon, yazı stili). Başlık yazısı istenen promptlarda yazıyı tırnak içinde ver. size: piksel ya da oran. tip: Türkçe 1 cümle, ChatGPT\'de nasıl kullanılacağı (ör. "oyun ekran görüntünü de ekle").',
    '- Oyun kartı varsa oyunun gerçek tarzına ve karakterlerine sadık kal; kartta olmayan bir şey uydurma.',
    '',
    'Örnek oyunlar ve dosyaları (JSON):',
    JSON.stringify(refs.map((r) => ({ oyun: r.title, indirme: r.installs, dosyalar: r.files }))),
    'Oyun kartımız (JSON):',
    JSON.stringify(profileText((await profiles())[gameId])),
    g.note ? `Sahibinin isteği: ${g.note}` : '',
  ].filter(Boolean).join('\n')

  try {
    const out = parse(await runClaude(prompt, SCHEMA, { readDir: dir, model: process.env.CLAUDE_FAST_MODEL || 'sonnet', timeoutMin: 10 }))
    await patchGuide(gameId, {
      status: 'ready', error: null, at: new Date().toISOString(),
      refs: refs.map((r) => ({ pkg: r.pkg, title: r.title, installs: r.installs })),
      references: out.references, style: out.style, doThis: out.doThis, avoid: out.avoid, prompts: out.prompts,
    })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

export async function runGuides() {
  for (const [gameId, g] of Object.entries((await setting('design_guides'))?.items ?? {})) {
    if (g.status !== 'requested') continue
    try {
      console.log(`Tasarım rehberi: ${gameId}`)
      await build(gameId, g)
    } catch (e) {
      console.error(e)
      await patchGuide(gameId, { status: g.prompts ? 'ready' : 'failed', error: String(e.message ?? e).slice(0, 300) })
    }
  }
}
