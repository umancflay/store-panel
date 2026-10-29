// Yayın Uzmanı'nın iş akışı: build'i incele → rapor → (engel yoksa) dahili teste yükle → üretim onayı aç;
// onaylanan eylemi uygula; eski build dosyalarını temizle. Bağımlılıklar dışarıdan verilir (testte sahte).

import path from 'node:path'
import { lessonFindings } from './ask.mjs'

const now = () => new Date().toISOString()
const pct = (f) => `%${Math.round(f * 100)}`

const ORDER = { block: 0, warn: 1, info: 2 }

// Sanal telefonda deneme: sonuç bulgusu + panelde gösterilecek özet (ekran görüntüleri Supabase'e taşınır)
export async function deviceTest(d, buildId, filePath, minSdk) {
  const storeShot = d.storeShot ? (i, buf) => d.storeShot(`expert/build-${buildId}/shot-${Date.now()}-${i}.png`, buf) : undefined
  const t = await d.testLab({ filePath, buildId, minSdk, storeShot }).catch((e) => ({ skipped: String(e.message).slice(0, 200) }))
  if (t?.skipped || !t?.finding) {
    const why = t?.skipped ?? 'bilinmeyen sebep'
    return { finding: { id: 'testlab-skipped', severity: 'info', title: 'Test cihazı denemesi yapılmadı', detail: `Sebep: ${why}.`, fix: [] }, device: { at: now(), outcome: 'SKIPPED', reason: why } }
  }
  return { finding: t.finding, device: { at: now(), outcome: t.outcome, name: t.device ? `${t.device.name} · Android ${t.device.api}` : null, url: t.url, shots: t.shots ?? [], minutes: t.minutes } }
}

async function setBuild(d, id, patch) {
  await d.db(`store_builds?id=eq.${id}`, 'PATCH', { ...patch, updated_at: now() }, 'return=minimal')
}

// Aynı paket için daha önce dahili teste ya da üretime çıkmış en büyük sürüm kodu
async function previous(d, pkg, id) {
  const rows = await d.db(
    `store_builds?package_name=eq.${encodeURIComponent(pkg)}&id=neq.${id}&status=in.(internal,awaiting_approval,publishing,live)&select=version_code&order=version_code.desc&limit=1`,
  )
  return rows[0]?.version_code ? { versionCode: rows[0].version_code } : null
}

export async function processBuild(build, d) {
  // Kapma: aynı build'i iki iş birden almasın
  const claimed = await d.db(`store_builds?id=eq.${build.id}&status=eq.uploaded`, 'PATCH', { status: 'inspecting', updated_at: now() })
  if (!claimed?.length) return

  const [game] = await d.db(`games?id=eq.${encodeURIComponent(build.game_id)}&select=id,name,android_package`)
  const gameName = game?.name ?? build.game_id ?? 'Oyun'
  try {
    const [file] = await d.db(`files?id=eq.${build.file_id}&select=path,parts,name`)
    if (!file) throw new Error('Build dosyası bulunamadı; panelden yeniden yükle.')
    const local = path.join(d.tmpDir(), `build-${build.id}${path.extname(file.name || '.aab') || '.aab'}`)
    await d.downloadFile(file, local)
    if (build.platform === 'ios') return await inspectIos(build, d, { local, gameName })
    const b = await d.readAndroid(local)
    const m = b.manifest

    const [ds] = await d.db('app_settings?key=eq.data_safety&select=value')
    const findings = d.runRules({
      build: b,
      prev: await previous(d, m.package, build.id),
      game: { id: build.game_id, name: gameName },
      declared: ds?.value?.[build.game_id] ?? null,
      today: d.today(),
    })
    // Yanlış oyuna yüklenen build: Play'e asla gitmesin
    if (game?.android_package && game.android_package !== m.package) {
      findings.unshift({
        id: 'wrong-package', severity: 'block', title: 'Build başka bir oyuna ait',
        detail: `Build'in paket adı ${m.package}, ${gameName} oyununun paketi ${game.android_package}.`,
        fix: ['Panelde doğru oyunu seçip yeniden yükle ya da Unity › Player Settings › Package Name\'i kontrol et.'],
      })
    }

    // Kullanıcının uzmana öğrettikleri her raporda hatırlatılır
    if (d.lessons) findings.push(...lessonFindings(await d.lessons(), 'android'))

    // Engelleyici yoksa sanal telefonda açıp oynat (Firebase Test Lab, sadece ücretsiz planda)
    let device = null
    if (d.testLab && build.platform === 'android' && !findings.some((f) => f.severity === 'block')) {
      await setBuild(d, build.id, { summary: 'Test cihazında deneniyor (3–5 dakika)…' })
      const t = await deviceTest(d, build.id, local, m.minSdk)
      device = t.device
      findings.push(t.finding)
      findings.sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
    }

    const report = d.buildReport(findings, { gameName, versionName: m.versionName, versionCode: m.versionCode })
    const summary = (await d.polish(report, findings)) ?? report.text
    const sdks = b.hits
    await setBuild(d, build.id, {
      package_name: m.package, version_code: m.versionCode, version_name: m.versionName, summary,
      report: {
        verdict: report.verdict, counts: report.counts, findings, text: report.text, aiSummary: summary !== report.text,
        ...(device ? { device } : {}),
        build: { kind: b.kind, targetSdk: m.targetSdk, minSdk: m.minSdk, abis: b.abis, sizeMb: Math.round(b.sizeBytes / 1048576), permissions: m.permissions, hits: sdks },
      },
      status: report.verdict === 'blocked' ? 'blocked' : 'ready',
    })

    if (report.verdict === 'blocked') {
      await d.notify(build.created_by, `${gameName} ${m.versionName}: düzeltmen gerekenler var`, report.text.split('\n')[0], './#/yayin')
      return
    }
    if (build.platform !== 'android') return

    await d.uploadBundle({ pkg: m.package, filePath: local, track: 'internal' })
    await setBuild(d, build.id, { status: 'internal' })
    await d.db('expert_actions', 'POST', { build_id: build.id, kind: 'publish_production', params: { userFraction: 0.1 }, status: 'pending' }, 'return=minimal')
    await setBuild(d, build.id, { status: 'awaiting_approval' })
    await d.notify(null, `${gameName} ${m.versionName} onay bekliyor`, `Dahili teste yüklendi${report.counts.warn ? `, ${report.counts.warn} uyarı var` : ', sorun yok'}. Oyunculara %10 açmak için onayla.`, './#/yayin')
  } catch (e) {
    await setBuild(d, build.id, { status: 'failed', error: String(e.message).slice(0, 500) })
    await d.notify(build.created_by, `${gameName}: build işlenemedi`, String(e.message).slice(0, 150), './#/yayin')
  }
}

// iOS: IPA incelenir, raporlanır. Yükleme Mac'te (Xcode/Transporter) yapılır; incelemeyi uzman App Store Connect'ten izler.
async function inspectIos(build, d, { local, gameName }) {
  const b = await d.readIos(local)
  const i = b.info
  const [last] = await d.db(`builds?game_id=eq.${encodeURIComponent(build.game_id)}&platform=eq.ios&select=version,build_number&order=updated_at.desc&limit=1`).catch(() => [])
  const findings = d.runRules({ build: b, prev: last ? { version: last.version, buildNumber: last.build_number } : null, today: d.today() }, d.iosRules)
  if (d.lessons) findings.push(...lessonFindings(await d.lessons(), 'ios'))
  const num = /^\d+$/.test(String(i.CFBundleVersion)) ? Number(i.CFBundleVersion) : null
  const report = d.buildReport(findings, { gameName, versionName: i.CFBundleShortVersionString, versionCode: i.CFBundleVersion })
  const summary = (await d.polish(report, findings)) ?? report.text
  await setBuild(d, build.id, {
    package_name: i.CFBundleIdentifier, version_code: num, version_name: i.CFBundleShortVersionString, summary,
    report: {
      verdict: report.verdict, counts: report.counts, findings, text: report.text, aiSummary: summary !== report.text,
      build: { kind: 'ipa', iosSdk: i.DTPlatformVersion ?? null, minOs: i.MinimumOSVersion ?? null, buildNumber: String(i.CFBundleVersion ?? ''), sizeMb: Math.round(b.sizeBytes / 1048576), hits: b.hits, frameworks: b.frameworks.map((f) => f.name) },
    },
    status: report.verdict === 'blocked' ? 'blocked' : 'ready',
  })
  await d.notify(
    build.created_by,
    report.verdict === 'blocked' ? `${gameName} iOS ${i.CFBundleShortVersionString}: düzeltmen gerekenler var` : `${gameName} iOS ${i.CFBundleShortVersionString} yüklemeye hazır`,
    report.verdict === 'blocked' ? report.text.split('\n')[0] : 'Xcode Organizer ya da Transporter ile App Store Connect\'e yükle; incelemeyi ben takip edip haber veririm.',
    './#/yayin',
  )
}

export async function processAction(action, d) {
  if (action.status !== 'approved') return
  // Kapma: onay iki kez işlenmesin
  const claimed = await d.db(`expert_actions?id=eq.${action.id}&status=eq.approved`, 'PATCH', { status: 'done', result: 'İşleniyor…' })
  if (!claimed?.length) return

  const [b] = await d.db(`store_builds?id=eq.${action.build_id}&select=id,game_id,platform,package_name,version_code,version_name,created_by`)
  const fraction = Number(action.params?.userFraction ?? 0.1)
  try {
    if (!b?.package_name || !b.version_code) throw new Error('Build bilgisi eksik; önce inceleme tamamlanmalı.')
    let msg
    if (action.kind === 'publish_production') {
      await setBuild(d, b.id, { status: 'publishing' })
      await d.promote({ pkg: b.package_name, versionCode: b.version_code, userFraction: fraction })
      msg = `Üretimde, oyuncuların ${pct(fraction)}'una açıldı.`
    } else if (action.kind === 'increase_rollout') {
      await d.setRollout({ pkg: b.package_name, versionCode: b.version_code, userFraction: fraction })
      msg = fraction >= 1 ? 'Tüm oyunculara açıldı.' : `Oyuncuların ${pct(fraction)}'una açıldı.`
    } else {
      await d.setRollout({ pkg: b.package_name, versionCode: b.version_code, userFraction: 'halt' })
      msg = 'Yayın durduruldu.'
    }
    await setBuild(d, b.id, { status: action.kind === 'halt' ? 'internal' : 'live' })
    await d.db(`expert_actions?id=eq.${action.id}`, 'PATCH', { result: msg }, 'return=minimal')
    await d.notify(null, `${b.version_name}: ${msg}`, 'Yayın Uzmanı onayınla işlemi yaptı.', './#/yayin')
  } catch (e) {
    await d.db(`expert_actions?id=eq.${action.id}`, 'PATCH', { status: 'failed', result: String(e.message).slice(0, 500) }, 'return=minimal')
    if (b) await setBuild(d, b.id, { status: action.kind === 'publish_production' ? 'awaiting_approval' : 'live', error: String(e.message).slice(0, 500) })
    await d.notify(null, 'Yayın işlemi yapılamadı', String(e.message).slice(0, 150), './#/yayin')
  }
}

// Ücretsiz planda depolama 1 GB: oyun başına son 2 build dosyası kalır, eskilerin dosyası silinir (rapor kalır)
export async function cleanupOldFiles(d) {
  const rows = await d.db('store_builds?file_id=not.is.null&select=id,game_id,file_id&order=created_at.desc')
  const seen = new Map()
  for (const r of rows) {
    const n = (seen.get(r.game_id) ?? 0) + 1
    seen.set(r.game_id, n)
    if (n <= 2) continue
    const [f] = await d.db(`files?id=eq.${r.file_id}&select=id,path,parts`)
    if (f) {
      await d.removeFile(f)
      await d.db(`files?id=eq.${f.id}`, 'DELETE', null, 'return=minimal')
    }
    await setBuild(d, r.id, { file_id: null })
  }
}
