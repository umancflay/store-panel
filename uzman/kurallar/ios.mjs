// iOS build (IPA) kuralları: App Store incelemesinden ya da yüklemeden dönmeye en sık sebep olan şeyler.
// ctx = { build: { info, privacy, provision, frameworks, hits, sizeBytes }, prev: { version, buildNumber } | null, today, esik, sdk }
// check(ctx) → null (sorun yok) ya da { detail, severity? }. Yeni bir ret türü öğrenildiğinde buraya kural eklenir.

import { compareVersions } from '../../scripts/expert/ios.mjs'

const mb = (b) => Math.round(b / 1024 / 1024)
const found = (c) => c.sdk.sdkler.filter((s) => (s.ios ?? []).some((n) => c.build.hits.includes(n)))
const hasAds = (c) => found(c).some((s) => s.beyan.includes('ads'))
const has = (c, id) => found(c).some((s) => s.id === id)

export default [
  {
    id: 'ios-dev-signed',
    severity: 'block',
    title: 'Build geliştirme imzalı, App Store\'a yüklenemez',
    policy: 'https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases',
    fix: [
      'Xcode › Product › Archive.',
      'Organizer › Distribute App › "App Store Connect" seç (Development ya da Ad Hoc değil).',
      'Çıkan .ipa\'yı buraya bırak.',
    ],
    check: (c) =>
      c.build.provision && c.build.provision.type !== 'appstore'
        ? { detail: `İmza profili "${c.build.provision.name ?? '?'}" bir ${c.build.provision.type === 'development' ? 'geliştirme' : 'ad hoc'} profili. App Store Connect bu build'i kabul etmez.` }
        : null,
  },
  {
    id: 'ios-build-number',
    severity: 'block',
    title: 'Build numarası artırılmamış',
    policy: 'https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundleversion',
    fix: [
      'Unity › Player Settings › iOS › Other Settings › Build değerini bir artır (ya da Xcode › General › Build).',
      'Build\'i yeniden al.',
    ],
    check: (c) => {
      const v = c.build.info.CFBundleShortVersionString
      const n = c.build.info.CFBundleVersion
      return c.prev && c.prev.version === v && c.prev.buildNumber && compareVersions(n, c.prev.buildNumber) <= 0
        ? { detail: `Sürüm ${v} için App Store Connect'te zaten ${c.prev.buildNumber} numaralı build var; bu build'in numarası ${n}. Apple aynı ya da küçük numarayı reddeder.` }
        : null
    },
  },
  {
    id: 'ios-old-sdk',
    severity: 'block',
    title: 'Eski Xcode / iOS SDK ile derlenmiş',
    policy: 'https://developer.apple.com/news/upcoming-requirements/',
    fix: ['Mac\'te Xcode\'u App Store\'dan güncelle.', 'Unity projesinden Xcode projesini yeniden üret, yeni Xcode ile Archive al.'],
    check: (c) => {
      const need = c.esik.iosSdk.filter((e) => e.from <= c.today).at(-1)
      const sdk = parseFloat(c.build.info.DTPlatformVersion ?? String(c.build.info.DTSDKName ?? '').replace(/^\D+/, ''))
      return need && sdk && sdk < need.min
        ? { detail: `Build iOS ${sdk} SDK ile alınmış; Apple ${need.from} itibarıyla en az iOS ${need.min} SDK (Xcode ${need.xcode}) istiyor. Yükleme reddedilir.` }
        : null
    },
  },
  {
    id: 'test-ad-id',
    severity: 'block',
    title: 'Test reklam kimliği unutulmuş',
    policy: 'https://developers.google.com/admob/ios/test-ads',
    fix: ['Unity projesinde ca-app-pub-3940256099942544 ile başlayan kimlikleri ara (reklam betiği / AdMob ayarları › iOS App ID).', 'Hepsini AdMob\'daki gerçek iOS kimlikleriyle değiştir, build\'i yeniden al.'],
    check: (c) => (c.build.hits.includes(c.sdk.testAdId) ? { detail: 'Build içinde Google\'ın test reklam kimliği var. Yayınlanırsa gerçek reklam gösterilmez, gelir olmaz.' } : null),
  },
  {
    id: 'ios-admob-app-id',
    severity: 'block',
    title: 'AdMob uygulama kimliği Info.plist\'te yok',
    policy: 'https://developers.google.com/admob/ios/quick-start#update_your_infoplist',
    fix: ['Unity › Assets › Google Mobile Ads › Settings › iOS App ID alanına AdMob\'daki iOS uygulama kimliğini (ca-app-pub-…~…) yaz.', 'Build\'i yeniden al.'],
    check: (c) => (has(c, 'admob') && !c.build.info.GADApplicationIdentifier ? { detail: 'AdMob SDK\'sı var ama GADApplicationIdentifier yok. Oyun açılır açılmaz çöker; Apple 2.1 (uygulama tamlığı) ile reddeder.' } : null),
  },
  {
    id: 'ios-att-missing',
    severity: 'warn',
    title: 'Takip izni (ATT) metni yok',
    policy: 'https://developer.apple.com/app-store/user-privacy-and-data-use/',
    fix: [
      'Info.plist\'e NSUserTrackingUsageDescription ekle (Unity: Player Settings › iOS › "User Tracking Usage Description").',
      'Örnek: "Reklamları sana daha uygun göstermek için izninle cihaz kimliğini kullanırız."',
      'Oyun açılırken ATT izin penceresini göster (Unity iOS 14 Advertising Support paketi).',
    ],
    check: (c) => (hasAds(c) && !c.build.info.NSUserTrackingUsageDescription ? { detail: 'Reklam SDK\'sı var ama takip izni metni yok. İzin sorulmadan reklam kimliği kullanılırsa Apple 5.1.2 ile reddeder; izin olmadan da reklam geliri düşük kalır.' } : null),
  },
  {
    id: 'ios-empty-usage',
    severity: 'block',
    title: 'Boş izin açıklaması',
    policy: 'https://developer.apple.com/documentation/bundleresources/information-property-list/protected-resources',
    fix: ['Unity › Player Settings › iOS › Other Settings\'te boş olan "Usage Description" alanlarını doldur ya da o özelliği kullanmıyorsan kaldır.', 'Açıklama neden izin istediğini açıkça söylemeli (ör. "Fotoğrafını profil resmi yapmak için").'],
    check: (c) => {
      const empty = Object.entries(c.build.info).filter(([k, v]) => /^NS\w+UsageDescription$/.test(k) && !String(v ?? '').trim()).map(([k]) => k)
      return empty.length ? { detail: `Boş açıklamalar: ${empty.join(', ')}. Apple yüklemeyi reddeder (ITMS-90683).` } : null
    },
  },
  {
    id: 'ios-privacy-manifest',
    severity: 'warn',
    title: 'Gizlilik bildirimi (PrivacyInfo) eksik',
    policy: 'https://developer.apple.com/documentation/bundleresources/privacy-manifest-files',
    fix: [
      'Unity 2022.3 ve üstü gizlilik bildirimini kendisi ekler; Unity\'yi güncel LTS\'e yükselt.',
      'Listelenen SDK\'ları (Package Manager / External Dependency Manager) en son sürüme güncelle; yeni sürümler kendi bildirimini getirir.',
    ],
    check: (c) => {
      const missingFw = c.build.frameworks.filter((f) => !f.privacy && f.name !== 'UnityFramework').map((f) => f.name)
      if (!c.build.privacy) return { detail: `Uygulamada PrivacyInfo.xcprivacy yok${missingFw.length ? `; bildirimsiz SDK'lar: ${missingFw.join(', ')}` : ''}. Apple yüklemede uyarı (ITMS-91053) verir, bazı SDK'larda reddeder.` }
      return missingFw.length ? { severity: 'info', detail: `Uygulamanın bildirimi var ama şu SDK'larda yok: ${missingFw.join(', ')}. Güncel sürümlerinde var.` } : null
    },
  },
  {
    id: 'ios-skadnetwork',
    severity: 'warn',
    title: 'SKAdNetwork listesi eksik',
    policy: 'https://developers.google.com/admob/ios/ios14#skadnetwork',
    fix: ['Unity: Google Mobile Ads › Settings\'te SKAdNetwork listesini aç (ya da Google\'ın listesini Info.plist\'e ekle).', 'Mediation ağları kullanıyorsan onların SKAdNetwork kimliklerini de ekle.'],
    check: (c) => {
      if (!has(c, 'admob')) return null
      const ids = (c.build.info.SKAdNetworkItems ?? []).map((x) => String(x.SKAdNetworkIdentifier ?? '').toLowerCase())
      return ids.includes('cstr6suwn9.skadnetwork') ? null : { detail: 'AdMob var ama Google\'ın SKAdNetwork kimliği (cstr6suwn9.skadnetwork) yok. Reklam verenler dönüşümü ölçemez, iOS reklam gelirin düşer.' }
    },
  },
  {
    id: 'ios-export-compliance',
    severity: 'info',
    title: 'Şifreleme beyanı Info.plist\'te yok',
    policy: 'https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations',
    fix: ['Oyun sadece HTTPS kullanıyorsa Info.plist\'e ITSAppUsesNonExemptEncryption = NO ekle (Unity: bir post-process betiğiyle).', 'Böylece her yüklemede App Store Connect "şifreleme" sorusunu sormaz ve build hemen teste hazır olur.'],
    check: (c) => (c.build.info.ITSAppUsesNonExemptEncryption === undefined ? { detail: 'Her yeni build\'de App Store Connect şifreleme sorusunu sorar; cevaplanana kadar build TestFlight\'a ve incelemeye gönderilemez.' } : null),
  },
  {
    id: 'ios-big',
    severity: 'info',
    title: 'Build büyük',
    fix: ['Kullanılmayan varlıkları kaldır, dokuları sıkıştır (ASTC), büyük içerikleri Addressables ile sonradan indir.'],
    check: (c) => (mb(c.build.sizeBytes) > c.esik.iosCellularMb ? { detail: `IPA ${mb(c.build.sizeBytes)} MB. ${c.esik.iosCellularMb} MB üstünde kullanıcılar mobil veride indirirken onay penceresi görür, bir kısmı vazgeçer.` } : null),
  },
]
