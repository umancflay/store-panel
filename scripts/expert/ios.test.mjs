import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { compareVersions, parseProvision, readIos } from './ios.mjs'
import { runRules } from './rules.mjs'
import iosRules from '../../uzman/kurallar/ios.mjs'

const prov = (inner) => Buffer.from(`\x30\x82garbage<?xml version="1.0"?><plist><dict><key>Name</key><string>Voo Dist</string>${inner}</dict></plist>\x00tail`, 'latin1')

test('imza profili: geliştirme, ad hoc, App Store ayrılır', () => {
  assert.equal(parseProvision(prov('<key>get-task-allow</key><true/>')).type, 'development')
  assert.equal(parseProvision(prov('<key>get-task-allow</key><false/><key>ProvisionedDevices</key><array/>')).type, 'adhoc')
  assert.deepEqual(parseProvision(prov('<key>get-task-allow</key><false/>')), { type: 'appstore', name: 'Voo Dist', expires: null })
})

test('noktalı sürüm karşılaştırma', () => {
  assert.equal(compareVersions('1.2.10', '1.2.9'), 1)
  assert.equal(compareVersions('12', '12.0'), 0)
  assert.equal(compareVersions('3', '4'), -1)
})

// unzip ve python3 yerine sahte: IPA'yı açıyormuş gibi klasör kurar, plist'leri JSON verir
function fakeExec(info, { privacy = true, fw = [] } = {}) {
  return (cmd, args) => {
    if (cmd === 'unzip') {
      const app = path.join(args[4], 'Payload', 'Game.app')
      fs.mkdirSync(path.join(app, 'Frameworks'), { recursive: true })
      fs.writeFileSync(path.join(app, 'Info.plist'), 'x')
      fs.writeFileSync(path.join(app, 'Game'), 'binary GADMobileAds ca-app-pub-3940256099942544/123 end')
      if (privacy) fs.writeFileSync(path.join(app, 'PrivacyInfo.xcprivacy'), 'x')
      for (const f of fw) fs.mkdirSync(path.join(app, 'Frameworks', `${f}.framework`), { recursive: true })
      return ''
    }
    if (cmd === 'python3') return JSON.stringify(args[2].endsWith('Info.plist') ? info : {})
    throw new Error(cmd)
  }
}

test('IPA okunur: plist, framework, SDK izi ve test kimliği bulunur', async () => {
  const ipa = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 't-')), 'g.ipa')
  fs.writeFileSync(ipa, 'zip')
  const b = await readIos(ipa, { exec: fakeExec({ CFBundleExecutable: 'Game', CFBundleVersion: '5' }, { fw: ['UnityAds'] }) })
  assert.equal(b.info.CFBundleVersion, '5')
  assert.ok(b.hits.includes('GADMobileAds'))
  assert.ok(b.hits.includes('ca-app-pub-3940256099942544'))
  assert.ok(b.hits.includes('UnityAds.framework'))
  assert.deepEqual(b.frameworks, [{ name: 'UnityAds', privacy: false }])
})

test('IPA değilse anlaşılır hata', async () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 't-')), 'x.ipa')
  fs.writeFileSync(f, 'zip')
  await assert.rejects(readIos(f, { exec: () => '' }), /Payload/)
})

const base = {
  info: { CFBundleShortVersionString: '1.1', CFBundleVersion: '7', DTPlatformVersion: '26.0', GADApplicationIdentifier: 'ca-app-pub-1~2', NSUserTrackingUsageDescription: 'x', SKAdNetworkItems: [{ SKAdNetworkIdentifier: 'cstr6suwn9.skadnetwork' }], ITSAppUsesNonExemptEncryption: false },
  privacy: {}, provision: { type: 'appstore', name: 'Dist' }, frameworks: [], hits: ['GADMobileAds'], sizeBytes: 80 << 20,
}
const ids = (build, prev = null) => runRules({ build, prev, today: '2026-10-29' }, iosRules).map((f) => f.id)

test('temiz iOS build\'de bulgu yok', () => {
  assert.deepEqual(ids(base, { version: '1.1', buildNumber: '6' }), [])
})

test('iOS kuralları: imza, build no, eski SDK, AdMob kimliği, ATT, boş izin, gizlilik, SKAdNetwork, şifreleme', () => {
  const bad = {
    ...base,
    provision: { type: 'development', name: 'Dev' },
    info: { CFBundleShortVersionString: '1.1', CFBundleVersion: '7', DTPlatformVersion: '18.2', NSCameraUsageDescription: '' },
    privacy: null,
    hits: ['GADMobileAds', 'ca-app-pub-3940256099942544'],
  }
  const got = ids(bad, { version: '1.1', buildNumber: '7' })
  for (const id of ['ios-dev-signed', 'ios-build-number', 'ios-old-sdk', 'test-ad-id', 'ios-admob-app-id', 'ios-att-missing', 'ios-empty-usage', 'ios-privacy-manifest', 'ios-skadnetwork', 'ios-export-compliance']) assert.ok(got.includes(id), id)
})
