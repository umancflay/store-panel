# Voo Game Studio Paneli: Devir Notu

Bu not, projeyi yeni bir Claude oturumuna (ya da başka bir geliştiriciye) devretmek için yazıldı.
Önce bu dosyayı, sonra `README.md`'yi oku. Notta hiçbir anahtar, token ya da şifre yok; olmamalı da.

Son güncelleme: 28 Ekim 2026

---

## 1. Proje ne?

Küçük bir Unity mobil oyun stüdyosu (Voo Game Studio / Pixel Game) için tek ekranlık yönetim paneli.

- **Kullanıcılar:** Stüdyo sahibi (Umut) ve bir ortağı. Panel Türkçe; masaüstü ve telefon (PWA) için.
- **Ne yapar?**
  - AdMob, Google Play, App Store, Meta reklamları ve Gmail'deki politika maillerinden veri toplar.
  - Sorunları bulur ve Claude ile çözüm önerir.
  - İki kişinin ortak işlerini yönetir: görevler, notlar, dosyalar, plan.
- **Site:** https://umancflay.github.io/store-panel/
- **Repo:** `umancflay/store-panel` (public). Yerel klasör: `D:\GitHub\store-panel`.
- **Supabase projesi:** `tklfwuwfzhsedczstvvg`.

### Değişmez kurallar (kullanıcının şartları)

1. Her şey ücretsiz olacak: GitHub Pages, GitHub Actions, Supabase ücretsiz plan.
2. Repo public. **Kodda hiçbir gizli anahtar, şifre ya da token olmayacak.**
3. Gizli bilgiler sadece GitHub Actions Secrets'ta ve Supabase'de durur.
4. **Yapay zeka, kullanıcı "Onayla" demeden para harcayan ya da mağazada bir şeyi değiştiren hiçbir işlem yapmaz.** Sadece önerir. Reklam API'leri sadece okuma izniyle bağlı.
5. Kod sade ve bakımı kolay olacak; yorumlar Türkçe.
6. Panel sadece gerçek veriyi gösterir. Örnek veri yalnızca demo modda (Supabase ayarlı değilken) görünür.

### Kullanıcıyla çalışma şekli

- Kullanıcı teknik değil. Kısa, adım adım, sade Türkçe ister ("dayı" diye hitap eder).
- Ekran görüntüsü atar; yazım hataları çoktur.
- Şunları kullanıcı kendisi yapmalı (asistan yapmaz):
  - şifre girmek ve giriş yapmak;
  - ödeme ya da kart bilgisi girmek;
  - GitHub Secrets'a token yapıştırmak.
- Sözleşme ve koşul kabul etmeden, ayar değiştirmeden önce onay alınır.
- Chrome'da (Claude in Chrome) Supabase, GitHub, Meta ve Play Console sekmeleri açık çalışılıyor.

---

## 2. Teknik yapı

| Katman | Ne kullanılıyor |
|---|---|
| Ön yüz | Vite 6 + React 18 + TypeScript, HashRouter, Recharts, lucide-react. `src/styles.css` tek CSS dosyası (koyu tema; yeşil `#8FD3AE`, altın `#E8C07A`, turuncu `#FF7A55`) |
| Yayın | GitHub Pages (`.github/workflows/deploy.yml`, main'e her push'ta) |
| Veritabanı | Supabase Postgres. Giriş: e-posta + şifre + **zorunlu TOTP (MFA)**. RLS: her tablo `public.is_admin()` ile korunur (admins tablosunda olmak + aal2) |
| Veri toplama | GitHub Actions `collect-data.yml` → `node scripts/collect.mjs <job>`. Supabase'e service role ile yazar |
| Yapay zeka | Claude Code CLI, kullanıcının **abonelik token'ıyla** (`CLAUDE_CODE_OAUTH_TOKEN`). API anahtarı yok. Claude'a araç verilmez (`--tools ""`); sadece JSON döndürür |
| Bildirim | Web Push (VAPID), `scripts/push.mjs` |
| Para birimi | Veri USD saklanır; ekranda TL'ye çevrilir. Kur: `app_settings.fx_usd_try` (frankfurter.dev). AdMob için ayrıca `admob_daily.revenue_try` (AdMob'un kendi kuru) |

### Zamanlama (`collect-data.yml`, saatler İstanbul)

| Zaman | İş |
|---|---|
| 08:00 ve 18:00 | `daily`: tüm kaynaklar, kurallar, Claude analizi, gerekiyorsa reklam planı |
| 6 saatte bir (:30) | `policy_check`: hafif; AdMob, son 3 gün, Gmail, inceleme durumları |
| Pazartesi 09:00 | `ad_plans`: Meta + Claude reklam planı |
| Elle | Actions › Veri topla › Run workflow (input: `daily` / `policy_check` / `ad_plans` / `manual`) |

### GitHub Secrets (isimler; değerler asla koda yazılmaz)

- **Supabase:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- **Google (AdMob + Gmail):** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`
- **Google Play:** `GOOGLE_PLAY_SA_JSON`, `PLAY_REPORTS_BUCKET`
- **App Store Connect:** `ASC_ISSUER_ID`, `ASC_KEY_ID`, `ASC_PRIVATE_KEY`, `ASC_VENDOR_NUMBER`
- **Claude:** `CLAUDE_CODE_OAUTH_TOKEN` (isteğe bağlı değişken: `CLAUDE_MODEL`; girilmezse `opus`)
- **Bildirim:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- **Meta:** `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID` (= `1507573837908002,1367381536942213`, virgülle birden fazla hesap)

---

## 3. Şimdiye kadar yapılanlar

### Veri kaynakları (`scripts/`)

| Dosya | Durum |
|---|---|
| `admob.mjs` | ✅ Günlük gelir, istek, gösterim; ülke ve reklam birimi kırılımı. USD + TRY (`revenue_try`). TRY ilk çalışmada 60 gün geriye doldurulur |
| `play.mjs` + `storepage.mjs` | ✅ Uygulama listesi, yorumlar, vitals. İkon, gerçek indirme sayısı ve puan mağaza sayfasından okunuyor. Toplu raporlardan oyuncu kırılımı (ülke, dil, cihaz, Android sürümü, uygulama sürümü → `play_breakdowns`). Toplu raporlara erişim 28 Ekim 2026 itibarıyla çalışıyor (8 oyun, 1 Eylülden beri veri var) |
| `appstore.mjs` | ✅ Sürümler, inceleme durumu, yorumlar. JWT 15 dk, 401'de bir kez yeniden deneme |
| `gmail.mjs` | ✅ Play/AdMob/Apple politika mailleri → `alerts`. Gürültü filtresi var (sözleşme, TestFlight vb. uyarı sayılmaz) |
| `fx.mjs` | ✅ USD→TRY günlük kur |
| `meta.mjs` | ✅ Birden fazla reklam hesabı. Günlük kampanya harcaması, gösterim, tıklama, kurulum, sonuç (`results`, `result_type`). Son 30 günün yaş-cinsiyet / platform-yerleşim / ülke kırılımı → `ad_breakdowns` |
| `rules.mjs` | ✅ Otomasyon kurallarına göre uyarı ve görev açar; düzelenleri kapatır |
| `ai.mjs` | ✅ Claude: günün özeti, uyarılara çözüm adımı, yorum gruplama, cevap taslağı (mağazaya GÖNDERİLMEZ), soru cevapları, görev önerisi. Limit dolarsa iş kırmızıya dönmez (soft adım) |
| `adplans.mjs` | ✅ Claude'un oyun başına reklam planı: kitle, ülke, bütçe (USD), kreatif, platform + "veriden öğrendikleri". Oyunlar: `app_settings.ad_games` (varsayılan: salgin, stockguys, haulguys) |
| `push.mjs` | ✅ Kritik uyarı ve günün özeti bildirimi |

### Panel sayfaları (`src/pages/`)

**Günlük**
- **Ana sayfa:** `Welcome.tsx`.
- **Komuta:** `Komuta.tsx`; oyun kartları ve sinyaller (`lib/signals.ts`).
- **Asistan.**
- **Uyarılar.**

**Çalışma**
- **Çalışma alanı** (`Workspace.tsx`, yeni):
  - benim işlerim / ortağın işleri;
  - bu hafta, ekip akışı, son dosyalar, son notlar;
  - hızlı görev ekleme;
  - ortak çevrimiçi mi, hangi sayfada.
- **Görevler:** Kanban. Görev detayında dosya ekleri, yorumlar ve geçmiş var.
- **Plan**, **Ortak plan**, **Otomasyon**.
- **Notlar:** Dosya eki ve yorum var.
- **Dosyalar** (`Files.tsx`, yeni):
  - ortak klasör; sürükle-bırak ve Ctrl+V ile yükleme;
  - klasör, oyun ve tür süzgeçleri;
  - 500 MB'a kadar. 50 MB üstü dosyalar 45 MB'lık parçalara bölünür, indirirken birleşir.
- **Takvim.**

**Mağaza ve gelir**
- **Oyunlar.**
- **Gelir:** AdMob ana sayfasıyla aynı özet (`AdmobSummary.tsx`).
- **Reklam** (`Ads.tsx` + `components/AdDashboard.tsx`, yeni):
  - göstergeler: harcama, sonuç, sonuç başı, TO, BGBM;
  - günlük grafikler;
  - yaş × cinsiyet grafiği, en iyi grup, cinsiyet dağılımı;
  - platform/yerleşim ve ülke listeleri;
  - kampanya tablosu (tıklayınca süzer);
  - Claude planı, onay bekleyen öneriler, reklam hesapları.
- **Yorumlar**, **Ayarlar.**

**Ortak altyapı**
- `lib/rows.ts` `useRows`: Supabase Realtime ile canlı güncelleme.
- `lib/presence.ts`: kim çevrimiçi.
- `lib/files.ts`: Storage.
- `components/Attachments.tsx`, `components/Comments.tsx`.

### Veritabanı dosyaları (`supabase/`, hepsi Supabase'de ÇALIŞTIRILDI)

`schema.sql`, `admins.sql`, `phase2-admob.sql`, `phase3-stores.sql`, `features.sql`, `phase4.sql`, `phase5.sql`:
- dosyalar (`files` + gizli `files` kovası);
- `comments`, `activity`;
- realtime;
- `campaigns.impressions/clicks`.

`phase6.sql`:
- `campaigns.objective/result_type/results`;
- `ad_breakdowns`;
- `files.parts`.

`phase7-admob-try.sql`:
- `admob_daily.revenue_try`;
- `admob_by_*` fonksiyonları yeniden kuruldu (`revenue_try`, `has_try` döner).

`phase8-play-breakdowns.sql` (✅ 28 Ekim 2026'da çalıştırıldı):
- `play_breakdowns` tablosu (game_id, date, dimension, key, installs, uninstalls, active_devices);
- `play_breakdown_summary(game, from)` fonksiyonu: boyut başına en çok kurulum yapan 30 anahtar.

`phase9-team.sql` (✅ 28 Ekim 2026'da çalıştırıldı; Asistan #1 ile doğrulandı: soru 55 sn'de cevaplandı, bildirimler gitti, ilk haftalık plan 5 öneriyle çıktı):
- `notify_outbox`: bildirim kuyruğu. Görev başkasına atanınca ve görevine yorum gelince tetikleyiciler yazar;
- `work_suggestions`: Claude'un haftalık iş bölümü önerileri (kabul / geç).

`phase10-releases.sql` (✅ 29 Ekim 2026'da çalıştırıldı): `releases` tablosu (sürüm çıkarma yardımcısı).

### Yayın Uzmanı Faz 1 (29 Ekim 2026)

- Tasarım: `docs/superpowers/specs/2026-10-29-yayin-uzmani-design.md`, plan: `docs/superpowers/plans/2026-10-29-yayin-uzmani-faz1.md`.
- Kod: `scripts/expert.mjs` (giriş), `scripts/expert/` (bundle, rules, report, llm, publish, pipeline), `uzman/` (kurallar, eşikler, SDK izleri), `.github/workflows/expert.yml`, panel `/yayin` (`pages/Expert.tsx`, `components/BuildCard.tsx`). Testler: `npm test` (37 test).
- Claude kullanmaz; model Ollama + `gemma3:4b` (29 Ekim: Qwen 7B'nin Türkçesi bozuktu; 12B yavaştı, kullanıcı hız istedi), çıktı doğrulanır, geçmezse kural raporu gösterilir.
- Akış: uploaded → inspecting → blocked | ready → internal (Play dahili test, onaysız) → awaiting_approval → (panelde Onayla) → live (%10). Yayındayken %50 / herkese aç / durdur düğmeleri.
- ✅ 29 Ekim 2026: `phase11-expert.sql` çalıştırıldı, `trigger-update` Edge Function ilk kez kuruldu (panelden anında başlatma çalışıyor). İlk gerçek AAB (RengiYakala, yanlışlıkla Salgın seçilmiş) uçtan uca işlendi: yanlış paket ve test reklam kimliği yakalandı, Play'e gitmedi.
- ⏳ `targetSdk` 2026 eşiği (36) resmi sayfadan doğrulanmalı. Fonksiyonun "Verify JWT with legacy secret" ayarı açık; çalışıyor, dokunulmadı.

### Yayın Uzmanı Faz 2 ve panel güncellemeleri (29 Ekim 2026)

- **Menü 17 → 10:** `Layout.tsx › navGroups` içinde benzer sayfalar `tabs` ile tek öğede (Komuta+Uyarılar, Çalışma: Bugün/Görevler/Ortak plan/Takvim, Plan+Otomasyon, Belgeler: Notlar/Dosyalar, Oyunlar+Yorumlar, Gelir+Reklam). Eski adresler aynen çalışır; `allPages` arama ve "kim nerede" için.
- **Tarih hatası düzeltildi:** `toISOString` Türkiye'de günü bir geri kaydırıyordu (panel hep bir gün geriden gidiyordu). Ortak `lib/format.ts › localIso`.
- **Gelir hedefi:** `components/GoalCard.tsx` (Gelir sayfası, ana sayfada yüzde), `app_settings.revenue_goal` (TL). `scripts/goals.mjs` sabah işinde: dün 7 günlük ortalamadan %50+ düşerse uyarı + bildirim, pazartesi haftalık gelir özeti (+ hedef gidişatı), hedefe ulaşınca tebrik.
- **Mağaza sayfası koçu:** `scripts/expert/aso.mjs` + `coach.mjs`, panelde Yayın Uzmanı › Mağaza sayfası (`components/AsoCoach.tsx`). Play sayfası API'den okunur (edit açılır, kaydedilmeden silinir), "tür" aramasındaki ilk 5 oyunla karşılaştırılır, kurallar + kendi model önerileri; sürüm notu (TR+EN). İstekler `app_settings.expert_queue`, sonuçlar `aso:<oyun>`, `whatsnew:<oyun>`.
- **Test Lab:** `scripts/expert/testlab.mjs`. Engelleyici yoksa build sanal arm64 telefonda Robo ile 5 dk. Sadece faturalandırma KAPALIYKEN çalışır (Cloud Billing API ile kontrol; doğrulanamazsa test atlanır, bulgu "yapılmadı" der). İlk gerçek denemede atlanma sebebine bakılmalı: Cloud Billing API'nin projede açık olması ve hizmet hesabının `resourcemanager.projects.get` izni gerekebilir. `saToken`'a `cloud-platform` kapsamı eklendi.
- **48 saat nöbet:** `scripts/expert/watch.mjs`. Yayındaki sürümün saatlik çökme/ANR oranı (Reporting API, `versionCode` kırılımı) eski sürümlerle karşılaştırılır; kötüyse onay bekleyen `halt` eylemi + bildirim (kendisi durdurmaz), 48 saat temiz geçerse haber verir.
- `expert.yml`: model (Ollama) sadece build/koçluk işi varken kurulur; nöbet ve onaylı eylemler hızlı geçer.
- Ana sayfada kısayollar (Build bırak, Mağaza raporu, Sürüm notu, Hedef, Asistan). Testler: 58.
- **iOS / App Store (29 Ekim 2026):**
  - IPA incelemesi: `scripts/expert/ios.mjs` (unzip + python3 plistlib), kurallar `uzman/kurallar/ios.mjs` (geliştirme imzası, build no, eski Xcode SDK, test reklam kimliği, AdMob App ID, ATT metni, boş izin açıklaması, PrivacyInfo, SKAdNetwork, şifreleme beyanı, boyut). Eşikler `esikler.json › iosSdk` (2026 satırı doğrulanmalı). Uzman IPA'yı yüklemez; kullanıcı Mac'ten yükler.
  - İnceleme takibi: `scripts/expert/appreview.mjs › syncReviews`, `expert.mjs check` her çalıştığında (birkaç saniye) App Store Connect'teki son sürüm durumunu `app_settings.asc_review_state` ile karşılaştırır, değişince telefona bildirir.
  - Ret yardımcısı: panelde Yayın Uzmanı › App Store; Apple mesajı yapıştırılır → kural numaraları `uzman/apple-kurallar.json` bilgi tabanıyla Türkçe açıklanır, model İngilizce Resolution Center cevabı yazar (İngilizce değilse ya da kural numarası geçmiyorsa şablon). Sonuç `app_settings.rejection:<oyun>`.
  - Uzmanın modeli `gemma3:4b` (hızlı; daha iyi Türkçe için EXPERT_MODEL=gemma3:12b).
- **Uzmana sor / öğret (29 Ekim 2026):** `scripts/expert/ask.mjs`. Sorular kuyruğa (`kind: ask`) girer, model kurallar + eşikler + Apple bilgi tabanı + öğrettiklerin + oyunun son build/mağaza raporuyla cevaplar → `app_settings.expert_chat` (son 40). Öğrettiklerin `app_settings.expert_lessons` (panel doğrudan yazar); her build raporuna "Öğrettiğin: …" bilgi bulgusu olarak eklenir.
- **Cihazda dene:** kuyrukta `kind: devicetest` (buildId); sonuç `store_builds.report.device`, ekran görüntüleri `files` kovasında `expert/build-<id>/`.
- Panel: build silme (dosya + görüntüler + kayıt), eski kartlar küçük, 1180px üstünde sabit sol menü.
- Sıradaki: Play politika retleri (Gmail'den), iOS cihaz testi, App Store mağaza sayfası koçu.

### Ekip ve asistan (28 Ekim 2026)

- **Asistan işi** (`.github/workflows/assistant.yml` → `scripts/assistant.mjs`), 10 dakikada bir çalışır:
  - bildirim kuyruğunu telefona gönderir;
  - bekleyen soruları cevaplar ve sorana bildirir;
  - panelden "Haftayı planla" istendiyse iş planını hazırlar.
  - Claude'a iş yoksa birkaç saniyede biter, Claude kurulmaz.
- **Haftalık iş bölümü** (`scripts/workplan.mjs`): Pazartesi `ad_plans` işinde, son plan 7 günden eskiyse günlük işte ya da istek üzerine çalışır. Sonuç `ai_insights` (kind `work_plan`) ve `work_suggestions` tablolarına yazılır. Görev ancak panelde "Kabul" denince açılır.
- **Çalışma sayfası** sadeleşti: Bugün sırada / ortak / Claude'un haftalık planı, altta sekmeli kart (Bu hafta, Ekip akışı, Son eklenenler).
- Tarayıcının açılır menüleri yerine `components/Select.tsx` kullanılıyor (`<Select>` + `<option>`, aynı yazım).
- Paneldeki Claude varsayılan olarak `opus` kullanıyor (`CLAUDE_MODEL` değişkeniyle değiştirilebilir).
- **Claude'a atanan görevler** (`scripts/assistanttasks.mjs`, Asistan işi içinde): `assignee = assistant` ve açık görevler (her seferde en çok 3). Sonuç göreve yorum (author `assistant`) olarak yazılır, görev açana geri atanır, `advice`'a tek cümle özet, etiket "Claude taslağı". Hiçbir şey yayınlanmaz.
- **Sürüm çıkar** (`pages/Release.tsx`, `/surum`): oyun + sürüm başına mağaza kontrol listesi (şablon kodda), durum, "Bu sürümde ne değişti". "Claude'a yazdır" Claude'a görev açar; sürüm notunu oyuncuların dillerinde yazar.
- **Hızlı arama** (`components/CommandPalette.tsx`): Ctrl+K ya da üstteki büyüteç. Sayfa/oyun/görev/not arar; yazılan metinle görev açar ya da Claude'a sorar.
- **Görünüş**: renkli zemin ışıkları (`.aurora`), sayfa ve kart giriş animasyonları, kart hover parıltısı, oyun logosunda oyunun rengi (`--gc`). Hareket azaltma ayarına uyar.
- **Telefon bildirimi kaydı** her açılışta tazelenir (`lib/push.ts › refreshPush`). Ayarlar › Bildirimler'de cihaz durumu ve "Test gönder" (kuyruğa yazar, 10 dk içinde gelir). 28 Ekim'de Apple bildirimi kabul ettiği hâlde kullanıcının telefonunda görünmedi; sebep kesinleşmedi (eski kayıt, Odak modu ya da izin olabilir).

### Meta (Facebook/Instagram) kurulumu

- **İşletme portföyü:** **Pixel Game** (business_id `415583563213815`). Business'a **Facebook profiliyle (Umut Ucar)** girilmeli. Instagram hesabıyla (voogamestudio) girilince uygulama/sistem kullanıcısı işlemleri engelleniyor.
- **Sistem kullanıcısı:** "Voo Panel Okuyucu" (Çalışan rolü). İki reklam hesabında sadece "Performansı görüntüleme" izni var. Token süresiz, sadece `ads_read`. Uygulama: **Voo Panel** (1818796293584758).
- **Reklam hesapları:**
  - `1507573837908002`: "Voo Game Studio", yeni ve TL, şu an boş.
  - `1367381536942213`: Instagram'dan açılan hesap, aktif "Yeni Trafik Kampanyası" (profil ziyareti).
- **Oyunların Meta uygulamaları** (hepsi Pixel Game'e bağlı, reklam hesabı 1507573837908002 yetkili):
  - Salgın `2372532210233524`: Google Play paketi kayıtlı, **reklama hazır**.
  - Stock Guys `1872554004096880`, Haul Guys `3482919175342888`: Play'de taslak oldukları için **paket adı eklenemedi**.
  - Borsa `4745479605778056`, DropMaster `3213175482224746`, Brick Gate `1428981405477197`: oluşturuldu. Kullanıcı bunlara reklam vermeyecek ama silinmesin istedi.
- iOS platformları eklenmedi; oyunlar App Store'da henüz yayında değil.

---

## 4. Yarım kalanlar ve sıradaki işler (öncelik sırasıyla)

1. **Google Play toplu raporları (şu an başlanan iş).** Hedef: oyuncuların ülke, dil, cihaz, Android sürümü, uygulama sürümü bazında günlük kurulum/kaldırma/aktif cihaz verisini çekmek ve Claude'un buna göre öneri yapması.
   - Play Console › **Kullanıcılar ve izinler**'de `GOOGLE_PLAY_SA_JSON`'daki hizmet hesabına hesap düzeyinde **"Uygulama bilgilerini görüntüleme ve toplu raporları indirme"** izni verilecek. İzin 24 saate kadar yayılabilir.
   - Play Console › **Toplu raporları indir** sayfasındaki `gs://pubsite_prod_...` adresi `PLAY_REPORTS_BUCKET` secret'ı ile aynı olmalı.
   - ✅ Kod hazır (28 Ekim 2026): `play.mjs › playerBreakdowns` CSV'leri okur (UTF-16, tırnaklı alan destekli; boyut ve ay başına en çok 50 anahtar), oyun sayfasında `components/Players.tsx` "Oyuncular" kartı, `adplans.mjs` Claude'a `play_oyunculari_son_30_gun` verir.
   - ✅ Canlıda doğrulandı (28 Ekim 2026, Veri topla #50): SQL çalıştırıldı, 8 oyun için tüm boyutlar dolu, sütun adları gerçek dosyayla tutuyor ("Active Device Installs" de geliyor). Paneldeki Claude yeni abonelik token'ıyla ve Opus ile çalışıyor.
   - İsteğe bağlı: Komuta sayfasına da özet eklenebilir.
   - **Not:** Play yaş/cinsiyet vermez. Yaş/cinsiyet yalnızca Meta reklam kırılımlarından geliyor.
2. **AdMob TL doğrulaması.** `revenue_try` kodu ve SQL'i canlıda. İlk otomatik çalışmadan sonra panel (Gelir, Komuta) ile AdMob ana sayfası karşılaştırılmalı; kuruşu kuruşuna tutmalı.
3. **Meta "sonuç" sayımı.** Instagram profil ziyareti kampanyasında panel 161 "Bağlantı tıklaması" sayıyor; Reklam Yöneticisi 113 profil ziyareti diyor. `meta.mjs › resultOf` içinde profil ziyareti aksiyon tipinin adı yakalanmalı: bir çalışmada `actions` dizisini logla, doğru `action_type`'ı bul.
4. **Stock Guys ve Haul Guys.** Play'de yayına çıkınca Meta uygulamalarına Android paket adı eklenecek (developers.facebook.com › uygulama › Ayarlar › Temel › Android › Google Play, sınıf adı `com.unity3d.player.UnityPlayerActivity`). App Store'a çıkınca iOS da eklenecek.
5. **TikTok Ads bağlantısı.** Henüz yapılmadı. TikTok for Business geliştirici uygulaması onayı 1-3 gün sürer; erken başvurulmalı. `campaigns`/`ad_breakdowns` tablolarına `platform='tiktok'` ile aynı yapıda yazılmalı.
6. **Kurulum ölçümü.** Meta kurulumları sayamıyor çünkü oyunlarda Meta SDK'sı yok. Kullanıcı Unity'de Meta SDK'yı (ya da AppsFlyer/Adjust gibi bir MMP) ekleyince kurulum ve kurulum başı maliyet panelde dolar.
7. ✅ **README Adım 11:** "Şimdi güncelle" Edge Function'ı 29 Ekim 2026'da kuruldu.
8. **Kullanıcı tarafında bekleyenler:**
   - Google Ads hesabına fatura bilgisi (Borsa kampanyası ₺250/gün, yayınlanmıyor);
   - Meta Voo Game Studio reklam hesabına ödeme yöntemi;
   - Meta'nın istediği kimlik doğrulaması (yapılmazsa aktif reklam durabilir);
   - telefonda bildirimleri açmak.

---

## 5. Yeni oturum için pratik bilgiler

- **Derleme kontrolü:** `npx tsc --noEmit -p .` ve `npm run build`.
  - Yerelde demo mod: `.claude/launch.json` içinde `store-panel` (port 5173). Supabase ayarlı değilse herhangi bir e-posta/şifre ile girilir.
- **Commit:** Her commit main'e gider ve siteyi yayınlar. Mesajlar Türkçe.
- **SQL'i Supabase'de çalıştırmak:**
  1. SQL Editor'ı aç.
  2. Sorguyu `window.monaco.editor.getModels()[0].setValue(...)` ile koy.
  3. Run'a bas.
  4. "Potential issue" uyarısında `drop … if exists` satırları için "Run query" de.
- **Elle veri toplamak:** github.com/umancflay/store-panel › Actions › Veri topla › Run workflow.
  - Sonucu görmek: `select message from sync_runs order by id desc limit 1;`
  - Kaynak durumları: `connections` tablosu.
- **Yeni bir veri kaynağı eklerken:**
  1. `scripts/<kaynak>.mjs` yaz; `<kaynak>Ready` ve `collect<Kaynak>()` dışa aktar.
  2. `collect.mjs`'e `step(...)` olarak ekle.
  3. Secret'ları `collect-data.yml` env'ine ekle.
  4. `setConnection(source, status, message)` ile Ayarlar'da durum göster.
  5. Tabloyu `supabase/phaseN.sql` olarak yaz; RLS'i `is_admin()` ile kur.
- **Claude'a yeni bir analiz eklerken:** `ai.mjs`'deki `runClaude(prompt, schema)` ve `parse()` dışa aktarılmış durumda; `adplans.mjs` örnek alınabilir. Claude yalnızca öneri yazar; hiçbir mağaza ya da reklam API'sine yazma yetkisi yoktur.

## Reklam sayfası, trendler, hızlı asistan (30 Eki 2026)
- Reklam ayrı menü öğesi (`/reklamlar`). Pano: platform sekmeleri (Google Ads, Meta …) → oyun çipleri → kampanya.
- Google Ads verisi: Google Ads'teki "Voo Panel" komut dosyası saatlik `ingest_ads` RPC'sine yazar (phase12).
- Reklam trendleri: `scripts/adtrends.mjs`, Claude internette araştırır (WebSearch/WebFetch), `app_settings.ad_trends`. Haftalık ya da panelden "Şimdi araştır" (`ad_trends_request`). assistant.yml içinde ayrı `trends` işi, sohbeti bekletmez.
- Asistan: sorular hızlı modelle (`vars.CLAUDE_FAST_MODEL`, varsayılan sonnet), reklam/trend/plan/Yayın Uzmanı/uyarı/son sohbet bağlamıyla cevaplanır.
- Yayın Uzmanı build kartında mağaza kararı tahmini (teknik kontrol, cihaz testi, Google Play/App Store kararı).

## Reklam Stüdyosu (30 Eki 2026)
- `/studyo` (Reklam › Stüdyo): oyun seç → "Yeni reklam" → Claude 3 fikir yazar (çekim listesi, ekran yazıları, kapanış ve mağaza başlığı; dayanak: trend / veri / yok) → fikir seç → her çekime kayıt yükle ya da Dosyalar'dan seç → "Videoyu hazırla".
- `scripts/studio.mjs` (assistant.yml › `studio` işi): ffmpeg ile 1080x1920 video (yazılar, kapanış kartı, sessiz ses kanalı), ilk kareden 1024x500 mağaza görseli ve 1080x1080 kare. Çıktılar Dosyalar › Reklam'a düşer.
- Durumlar: Fikirler hazırlanıyor → Fikir seç → Kayıt eksik n/m → Video hazırlanıyor → İnceleme bekliyor → Paket hazır → Yayımlandı (elle işaretlenir). Hiçbir şey kendiliğinden yayınlanmaz.
- Veri: `app_settings.ad_projects` (panel ve iş aynı anahtara yazar; her yazmada son hal okunur).
- Oyun kartı (`app_settings.game_profiles`, `scripts/gameprofile.mjs`): Stüdyo'da her oyun için. "Mağazadan oku" Claude'a Play/App Store sayfasını okutur, taslak yazar; sahibi düzeltip onaylar. Stüdyo fikirleri, çekim promptları, reklam trendleri ve asistan bu kartı kullanır; kartta olmayan şey oyun kaydı gibi gösterilmez.
- Öğrenen hafıza (`scripts/adlessons.mjs`, `app_settings.ad_lessons`): Stüdyo'da yayımlanan video kampanyaya bağlanır; günlük iş ve her fikir isteği yayından bu yana sonuçları oyunun diğer reklamlarıyla kıyaslar (iyi / orta / pahalı / veri az). "Olmaz" denen fikirler sebebiyle saklanır. Fikir istemi bu dersleri kullanır. Yapay zeka kullanmaz, testli.
- Ana sayfa "Bugün karar ver" (`src/components/Decisions.tsx`): kritik uyarı, yayın onayı, para harcayan öneri, stüdyo, yorum taslağı, oyun kartı; en fazla 5.
