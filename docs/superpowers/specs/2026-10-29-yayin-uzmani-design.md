# Yayın Uzmanı: tasarım dokümanı

Tarih: 29 Ekim 2026 · Durum: kullanıcı onayı bekliyor

## 1. Ne ve neden

Voo Game Studio iki kişilik bir Unity mobil oyun stüdyosu. Oyunları Google Play'e ve App Store'a yüklemek,
mağaza politikalarına uymak, ret gelince ne yapacağını bilmek ve mağaza sayfasını (açıklama, görseller) iyi
hazırlamak şu an tamamen elle ve deneme-yanılmayla yapılıyor. Kullanıcı kod bilmiyor.

**Yayın Uzmanı**, stüdyonun kendi yayın asistanı olacak:

- Build'i (Android AAB/APK, iOS IPA) panele bırakınca **kendisi inceler ve dener**, sorunları sırayla ve
  "ne yapmalısın" diliyle söyler.
- **Yükler ve yayınlar** (önce Android), oyunculara giden her adımda **telefondan onay** ister.
- **Ret gelince süreci yönetir**: sebebi bulur, düzeltme listesini ve itiraz metnini hazırlar.
- **Mağaza vitrini uzmanıdır**: en çok tutan oyunların açıklamalarını ve görsellerini inceler, bizim oyun için
  ne yazılacağını, kaç görsel konacağını, hangi sırayla ve neyin gösterileceğini söyler.
- **Claude'dan bağımsızdır**: beyni kurallar + bilgi dosyaları + stüdyonun **kendi açık kaynak dil modeli**.
  Abonelik limiti, API ücreti ya da kullanıcının bilgisayarı gerekmez; her şey GitHub Actions'ta çalışır.
- **Öğrenerek gelişir**: her ret, her düzeltme ve kullanıcının "bu öneri doğru/yanlış" geri bildirimi bilgi
  dosyasına eklenir.

## 2. Hedefler, hedef olmayanlar, başarısızlık sayılacaklar

**Hedefler**
1. Android build'i yüklemeden önce, bilinen politika ve teknik hataların tamamını yakalamak.
2. Bir build'i panelden Play'e (dahili test → üretim, kademeli) kullanıcı bilgisayarı kapalıyken yüklemek.
3. Her sorunu Türkçe, sade, adım adım ("Unity › Player Settings › … şunu yap") anlatmak.
4. Ret geldiğinde 1 saat içinde (bir sonraki kontrol çalışmasında) dosya açıp düzeltme + itiraz taslağı vermek.
5. Bir oyunun mağaza sayfası için somut, örnekli vitrin önerisi vermek (metin taslağı + görsel planı).
6. Tamamen ücretsiz ve Claude'dan bağımsız çalışmak.

**Hedef olmayanlar (bu projede yok)**
- Reklam platformları (Google Ads, TikTok) ve trend radarı: ayrı projeler.
- Unity projesini derlemek (build'i kullanıcı Unity'de alır; uzman alınmış build'le çalışır).
- iOS'a yükleme (Mac + imzalama gerekir) ve iOS cihaz testi: bu projede sadece IPA **incelemesi** var.
- Görsel üretmek (ekran görüntüsü tasarlamak): uzman plan ve örnek verir, görseli insanlar yapar.

**Başarısızlık sayılacaklar (teknik olarak çalışsa bile)**
- Onay verilmeden oyunculara (üretim kanalı, kademeli yayının büyütülmesi) bir build gitmesi.
- Uzmanın uydurma bir politika maddesi, sayı ya da "Google böyle diyor" iddiası yazması.
- Raporun teknik jargonla dolu olması; kullanıcının ne yapacağını anlamaması.
- Yayınlanmamış build'lerin herkese açık bir yere düşmesi (repo public).
- Ücretli bir hizmete bağımlı hale gelmek.

## 3. Kısıtlar

- **Ücretsiz**: GitHub Actions (public repo, dakika sınırı yok; iş başına 6 saat; 4 çekirdek, 16 GB RAM),
  Supabase ücretsiz plan (depolama toplam 1 GB, tek dosya 50 MB → mevcut 45 MB parçalama), Firebase Test Lab
  ücretsiz kotası (günde 5 gerçek + 10 sanal cihaz testi).
- **Repo public**: kodda gizli bilgi yok; anahtarlar GitHub Secrets'ta. Build dosyaları **asla** repoya,
  GitHub Releases'a ya da herkese açık bir kovaya konmaz; sadece Supabase'in gizli `files` kovasında durur.
- **Onay kuralı** (stüdyonun değişmez kuralı): oyunculara giden ve mağazada bir şeyi değiştiren her işlem
  kullanıcının "Onayla"sından sonra yapılır.
- **Kullanıcı teknik değil**: her şey panelden ve telefondan yürür; Türkçe, kısa, adım adım.
- **Gizli bilgi girme**: hesap izinleri, şifreler ve anahtarlar kullanıcı tarafından verilir (asistan girmez).

## 4. Kullanıcının kararları (bu konuşmada verildi)

| Konu | Karar |
|---|---|
| Yapay zeka | Stüdyonun **kendi açık kaynak modeli**, GitHub Actions'ta çalışır. Claude'a bağımlı değil. |
| Yükleme onayı | Onaylar **telefondan** (bildirim → panelde tek dokunuşla Onayla). |
| Çalışma yeri | Kullanıcının bilgisayarı kapalıyken de çalışır (GitHub Actions). |
| Kapsam | Yükleme + yayın + politika + ret/itiraz + **mağaza vitrini** (açıklama dili, görsel sayısı/düzeni). |
| Gelişim | "Geliştire geliştire": bilgi dosyası ve geri bildirimle büyür. |

**Benim kararım (kullanıcı değiştirebilir)**: dahili test kanalına (sadece ekibin gördüğü) yükleme **onaysız**,
üretim kanalı / kademeli yayını büyütme / yayını durdurma / itiraz gönderme **onaylı**.

## 5. Nasıl çalışır

### 5.1 Genel akış

```
Panel › Yayın Uzmanı › build'i bırak (AAB/APK/IPA)
        │  Supabase gizli kova (parçalı)
        ▼
GitHub Actions "Yayın Uzmanı" işi (10 dk'da bir kuyruğa bakar + panelden "şimdi" isteği)
  1. İnceleme (kurallar)          → bulgular
  2. Cihaz testi (Test Lab, Android) → çökme/ANR/açılış süresi, ekran görüntüsü, video
  3. Rapor (kurallar + kendi model) → "ne yapmalısın" özeti
  4. Dahili teste yükle (onaysız)
        │  bildirim: "Salgın 1.1.0: 2 sorun var / hazır"
        ▼
Telefon › bildirime dokun › Panel › Onayla (üretim, %10 kademeli)
        ▼
Uzman yükler, 48 saat izler (çökme, ANR, 1-2 yıldız yorum) → büyüt / durdur önerisi (onaylı)
```

### 5.2 Build incelemesi (Claude'suz, kurallarla)

Android (AAB/APK, `bundletool` + `aapt2` + manifest/dex okuma, Actions'ta Java ile):
- `versionCode`/`versionName` önceki yüklenenden büyük mü
- `targetSdkVersion` Google'ın güncel zorunluluğunu karşılıyor mu (eşik bilgi dosyasında, tarihli)
- `debuggable` kapalı mı, test reklam birimi kimlikleri (`ca-app-pub-3940256099942544`) kodda kalmış mı
- İzinler: tehlikeli/özel izinler ve bunların Play beyan gerektirip gerektirmediği (konum, SMS, tüm dosyalar,
  `QUERY_ALL_PACKAGES`, `AD_ID` …)
- İçindeki SDK'lar (paket adlarından tanıma: AdMob, Unity Ads, AppLovin, Meta, Firebase …) ve **veri güvenliği
  formuyla tutarlılık** (formdaki beyan bilgi dosyasında oyun başına tutulur)
- 64-bit (`arm64-v8a`) kütüphaneler, 16 KB sayfa boyutu uyumu, boyut (indirme ve kurulum)
- Simge, uygulama adı uzunluğu, `minSdk`

iOS (IPA, zip + `plist` okuma; Mac gerekmez):
- `PrivacyInfo.xcprivacy` var mı, gerekli-sebep API'leri beyan edilmiş mi; SDK'ların gizlilik dosyaları
- İzin açıklama metinleri (`NS…UsageDescription`) var ve anlamlı mı; ATT (`NSUserTrackingUsageDescription`)
- Minimum iOS sürümü, mimari, boyut, sürüm/derleme numarası

Her kural bir dosyada tanımlıdır (`uzman/kurallar/*.yml`): kimlik, ne kontrol eder, ciddiyet
(engelleyici / uyarı / bilgi), hangi politika maddesine dayanır (bağlantı), Türkçe "ne yapmalısın" adımları
(Unity menü yoluyla). Yeni bir ret türü öğrenildiğinde yeni kural eklenir.

### 5.3 Cihaz testi (Android)

- Firebase Test Lab, ücretsiz kota içinde: her build için 1-2 gerçek cihaz (ör. orta segment Samsung + eski
  Android) ve 1-2 sanal cihaz. Kota dolarsa test ertesi güne kalır, rapor bunu söyler.
- **Unity sorunu**: Test robotu Unity ekranındaki düğmeleri göremez, rastgele dokunur. Bu yüzden iki mod:
  - Hemen: Robo testi → açılışta çökme, donma, açılış süresi, bellek.
  - Kullanıcı bir kez eklerse: **Game Loop** testi. Repo'da hazır bir Unity betiği (`unity/VooGameLoop.cs`)
    verilir; Test Lab oyunu bu betikle açınca oyun kendi kendine 60-90 saniyelik bir oynanış yapar
    (menü → oyuna gir → birkaç hamle). Bu betiği eklemek kullanıcının tek seferlik işi; panelde adım adım anlatılır.
- Sonuçlar (log, ekran görüntüleri, video bağlantısı) rapora eklenir.

### 5.4 Yükleme ve yayın (Android)

- Google Play Developer Publishing API (mevcut hizmet hesabı). Kullanıcı Play Console'da bu hesaba
  **"Test kanallarına yayınla"** ve **"Üretime yayınla"** izinlerini verir (tek seferlik).
- Dahili test: onaysız, inceleme "engelleyici" bulgu içermiyorsa.
- Üretim: telefondan onay. Kademeli yüzde varsayılan %10; sürüm notları "Sürüm çıkar" sayfasından (çok dilli).
- 48 saat izleme: Play vitals (çökme/ANR) ve yeni 1-2 yıldızlı yorumlar. Eşik aşılırsa "yayını durdur"
  önerisi (onaylı). Eşikler yoksa "büyüt" önerisi (%10 → %50 → %100, her biri onaylı).
- iOS yüklemesi bu projede yok; iOS için uzman sadece inceleme raporu verir.

### 5.5 Ret ve itiraz

- Kaynaklar: mevcut Gmail okuma (Play/Apple politika mailleri), Play ve App Store inceleme durumları.
- Ret gelince bir **dosya** açılır: ret metni, hangi oyun/sürüm, tanınan ret türü (kurallarla eşleşme),
  hangi politika maddesi, düzeltme adımları, itiraz gerekip gerekmediği.
- Sık ret türleri için **hazır itiraz şablonları** (`uzman/itiraz/*.md`); kendi model şablonu oyunun
  bilgileriyle doldurur ve dili düzeltir. Tanınmayan rette model metni yorumlar ama **"emin değilim"
  diyebilir**; uydurma politika maddesi yazmaz (bilgi dosyasında olmayan madde gösterilmez).
- İtirazı göndermek: Play ve Apple'ın itiraz için resmi arayüzü yok. Panel metni kopyalanabilir verir ve
  "nereye yapıştıracağını" adım adım gösterir; kullanıcı isterse Chrome'daki Claude'a hazır tarif verilir.
- Dosyanın sonucu (kabul/ret) işaretlenir; bilgi dosyasına "bu ret türünde bu itiraz işe yaradı/yaramadı" eklenir.

### 5.6 Mağaza vitrini (ASO) uzmanı

- **Veri**:
  - App Store: Apple'ın resmi ücretsiz top chart beslemeleri (oyun kategorileri, TR/US/BR …) + iTunes Lookup
    (açıklama, alt başlık, ekran görüntüsü sayısı ve URL'leri, video var mı, puan).
  - Google Play: herkese açık mağaza sayfaları (mevcut `storepage.mjs` yaklaşımı) — rakip/benzer oyun listesi
    (oyun başına ayarlardan; varsayılan olarak türdeki tanınmış oyunlar) ve bulunabiliyorsa üst listeler.
- **Analiz** (kurallar + kendi model): açıklama uzunluğu, ilk 3 satırda ne söyleniyor, emoji/madde kullanımı,
  tekrar eden anahtar kelimeler, dil tonu; ekran görüntüsü sayısı, dikey/yatay, ilk görselde metin var mı,
  tanıtım videosu var mı. Haftada bir yenilenir, oyun türüne göre özet tutulur.
- **Öneri**: bizim oyun için "şu an" ile "türün en iyileri" karşılaştırması; açıklama taslağı (TR + EN +
  oyuncuların en çok konuştuğu diller; Play verisinden), kısa açıklama, **görsel planı** (kaç görsel, sıra,
  her birinde ne gösterilecek ve üstüne hangi kısa metin). Görsel içeriği analizi ilk sürümde sayılar ve
  basit özelliklerle; görüntüyü "anlayan" model ileri fazda.
- Mağazaya otomatik yazmaz: taslak verir; "Play'e uygula" düğmesi onaylıdır ve sadece metinleri günceller.

### 5.7 Kendi dil modeli

- Açık kaynak, ticari kullanıma izinli bir model (varsayılan: Qwen2.5 7B Instruct, Apache-2.0), Ollama ile
  GitHub Actions'ta çalışır; model dosyası Actions önbelleğinde tutulur. Her iş başında açılır, bitince kapanır.
- Görevi dar: kural bulgularını sade Türkçe özete çevirmek, itiraz şablonunu doldurmak, ret metnini
  sınıflandırmak, açıklama taslağı yazmak. Kararları (yükle/yükleme, engelleyici mi) **kurallar** verir.
- Çıktılar doğrulanır: kural/politika kimliği bilgi dosyasında yoksa çıktıdan atılır; sayı ve tarih
  sadece veriden gelir.
- Model değiştirilebilir (ayar), Claude isteğe bağlı bir seçenek olarak kalabilir ama varsayılan kapalı.
- Beklenen hız: kısa özet 1-3 dk, itiraz taslağı 3-5 dk. Kabul edilebilir çünkü bu işler nadir.

### 5.8 Hafıza ve öğrenme

- `uzman/` klasörü (repo içinde, gizli bilgi yok): `kurallar/`, `itiraz/`, `politikalar.md` (tarihli özetler
  ve resmi bağlantılar), `vitrin/` (tür bazında ASO notları).
- Veritabanı: build'ler, raporlar, bulgular, ret dosyaları, kullanıcı geri bildirimi ("doğru / yanlış /
  zaten biliyordum"). Yanlış bulunan kural sessize alınır ve "gözden geçir" listesine düşer.
- "Öğretme" iki yoldan: panelde bir bulguya not düşmek; ya da yeni bir ret yaşanınca uzmanın önerdiği yeni
  kuralı onaylamak.

### 5.9 Panel ve telefon

- Menüde **"Yayın"** başlığı (mevcut "Sürüm çıkar" bunun içine sekme olur): Build'ler · Raporlar · Ret dosyaları ·
  Vitrin · Bilgi.
- Build sayfası: yükleme alanı, ilerleme (incelendi → test edildi → dahili testte → onay bekliyor → yayında),
  bulgular ciddiyete göre, her biri "ne yapmalısın" ile.
- Bildirimler: rapor hazır, onay bekliyor, ret geldi, yayın sorunu. Bildirime dokununca ilgili sayfadaki
  Onayla/Reddet düğmeleri.

## 6. Kullanıcının yapacakları (tek seferlik)

1. Play Console › Kullanıcılar ve izinler: hizmet hesabına test ve üretim kanallarına yayınlama izni.
2. Firebase konsolu: mevcut Google Cloud projesine Firebase'i ekle (ücretsiz Spark), Test Lab'i aç;
   hizmet hesabına Test Lab rolü.
3. (İsteğe bağlı, önerilir) Unity'ye `VooGameLoop.cs` betiğini ekle.
4. Her oyun için veri güvenliği formunda ne beyan ettiğini panelde bir kez işaretle (uzman tutarlılığı buna göre kontrol eder).
5. GitHub'da sadece bu repo için "Actions: yazma" izinli bir token oluştur ve Supabase'e gir (işlerin anında başlaması için; adım adım anlatılır).

## 7. Aşamalar

1. **Faz 1, temel**: build yükleme alanı + Android incelemesi (kurallar) + rapor + kendi model özeti +
   dahili teste yükleme + telefondan onayla üretime kademeli yükleme.
2. **Faz 2**: Test Lab (Robo, sonra Game Loop) + 48 saat izleme + büyüt/durdur önerileri.
3. **Faz 3**: Ret dosyaları + itiraz şablonları + iOS IPA incelemesi.
4. **Faz 4**: Mağaza vitrini uzmanı (veri toplama, analiz, öneri, taslak).
5. **Faz 5**: Öğrenme döngüsü, görsel anlayan model, iOS yükleme (Mac koşucusu) değerlendirmesi.

Her faz kendi başına işe yarar ve ayrı yayınlanır.

## 8. Denetimden çıkan kararlar (benim kararım, kullanıcı değiştirebilir)

- **Depolama**: Supabase ücretsiz plan toplam 1 GB. Oyun başına sadece **son 2 build** saklanır; üretimde %100'e
  ulaşan build'in dosyası 7 gün sonra silinir (rapor ve bulgular kalır). Panel kalan alanı gösterir.
- **Tetikleme**: 10 dakikalık zamanlanmış iş GitHub'da güvenilir değil (28-29 Ekim'de hiç kendiliğinden
  çalışmadı). Bu yüzden build bırakılınca ve "Onayla"ya basılınca iş **anında** başlatılır: Supabase Edge
  Function → GitHub `workflow_dispatch`. Bunun için kullanıcı bir kez GitHub'da sadece bu repo için
  "Actions: yazma" izinli bir token oluşturup Supabase'e girer (6. bölüme eklendi). Zamanlanmış iş yedek kalır.
- **Test Lab ücretsiz mi**: Spark planında kotayla çalıştığı varsayılıyor; Faz 2'nin ilk adımı bunu
  doğrulamak. Faturalandırma açmayı gerektirirse cihaz testi atlanır ve kullanıcıya sorulur (ücretli hiçbir
  şey kendiliğinden açılmaz).
- **İmza**: Unity'den çıkan AAB'nin yükleme anahtarıyla imzalı olduğu ve Play App Signing'in açık olduğu
  varsayılır; değilse inceleme bunu engelleyici bulgu olarak söyler.
- **Onayın güvenliği**: Onay sadece panele MFA ile girmiş bir yönetici tarafından verilebilir (mevcut
  `is_admin()` kuralı). Bildirimin kendisi bir şey onaylamaz.

## 9. Yapıcıya bırakılanlar

- Kuralların ilk listesi ve eşik değerleri (güncel Play/Apple zorunlulukları, tarihli ve kaynaklı).
- Veritabanı şeması, iş kuyruğu tasarımı, Actions iş bölümü.
- Model önbellekleme ve tam model seçimi (lisans ticari kullanıma izinli olmalı).
- Test Lab cihaz seçimi ve kota yönetimi.
- Rapor ve panel ekranlarının tasarımı (mevcut panel diliyle).
