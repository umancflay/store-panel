// Build dosyasını Supabase'den indirir ve içini okur (Android AAB/APK).
// Manifest: AAB için bundletool (BUNDLETOOL = jar yolu), APK için aapt2 (AAPT2 = program yolu).
// Ayrıca native kütüphanelerin sayfa hizalamasına ve dex / il2cpp dosyalarında SDK izlerine bakar.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { elfLoadAlign, findNeedles } from './binary.mjs'

const SDK_FILE = new URL('../../uzman/sdkler.json', import.meta.url)
export const sdkList = () => JSON.parse(fs.readFileSync(SDK_FILE, 'utf8'))

// Gizli "files" kovasından indirir. Büyük dosyalar panelde 45 MB'lık parçalara bölünür (path.part0, part1 …):
// parçalar sırayla aynı dosyaya akıtılır, bellek dolmaz.
export async function downloadFile(file, dest, { fetchImpl = fetch, url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY } = {}) {
  const parts = file.parts > 1 ? Array.from({ length: file.parts }, (_, i) => `${file.path}.part${i}`) : [file.path]
  fs.rmSync(dest, { force: true })
  for (const p of parts) {
    const res = await fetchImpl(`${url}/storage/v1/object/files/${p}`, {
      headers: { apikey: key, ...(String(key).startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) },
    })
    if (!res.ok) throw new Error(`Build dosyası indirilemedi (${res.status}): ${p}`)
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest, { flags: 'a' }))
  }
}

const attr = (tag, name) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1]

// bundletool dump manifest çıktısı (XML)
export function parseBundletoolManifest(xml) {
  const root = xml.match(/<manifest\b[^>]*>/)?.[0] ?? ''
  const sdk = xml.match(/<uses-sdk\b[^>]*>/)?.[0] ?? ''
  const app = xml.match(/<application\b[^>]*>/)?.[0] ?? ''
  const metaData = {}
  for (const [tag] of xml.matchAll(/<meta-data\b[^>]*>/g)) {
    const n = attr(tag, 'android:name')
    if (n) metaData[n] = attr(tag, 'android:value') ?? attr(tag, 'android:resource') ?? ''
  }
  return {
    package: attr(root, 'package') ?? '',
    versionCode: Number(attr(root, 'android:versionCode') ?? 0),
    versionName: attr(root, 'android:versionName') ?? '',
    minSdk: Number(attr(sdk, 'android:minSdkVersion') ?? 1),
    targetSdk: Number(attr(sdk, 'android:targetSdkVersion') ?? attr(sdk, 'android:minSdkVersion') ?? 1),
    debuggable: attr(app, 'android:debuggable') === 'true',
    permissions: [...xml.matchAll(/<uses-permission(?:-sdk-23)?\b[^>]*android:name="([^"]+)"/g)].map((m) => m[1]),
    metaData,
  }
}

// aapt2 dump badging çıktısı (APK)
export function parseBadging(text) {
  const pkg = text.match(/^package: (.*)$/m)?.[1] ?? ''
  const q = (s, n) => s.match(new RegExp(`${n}='([^']*)'`))?.[1]
  return {
    package: q(pkg, 'name') ?? '',
    versionCode: Number(q(pkg, 'versionCode') ?? 0),
    versionName: q(pkg, 'versionName') ?? '',
    minSdk: Number(text.match(/^sdkVersion:'(\d+)'/m)?.[1] ?? 1),
    targetSdk: Number(text.match(/^targetSdkVersion:'(\d+)'/m)?.[1] ?? 1),
    debuggable: /^application-debuggable/m.test(text),
    permissions: [...text.matchAll(/^uses-permission: name='([^']+)'/gm)].map((m) => m[1]),
    metaData: {},
  }
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
}

// Build'in tamamını okur. Araçlar yoksa (yerelde) anlaşılır bir hata verir.
export async function readAndroid(filePath) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'build-'))
  try {
    execFileSync('unzip', ['-qq', '-o', filePath, '-d', tmp], { stdio: 'ignore' })
  } catch {
    /* unzip uyarıyla bitebilir (ör. imza dosyaları); içerik yine çıkar */
  }
  const kind = fs.existsSync(path.join(tmp, 'base', 'manifest')) ? 'aab' : 'apk'
  let manifest
  try {
    manifest =
      kind === 'aab'
        ? parseBundletoolManifest(execFileSync('java', ['-jar', process.env.BUNDLETOOL, 'dump', 'manifest', '--bundle', filePath], { encoding: 'utf8', maxBuffer: 32 << 20 }))
        : parseBadging(execFileSync(process.env.AAPT2, ['dump', 'badging', filePath], { encoding: 'utf8', maxBuffer: 32 << 20 }))
  } catch (e) {
    throw new Error(`Build okunamadı (${kind.toUpperCase()}): dosya bozuk ya da desteklenmeyen biçim. ${String(e.message).slice(0, 200)}`)
  }

  const files = walk(tmp).map((f) => path.relative(tmp, f).split(path.sep).join('/'))
  const libRe = kind === 'aab' ? /^base\/lib\/([^/]+)\/([^/]+\.so)$/ : /^lib\/([^/]+)\/([^/]+\.so)$/
  const libs = []
  for (const f of files) {
    const m = f.match(libRe)
    if (!m) continue
    const fd = fs.openSync(path.join(tmp, f), 'r')
    const head = Buffer.alloc(64 * 1024) // program başlıkları dosyanın başında
    fs.readSync(fd, head, 0, head.length, 0)
    fs.closeSync(fd)
    libs.push({ abi: m[1], name: m[2], align: elfLoadAlign(head) })
  }

  // SDK izleri ve unutulmuş test reklam kimliği: dex, il2cpp metadata ve native kütüphanelerde
  const sdk = sdkList()
  const needles = [sdk.testAdId, ...sdk.sdkler.flatMap((s) => s.needles)]
  const hits = new Set()
  for (const f of files.filter((x) => /\.dex$|global-metadata\.dat$|\.so$/.test(x))) {
    for (const h of findNeedles(fs.readFileSync(path.join(tmp, f)), needles.filter((n) => !hits.has(n)))) hits.add(h)
    if (hits.size === needles.length) break
  }
  // Manifestteki meta-data değerlerinde de test kimliği olabilir
  if (Object.values(manifest.metaData).some((v) => v.includes(sdk.testAdId))) hits.add(sdk.testAdId)

  fs.rmSync(tmp, { recursive: true, force: true })
  return {
    kind,
    manifest,
    abis: [...new Set(libs.map((l) => l.abi))],
    libs,
    sizeBytes: fs.statSync(filePath).size,
    hits: [...hits],
  }
}
