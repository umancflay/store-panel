// Mağaza ve reklam görseli şablonları: HTML/CSS ile tasarlanır, başsız Chrome ile PNG'ye çevrilir.
// API ya da ücretli hizmet gerekmez; gerçek oyun görüntüsü + renk geçişi + telefon çerçevesi + kaliteli yazı tipi.
// Chrome: GitHub sunucusunda hazır (google-chrome); yerelde CHROME ortam değişkeni ya da Windows'taki varsayılan yol.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

export function chromePath() {
  const list = [
    process.env.CHROME,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ].filter(Boolean)
  return list.find((p) => fs.existsSync(p)) ?? null
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
// Başlıkta *yıldızlı* kelime vurgulu renkte yazılır: "Build your *empire*"
const rich = (s) => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>')

export const dataUri = (file) => `data:${/\.png$/i.test(file) ? 'image/png' : 'image/jpeg'};base64,${fs.readFileSync(file).toString('base64')}`

// Hazır renk temaları; "auto" kareden çıkan renkle
export const THEMES = {
  gece: { a: '#0b1020', b: '#1c2a5a', accent: '#7cc4ff', text: '#ffffff' },
  orman: { a: '#07170f', b: '#145a3a', accent: '#8FD3AE', text: '#ffffff' },
  gunbatimi: { a: '#2a0b1a', b: '#c2410c', accent: '#ffd166', text: '#ffffff' },
  sicak: { a: '#1a1206', b: '#7c4a03', accent: '#ffcf5c', text: '#ffffff' },
}

const FONT = `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;800;900&display=block" rel="stylesheet">`

function base(w, h, t, body, extra = '') {
  return `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${w}px;height:${h}px;overflow:hidden}
body{font-family:Poppins,system-ui,sans-serif;color:${t.text};background:radial-gradient(120% 80% at 50% 0%, ${t.b} 0%, ${t.a} 70%);position:relative}
em{font-style:normal;color:${t.accent}}
.glow{position:absolute;border-radius:50%;filter:blur(${Math.round(w / 9)}px);opacity:.55}
${extra}
</style></head><body>${body}</body></html>`
}

// Mağaza ekran görüntüsü: üstte büyük başlık, altında telefon çerçevesi içinde gerçek oyun görüntüsü (hafif eğik)
export function storeShotHtml({ w, h, img, headline, sub = '', theme = THEMES.gece, tilt = 0 }) {
  const u = w / 1080
  const phoneW = Math.round(w * 0.78)
  const phoneH = Math.round(phoneW * 2.05)
  return base(w, h, theme, `
<div class="glow" style="width:${w * 0.9}px;height:${w * 0.9}px;background:${theme.accent};left:${-w * 0.25}px;top:${h * 0.55}px"></div>
<div class="glow" style="width:${w * 0.7}px;height:${w * 0.7}px;background:${theme.b};right:${-w * 0.2}px;top:${h * 0.15}px"></div>
<div class="head">
  <h1>${rich(headline)}</h1>
  ${sub ? `<p>${esc(sub)}</p>` : ''}
</div>
<div class="phone" style="transform:translateX(-50%) rotate(${tilt}deg)"><div class="screen"></div></div>`, `
.head{position:absolute;top:${Math.round(h * 0.055)}px;left:${Math.round(70 * u)}px;right:${Math.round(70 * u)}px;text-align:center}
h1{font-weight:900;font-size:${Math.round(108 * u)}px;line-height:1.04;letter-spacing:-${(2 * u).toFixed(1)}px;text-shadow:0 ${Math.round(6 * u)}px ${Math.round(30 * u)}px rgba(0,0,0,.35)}
p{margin-top:${Math.round(22 * u)}px;font-weight:600;font-size:${Math.round(40 * u)}px;opacity:.82}
.phone{position:absolute;left:50%;top:${Math.round(h * 0.3)}px;width:${phoneW}px;height:${phoneH}px;border-radius:${Math.round(96 * u)}px;background:#0a0a0a;padding:${Math.round(22 * u)}px;box-shadow:0 ${Math.round(50 * u)}px ${Math.round(120 * u)}px rgba(0,0,0,.6),0 0 0 ${Math.round(4 * u)}px rgba(255,255,255,.12) inset}
.screen{width:100%;height:100%;border-radius:${Math.round(76 * u)}px;background:url('${img}') center/cover no-repeat}`)
}

// Play tanıtım görseli 1024x500: solda oyun adı ve başlık, sağda eğik ekran
export function featureHtml({ img, headline, gameName, icon = null, theme = THEMES.gece }) {
  const w = 1024
  const h = 500
  return base(w, h, theme, `
<div class="bg"></div>
<div class="glow" style="width:520px;height:520px;background:${theme.accent};left:-180px;top:180px;opacity:.35"></div>
<div class="left">
  ${icon ? `<img class="icon" src="${icon}">` : ''}
  <div class="name">${esc(gameName)}</div>
  <h1>${rich(headline)}</h1>
</div>
<div class="shot"></div>`, `
.bg{position:absolute;inset:0;background:url('${img}') center/cover;filter:blur(18px) brightness(.35);transform:scale(1.15)}
.left{position:absolute;left:56px;top:0;bottom:0;width:470px;display:flex;flex-direction:column;justify-content:center;gap:14px}
.icon{width:92px;height:92px;border-radius:22px;box-shadow:0 10px 30px rgba(0,0,0,.5)}
.name{font-weight:600;font-size:22px;letter-spacing:3px;text-transform:uppercase;opacity:.85}
h1{font-weight:900;font-size:60px;line-height:1.02;letter-spacing:-1px;text-shadow:0 4px 24px rgba(0,0,0,.4)}
.shot{position:absolute;right:-40px;top:40px;width:520px;height:420px;border-radius:28px;background:url('${img}') center/cover;transform:rotate(-6deg);box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 6px rgba(255,255,255,.1)}`)
}

// Reklam afişi (kare ya da dikey): görüntü tam ekran, altta koyu geçiş, büyük başlık ve "Ücretsiz oyna" düğmesi
export function posterHtml({ w, h, img, headline, cta = 'Play free', gameName, icon = null, theme = THEMES.gece }) {
  const u = w / 1080
  return base(w, h, theme, `
<div class="img"></div><div class="fade"></div>
<div class="bottom">
  <h1>${rich(headline)}</h1>
  <div class="row">
    ${icon ? `<img class="icon" src="${icon}">` : ''}
    <div class="name">${esc(gameName)}</div>
    <div class="cta">${esc(cta)}</div>
  </div>
</div>`, `
.img{position:absolute;inset:0;background:url('${img}') center/cover}
.fade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 35%,${theme.a}ee 78%,${theme.a} 100%)}
.bottom{position:absolute;left:${Math.round(64 * u)}px;right:${Math.round(64 * u)}px;bottom:${Math.round(70 * u)}px;display:flex;flex-direction:column;gap:${Math.round(34 * u)}px}
h1{font-weight:900;font-size:${Math.round(112 * u)}px;line-height:1.02;letter-spacing:-${(2 * u).toFixed(1)}px;text-shadow:0 6px 30px rgba(0,0,0,.5)}
.row{display:flex;align-items:center;gap:${Math.round(22 * u)}px}
.icon{width:${Math.round(96 * u)}px;height:${Math.round(96 * u)}px;border-radius:${Math.round(24 * u)}px}
.name{flex:1;font-weight:800;font-size:${Math.round(40 * u)}px}
.cta{background:${theme.accent};color:#0a0a0a;font-weight:800;font-size:${Math.round(40 * u)}px;padding:${Math.round(22 * u)}px ${Math.round(44 * u)}px;border-radius:999px;box-shadow:0 10px 30px rgba(0,0,0,.35)}`)
}

// HTML'i Chrome ile PNG'ye çevirir (yazı tipinin yüklenmesi için sanal zaman tanınır)
export function renderHtml(html, w, h, out, chrome = chromePath()) {
  if (!chrome) throw new Error('Chrome bulunamadı (CHROME ortam değişkeniyle yolunu ver)')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tpl-'))
  const file = path.join(dir, 'page.html')
  fs.writeFileSync(file, html)
  execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=${w},${h}`, '--virtual-time-budget=6000', `--screenshot=${path.resolve(out)}`, `file:///${file.replace(/\\/g, '/')}`,
  ], { stdio: 'ignore', timeout: 60000 })
  fs.rmSync(dir, { recursive: true, force: true })
  if (!fs.existsSync(out)) throw new Error('Görsel üretilemedi')
  return out
}
