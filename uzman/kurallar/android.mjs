// Android build kuralları. Her kural: ne kontrol eder, ne kadar ciddi, hangi politikaya dayanır ve "ne yapmalısın".
// ctx = { build: { kind, manifest, abis, libs, sizeBytes, hits }, prev: { versionCode } | null, game, declared, today, esik, sdk }
// check(ctx) → null (sorun yok) ya da { detail, severity? } (severity verilirse kuralın varsayılanını ezer).
// Yeni bir ret türü öğrenildiğinde buraya yeni bir kural eklenir.

const SENSITIVE = {
  'android.permission.ACCESS_FINE_LOCATION': 'kesin konum',
  'android.permission.ACCESS_COARSE_LOCATION': 'yaklaşık konum',
  'android.permission.ACCESS_BACKGROUND_LOCATION': 'arka planda konum',
  'android.permission.READ_EXTERNAL_STORAGE': 'depolamayı okuma',
  'android.permission.WRITE_EXTERNAL_STORAGE': 'depolamaya yazma',
  'android.permission.MANAGE_EXTERNAL_STORAGE': 'tüm dosyalara erişim',
  'android.permission.QUERY_ALL_PACKAGES': 'yüklü tüm uygulamaları görme',
  'android.permission.READ_SMS': 'SMS okuma',
  'android.permission.RECORD_AUDIO': 'mikrofon',
  'android.permission.CAMERA': 'kamera',
  'android.permission.READ_CONTACTS': 'rehber',
  'android.permission.READ_PHONE_STATE': 'telefon durumu',
}

const BEYAN = {
  ads: 'Reklamlar',
  ad_id: 'Cihaz veya diğer kimlikler (reklam kimliği)',
  device_id: 'Cihaz kimlikleri',
  analytics: 'Uygulama etkinliği / analiz',
  crash_logs: 'Kilitlenme günlükleri',
  location: 'Konum',
  personal: 'Kişisel bilgiler',
}

const mb = (b) => Math.round(b / 1024 / 1024)
const foundSdks = (ctx) => ctx.sdk.sdkler.filter((s) => s.needles.some((n) => ctx.build.hits.includes(n)))
const hasAds = (ctx) => foundSdks(ctx).some((s) => s.beyan.includes('ads'))

export default [
  {
    id: 'version-code-not-increased',
    severity: 'block',
    title: 'Sürüm kodu artırılmamış',
    policy: 'https://developer.android.com/studio/publish/versioning',
    fix: [
      'Unity › File › Build Settings › Player Settings › Other Settings › Bundle Version Code değerini bir artır.',
      'Build\'i yeniden al ve buraya tekrar bırak.',
    ],
    check: (c) =>
      c.prev && c.build.manifest.versionCode <= c.prev.versionCode
        ? { detail: `Bu build'in sürüm kodu ${c.build.manifest.versionCode}, Play'deki/son build ${c.prev.versionCode}. Play aynı ya da küçük kodu kabul etmez.` }
        : null,
  },
  {
    id: 'target-sdk-too-low',
    severity: 'block',
    title: 'Hedef API seviyesi düşük',
    policy: 'https://support.google.com/googleplay/android-developer/answer/11926878',
    fix: [
      'Unity › Player Settings › Other Settings › Target API Level\'ı en yüksek seviyeye ayarla (ya da "Automatic (highest installed)").',
      'Unity Hub › Installs › Unity sürümün › Add modules › Android SDK & NDK Tools güncel değilse güncelle.',
      'Build\'i yeniden al.',
    ],
    check: (c) => {
      const min = c.esik.targetSdk.filter((e) => e.from <= c.today).at(-1)?.min
      return min && c.build.manifest.targetSdk < min
        ? { detail: `Hedef API ${c.build.manifest.targetSdk}; Google ${min} istiyor. Bu haliyle güncelleme kabul edilmez.` }
        : null
    },
  },
  {
    id: 'debuggable',
    severity: 'block',
    title: 'Hata ayıklama (debug) açık',
    policy: 'https://developer.android.com/studio/publish/preparing',
    fix: [
      'Unity › File › Build Settings\'te "Development Build" kutusunu kaldır.',
      'Build\'i yeniden al.',
    ],
    check: (c) => (c.build.manifest.debuggable ? { detail: 'Build "debuggable" işaretli. Play bunu üretime kabul etmez.' } : null),
  },
  {
    id: 'test-ad-id',
    severity: 'block',
    title: 'Test reklam kimliği unutulmuş',
    policy: 'https://developers.google.com/admob/android/test-ads',
    fix: [
      'Unity projesinde ca-app-pub-3940256099942544 ile başlayan kimlikleri ara (reklam betiği / AdMob ayarları).',
      'Hepsini AdMob panelindeki gerçek reklam birimi kimlikleriyle değiştir.',
      'Build\'i yeniden al.',
    ],
    check: (c) =>
      c.build.hits.includes(c.sdk.testAdId)
        ? { detail: 'Build içinde Google\'ın test reklam kimliği bulundu. Bu sürüm yayınlanırsa gerçek reklam gösterilmez, gelir olmaz.' }
        : null,
  },
  {
    id: 'no-arm64',
    severity: 'block',
    title: '64-bit (ARM64) desteği yok',
    policy: 'https://developer.android.com/google/play/requirements/64-bit',
    fix: [
      'Unity › Player Settings › Other Settings › Scripting Backend: IL2CPP.',
      'Target Architectures\'ta ARM64\'ü işaretle.',
      'Build\'i yeniden al.',
    ],
    check: (c) =>
      c.build.libs.length && !c.build.abis.includes('arm64-v8a')
        ? { detail: `Native kütüphaneler sadece şu mimarilerde: ${c.build.abis.join(', ')}. Play 64-bit istiyor.` }
        : null,
  },
  {
    id: 'page-size-16k',
    severity: 'warn',
    title: '16 KB sayfa boyutu uyumu yok',
    policy: 'https://developer.android.com/guide/practices/page-sizes',
    fix: [
      'Unity\'yi 16 KB destekli bir sürüme güncelle (Unity 6000.0.38+, 2022.3.56+ ya da daha yeni).',
      'Üçüncü parti eklentilerin (reklam ağları vb.) güncel sürümlerini kur; eski .so dosyaları bu hataya sebep olur.',
      'Build\'i yeniden al.',
    ],
    check: (c) => {
      const bad = c.build.libs.filter((l) => l.abi === 'arm64-v8a' && l.align !== null && l.align < 16384)
      if (!bad.length) return null
      const sev = c.esik.pageSize16k.filter((e) => e.from <= c.today).at(-1)?.severity
      if (!sev) return null
      return { severity: sev, detail: `16 KB hizalı olmayan kütüphaneler: ${bad.map((l) => l.name).join(', ')}` }
    },
  },
  {
    id: 'ad-id-permission-missing',
    severity: 'warn',
    title: 'Reklam kimliği (AD_ID) izni eksik',
    policy: 'https://support.google.com/googleplay/android-developer/answer/6048248',
    fix: [
      'Reklam SDK\'ları genelde bu izni kendisi ekler; eklemiyorsa Assets/Plugins/Android/AndroidManifest.xml dosyasına',
      '<uses-permission android:name="com.google.android.gms.permission.AD_ID"/> satırını ekle.',
      'Play Console › Uygulama içeriği › Reklam kimliği beyanında "Evet" seçili olsun.',
    ],
    check: (c) =>
      hasAds(c) && !c.build.manifest.permissions.includes('com.google.android.gms.permission.AD_ID')
        ? { detail: 'Build reklam gösteriyor ama AD_ID izni yok. Android 13+ cihazlarda reklam kimliği sıfır gelir, reklam geliri düşer.' }
        : null,
  },
  {
    id: 'sensitive-permissions',
    severity: 'warn',
    title: 'Hassas izinler var',
    policy: 'https://support.google.com/googleplay/android-developer/answer/9888170',
    fix: [
      'Oyun bu izinleri gerçekten kullanmıyorsa kaldır: genelde bir eklenti ekler. Assets/Plugins/Android/AndroidManifest.xml\'e',
      '<uses-permission android:name="İZİN_ADI" tools:node="remove"/> satırı eklenerek silinir.',
      'Kullanıyorsan Play Console › Uygulama içeriği\'nde gerekçesini beyan et.',
    ],
    check: (c) => {
      const found = c.build.manifest.permissions.filter((p) => SENSITIVE[p])
      return found.length ? { detail: found.map((p) => `${p.split('.').pop()} (${SENSITIVE[p]})`).join(', ') } : null
    },
  },
  {
    id: 'data-safety-mismatch',
    severity: 'warn',
    title: 'Veri güvenliği formu build\'le uyuşmuyor',
    policy: 'https://support.google.com/googleplay/android-developer/answer/10787469',
    fix: [
      'Play Console › Uygulama içeriği › Veri güvenliği formunu aç.',
      'Aşağıda listelenen veri türlerini "toplanıyor / paylaşılıyor" olarak işaretle ve gönder.',
      'Panelde Yayın Uzmanı › Veri güvenliği beyanı\'nı da aynı şekilde güncelle.',
    ],
    check: (c) => {
      if (!c.declared) return null
      const need = new Map()
      for (const s of foundSdks(c)) for (const k of s.beyan) if (!c.declared[k]) need.set(k, [...(need.get(k) ?? []), s.ad])
      return need.size ? { detail: [...need].map(([k, sdks]) => `${BEYAN[k]} (${sdks.join(', ')})`).join('; ') } : null
    },
  },
  {
    id: 'data-safety-undeclared',
    severity: 'info',
    title: 'Veri güvenliği beyanı panelde işaretlenmemiş',
    fix: ['Panelde Yayın Uzmanı › Veri güvenliği beyanı\'nda bu oyun için Play\'e ne beyan ettiğini işaretle; uzman build\'le karşılaştırsın.'],
    check: (c) => (c.declared ? null : { detail: `Build'de bulunan SDK'lar: ${foundSdks(c).map((s) => s.ad).join(', ') || 'yok'}` }),
  },
  {
    id: 'big-download',
    severity: 'warn',
    title: 'İndirme boyutu çok büyük',
    policy: 'https://support.google.com/googleplay/android-developer/answer/9859372',
    fix: [
      'Büyük içerikleri Play Asset Delivery ile ayır (Unity › Addressables + Play Asset Delivery).',
      'Doku sıkıştırmasını ASTC yap, kullanılmayan varlıkları projeden çıkar.',
    ],
    check: (c) =>
      mb(c.build.sizeBytes) > c.esik.maxDownloadMb
        ? { detail: `Dosya ${mb(c.build.sizeBytes)} MB. Play'in temel modül sınırı ${c.esik.maxDownloadMb} MB; büyük oyunlar daha az indiriliyor.` }
        : null,
  },
]
