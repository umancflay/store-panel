// Her veri kaynağı için: bağlanınca ne gelir, ne gerekir, adım adım nasıl bağlanır.
// Panelde bağlı olmayan kaynakların yerinde bu bilgiler gösterilir.

export interface Requirement {
  id: string
  name: string
  phase: number
  gives: string
  needs: string[]
  steps: string[]
  note?: string
}

export const requirements: Record<string, Requirement> = {
  admob: {
    id: 'admob',
    name: 'AdMob',
    phase: 2,
    gives: 'Reklam geliri, eCPM, gösterim ve fill rate (oyun, ülke, format ve reklam birimi bazında).',
    needs: ['Google Cloud OAuth istemcisi (Client ID + Client secret)', 'Refresh token', 'GitHub Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN'],
    steps: [
      'Google Cloud\'da proje aç ve AdMob API\'yi etkinleştir.',
      'Google Auth Platform\'da izin ekranını oluştur ve "In production" yap.',
      'Clients › Create client › Desktop app ile Client ID ve Client secret al.',
      'Bilgisayarında "node scripts/google-token.mjs" çalıştırıp refresh token üret.',
      'Üç değeri GitHub › Settings › Secrets and variables › Actions\'a gir.',
    ],
  },
  google_play: {
    id: 'google_play',
    name: 'Google Play Console',
    phase: 3,
    gives: 'Çökme ve ANR oranları, yorumlar, sürüm durumu, günlük indirme ve puan. Çökme Google eşiğini aşınca otomatik uyarı.',
    needs: [
      'Google Cloud servis hesabı ve JSON anahtar dosyası',
      'Play Console\'da bu servis hesabına okuma izni',
      'Play Console rapor klasörünün adresi (gs://pubsite_prod_…)',
      'GitHub Secrets: GOOGLE_PLAY_SA_JSON, PLAY_REPORTS_BUCKET',
    ],
    steps: [
      'Google Cloud (store-panel projesi) › APIs & Services › Library: "Google Play Android Developer API" ve "Google Play Developer Reporting API"yi Enable yap.',
      'IAM & Admin › Service Accounts › Create service account. Adı: store-panel-play. Rol seçmeden Done de.',
      'Servis hesabına tıkla › Keys › Add key › Create new key › JSON. İnen dosyayı sakla; gizli bir dosya.',
      'Play Console › Kullanıcılar ve izinler › Yeni kullanıcı davet et. E-posta olarak servis hesabının adresini (…@….iam.gserviceaccount.com) yaz.',
      'Hesap izinleri: "Uygulama bilgilerini görüntüleme ve toplu raporları indirme" ve "Finansal verileri görüntüleme"yi işaretle, davet et.',
      'Play Console › Raporları indir › İstatistikler sayfasında "Cloud Storage URI\'sini kopyala"ya bas (gs://pubsite_prod_rev_… ile başlar).',
      'GitHub Secrets: GOOGLE_PLAY_SA_JSON = JSON dosyasının tamamı (Not Defteri ile aç, hepsini kopyala). PLAY_REPORTS_BUCKET = kopyaladığın gs:// adresi.',
    ],
    note: 'Play Console izinlerinin devreye girmesi 24 saate kadar sürebilir. İlk gün "uygulama bulunamadı" hatası normaldir.',
  },
  app_store: {
    id: 'app_store',
    name: 'App Store Connect',
    phase: 3,
    gives: 'Günlük indirme, uygulama içi satın alma geliri, yorumlar, sürüm ve inceleme durumu, puan. Reddedilen sürüm için otomatik uyarı.',
    needs: [
      'App Store Connect API anahtarı (.p8 dosyası)',
      'Issuer ID ve Key ID',
      'Vendor numarası (indirme ve satış raporu için)',
      'GitHub Secrets: ASC_ISSUER_ID, ASC_KEY_ID, ASC_PRIVATE_KEY, ASC_VENDOR_NUMBER',
    ],
    steps: [
      'App Store Connect › Kullanıcılar ve Erişim › Entegrasyonlar › App Store Connect API › Ekip Anahtarları\'na gir.',
      'İlk kez giriyorsan "Erişim iste"ye bas ve onayla.',
      '"+" ile yeni anahtar oluştur. Ad: store-panel. Erişim: Admin. Panel sadece okur, hiçbir şeyi değiştirmez; satış raporu için bu yetki gerekiyor.',
      '"API Anahtarını İndir"e bas. .p8 dosyası sadece bir kez iner, sakla.',
      'Sayfanın üstündeki Issuer ID\'yi ve anahtarın satırındaki Key ID\'yi kopyala.',
      'Vendor numarası: App Store Connect › Ödemeler ve Finansal Raporlar sayfasının sol üstünde yazan 8 haneli sayı.',
      'GitHub Secrets: ASC_ISSUER_ID, ASC_KEY_ID, ASC_VENDOR_NUMBER ve ASC_PRIVATE_KEY (.p8 dosyasını Not Defteri ile aç, BEGIN/END satırları dahil tamamını yapıştır).',
    ],
  },
  gmail: {
    id: 'gmail',
    name: 'Gmail (politika mailleri)',
    phase: 4,
    gives: 'Play Console, AdMob ve App Store\'dan gelen politika ve inceleme maillerini uyarıya dönüştürür; son tarihi mailden çıkarır, "nasıl düzeltilir" adımlarını Claude yazar.',
    needs: ['Gmail API (Google Cloud\'da açık)', 'Gmail izniyle yeniden üretilmiş GOOGLE_REFRESH_TOKEN'],
    steps: [
      'Google Cloud (store-panel projesi) › APIs & Services › Library\'de "Gmail API"yi bul ve Enable\'a bas.',
      'Google Auth Platform › Data Access › Add or remove scopes\'ta gmail.readonly iznini ekle ve kaydet.',
      'Bilgisayarında proje klasöründe "node scripts/google-token.mjs" komutunu çalıştır. Politika maillerinin geldiği Google hesabını seç ve iki izni de onayla.',
      'Çıkan yeni refresh token\'ı GitHub Secrets\'ta GOOGLE_REFRESH_TOKEN olarak güncelle (eskisinin üzerine yaz).',
      'Actions › Veri topla › Run workflow. Ayarlar\'da Gmail\'in yanında "Bağlı" yazmalı.',
    ],
  },
  claude: {
    id: 'claude',
    name: 'Claude (yapay zeka)',
    phase: 4,
    gives: 'Günün özeti, uyarılara "nasıl düzeltilir" adımları, yorumların gruplanması, cevap taslakları, Asistan sorularının cevabı ve görev önerileri. Sadece önerir; hiçbir şeyi onaysız uygulamaz.',
    needs: ['Claude Pro ya da Max aboneliği', 'GitHub Secret: CLAUDE_CODE_OAUTH_TOKEN'],
    steps: [
      'Bilgisayarına Claude Code\'u kur (Node.js yüklüyse: npm install -g @anthropic-ai/claude-code).',
      'Terminalde "claude setup-token" komutunu çalıştır, tarayıcıda Claude hesabınla onay ver. Ekrana uzun bir token yazar.',
      'Token\'ı GitHub Secrets\'a CLAUDE_CODE_OAUTH_TOKEN adıyla gir. Başka hiçbir yere yapıştırma.',
      'Actions › Veri topla › Run workflow. Ayarlar\'da Claude\'un yanında "Bağlı" yazmalı.',
    ],
  },
  google_ads: {
    id: 'google_ads',
    name: 'Google Ads',
    phase: 6,
    gives: 'Kampanya harcaması, kurulum sayısı, kurulum başı maliyet.',
    needs: ['Google Ads yönetici hesabı', 'Geliştirici token\'ı (Google onayı gerekir)'],
    steps: ['Google Ads › Araçlar › API Merkezi\'nden geliştirici token\'ı başvurusu yap. Onay gelince 6. aşamada bağlanacak.'],
  },
  apple_ads: { id: 'apple_ads', name: 'Apple Ads', phase: 6, gives: 'Arama reklamı harcaması ve kurulumlar.', needs: ['Apple Ads hesabı', 'API erişimi (Apple Ads › Ayarlar › API)'], steps: ['6. aşamada bağlanacak.'] },
  meta: { id: 'meta', name: 'Meta', phase: 6, gives: 'Facebook/Instagram reklam harcaması ve kurulumlar.', needs: ['Meta Business hesabı', 'Marketing API erişimi'], steps: ['6. aşamada bağlanacak.'] },
  tiktok: { id: 'tiktok', name: 'TikTok', phase: 6, gives: 'TikTok reklam harcaması ve kurulumlar.', needs: ['TikTok for Business hesabı', 'Marketing API erişimi'], steps: ['6. aşamada bağlanacak.'] },
}
