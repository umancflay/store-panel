// iOS build (IPA) okuyucu: Info.plist, gizlilik bildirimi (PrivacyInfo.xcprivacy), imza profili, framework'ler ve SDK izleri.
// IPA bir zip'tir; plist'ler (ikili ya da XML) Python'un plistlib'i ile JSON'a çevrilir (GitHub'ın Ubuntu'sunda hazır).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { findNeedles } from './binary.mjs'
import { sdkList } from './bundle.mjs'

const PLIST_TO_JSON = 'import plistlib,json,sys,datetime\nd=plistlib.load(open(sys.argv[1],"rb"))\nprint(json.dumps(d,default=lambda o:o.isoformat() if isinstance(o,datetime.datetime) else None))'

export function readPlist(file, { exec = execFileSync } = {}) {
  return JSON.parse(exec('python3', ['-c', PLIST_TO_JSON, file], { encoding: 'utf8', maxBuffer: 16 << 20 }))
}

// embedded.mobileprovision CMS ile imzalı ama içindeki plist düz metin: geliştirme mi, ad hoc mu, App Store mu?
export function parseProvision(buf) {
  const text = buf.toString('latin1')
  const xml = text.slice(text.indexOf('<?xml'), text.indexOf('</plist>') + 8)
  if (!xml.startsWith('<?xml')) return null
  const getTaskAllow = /<key>get-task-allow<\/key>\s*<true\/>/.test(xml)
  const devices = /<key>ProvisionedDevices<\/key>/.test(xml)
  const name = xml.match(/<key>Name<\/key>\s*<string>([^<]*)<\/string>/)?.[1] ?? null
  const expires = xml.match(/<key>ExpirationDate<\/key>\s*<date>([^<]*)<\/date>/)?.[1] ?? null
  return { type: getTaskAllow ? 'development' : devices ? 'adhoc' : 'appstore', name, expires }
}

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))

export async function readIos(filePath, { exec = execFileSync } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ipa-'))
  try {
    exec('unzip', ['-qq', '-o', filePath, '-d', tmp], { stdio: 'ignore' })
  } catch {
    /* uyarıyla bitebilir; içerik yine çıkar */
  }
  const payload = path.join(tmp, 'Payload')
  const appName = fs.existsSync(payload) ? fs.readdirSync(payload).find((n) => n.endsWith('.app')) : null
  if (!appName) throw new Error('Bu dosya bir iOS build\'i (IPA) değil: içinde Payload/…app klasörü yok. Xcode › Product › Archive › Distribute App › App Store Connect › Export ile alınan .ipa\'yı bırak.')
  const app = path.join(payload, appName)

  let info
  try {
    info = readPlist(path.join(app, 'Info.plist'), { exec })
  } catch (e) {
    throw new Error(`Info.plist okunamadı: ${String(e.message).slice(0, 200)}`)
  }
  const privacyFile = path.join(app, 'PrivacyInfo.xcprivacy')
  const privacy = fs.existsSync(privacyFile) ? (() => { try { return readPlist(privacyFile, { exec }) } catch { return {} } })() : null
  const provFile = path.join(app, 'embedded.mobileprovision')
  const provision = fs.existsSync(provFile) ? parseProvision(fs.readFileSync(provFile)) : null

  const fwDir = path.join(app, 'Frameworks')
  const frameworks = fs.existsSync(fwDir)
    ? fs.readdirSync(fwDir).filter((n) => n.endsWith('.framework')).map((n) => ({ name: n.replace(/\.framework$/, ''), privacy: fs.existsSync(path.join(fwDir, n, 'PrivacyInfo.xcprivacy')) }))
    : []

  // SDK izleri: ana çalıştırılabilir dosya, UnityFramework, il2cpp metadata; framework adları da iz sayılır
  const sdk = sdkList()
  const needles = [sdk.testAdId, ...sdk.sdkler.flatMap((s) => s.ios ?? [])]
  const hits = new Set(frameworks.flatMap((f) => needles.filter((n) => n === `${f.name}.framework` || n === f.name)))
  const candidates = [path.join(app, info.CFBundleExecutable ?? ''), path.join(fwDir, 'UnityFramework.framework', 'UnityFramework'), ...walk(app).filter((f) => f.endsWith('global-metadata.dat'))]
  for (const f of candidates.filter((x) => fs.existsSync(x) && fs.statSync(x).isFile())) {
    for (const h of findNeedles(fs.readFileSync(f), needles.filter((n) => !hits.has(n)))) hits.add(h)
  }
  if (JSON.stringify(info).includes(sdk.testAdId)) hits.add(sdk.testAdId)
  if (info.GADApplicationIdentifier) hits.add('GADApplicationIdentifier')

  return { kind: 'ipa', info, privacy, provision, frameworks, hits: [...hits], sizeBytes: fs.statSync(filePath).size }
}

// "1.2.10" > "1.2.9" gibi noktalı sürüm karşılaştırma
export function compareVersions(a, b) {
  const x = String(a).split('.').map(Number)
  const y = String(b).split('.').map(Number)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0)
    if (d) return Math.sign(d)
  }
  return 0
}
