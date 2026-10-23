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
| 2 | AdMob bağlantısı ve günlük veri çekme | ⏳ |
| 3 | Google Play ve App Store Connect | ⏳ |
| 4 | Gmail'den politika uyarıları, Claude analizi, telefon bildirimleri | ⏳ |
| 5 | Reklam planları ve onay sistemi | ⏳ |
| 6 | Reklam platformu bağlantıları | ⏳ |

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
- **Arama motorları siteyi indekslemez.** Bunu `noindex` etiketi ve `robots.txt` sağlar.
- **Telefon bildirimleri** 4. aşamada açılacak. Altyapısı (service worker, abonelik tablosu) hazır.

## Klasör yapısı

```
src/
  pages/        Sayfalar (Genel Bakış, Uyarılar, Oyunlar, …)
  components/   Menü, kartlar, göstergeler
  lib/          Supabase bağlantısı, giriş, ortak durum
  data/         1. aşamanın örnek verileri
supabase/
  schema.sql    Tablolar + güvenlik kuralları
  admins.sql    Admin e-postaları
  functions/    "Şimdi güncelle" fonksiyonu
scripts/
  collect.mjs   GitHub Actions'ta çalışan veri toplama betiği
.github/workflows/
  deploy.yml        Siteyi yayınlar
  collect-data.yml  Zamanlanmış veri toplama
```
