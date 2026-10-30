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

const W = 1080
const H = 1920
export const FONT = process.env.STUDIO_FONT || '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

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
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['seconds', 'record', 'text'],
              properties: { seconds: { type: 'number' }, record: { type: 'string' }, text: { type: 'string' } },
            },
          },
          endText: { type: 'string' },
          storeHeadline: { type: 'string' },
        },
      },
    },
  },
}

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

export async function studioDue() {
  const cur = await setting('ad_projects')
  return (cur?.items ?? []).some((p) => p.status === 'ideas_requested' || p.status === 'render_requested')
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
    '- Her fikirde 3-6 çekim (shots). seconds: o çekimin süresi; toplam 15-25 sn. record: oyunda neyin kaydedileceği (Unity oyun ekranı ya da telefon ekran kaydı; kişi çekimi gerekiyorsa açıkça yaz). text: ekrana yazılacak kısa yazı (en fazla 32 karakter, boş olabilir).',
    '- hook: ilk 2 saniyede izleyiciyi tutan şey. endText: kapanış kartındaki çağrı (ör. "Play now for free"). storeHeadline: mağaza görseline yazılacak 2-5 kelime.',
    '- Ekran yazılarının dili: reklam planındaki hedef ülkelere uygun olsun; plan yoksa İngilizce.',
    '- evidence: fikir "reklam_trendleri"nden geliyorsa "trend", oyunun kendi reklam sonuçlarından ("kampanyalar") çıkıyorsa "veri", ikisi de değilse "yok". why: bu dayanağı tek cümleyle, rakam varsa rakamla. Kazanacağını iddia etme; bunlar denenecek fikirler.',
    '- "onceki_projeler"deki fikirleri tekrar etme.',
    '',
    'Veri (JSON):',
    JSON.stringify({
      reklam_trendleri: trends ? { trendler: (trends.items ?? []).slice(0, 8), bu_oyun_icin: (trends.forGames ?? []).find((g) => g.game_id === p.gameId)?.ideas ?? [] } : null,
      reklam_plani: plans[0]?.content ?? null,
      kampanyalar: [...agg.values()],
      onceki_projeler: past,
    }),
  ].filter(Boolean).join('\n')

  const out = parse(await runClaude(prompt, IDEAS, { model: process.env.CLAUDE_FAST_MODEL || 'sonnet', timeoutMin: 6 }))
  const ideas = (out.ideas ?? []).slice(0, 3).map((i, n) => ({ ...i, id: `i${n}`, shots: clampShots(i.shots ?? []) }))
  if (!ideas.length) throw new Error('Fikir üretilemedi')
  await patchProject(p.id, { status: 'pick', ideas, error: null })
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
  const ids = idea.shots.map((s) => s.fileId).filter(Boolean)
  const files = ids.length ? await db(`files?select=id,name,path,mime,parts&id=in.(${ids.join(',')})`) : []
  const segs = []
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
  // Platformlar sessiz videoyu sorunlu sayabiliyor: sessiz ses kanalı eklenir (müziği sen eklersin)
  ff(['-y', '-f', 'concat', '-safe', '0', '-i', list, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-shortest', '-c:v', 'copy', '-c:a', 'aac', '-movflags', '+faststart', video])

  const frame = path.join(dir, 'frame.png')
  ff(['-y', '-ss', '1', '-i', segs[0], '-frames:v', '1', frame])
  const head = path.join(dir, 'head.txt')
  fs.writeFileSync(head, wrapText(idea.storeHeadline || game?.name || '', 22))
  const feature = path.join(dir, 'feature.png')
  const square = path.join(dir, 'square.png')
  ff(stillArgs({ frame, w: 1024, h: 500, textFile: head, out: feature }))
  ff(stillArgs({ frame, w: 1080, h: 1080, textFile: head, out: square }))

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
  const seconds = idea.shots.reduce((a, s) => a + s.seconds, 0) + 2.5
  fs.rmSync(dir, { recursive: true, force: true })
  await patchProject(p.id, { status: 'review', outputs, seconds, error: null })
}

export async function runStudio() {
  const items = ((await setting('ad_projects'))?.items ?? []).filter((p) => p.status === 'ideas_requested' || p.status === 'render_requested')
  for (const p of items) {
    try {
      console.log(`Stüdyo: ${p.id} (${p.status})`)
      if (p.status === 'ideas_requested') await writeIdeas(p)
      else await render(p)
    } catch (e) {
      console.error(e)
      const msg = String(e.stderr ?? e.message ?? e).slice(0, 400)
      await patchProject(p.id, { status: p.status === 'ideas_requested' ? 'failed_ideas' : 'failed_render', error: msg })
    }
  }
}
