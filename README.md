# Store Panel

Unity oyunlarım için yönetim paneli. App Store Connect, Google Play Console ve AdMob verilerini tek yerde gösterir. Claude sorunları bulur ve çözüm önerir.

- **Site:** GitHub Pages (bedava, statik)
- **Giriş ve veritabanı:** Supabase (bedava plan)
- **Veri toplama ve yapay zeka:** GitHub Actions (bedava)
- **Telefonda:** Ana ekrana eklenip uygulama gibi açılır (PWA)

> 🔒 Bu repo herkese açık. Kodda hiçbir şifre, anahtar ya da token yok. Hepsi GitHub Secrets'ta ve Supabase'de duruyor.

---

## Aşamalar

| Aşama | İçerik | Durum |
|---|---|---|
| 1 | Site iskeleti, giriş (iki adımlı doğrulama dahil), veritabanı, PWA, otomatik yayın. Örnek verilerle. | ✅ Bitti |
| 2 | AdMob bağlantısı ve günlük veri çekme | ✅ Bitti |
| 3 | Google Play ve App Store Connect | ✅ Bitti |
| 3+ | Yeni tasarım ve çalışma sayfaları: Komuta, Görevler, Plan, Ortak plan, Otomasyon, Notlar, Takvim | ✅ Bitti |
| 4 | Gmail'den politika uyarıları, Claude analizi, telefon bildirimleri | ✅ Bitti (kurulum aşağıda) |
| 5 | Reklam planları ve onay sistemi | ⏳ |
| 6 | Reklam platformu bağlantıları | ⏳ |
| 7 | Otomatik düzeltme ve yayınlama (onaylı): Claude sorunu çözer, Unity build alır, mağazaya yükler | ⏳ |

### 7. aşama planı: Otomatik düzeltme ve yayınlama

Akış: **sorun tespit edilir → Claude çözümü hazırlar → panelde "Onayla" → sistem uygular.** Onay olmadan hiçbir şey yayınlanmaz.

| İş | Google Play | App Store |
|---|---|---|
| Unity build alma (AAB / IPA) | GitHub Actions + GameCI | GitHub Actions macOS makinesi |
| Build yükleme, test/üretim kanalı | API ile | API ile |
| Mağaza açıklaması, sürüm notları | API ile | API ile |
| İncelemeye gönderme | API ile | API ile |
| Unity ayar/kod düzeltmesi | Claude oyun reposuna PR açar | Claude oyun reposuna PR açar |
| Yorumlara cevap | API ile | API ile |
| İçerik derecelendirme, reklam beyanı, hedef kitle formları | API yok: adım adım tarif | API yok: adım adım tarif |

Gerekenler: oyun kodlarının GitHub'da olması, Unity lisansının Actions'ta etkinleştirilmesi, **yazma yetkili ayrı bir servis hesabı** (okuma hesabı ayrı kalır) ve App Store için yazma yetkili API anahtarı.

---

## Kurulum (1. aşama)

Adımları sırayla yap. Toplam 30-40 dakika sürer.

### Adım 1: Supabase projesi aç

1. [supabase.com](https://supabase.com) adresine git, **Start your project** de, GitHub hesabınla giriş yap.
2. **New project**'e tıkla.
3. Bilgileri doldur:
   - **Name:** `store-panel`
   - **Database Password:** Uzun bir şifre üret ve bir yere kaydet (şifre yöneticisi gibi).
   - **Region:** `Central EU (Frankfurt)`. Türkiye'ye en yakını bu.
   - **Plan:** Free
4. **Create new project**'e tıkla ve 1-2 dakika bekle.

### Adım 2: Veritabanı tablolarını oluştur

1. Supabase'de sol menüden **SQL Editor**'e gir.
2. **New query**'ye tıkla.
3. Bu repodaki [`supabase/schema.sql`](supabase/schema.sql) dosyasını aç, içeriğin **tamamını** kopyala ve editöre yapıştır.
4. Sağ alttaki **Run** butonuna bas. Ekranda "Success. No rows returned" görmelisin.

Bu dosya tüm tabloları oluşturur ve her tabloda **RLS** (satır güvenliği) kuralını açar. Böylece sadece admin listesindeki ve iki adımlı doğrulamayı geçmiş kişiler veri görebilir.

### Adım 3: Yeni kayıtları kapat

Siteden kimse kendi kendine hesap açamasın:

1. Sol menüden **Authentication**'a gir, sonra **Sign In / Providers**'a tıkla.
2. **Allow new users to sign up** seçeneğini **kapat**.
3. **Email** sağlayıcısının açık olduğundan emin ol.
4. **Save** de.

İki adımlı doğrulama (TOTP) Supabase'de varsayılan olarak açıktır. Kontrol etmek için **Authentication › Multi-Factor**'e bak: **TOTP** "Enabled" olmalı.

### Adım 4: Admin hesaplarını ekle

İki hesap açacağız: biri sana, biri arkadaşına.

1. **Authentication › Users**'a gir.
2. **Add user › Create new user**'a tıkla.
3. E-posta ve şifreyi yaz. **Auto Confirm User** seçeneğini işaretle.
4. **Create user** de.
5. Aynısını arkadaşın için de yap.

Sonra bu iki e-postayı admin listesine ekle:

1. **SQL Editor › New query**'ye gir.
2. [`supabase/admins.sql`](supabase/admins.sql) dosyasını yapıştır.
3. İçindeki örnek e-postaları **kendi e-postalarınla** değiştir.
4. **Run**'a bas.

> Sadece `admins` tablosundaki e-postalar veri görebilir. Birini çıkarmak için o satırı sil: **Table Editor › admins**.

### Adım 5: Supabase anahtarlarını al

1. Sol alttaki **Project Settings** (dişli ikonu) menüsüne gir.
2. **Data API** sayfasındaki **Project URL**'yi kopyala. `https://xxxx.supabase.co` gibi görünür.
3. **API Keys** sayfasında iki anahtar var:
   - **anon / public** (veya **publishable**): Siteye gider. Gizli değildir, veriyi RLS korur.
   - **service_role** (veya **secret**): **Çok gizli.** Sadece GitHub Secrets'a girer. Asla kodun içine, siteye ya da bir mesaja yapıştırma.

### Adım 6: GitHub reposunu oluştur ve kodu yükle

1. [github.com/new](https://github.com/new) adresine git.
2. **Repository name:** `store-panel`, görünürlük: **Public**. README ekleme seçeneğini işaretleme.
3. **Create repository**'ye tıkla.
4. Bilgisayarında bu klasörde bir terminal aç ve şunları çalıştır. `KULLANICI_ADIN` yerine kendi GitHub kullanıcı adını yaz:

```bash
git add .
```

```bash
git commit -m "1. aşama: site iskeleti"
```

```bash
git remote add origin https://github.com/KULLANICI_ADIN/store-panel.git
```

```bash
git push -u origin main
```

### Adım 7: GitHub Secrets'ı gir

Repoda **Settings › Secrets and variables › Actions › New repository secret**'a gir. Aşağıdaki her satır için ayrı bir secret ekle:

| Secret adı | Değer | Nereden |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` | Adım 5, Project URL |
| `VITE_SUPABASE_ANON_KEY` | anon / publishable anahtar | Adım 5 |
| `SUPABASE_URL` | `https://xxxx.supabase.co` (yukarıdakiyle aynı) | Adım 5 |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret anahtar | Adım 5 (**gizli!**) |

`VITE_` ile başlayanlar siteye girer. Diğerleri sadece GitHub Actions'ta kalır.

### Adım 8: GitHub Pages'i aç

1. Repoda **Settings › Pages**'e gir.
2. **Source** kısmında **GitHub Actions**'ı seç.
3. Üstteki **Actions** sekmesine geç. "Siteyi yayınla" işini seç, sonra **Run workflow › Run workflow**'a bas.
4. İş yeşil tikle bitince siten şu adreste açılır:
   `https://KULLANICI_ADIN.github.io/store-panel/`

Bundan sonra `main`'e her push'ta site kendiliğinden güncellenir.

### Adım 9: Site adresini Supabase'e tanıt

1. Supabase'de **Authentication › URL Configuration**'a gir.
2. **Site URL** alanına `https://KULLANICI_ADIN.github.io/store-panel/` yaz.
3. **Save** de.

### Adım 10: İlk giriş ve iki adımlı doğrulama

1. Siteyi aç, e-posta ve şifrenle giriş yap.
2. İlk girişte bir QR kod çıkar. Telefonundaki **Google Authenticator**, **Microsoft Authenticator** veya **Authy** uygulamasıyla bu kodu okut.
3. Uygulamanın gösterdiği 6 haneli kodu yaz.
4. Sonraki girişlerde sadece 6 haneli kod sorulur.

> Telefonunu kaybedersen: Supabase'de **Authentication › Users**'a gir, kendi hesabına tıkla ve **MFA factors** altındaki kaydı sil. Bir sonraki girişte yeni QR kod çıkar.

### Adım 11: "Şimdi güncelle" butonunu kur

Bu buton GitHub'daki veri toplama işini başlatır. Bunun için bir GitHub token'ı gerekiyor. Token sitede değil, Supabase'de durur.

**a) GitHub token'ı oluştur**

1. GitHub'da sağ üstteki profil fotoğrafına tıkla, sonra **Settings › Developer settings › Personal access tokens › Fine-grained tokens › Generate new token**'a gir.
2. **Token name:** `store-panel-guncelle`. **Expiration:** 1 yıl.
3. **Repository access:** **Only select repositories**'i seç ve `store-panel`'i işaretle.
4. **Permissions › Repository permissions › Actions**: **Read and write** yap.
5. **Generate token**'a tıkla ve token'ı kopyala. Sadece bir kez gösterilir.

**b) Edge Function'ı yükle**

1. Supabase'de **Edge Functions**'a gir, **Deploy a new function › Via Editor**'ü seç.
2. Fonksiyon adı olarak tam olarak `trigger-update` yaz.
3. Editördeki kodu sil. Yerine [`supabase/functions/trigger-update/index.ts`](supabase/functions/trigger-update/index.ts) dosyasının içeriğini yapıştır.
4. **Deploy function**'a tıkla.

**c) Fonksiyonun secret'larını gir**

1. **Edge Functions › Secrets**'a gir.
2. İki secret ekle:
   - `GH_REPO` = `KULLANICI_ADIN/store-panel`
   - `GH_DISPATCH_TOKEN` = (a) adımında kopyaladığın token
3. **Save** de.

Artık sitede **Şimdi güncelle**'ye bastığında GitHub'daki "Veri topla" işi başlar. Durumunu repodaki **Actions** sekmesinden izleyebilirsin.

---

## Kurulum (2. aşama): AdMob bağlantısı

Bu aşamadan sonra panel AdMob'daki gerçek reklam gelirlerini gösterir: gelir, eCPM, gösterim ve fill rate (oyun, ülke, format ve reklam birimi bazında). Veriler her sabah 08:00'de kendiliğinden güncellenir.

İndirme, puan ve çökme verileri 3. aşamada gelecek. O zamana kadar panelde bu alanlar "—" olarak görünür.

### Adım 1: Veritabanına AdMob fonksiyonlarını ekle

1. Supabase'de **SQL Editor › New query**'ye gir.
2. [`supabase/phase2-admob.sql`](supabase/phase2-admob.sql) dosyasının tamamını yapıştır.
3. **Run**'a bas.

### Adım 2: Google Cloud projesi aç ve AdMob API'yi aç

1. [console.cloud.google.com](https://console.cloud.google.com) adresine **AdMob hesabının bağlı olduğu Google hesabıyla** gir.
2. Üstteki proje seçiciden **New project**'e tıkla. Adı `store-panel` olsun, **Create** de.
3. Proje seçiliyken [AdMob API sayfasına](https://console.cloud.google.com/apis/library/admob.googleapis.com) git ve **Enable**'a bas.

### Adım 3: İzin ekranını ayarla

1. Sol menüden **Google Auth Platform**'a gir (eski adı: OAuth consent screen), sonra **Get started**'a tıkla.
2. **App name:** `Store Panel`. **User support email:** kendi e-postan.
3. **Audience:** **External**'ı seç.
4. **Contact information:** kendi e-postan. Şartları kabul et ve **Create** de.
5. Sol menüden **Audience**'a gir ve **Publish app › Confirm**'e bas.

> Bu son adım önemli. Uygulama "Testing" modunda kalırsa Google bağlantıyı **7 günde bir koparır**. "In production" olunca kopmaz. Google uygulamanı doğrulamadığı için izin ekranında bir uyarı çıkar. Bu normal, çünkü uygulamayı sadece sen kullanıyorsun.

### Adım 4: OAuth istemcisi oluştur

1. **Google Auth Platform › Clients › Create client**'a gir.
2. **Application type:** **Desktop app**. **Name:** `store-panel`.
3. **Create**'e bas. Açılan pencerede **Client ID** ve **Client secret** yazar. İkisini de bir kenara kopyala.

### Adım 5: Refresh token üret (bilgisayarında, bir kez)

Bu klasörde bir terminal aç ve şunu çalıştır:

```bash
node scripts/google-token.mjs
```

1. Senden önce **Client ID**'yi, sonra **Client secret**'ı ister. Yapıştır ve Enter'a bas.
2. Tarayıcıda Google izin ekranı açılır. **AdMob hesabının bağlı olduğu** Google hesabını seç.
3. "Google bu uygulamayı doğrulamadı" uyarısı çıkarsa: **Gelişmiş › Store Panel'e git (güvenli değil)**'e tıkla. Bu uygulama senin kendi uygulaman.
4. İzin ver. Tarayıcıda "Tamam!" yazısı çıkar.
5. Terminale dön. Orada uzun bir **refresh token** yazıyor. Onu kopyala.

### Adım 6: GitHub Secrets'a üç değer ekle

Repoda **Settings › Secrets and variables › Actions › New repository secret**'a gir:

| Secret adı | Değer |
|---|---|
| `GOOGLE_CLIENT_ID` | Adım 4'teki Client ID |
| `GOOGLE_CLIENT_SECRET` | Adım 4'teki Client secret (**gizli**) |
| `GOOGLE_REFRESH_TOKEN` | Adım 5'teki refresh token (**gizli**) |

### Adım 7: İlk veri çekme

1. Repoda **Actions** sekmesine geç ve soldan **Veri topla**'yı seç.
2. **Run workflow › Run workflow**'a bas.
3. İş yeşil tikle bitince paneli yenile. İlk çalıştırma son 60 günü çeker.

Paneldeki **Ayarlar** sayfasında AdMob'un yanında **Bağlı** yazmalı. Oyunlar AdMob'daki uygulama adlarına göre kendiliğinden eşleşir. AdMob'da adı farklı olan bir oyun panelde yeni bir oyun olarak görünür.

> Hata alırsan **Actions**'ta kırmızı işe tıkla, **collect** adımını aç ve hatayı oku. En sık sebep: refresh token'ın AdMob'a bağlı olmayan bir Google hesabıyla üretilmiş olması.

---

## Kurulum (3. aşama): Google Play ve App Store

Panel artık **sadece gerçek veri** gösterir. Bağlı olmayan bir kaynağın yerinde "ne gerekiyor, nasıl bağlanır" kartı çıkar. Aynı rehberler sitedeki **Ayarlar › Bağlantı rehberleri** bölümünde de var.

Önce Supabase'de **SQL Editor › New query**'ye gir, [`supabase/phase3-stores.sql`](supabase/phase3-stores.sql) dosyasını yapıştır ve **Run**'a bas.

### Google Play Console

Bağlanınca gelenler: çökme ve ANR oranı, yorumlar, sürüm durumu, günlük indirme ve puan, oyuncuların ülke / dil / cihaz / Android sürümü kırılımı (oyun sayfasında "Oyuncular"). Çökme oranı Google'ın eşiğini aşınca otomatik uyarı da oluşur.

1. Google Cloud'da (`store-panel` projesi) **APIs & Services › Library**'ye gir. **Google Play Android Developer API** ve **Google Play Developer Reporting API**'yi bul, ikisini de **Enable** yap.
2. **IAM & Admin › Service Accounts › Create service account**'a gir. Adı `store-panel-play` olsun. Rol seçmeden **Done** de.
3. Oluşan servis hesabına tıkla, sonra **Keys › Add key › Create new key › JSON**'a bas. Bir dosya iner. Bu dosya gizlidir, sakla.
4. **Play Console › Kullanıcılar ve izinler › Yeni kullanıcı davet et**'e gir. E-posta olarak servis hesabının adresini (`…@….iam.gserviceaccount.com`) yaz.
5. İzinlerde **Uygulama bilgilerini görüntüleme ve toplu raporları indirme** ile **Finansal verileri görüntüleme**'yi seç ve davet et.
6. **Play Console › Raporları indir › İstatistikler** sayfasında **Cloud Storage URI'sini kopyala**'ya bas. Kopyalanan adres `gs://pubsite_prod_rev_…` ile başlar.
7. GitHub Secrets'a iki değer ekle:
   - `GOOGLE_PLAY_SA_JSON`: JSON dosyasını Not Defteri ile aç ve içeriğin tamamını yapıştır.
   - `PLAY_REPORTS_BUCKET`: 6. adımda kopyaladığın `gs://` adresi.

> Play Console izinlerinin devreye girmesi 24 saate kadar sürebilir.

8. Oyuncu kırılımları için Supabase **SQL Editor**'da [`supabase/phase8-play-breakdowns.sql`](supabase/phase8-play-breakdowns.sql) dosyasını bir kez çalıştır.

### App Store Connect

Bağlanınca gelenler: günlük indirme, uygulama içi satın alma geliri (USD'ye çevrilir), yorumlar, sürüm ve inceleme durumu, puan. Bir sürüm reddedilince otomatik uyarı da oluşur.

1. **App Store Connect › Kullanıcılar ve Erişim › Entegrasyonlar › App Store Connect API › Ekip Anahtarları**'na gir. İlk kez giriyorsan önce erişim iste.
2. **+** ile yeni bir anahtar oluştur. Ad `store-panel`, erişim **Admin** olsun. Panel sadece okur, hiçbir şeyi değiştirmez; satış raporunu okumak için bu yetki gerekiyor.
3. **API Anahtarını İndir**'e bas. `.p8` dosyası sadece bir kez iner, sakla.
4. Sayfanın üstündeki **Issuer ID**'yi ve anahtarın satırındaki **Key ID**'yi kopyala.
5. **Ödemeler ve Finansal Raporlar** sayfasının sol üstünde yazan 8 haneli sayı senin **vendor numaran**.
6. GitHub Secrets'a dört değer ekle:
   - `ASC_ISSUER_ID`: 4. adımdaki Issuer ID.
   - `ASC_KEY_ID`: 4. adımdaki Key ID.
   - `ASC_VENDOR_NUMBER`: 5. adımdaki vendor numarası.
   - `ASC_PRIVATE_KEY`: `.p8` dosyasını Not Defteri ile aç ve `BEGIN`/`END` satırları dahil tamamını yapıştır.

Anahtarları girdikten sonra **Actions › Veri topla › Run workflow** ile hemen çalıştırabilirsin.

---

## Kurulum (4. aşama): Gmail, Claude ve telefon bildirimleri

Bu aşamadan sonra:

- **Gmail:** Play Console, AdMob ve App Store'dan gelen politika ve inceleme mailleri 6 saatte bir okunur, **Uyarılar** sayfasına düşer. Mailde son tarih yazıyorsa o da alınır. Aynı mail iki kez eklenmez.
- **Claude:** Her sabah günün özetini yazar (Ana sayfada görünür), uyarılara adım adım çözüm ekler, yorumları gruplar ve cevap taslağı hazırlar, Asistan'daki soruları cevaplar, görevlere öneri yazar. Sorular 6 saatte bir de cevaplanır.
- **Telefon bildirimi:** Kritik bir uyarı açılınca bildirimi açtığın telefonlara bildirim gider. İstersen her sabah günün özeti de gelir.

> 🔒 **Yapay zeka sadece önerir.** Claude'a hiçbir araç verilmez: komut çalıştıramaz, dosya okuyamaz, internete çıkamaz. Sadece panelin hazırladığı özeti görür ve metin yazar. Para harcayan ya da mağazada bir şey değiştiren hiçbir işlem yapılmaz. Yorum cevap taslakları mağazaya **gönderilmez**; sen kopyalayıp yapıştırırsın (tek tıkla gönderme 7. aşamada, onayınla gelecek).
>
> Kodda hiçbir anahtar yok. Her şey GitHub Secrets'ta.

Adımları sırayla yap. Toplam 20-30 dakika sürer.

### Adım 1: Veritabanı eklerini çalıştır

1. Supabase'de **SQL Editor › New query**'ye gir.
2. [`supabase/phase4.sql`](supabase/phase4.sql) dosyasının tamamını yapıştır.
3. **Run**'a bas. "Success" görmelisin. (Tekrar çalıştırılabilir.)

### Adım 2: Gmail API'yi aç

1. [console.cloud.google.com](https://console.cloud.google.com) adresine gir. Üstte **store-panel** projesinin seçili olduğundan emin ol.
2. [Gmail API sayfasına](https://console.cloud.google.com/apis/library/gmail.googleapis.com) git ve **Enable**'a bas.

> **Data Access** sayfasına Gmail iznini **ekleme**. Gmail "kısıtlı izin" sayılır; oraya eklersen Google video ve gerekçe ile doğrulama başvurusu ister. Kendi hesabın için gerek yok: izin, Adım 3'te token üretirken istenir ve "doğrulanmamış uygulama" uyarısını geçmen yeterli olur.

> `gmail.readonly` sadece okuma iznidir. Panel mail silemez, gönderemez, etiket değiştiremez. Sadece Google Play, AdMob ve Apple'dan gelen mailleri arar.

### Adım 3: Google refresh token'ını Gmail izniyle yenile

2. aşamadaki token sadece AdMob iznini taşıyor. Gmail için bir kez daha üretmen gerekiyor.

1. Bilgisayarında proje klasöründe bir terminal aç ve en son kodu çek:

```bash
git pull
```

2. Token üreticisini çalıştır:

```bash
node scripts/google-token.mjs
```

3. **Client ID** ve **Client secret**'ı yapıştır (2. aşamadakilerin aynısı).
4. Tarayıcıda açılan ekranda **politika maillerinin geldiği** Google hesabını seç. AdMob hesabın da buysa daha iyi; değilse bir sonraki nota bak.
5. "Google bu uygulamayı doğrulamadı" uyarısında **Gelişmiş › Store Panel'e git**'e tıkla.
6. **İki izni de** (AdMob ve Gmail) işaretleyip onayla.
7. Terminalde çıkan yeni refresh token'ı kopyala.
8. GitHub'da **Settings › Secrets and variables › Actions**'a gir. `GOOGLE_REFRESH_TOKEN`'ın yanındaki kalem ikonuna bas, yeni değeri yapıştır ve **Update secret** de.

> Token tek bir Google hesabına bağlıdır. AdMob ve mağaza mailleri **aynı** hesaptaysa sorun yok. Farklı hesaplardaysa: mail hesabında Gmail › Ayarlar › Yönlendirme ile `googleplay-noreply@google.com`, `admob-noreply@google.com` ve `email.apple.com`'dan gelen mailleri AdMob hesabına yönlendir.

### Adım 4: Claude token'ını al

Claude, Claude Pro ya da Max aboneliğinle çalışır. API anahtarı **kullanılmaz**, ek ücret çıkmaz (aboneliğinin kullanım limitinden düşer).

1. Bilgisayarında [Node.js](https://nodejs.org) yüklü olsun. Claude Code'u kur:

```bash
npm install -g @anthropic-ai/claude-code
```

2. Token üret:

```bash
claude setup-token
```

3. Tarayıcıda Claude hesabınla giriş yap ve onay ver.
4. Terminale dön. `sk-ant-oat…` ile başlayan uzun token'ı kopyala.
5. GitHub'da **Settings › Secrets and variables › Actions › New repository secret**:
   - **Name:** `CLAUDE_CODE_OAUTH_TOKEN`
   - **Secret:** kopyaladığın token

> İsteğe bağlı: Hangi Claude modelinin kullanılacağını seçmek için aynı sayfadaki **Variables** sekmesinde `CLAUDE_MODEL` adlı bir değişken aç (ör. `opus` ya da `sonnet`). Girmezsen `opus` kullanılır. Abonelik limiti dolarsa `sonnet` yazmak daha az harcar.

### Adım 5: Bildirim anahtarlarını (VAPID) üret

1. Proje klasöründe şunu çalıştır:

```bash
node scripts/vapid-keys.mjs
```

2. Ekranda iki değer çıkar. GitHub Secrets'a **dört** secret ekle:

| Secret adı | Değer |
|---|---|
| `VAPID_PUBLIC_KEY` | Ekrandaki ilk değer (public) |
| `VITE_VAPID_PUBLIC_KEY` | Aynı ilk değer (siteye gider, gizli değildir) |
| `VAPID_PRIVATE_KEY` | Ekrandaki ikinci değer (**gizli**) |
| `VAPID_SUBJECT` | `mailto:` ve kendi e-postan, ör. `mailto:umut@ornek.com` |

> Anahtarları bir kez üret. Sonradan değiştirirsen telefonlardaki bildirim izni geçersiz olur ve her cihazda bildirimi yeniden açman gerekir.

### Adım 6: Siteyi yeniden yayınla

`VITE_VAPID_PUBLIC_KEY` siteye derleme sırasında girer. Bu yüzden siteyi bir kez yeniden yayınla:

1. Repoda **Actions** sekmesine geç, soldan **Siteyi yayınla**'yı seç.
2. **Run workflow › Run workflow**'a bas ve yeşil tiki bekle.

### Adım 7: Telefonda bildirimleri aç

1. iPhone'da siteyi **ana ekrana eklemiş** olmalısın (yukarıdaki "Telefonda ana ekrana ekleme" bölümü). iPhone'da bildirim sadece ana ekran uygulamasında çalışır.
2. Ana ekrandaki ikondan paneli aç ve giriş yap.
3. **Ayarlar › Bildirimler**'e gir, **Bu cihazda bildirimleri aç** satırında **Aç**'a bas ve izin ver.
4. **Kritik uyarılarda bildir** açık kalsın. Her sabah özet istiyorsan **Günün özeti hazır olunca bildir**'i de aç.
5. Bildirim almak istediğin her cihazda (arkadaşının telefonu dahil) bu adımları tekrarla.

### Adım 8: İlk çalıştırma

1. **Actions › Veri topla › Run workflow › Run workflow**'a bas.
2. İş bitince **Ayarlar** sayfasında Gmail ve Claude'un yanında **Bağlı** yazmalı.
3. Ana sayfada günün özeti, Uyarılar'da "nasıl düzeltilir" adımları, Yorumlar'da gruplar ve cevap taslakları görünür.

> Hata alırsan **Actions**'ta kırmızı işe tıkla, **Çalıştır** adımını aç ve hatayı oku. Sık görülenler:
> - **"Gmail izni yok"**: Adım 3'ü yapmamışsın ya da eski token hâlâ duruyor.
> - **"Claude Code hata verdi … 401"**: `CLAUDE_CODE_OAUTH_TOKEN` yanlış ya da süresi dolmuş. Adım 4'ü tekrarla.
> - Claude abonelik limitine takılırsa o çalışma atlanır, sorular sıradaki çalışmada cevaplanır. Panel çalışmaya devam eder.

### Ne zaman ne çalışır

| Zaman | İş |
|---|---|
| Her gün 08:00 | Tüm veriler + Gmail + uyarı kuralları + Claude'un tam analizi + bildirimler + günün özeti bildirimi |
| Her gün 18:00 | Aynısı (günün özeti bildirimi hariç) |
| 6 saatte bir | Mağaza durumları, Gmail, yeni uyarılara çözüm adımı, Asistan soruları, kritik uyarı bildirimi |
| Üst çubuktaki güncelle düğmesi | Tüm iş, hemen |

---

## Kurulum: Çalışma sayfaları (Görevler, Plan, Notlar …)

Yeni sayfaların verisi Supabase'de durur. Bir kez kurman yeterli:

1. Supabase'de **SQL Editor › New query**'ye gir.
2. [`supabase/features.sql`](supabase/features.sql) dosyasının tamamını yapıştır ve **Run**'a bas. (Tekrar çalıştırılabilir, mevcut veriyi silmez.)
3. Sitede **Ayarlar › Profil** bölümünden adını yaz. Ana sayfadaki karşılama ve menü bu adı kullanır.
4. Aynı sayfadaki **Oyun listesi**'nde her oyuna aylık gelir hedefi girebilirsin. Gelir sayfasındaki "Oyun sağlığı" halkası bu hedefe göre dolar.

| Sayfa | Ne işe yarar |
|---|---|
| Ana sayfa | Karşılama, dünün geliri ve indirmesi, kritik iş sayısı |
| Komuta | Her oyunun sinyalleri (uyarı, sürüm, çökme, puan, fill rate, gelir) → değerlendirme → önerilen aksiyon. Tek tıkla göreve çevrilir. |
| Görevler | Açık / Devam ediyor / Bitti panosu. Kartı sürükle; adımlar, notlar, sorumlu, son tarih. |
| Plan | Sürüm planı. Adımları birbirine bağla; bir adım bitince sıradaki kendiliğinden başlar. |
| Ortak plan | İkiniz ve asistanın zaman çizelgesi, kim çevrimiçi, ortak kararlar (oylama), canlı sohbet |
| Otomasyon | "Çökme %1,09'u aşarsa görev aç" gibi kurallar. Veri her toplandığında çalışır. Sadece görev/uyarı üretir, para harcamaz, mağazada bir şey değiştirmez. |
| Notlar | Klasörlü dokümanlar. `[ ] iş`, `[x] bitti`, `- madde` yazımı. Not göreve çevrilebilir. |
| Takvim | Görev son tarihleri, politika son tarihleri, plan yayın tarihleri, kendi etkinliklerin ve sezon fırsatları (Black Friday, Cadılar Bayramı …) |
| Gelir | Toplam gelir grafiği, oyun sağlığı halkaları, haftalık ritim ısı haritası, ülkeler, formatlar, oyuncu nabzı |
| Asistan | Sorularını kaydeder; Claude 6 saatte bir cevaplar. Onay bekleyen öneriler burada da görünür. |

---

## Kurulum: Yayın Uzmanı

Build'i panele bırakırsın; uzman inceler, sorunları "ne yapmalısın" diye yazar, dahili teste yükler. Oyunculara açmak senin onayınla. Claude kullanmaz: kurallar (`uzman/`) + stüdyonun kendi açık kaynak modeli (Ollama, GitHub Actions'ta).

1. Supabase **SQL Editor**'da [`supabase/phase11-expert.sql`](supabase/phase11-expert.sql) dosyasını çalıştır.
2. **Play Console › Kullanıcılar ve izinler** › hizmet hesabı › Hesap izinleri: "Üretim sürümüne yayınlama…", "Uygulamaları test kanallarına yayınlama", "Test kanallarını yönetme…" işaretli olsun.
3. **Anında başlatma**: README › Adım 11'deki `trigger-update` Edge Function'ı en güncel koduyla deploy et (secret'lar: `GH_REPO`, `GH_DISPATCH_TOKEN`). Kurulmazsa iş en geç 15 dakikada zamanlamayla başlar.
4. Panel › **Yayın Uzmanı › Veri güvenliği**: her oyun için Play'e ne beyan ettiğini işaretle.
5. İlk sürüm: Play'de hiç yüklenmemiş bir oyunun ilk build'ini Play Console'dan elle yükle; sonrakileri uzman yükler.

İsteğe bağlı: GitHub › Settings › Variables'ta `EXPERT_MODEL` (varsayılan `gemma3:4b`, hızlı; daha iyi Türkçe için `gemma3:12b` yazılabilir).

## Telefonda ana ekrana ekleme

### Android (Chrome)

1. Siteyi Chrome'da aç ve giriş yap.
2. Sağ üstteki **⋮** menüsüne dokun.
3. **Ana ekrana ekle**'ye veya **Uygulamayı yükle**'ye dokun, sonra **Yükle** de.
4. Ana ekranda Store Panel ikonu çıkar. Site tam ekran, uygulama gibi açılır.

### iPhone (Safari)

> iPhone'da bu işlem **sadece Safari'de** çalışır. Chrome'da çalışmaz.

1. Siteyi **Safari**'de aç.
2. Alttaki **Paylaş** butonuna dokun (yukarı ok çıkan kare).
3. Aşağı kaydır ve **Ana Ekrana Ekle**'ye dokun.
4. Sağ üstten **Ekle**'ye dokun.
5. Ana ekrandaki ikondan aç. Bir kez daha giriş yapman gerekir, çünkü ana ekran uygulaması Safari'den ayrı oturum tutar.

---

## Yerelde deneme (isteğe bağlı)

Bilgisayarında [Node.js](https://nodejs.org) (sürüm 20 veya üstü) yüklü olmalı.

```bash
npm install
```

```bash
npm run dev
```

Tarayıcıda `http://localhost:5173` adresini aç.

- Supabase bilgisi girmezsen site **demo modda** açılır: herhangi bir bilgiyle girip örnek verileri görürsün.
- Gerçek girişi denemek için `.env.example` dosyasını `.env.local` adıyla kopyala ve içine Supabase URL'si ile anon anahtarını yaz. `.env.local` git'e gönderilmez.

---

## Bilmen gerekenler

- **Supabase bedava planda 1 hafta hiç kullanılmayan projeleri duraklatır.** Her sabah çalışan veri toplama işi projeyi aktif tutar. Proje yine de duraklarsa Supabase panelinden **Restore** de.
- **GitHub, public repolarda 60 gün hiç commit gelmezse zamanlanmış işleri durdurur.** Böyle olursa **Actions** sekmesinde bir uyarı çıkar. **Enable workflow** demen yeterli.
- **Yapay zeka hiçbir şeyi onaysız uygulamaz.** Para harcayan ya da mağazada bir şeyi değiştiren her öneri "Onayını bekleyen öneriler" listesine düşer. Sen **Onayla** demeden hiçbir şey yapılmaz.
- **Otomatik işler:** Veriler her gün 08:00 ve 18:00'de toplanır. Sorun düzelince (ör. çökme oranı eşiğin altına inince) ilgili uyarı ve görev kendiliğinden kapanır. Plana bağlı bir görev bitince plan adımı da biter ve sıradaki adım başlar. Panel açıkken yeni veri gelince sayfa kendini yeniler.
- **Arama motorları siteyi indekslemez.** Bunu `noindex` etiketi ve `robots.txt` sağlar.
- **Telefon bildirimleri** sadece kritik uyarılar (ve istersen günün özeti) için gelir. Aynı uyarı için bir kez gönderilir.

## Klasör yapısı

```
src/
  pages/        Sayfalar (Ana sayfa, Komuta, Görevler, Plan, Gelir, …)
  components/   Menü, kartlar, göstergeler
  lib/          Supabase bağlantısı, giriş, ortak durum, sinyal hesapları
  data/         Demo modun örnek verileri (gerçek modda kullanılmaz)
supabase/
  schema.sql    Tablolar + güvenlik kuralları
  admins.sql    Admin e-postaları
  phase2-admob.sql  AdMob özet fonksiyonları
  phase3-stores.sql Mağaza özet fonksiyonu
  phase4.sql    Bildirim takibi, Gmail ve Claude bağlantı satırları
  features.sql  Görevler, notlar, planlar, takvim, otomasyonlar, sohbet
  phase8-play-breakdowns.sql  Google Play oyuncu kırılımları (ülke, dil, cihaz …)
  functions/    "Şimdi güncelle" fonksiyonu
scripts/
  collect.mjs   GitHub Actions'ta çalışan veri toplama betiği
  admob.mjs     AdMob verisini çeker
  play.mjs      Google Play verisini çeker
  appstore.mjs  App Store Connect verisini çeker
  games.mjs     Uygulamaları paneldeki oyunlarla eşleştirir
  rules.mjs     Otomasyon kuralları: uyarı ve görev açar
  gmail.mjs     Politika maillerini okur, uyarıya çevirir
  ai.mjs        Claude analizi (özet, çözüm adımı, yorum, soru, görev önerisi)
  push.mjs      Telefona bildirim (Web Push)
  vapid-keys.mjs    Bildirim anahtarı üretici (bilgisayarında bir kez çalışır)
  google-token.mjs  Google refresh token üretici (bilgisayarında bir kez çalışır)
.github/workflows/
  deploy.yml        Siteyi yayınlar
  collect-data.yml  Zamanlanmış veri toplama
```
