// Reklam Stüdyosu: oyun seç → 3 reklam fikri (çekim listesiyle) → kayıtlar → dikey video + mağaza görselleri.
// Projeler app_settings.ad_projects'te durur; panel yazar, bu iş (assistant.yml › studio) işler.
//   ideas_requested  → Claude, trendlere ve oyunun reklam sonuçlarına bakıp 3 fikir yazar → pick
//   render_requested → ffmpeg kayıtları 1080x1920 videoya, ilk kareden 1024x500 ve 1080x1080 görsele çevirir → review
// Hiçbir şeyi yayınlamaz, reklam açmaz; çıktılar "Reklam" klasörüne dosya olarak düşer.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { db } from './db.mjs'
import { parse, runClaude } from './ai.mjs'
import { downloadFile } from './expert/bundle.mjs'
import { profileText, profiles } from './gameprofile.mjs'
import { updateAdLessons } from './adlessons.mjs'

const W = 1080
const H = 1920
export const FONT = process.env.STUDIO_FONT || '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

const SHOT = {
  type: 'object',
  additionalProperties: false,
  required: ['seconds', 'kind', 'record', 'direction', 'aiPrompt', 'text'],
  properties: {
    seconds: { type: 'number' },
    kind: { type: 'string', enum: ['oyun', 'ai', 'kisi'] },
    record: { type: 'string' },
    direction: { type: 'string' },
    aiPrompt: { type: 'string' },
    text: { type: 'string' },
  },
}

const IDEAS = {
  type: 'object',
  additionalProperties: false,
  required: ['ideas'],
  properties: {
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'platform', 'why', 'evidence', 'hook', 'shots', 'endText', 'storeHeadline'],
        properties: {
          title: { type: 'string' },
          platform: { type: 'string' },
          why: { type: 'string' },
          evidence: { type: 'string', enum: ['trend', 'veri', 'yok'] },
          hook: { type: 'string' },
          shots: {
            type: 'array',
            items: SHOT,
          },
          endText: { type: 'string' },
          storeHeadline: { type: 'string' },
          style: { type: 'string' },
          music: { type: 'string' },
        },
      },
    },
  },
}

// Sonradan detay yazma (eski projeler ya da "promptları yenile"): seçili fikrin çekimleri aynı sırayla
const DETAILS = {
  type: 'object',
  additionalProperties: false,
  required: ['style', 'music', 'shots'],
  properties: { style: { type: 'string' }, music: { type: 'string' }, shots: { type: 'array', items: SHOT } },
}

// Çekim türüne göre ne yapılacağını anlatan ortak kurallar (fikir ve detay istemlerinde)
const SHOT_RULES = [
  '- Her çekimde kind: "oyun" (Unity oyun ekranı ya da telefon ekran kaydı), "ai" (yapay zeka video aracıyla üretilecek oyun dışı sahne) ya da "kisi" (insan çekimi: el, yüz, tepki).',
  '- direction: Türkçe, 2-4 cümlelik çekim yönergesi. "oyun" için: hangi bölüm/sahne, kamera açısı ve yakınlığı, oyunda ne yapılacağı, kayıt ayarı (dikey 9:16, 60 fps, arayüz açık/kapalı), dikkat edilecekler. "kisi" için: kadraj, ışık, ifade. "ai" için: sahnenin kısa Türkçe özeti.',
  '- aiPrompt: SADECE kind "ai" ise doldur, diğerlerinde boş metin. İngilizce, ayrıntılı, tek paragraf video üretim istemi (Veo, Kling, Runway, Sora gibi araçlara yapıştırılacak): konu ve karakter, eylem saniye saniye, ortam, kamera hareketi ve lensi, ışık, renk paleti, görsel tarz (ör. cinematic, hyper-realistic, 3D stylized, anime), hız, ruh hali; sonuna "vertical 9:16, N seconds, no text, no logos, no watermark" ekle (N çekimin süresi). Oyunun tarzıyla (style) uyumlu olsun.',
  '- style (fikir düzeyinde): bütün videonun görsel tarzı, renkleri, kurgu hızı (Türkçe, 1-2 cümle). music: önerilen müzik/ses tarzı ve tempo (Türkçe, 1 cümle; telifsiz kütüphanede aranacak anahtar kelimelerle).',
].join('\n')

// ---- saf yardımcılar (testli) ----

// Ekrandaki yazıyı satırlara böler: drawtext kendisi kaydırmaz
export function wrapText(text, max = 18) {
  const lines = []
  let line = ''
  for (const word of String(text ?? '').trim().split(/\s+/).filter(Boolean)) {
    if (line && (line + ' ' + word).length > max) {
      lines.push(line)
      line = word
    } else line = line ? line + ' ' + word : word
  }
  if (line) lines.push(line)
  return lines.join('\n')
}

// Çekimin süresi 1-8 sn arasında kalsın; toplam 30 sn'yi geçmesin
export function clampShots(shots) {
  let total = 0
  return shots.slice(0, 6).map((s) => {
    const sec = Math.min(8, Math.max(1, Math.round(Number(s.seconds) || 3)), Math.max(1, 30 - total))
    total += sec
    return { ...s, seconds: sec }
  })
}

// Font yolunu ffmpeg filtresi için kaçışlar (Windows'ta "C:" iki nokta da kaçmalı)
const esc = (p) => p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")

// Tek çekimi 1080x1920, 30 fps, sessiz parçaya çeviren ffmpeg argümanları
export function segmentArgs({ input, isImage, seconds, textFile, out, font = FONT }) {
  const vf = [`scale=${W}:${H}:force_original_aspect_ratio=increase`, `crop=${W}:${H}`, 'setsar=1', 'fps=30']
  if (textFile) {
    vf.push(`drawtext=expansion=none:fontfile='${esc(font)}':textfile='${esc(textFile)}':fontcolor=white:fontsize=78:borderw=7:bordercolor=black:line_spacing=14:x=(w-text_w)/2:y=h*0.11`)
  }
  vf.push('format=yuv420p')
  return [
    '-y', ...(isImage ? ['-loop', '1'] : []), '-t', String(seconds), '-i', input,
    '-vf', vf.join(','), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-r', '30', '-t', String(seconds), out,
  ]
}

// Kapanış kartı: oyun adı ve çağrı (ör. "Şimdi ücretsiz indir")
export function endCardArgs({ titleFile, ctaFile, out, seconds = 2.5, font = FONT }) {
  const f = `fontfile='${esc(font)}'`
  return [
    '-y', '-f', 'lavfi', '-i', `color=c=0x0b0b0b:s=${W}x${H}:d=${seconds}:r=30`,
    '-vf', [
      `drawtext=expansion=none:${f}:textfile='${esc(titleFile)}':fontcolor=white:fontsize=96:line_spacing=12:x=(w-text_w)/2:y=h*0.40`,
      `drawtext=expansion=none:${f}:textfile='${esc(ctaFile)}':fontcolor=0x8FD3AE:fontsize=60:x=(w-text_w)/2:y=h*0.58`,
      'format=yuv420p',
    ].join(','),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-t', String(seconds), out,
  ]
}

// Mağaza görseli: videonun bir karesinden kırpılmış, karartılmış, ortasında başlık
export function stillArgs({ frame, w, h, textFile, out, font = FONT }) {
  return [
    '-y', '-i', frame, '-vf', [
      `scale=${w}:${h}:force_original_aspect_ratio=increase`, `crop=${w}:${h}`,
      `drawbox=x=0:y=0:w=iw:h=ih:color=black@0.38:t=fill`,
      `drawtext=expansion=none:fontfile='${esc(font)}':textfile='${esc(textFile)}':fontcolor=white:fontsize=${Math.round(h / 8)}:borderw=5:bordercolor=black:line_spacing=10:x=(w-text_w)/2:y=(h-text_h)/2`,
    ].join(','), '-frames:v', '1', out,
  ]
}

// Mağaza ekran görüntüsü: üstte renkli şerit ve büyük başlık, altında oyundan kare.
// Play telefon 1080x1920, App Store 6.9" 1320x2868. Başlık bandı yüksekliğin %24'ü.
export const STORE_SIZES = { play: [1080, 1920], ios: [1320, 2868] }
export function screenshotArgs({ frame, w, h, textFile, out, font = FONT, color = '0x10241a' }) {
  const band = Math.round(h * 0.24)
  return [
    '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=${w}x${h}:d=1`, '-i', frame, '-filter_complex', [
      `[1:v]scale=${w}:${h - band}:force_original_aspect_ratio=increase,crop=${w}:${h - band}[shot]`,
      `[0:v][shot]overlay=0:${band}[bg]`,
      `[bg]drawtext=expansion=none:fontfile='${esc(font)}':textfile='${esc(textFile)}':fontcolor=white:fontsize=${Math.round(w / 11)}:line_spacing=${Math.round(w / 60)}:x=(w-text_w)/2:y=(${band}-text_h)/2`,
    ].join(';'), '-frames:v', '1', out,
  ]
}

// Müzik: videonun süresine kırpılır, başta ve sonda yumuşak geçiş; müzik yoksa sessiz kanal
export function muxArgs({ list, music, seconds, out }) {
  const d = Math.max(1, seconds)
  return music
    ? ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-stream_loop', '-1', '-i', music, '-filter_complex',
      `[1:a]atrim=0:${d},asetpts=N/SR/TB,afade=t=in:st=0:d=0.4,afade=t=out:st=${Math.max(0, d - 1.2).toFixed(2)}:d=1.2,volume=0.85[a]`,
      '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-t', String(d), '-movflags', '+faststart', out]
    : ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-shortest', '-c:v', 'copy', '-c:a', 'aac', '-movflags', '+faststart', out]
}

export const isImageFile = (f) => (f.mime ?? '').startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(f.name ?? '')

// ---- veri ----

async function setting(key) {
  try {
    return (await db(`app_settings?select=value&key=eq.${key}`))[0]?.value ?? null
  } catch {
    return null
  }
}
const saveSetting = (key, value) => db('app_settings?on_conflict=key', 'POST', { key, value, updated_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal')

// Panel de aynı anahtara yazıyor: her yazmadan önce son hali okunur, sadece bu proje değişir
async function patchProject(id, patch) {
  const cur = (await setting('ad_projects')) ?? { items: [] }
  const items = (cur.items ?? []).map((p) => (p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p))
  await saveSetting('ad_projects', { ...cur, items })
}

const WORK = ['ideas_requested', 'detail_requested', 'render_requested']

// Gerçekçilik: oyunda olmayan şeyi oyun kaydı gibi göstermek hem yanıltıcı hem mağaza/reklam politikası ihlali
const REALISM = [
  '- "oyun_karti" oyunun gerçekte ne olduğunu anlatır. "oyun" türündeki çekimlerde SADECE kartta (nasil_oynanir, kayda_deger_anlar, karakterler_ve_ogeler) geçen şeyleri göster.',
  '- Kartta olmayan bir an gerekiyorsa onu "ai" ya da "kisi" çekimi yap ve oyun kaydıymış gibi sunma (yanıltıcı reklam politikası).',
  '- "ai" promptlarında oyunun görsel tarzını (gorsel_tarz) ve karakterlerini kullan ki oyun kayıtlarıyla aynı dünyada dursun.',
  '- Oyun kartı yoksa ya da onayli=false ise fikirleri genel tut ve why alanına "oyun kartı eksik" yaz.',
].join(' ')

export async function studioDue() {
  const cur = await setting('ad_projects')
  return (cur?.items ?? []).some((p) => WORK.includes(p.status))
}

async function writeIdeas(p) {
  const [game] = await db(`games?select=id,name,genre&id=eq.${encodeURIComponent(p.gameId)}`)
  const trends = await setting('ad_trends')
  const plans = await db(`ad_plans?select=content&game_id=eq.${encodeURIComponent(p.gameId)}&order=created_at.desc&limit=1`).catch(() => [])
  const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10)
  const camps = await db(`campaigns?select=platform,name,spend,impressions,clicks,results,result_type&game_id=eq.${encodeURIComponent(p.gameId)}&date=gte.${since}`).catch(() => [])
  const agg = new Map()
  for (const c of camps) {
    const a = agg.get(c.name) ?? { platform: c.platform, kampanya: c.name, harcama_usd: 0, tiklama: 0, gosterim: 0, sonuc: 0, sonuc_turu: c.result_type }
    a.harcama_usd = Math.round((a.harcama_usd + Number(c.spend ?? 0)) * 100) / 100
    a.tiklama += Number(c.clicks ?? 0)
    a.gosterim += Number(c.impressions ?? 0)
    a.sonuc += Number(c.results ?? 0)
    agg.set(c.name, a)
  }
  const past = ((await setting('ad_projects'))?.items ?? [])
    .filter((x) => x.gameId === p.gameId && x.id !== p.id && x.idea)
    .map((x) => ({ fikir: x.idea.title, durum: x.status, platform: x.publishedOn ?? x.idea.platform }))

  const prompt = [
    `Oyun: ${game?.name ?? p.gameId}${game?.genre ? ` (tür: ${game.genre})` : ''}.`,
    p.note ? `Sahibinin notu: ${p.note}` : '',
    'Görev: bu oyun için çekilebilir 3 kısa dikey video reklam fikri yaz (TikTok / Reels / Shorts).',
    REALISM,
    '- Her fikirde 3-6 çekim (shots). seconds: o çekimin süresi; toplam 15-25 sn. record: çekimin tek satırlık özeti. text: ekrana yazılacak kısa yazı (en fazla 32 karakter, boş olabilir).',
    '- hook: ilk 2 saniyede izleyiciyi tutan şey. endText: kapanış kartındaki çağrı (ör. "Play now for free"). storeHeadline: mağaza görseline yazılacak 2-5 kelime.',
    SHOT_RULES,
    '- Ekran yazılarının dili: reklam planındaki hedef ülkelere uygun olsun; plan yoksa İngilizce.',
    '- evidence: fikir "reklam_trendleri"nden geliyorsa "trend", oyunun kendi reklam sonuçlarından ("kampanyalar") çıkıyorsa "veri", ikisi de değilse "yok". why: bu dayanağı tek cümleyle, rakam varsa rakamla. Kazanacağını iddia etme; bunlar denenecek fikirler.',
    '- "onceki_projeler"deki fikirleri tekrar etme.',
    '- "dersler" gerçek sonuçlardır: verdict "iyi" olan kurguların benzerini dene ve why alanında bu dersi rakamıyla an (evidence "veri"); "kotu" olanlardan ve reddedilen fikirlerin sebeplerinden kaçın. "erken" olanlardan hüküm çıkarma.',
    '',
    'Veri (JSON):',
    JSON.stringify({
      oyun_karti: profileText((await profiles())[p.gameId]),
      dersler: (await updateAdLessons().catch(() => [])).filter((l) => l.gameId === p.gameId).map((l) => ({ tur: l.kind === 'rejected' ? 'reddedilen_fikir' : 'sonuc', hukum: l.verdict, ders: l.text })),
      reklam_trendleri: trends ? { trendler: (trends.items ?? []).slice(0, 8), bu_oyun_icin: (trends.forGames ?? []).find((g) => g.game_id === p.gameId)?.ideas ?? [] } : null,
      reklam_plani: plans[0]?.content ?? null,
      kampanyalar: [...agg.values()],
      onceki_projeler: past,
    }),
  ].filter(Boolean).join('\n')

  const out = parse(await runClaude(prompt, IDEAS, { model: process.env.CLAUDE_FAST_MODEL || 'sonnet', timeoutMin: 6 }))
  const ideas = (out.ideas ?? []).slice(0, 3).map((i, n) => ({
    ...i, id: `i${n}`, shots: clampShots(i.shots ?? []).map((s) => ({ ...s, aiPrompt: s.kind === 'ai' ? s.aiPrompt : '' })),
  }))
  if (!ideas.length) throw new Error('Fikir üretilemedi')
  await patchProject(p.id, { status: 'pick', ideas, error: null })
}

// Seçili fikrin çekimlerine ayrıntılı yönerge ve yapay zeka video istemi yazar; yüklenmiş kayıtlar ve yazılar korunur
async function writeDetails(p) {
  const [game] = await db(`games?select=id,name,genre&id=eq.${encodeURIComponent(p.gameId)}`)
  const idea = p.idea
  const prompt = [
    `Oyun: ${game?.name ?? p.gameId}${game?.genre ? ` (tür: ${game.genre})` : ''}.`,
    p.note ? `Sahibinin notu: ${p.note}` : '',
    `Reklam fikri: ${idea.title}. Kanca: ${idea.hook}. Platform: ${idea.platform}.`,
    'Görev: bu fikrin çekimlerini AYNI SIRA ve AYNI SÜRELERLE ayrıntılandır. seconds, record ve text değerlerini aynen koru; kind, direction, aiPrompt yaz. Yapay zeka ile üretilecek ya da oyun dışı sahneler kind "ai" olsun.',
    SHOT_RULES,
    REALISM,
    '',
    'Oyun kartı (JSON):',
    JSON.stringify(profileText((await profiles())[p.gameId])),
    'Çekimler (JSON):',
    JSON.stringify(idea.shots.map((s) => ({ seconds: s.seconds, record: s.record, text: s.text }))),
  ].filter(Boolean).join('\n')
  const out = parse(await runClaude(prompt, DETAILS, { model: process.env.CLAUDE_FAST_MODEL || 'sonnet', timeoutMin: 6 }))
  const shots = idea.shots.map((s, i) => {
    const d = out.shots?.[i] ?? {}
    return { ...s, kind: d.kind ?? s.kind ?? 'oyun', direction: d.direction ?? '', aiPrompt: d.kind === 'ai' ? d.aiPrompt ?? '' : '' }
  })
  await patchProject(p.id, { status: 'recording', idea: { ...idea, style: out.style, music: out.music, shots }, error: null })
}

async function upload(localPath, storePath, mime) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const res = await fetch(`${url}/storage/v1/object/files/${storePath}`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': mime, 'x-upsert': 'true', ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) },
    body: fs.readFileSync(localPath),
  })
  if (!res.ok) throw new Error(`Yüklenemedi (${res.status}): ${await res.text()}`)
  const size = fs.statSync(localPath).size
  return { path: storePath, size }
}

const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'ignore', 'pipe'] })

async function render(p) {
  const idea = p.idea
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-'))
  const [game] = await db(`games?select=id,name&id=eq.${encodeURIComponent(p.gameId)}`)
  const ids = [...idea.shots.map((s) => s.fileId), p.musicFileId].filter(Boolean)
  const files = ids.length ? await db(`files?select=id,name,path,mime,parts&id=in.(${ids.join(',')})`) : []
  const segs = []
  const sources = [] // yazısız kaynak kayıtlar: mağaza ekran görüntülerinin karesi buradan alınır
  for (const [i, s] of idea.shots.entries()) {
    const f = files.find((x) => x.id === s.fileId)
    if (!f) throw new Error(`${i + 1}. çekimin kaydı yok`)
    const input = path.join(dir, `in${i}${path.extname(f.name) || '.bin'}`)
    await downloadFile(f, input)
    let textFile = null
    if (s.text?.trim()) {
      textFile = path.join(dir, `t${i}.txt`)
      fs.writeFileSync(textFile, wrapText(s.text))
    }
    const out = path.join(dir, `s${i}.mp4`)
    ff(segmentArgs({ input, isImage: isImageFile(f), seconds: s.seconds, textFile, out }))
    segs.push(out)
    sources.push({ input, isImage: isImageFile(f) })
  }
  const titleFile = path.join(dir, 'title.txt')
  const ctaFile = path.join(dir, 'cta.txt')
  fs.writeFileSync(titleFile, wrapText(game?.name ?? '', 14))
  fs.writeFileSync(ctaFile, wrapText(idea.endText || 'Play now', 26))
  const end = path.join(dir, 'end.mp4')
  ff(endCardArgs({ titleFile, ctaFile, out: end }))
  segs.push(end)

  const list = path.join(dir, 'list.txt')
  fs.writeFileSync(list, segs.map((s) => `file '${s.replace(/\\/g, '/')}'`).join('\n'))
  const video = path.join(dir, 'video.mp4')
  const seconds = idea.shots.reduce((a, s) => a + s.seconds, 0) + 2.5
  // Müzik seçildiyse karıştırılır; yoksa sessiz kanal (platformlar sesi olmayan videoyu sorunlu sayabiliyor)
  let music = null
  const mf = p.musicFileId && files.find((x) => x.id === p.musicFileId)
  if (mf) {
    music = path.join(dir, `music${path.extname(mf.name) || '.mp3'}`)
    await downloadFile(mf, music)
  }
  ff(muxArgs({ list, music, seconds, out: video }))

  const frame = path.join(dir, 'frame.png')
  ff(['-y', '-ss', '1', '-i', segs[0], '-frames:v', '1', frame])
  const head = path.join(dir, 'head.txt')
  fs.writeFileSync(head, wrapText(idea.storeHeadline || game?.name || '', 22))
  const feature = path.join(dir, 'feature.png')
  const square = path.join(dir, 'square.png')
  ff(stillArgs({ frame, w: 1024, h: 500, textFile: head, out: feature }))
  ff(stillArgs({ frame, w: 1080, h: 1080, textFile: head, out: square }))

  // Mağaza ekran görüntüleri: her çekimden bir kare, başlığı çekimin yazısı (yoksa mağaza başlığı); en fazla 5
  const shotsOut = []
  for (const [i, s] of idea.shots.slice(0, 5).entries()) {
    const fr = path.join(dir, `f${i}.png`)
    const src = sources[i]
    ff(src.isImage ? ['-y', '-i', src.input, '-frames:v', '1', fr] : ['-y', '-ss', String(Math.min(1.5, s.seconds / 2)), '-i', src.input, '-frames:v', '1', fr])
    const cap = path.join(dir, `c${i}.txt`)
    fs.writeFileSync(cap, wrapText(s.text?.trim() || idea.storeHeadline || game?.name || '', 16))
    const pair = {}
    for (const [k, [w, h]] of Object.entries(STORE_SIZES)) {
      const out = path.join(dir, `ss-${k}-${i}.png`)
      ff(screenshotArgs({ frame: fr, w, h, textFile: cap, out }))
      pair[k] = out
    }
    shotsOut.push(pair)
  }

  // Çıktılar: kovaya ve "Reklam" klasörüne (Dosyalar'da da görünsün)
  const stamp = Date.now()
  const base = `studio/${p.id}/${stamp}`
  const name = `${game?.name ?? p.gameId} - ${idea.title}`.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80)
  const outputs = {}
  for (const [k, file, mime, ext] of [['video', video, 'video/mp4', 'mp4'], ['feature', feature, 'image/png', 'png'], ['square', square, 'image/png', 'png']]) {
    const up = await upload(file, `${base}-${k}.${ext}`, mime)
    const label = k === 'video' ? 'video 9x16' : k === 'feature' ? 'mağaza görseli 1024x500' : 'kare 1080x1080'
    const [row] = await db('files', 'POST', { name: `${name} (${label}).${ext}`, path: up.path, size: up.size, mime, folder: 'Reklam', game_id: p.gameId, uploaded_by: 'Reklam Stüdyosu' })
    outputs[k] = { path: up.path, fileId: row?.id ?? null }
  }
  outputs.screens = []
  for (const [i, pair] of shotsOut.entries()) {
    const one = {}
    for (const [k, file] of Object.entries(pair)) {
      const up = await upload(file, `${base}-ss-${k}-${i + 1}.png`, 'image/png')
      const label = k === 'play' ? 'Play ekran görüntüsü' : 'App Store ekran görüntüsü'
      await db('files', 'POST', { name: `${name} (${label} ${i + 1}).png`, path: up.path, size: up.size, mime: 'image/png', folder: 'Mağaza', game_id: p.gameId, uploaded_by: 'Reklam Stüdyosu' }, 'return=minimal')
      one[k] = up.path
    }
    outputs.screens.push(one)
  }
  fs.rmSync(dir, { recursive: true, force: true })
  await patchProject(p.id, { status: 'review', outputs, seconds, error: null })
}

export async function runStudio() {
  const items = ((await setting('ad_projects'))?.items ?? []).filter((p) => WORK.includes(p.status))
  for (const p of items) {
    try {
      console.log(`Stüdyo: ${p.id} (${p.status})`)
      if (p.status === 'ideas_requested') await writeIdeas(p)
      else if (p.status === 'detail_requested') await writeDetails(p)
      else await render(p)
    } catch (e) {
      console.error(e)
      const msg = String(e.stderr ?? e.message ?? e).slice(0, 400)
      // Detay yazılamazsa proje çekim aşamasında kalır, sadece hata görünür
      const status = p.status === 'ideas_requested' ? 'failed_ideas' : p.status === 'detail_requested' ? 'recording' : 'failed_render'
      await patchProject(p.id, { status, error: msg })
    }
  }
}
