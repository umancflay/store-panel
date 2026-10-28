# Yayın Uzmanı Faz 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Panele bırakılan Android build'ini (AAB/APK) Claude'suz inceleyen, Türkçe "ne yapmalısın" raporu çıkaran, kendi açık kaynak modeliyle özetleyen, dahili teste onaysız yükleyen ve telefondan onayla üretime kademeli yayınlayan Yayın Uzmanı'nın ilk sürümü.

**Architecture:** Panel (React) build'i mevcut `files` kovasına parçalı yükler, `store_builds` satırı açar ve Edge Function ile `expert.yml` iş akışını anında tetikler. İş akışı `scripts/expert.mjs` orkestratörünü çalıştırır: build'i indirir, `bundletool`/`aapt2` ile manifesti okur, kuralları (`uzman/kurallar/android.mjs`) uygular, raporu yazar, Ollama ile kendi modelinden özet ister, Play Publishing API ile dahili teste yükler ve üretim için `expert_actions` onayı açar. Onay panelde verilir; iş akışı onaylı eylemi uygular.

**Tech Stack:** Node 22 (ESM, ek bağımlılık yok, testler `node --test`), GitHub Actions (ubuntu-latest, Java, Android SDK `aapt2`, `bundletool` jar), Ollama + Qwen2.5 7B Instruct, Supabase (Postgres + Storage + Edge Functions), React 18 + TypeScript.

**Spec:** `docs/superpowers/specs/2026-10-29-yayin-uzmani-design.md`

## Global Constraints

- Ücretsiz: yeni ücretli servis yok; Supabase depolama toplam 1 GB → oyun başına son 2 build dosyası saklanır.
- Repo public: build dosyası, anahtar, token repoya/Releases'a/herkese açık kovaya konmaz.
- Oyunculara giden her işlem (üretim kanalı, kademeli yüzde artışı, durdurma) `expert_actions` onayı olmadan yapılmaz; dahili test kanalı onaysızdır, ama "engelleyici" bulgu varsa yüklenmez.
- Claude'a bağımlılık yok: `scripts/expert/**` hiçbir yerde `runClaude` çağırmaz.
- Model çıktısı yoksa ya da doğrulamadan geçmezse kural tabanlı rapor aynen kullanılır; iş başarısız sayılmaz.
- Metinler Türkçe, sade, adım adım; kod yorumları Türkçe.
- Varsayılan model: `qwen2.5:7b-instruct` (Apache-2.0); `EXPERT_MODEL` değişkeniyle değişir.
- Kademeli yayın varsayılan yüzdesi: %10.

## Review Focus

1. 150 MB+ çok parçalı AAB: parçalar diske akıtılarak birleştirilmeli, bellek taşmamalı → Task 3 testi: parçaları birleştirme sırası ve boyutu.
2. Play'de hiç yüklenmemiş paket (ilk yükleme elle yapılmalı) ya da kullanılmış versionCode → Türkçe, ne yapılacağını söyleyen hata → Task 6 testi: 404 ve 403 "versionCode" eşlemeleri.
3. Model yok / zaman aşımı / saçma çıktı → kural raporu gösterilir → Task 5 testi: doğrulama reddi ve `null` dönüşü.
4. İki iş aynı build'i kapmaya çalışır → koşullu güncelleme (status=eq.uploaded) ile tek iş alır → Task 7 testi: `claim` boş dönerse işlenmez.
5. Onaya iki kez basma → eylem bir kez uygulanır → Task 7 testi: `approved` dışındaki durumlar atlanır.

---

### Task 1: Veritabanı ve anında tetikleme

**Files:**
- Create: `supabase/phase11-expert.sql`
- Modify: `supabase/functions/trigger-update/index.ts` (gövdeden `workflow` alır; izinli liste)
- Modify: `src/lib/store.tsx` (export `triggerWorkflow(name: 'collect-data.yml' | 'expert.yml' | 'assistant.yml')`)

**Interfaces:**
- Produces: tablolar `store_builds(id, game_id, platform, file_id → files.id, file_name, package_name, version_code, version_name, status, report jsonb, summary text, error text, created_by, created_at, updated_at)`; `status ∈ uploaded|inspecting|blocked|ready|internal|awaiting_approval|publishing|live|failed`. `expert_actions(id, build_id, kind ∈ publish_production|increase_rollout|halt, params jsonb, status ∈ pending|approved|rejected|done|failed, result text, approved_by, approved_at, created_at)`. Her ikisi RLS `is_admin()` + realtime.
- Edge Function POST gövdesi `{ workflow?: string }` (yoksa `collect-data.yml`), izinli: `collect-data.yml, expert.yml, assistant.yml`.

- [ ] SQL'i yaz; Supabase'de çalıştır (kullanıcı ücretsiz işlere genel onay verdi); `select count(*) from store_builds` hata vermemeli.
- [ ] Edge Function'ı güncelle ve Supabase panelinden deploy et; `GH_REPO`/`GH_DISPATCH_TOKEN` secret'ları mevcut.
- [ ] `triggerWorkflow` ekle, `triggerUpdate` onu kullanır. `npx tsc --noEmit -p .` temiz.
- [ ] Commit.

### Task 2: Test altyapısı ve ELF / bayt tarama yardımcıları

**Files:**
- Modify: `package.json` (`"test": "node --test scripts/"`)
- Create: `scripts/expert/binary.mjs`, Test: `scripts/expert/binary.test.mjs`

**Interfaces:**
- Produces: `elfLoadAlign(buf: Buffer) → number | null` (PT_LOAD segmentlerinin en küçük `p_align` değeri; ELF değilse null; 32/64-bit, little-endian). `findNeedles(buf: Buffer, needles: string[]) → string[]` (bulunanlar).

- [ ] Testler: 64-bit ELF başlığı + iki PT_LOAD (align 0x4000 ve 0x1000) → `4096`; ELF olmayan → `null`; `findNeedles(Buffer.from('xx ca-app-pub-3940256099942544 yy'), ['ca-app-pub-3940256099942544','zzz'])` → `['ca-app-pub-3940256099942544']`.
- [ ] Çalıştır, kırmızı; yaz; `npm test` yeşil; commit.

### Task 3: Build dosyasını indirme ve okuma

**Files:**
- Create: `scripts/expert/bundle.mjs`, Test: `scripts/expert/bundle.test.mjs`, fixture: `scripts/expert/fixtures/manifest-aab.xml`, `scripts/expert/fixtures/badging.txt`

**Interfaces:**
- Consumes: `elfLoadAlign`, `findNeedles` (Task 2); `db` (scripts/db.mjs).
- Produces:
  - `downloadFile(file: {path, parts}, dest: string) → Promise<void>` (Supabase Storage'dan service role ile; parçalar `path.part0..N` sırasıyla diske eklenir, akışla).
  - `parseBundletoolManifest(xml: string) → Manifest` ve `parseBadging(text: string) → Manifest`; `Manifest = { package, versionCode: number, versionName, minSdk: number, targetSdk: number, debuggable: boolean, permissions: string[], metaData: Record<string,string> }`.
  - `readAndroid(filePath: string) → Promise<AndroidBuild>`; `AndroidBuild = { kind: 'aab'|'apk', manifest: Manifest, abis: string[], libs: {abi, name, align: number|null}[], sizeBytes: number, hits: string[] }` (`hits`: `uzman/sdkler.json` iğneleri + test reklam kimliği; dex, `global-metadata.dat`, `.so` dosyalarında aranır). Zip açma `unzip` komutuyla geçici klasöre.
- [ ] Testler: fixture XML → `targetSdk 35, minSdk 23, versionCode 42, debuggable false, permissions` içinde `com.google.android.gms.permission.AD_ID`; badging fixture → aynı alanlar; parça birleştirme testi (sahte `fetch` iki parça döner → hedef dosya iki parçanın ardışık birleşimi).
- [ ] Kırmızı → yaz → yeşil → commit.

### Task 4: Kurallar ve rapor

**Files:**
- Create: `uzman/esikler.json`, `uzman/sdkler.json`, `uzman/kurallar/android.mjs`, `scripts/expert/rules.mjs`, `scripts/expert/report.mjs`, Test: `scripts/expert/rules.test.mjs`

**Interfaces:**
- Consumes: `AndroidBuild` (Task 3).
- Produces:
  - Kural biçimi: `{ id: string, severity: 'block'|'warn'|'info', title: string, policy?: string, fix: string[], check(ctx) → null | { detail: string } }`; `ctx = { build: AndroidBuild, prev: { versionCode: number } | null, game: { id, name }, declared: DataSafety | null, today: string }`.
  - `runRules(ctx) → Finding[]`; `Finding = { id, severity, title, detail, fix, policy? }`, ciddiyete göre sıralı.
  - `buildReport(findings, meta: {gameName, versionName, versionCode}) → { verdict: 'blocked'|'warnings'|'clean', counts: {block, warn, info}, text: string }` (deterministik Türkçe).
- İlk kurallar (id): `version-code-not-increased` (block), `target-sdk-too-low` (block; eşik `esikler.json` → `{"targetSdk":[{"from":"2025-08-31","min":35},{"from":"2026-08-31","min":36}]}`, uygulamada resmi sayfadan doğrula), `debuggable` (block), `test-ad-id` (block), `no-arm64` (block, native kütüphane varsa), `page-size-16k` (warn→ `esikler.json` tarihinden sonra block; align < 16384), `ad-id-permission-missing` (warn: reklam SDK'sı var ama `AD_ID` izni yok), `sensitive-permissions` (warn: `ACCESS_FINE_LOCATION`, `READ_EXTERNAL_STORAGE`, `MANAGE_EXTERNAL_STORAGE`, `QUERY_ALL_PACKAGES`, `READ_SMS`, `RECORD_AUDIO`, `CAMERA`), `data-safety-mismatch` (warn: bulunan SDK'nın gerektirdiği beyan yok), `data-safety-undeclared` (info), `big-download` (warn: > 200 MB).
- [ ] Testler: her kural için bir tetiklenen ve bir tetiklenmeyen durum; `buildReport` → engelleyici varsa `verdict: 'blocked'` ve metnin ilk satırı `Yüklenemez: 2 engelleyici sorun` biçiminde.
- [ ] Kırmızı → yaz → yeşil → commit.

### Task 5: Kendi model (Ollama) ile özet

**Files:**
- Create: `scripts/expert/llm.mjs`, Test: `scripts/expert/llm.test.mjs`

**Interfaces:**
- Produces: `polish(report: {text}, findings: Finding[], { fetchImpl?, timeoutMs = 480000 }) → Promise<string | null>` (`http://127.0.0.1:11434/api/generate`, model `process.env.EXPERT_MODEL || 'qwen2.5:7b-instruct'`, `stream:false`, Türkçe sistem talimatı: sadece verilen bulgulardan, en fazla 8 madde); `validatePolish(out: string, findings) → boolean` (uzunluk 80-2500, her `block` bulgusunun başlığındaki ilk anlamlı kelime geçiyor, girdide olmayan sayı yok).
- [ ] Testler: sahte fetch iyi çıktı → metin; girdide olmayan "%87" içeren çıktı → `null`; fetch hata/zaman aşımı → `null`.
- [ ] Kırmızı → yaz → yeşil → commit.

### Task 6: Play'e yükleme istemcisi

**Files:**
- Modify: `scripts/play.mjs` (export `saToken`)
- Create: `scripts/expert/publish.mjs`, Test: `scripts/expert/publish.test.mjs`

**Interfaces:**
- Produces: `uploadBundle({ pkg, filePath, track: 'internal'|'production', userFraction?: number, notes?: {language, text}[], fetchImpl? }) → Promise<{ versionCode: number }>` (edits insert → `upload/androidpublisher/v3/applications/{pkg}/edits/{id}/bundles?uploadType=media` (apk ise `/apks`) → tracks update → commit; üretimde `status: 'inProgress', userFraction`); `setRollout({ pkg, versionCode, userFraction | 'halt', fetchImpl? })`; `playError(status, body) → string` (Türkçe: 404 → "Bu paket Play'de yok: ilk sürümü Play Console'dan elle yükle"; 403 + "versionCode" → "Bu sürüm kodu daha önce kullanılmış: Unity'de Bundle Version Code'u artır"; 403 diğer → "Hizmet hesabının yayınlama izni yok").
- [ ] Testler: sahte fetch çağrı sırası ve URL'ler; hata eşlemeleri.
- [ ] Kırmızı → yaz → yeşil → commit.

### Task 7: Orkestratör ve iş akışı

**Files:**
- Create: `scripts/expert.mjs`, `scripts/expert/pipeline.mjs`, Test: `scripts/expert/pipeline.test.mjs`, `.github/workflows/expert.yml`

**Interfaces:**
- Consumes: Task 3-6; `db`, `notify_outbox` (bildirim için satır ekleme).
- Produces: `processBuild(build, deps) → Promise<void>` (claim: `PATCH store_builds?id=eq.X&status=eq.uploaded` → `inspecting`; boş dönerse çık. İndir → oku → kurallar → rapor → `polish` → `report/summary` yaz. `blocked` ise bildirim "düzeltmen gerekenler"; değilse dahili teste yükle → `internal` → `expert_actions(publish_production, {userFraction:0.1})` pending → `awaiting_approval` → bildirim "Onay bekliyor"). `processAction(action, deps)` (sadece `approved`; `publishing` → yükle → `live`/`done` ya da `failed` + bildirim). `cleanupOldFiles(deps)` (oyun başına son 2 dosya). `deps` içinde `db, readAndroid, runRules, buildReport, polish, uploadBundle, notify, downloadFile` (testte sahte).
- `scripts/expert.mjs`: `check` modu (iş var mı → `GITHUB_OUTPUT has=`), normal mod (sıradaki build'ler, onaylı eylemler, temizlik).
- `expert.yml`: `workflow_dispatch` + yedek `cron: '5-59/15 * * * *'`; check → (iş varsa) Java hazır, `bundletool-all-1.17.2.jar` indir, `aapt2` yolu `$ANDROID_HOME/build-tools/*/aapt2`, Ollama kur, `actions/cache` ile `~/.ollama/models`, `ollama pull $EXPERT_MODEL` → `node scripts/expert.mjs`. Secrets: SUPABASE_*, GOOGLE_PLAY_SA_JSON, VAPID_*.
- [ ] Testler: claim boşsa hiçbir şey çağrılmaz; engelleyici bulguda `uploadBundle` çağrılmaz; temiz build'de `uploadBundle({track:'internal'})` ve pending eylem; `processAction` `approved` değilse çıkar; yükleme hatasında `failed` + Türkçe hata.
- [ ] Kırmızı → yaz → yeşil → commit; `workflow_dispatch` ile build yokken çalıştır → "iş yok" ile yeşil bitmeli.

### Task 8: Panel — Yayın Uzmanı sayfası

**Files:**
- Create: `src/pages/Expert.tsx`, `src/components/BuildCard.tsx`
- Modify: `src/App.tsx` (`/yayin`; `/surum` → `/yayin?tab=surum`), `src/components/Layout.tsx` (menüde "Sürüm çıkar" yerine "Yayın Uzmanı", ikon Rocket), `src/lib/types.ts` (`StoreBuild`, `ExpertAction`), `src/data/demo.ts` (demo build + rapor), `src/styles.css`

**Interfaces:**
- Consumes: `uploadFile` (lib/files.ts), `triggerWorkflow('expert.yml')`, `useRows`, `ReleasePage` (sekme olarak).
- Sekmeler: **Build'ler** (oyun + platform seç, sürükle-bırak yükleme, ilerleme; build listesi: adım çizgisi uploaded → inceleniyor → rapor → dahili test → onay → yayında; rapor: özet, bulgular ciddiyete göre, her biri "ne yapmalısın" adımlarıyla; onay kartı: yüzde seçimi %10/%20/%50, Onayla/Reddet) · **Sürüm çıkar** (mevcut sayfa) · **Veri güvenliği beyanı** (oyun başına onay kutuları: reklam, reklam kimliği, analiz, konum, kişisel veri; `app_settings.data_safety`).
- Onay sadece `pending` eylemde; basınca `approved`, `approved_by`, `approved_at` + `triggerWorkflow('expert.yml')`.
- [ ] Demo modda: yükleme alanı, örnek rapor, onay kartı görünür; telefonda yatay taşma yok; `npm run build` temiz.
- [ ] Commit.

### Task 9: Belgeler ve canlı doğrulama

**Files:**
- Modify: `README.md` (Yayın Uzmanı kurulumu: Play izinleri, Firebase, token, Edge Function), `DEVIR.md`

- [ ] Yayınla; `expert.yml`'yi elle tetikle, "iş yok" ile bitsin; Edge Function'ın `expert.yml`'yi tetiklediğini doğrula (panelden test yüklemesi yapılmaz: gerçek build kullanıcıda).
- [ ] Commit.
