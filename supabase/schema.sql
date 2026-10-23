-- Store Panel veritabanı şeması
-- Supabase panelinde: SQL Editor › New query › bu dosyanın tamamını yapıştır › Run
-- Dosya tekrar çalıştırılabilir (var olanları bozmaz).

-- ============================================================
-- 1) Adminler ve yetki kontrolü
-- ============================================================

create table if not exists public.admins (
  email text primary key,
  created_at timestamptz not null default now()
);

-- Giriş yapan kişi admin mi VE iki adımlı doğrulamayı geçti mi (aal2)?
-- Tüm tablolardaki RLS kuralları bu fonksiyonu kullanır.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (
       select 1 from public.admins
       where lower(email) = lower(auth.jwt() ->> 'email')
     );
$$;

-- Sadece "admin listesinde miyim" sorusu (MFA öncesi ekranda kullanılır).
create or replace function public.am_i_listed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.am_i_listed() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.am_i_listed() to authenticated;

-- ============================================================
-- 2) Oyunlar ve bağlantılar
-- ============================================================

create table if not exists public.games (
  id text primary key,                    -- kısa ad, ör. 'salgin'
  name text not null,
  genre text,
  platforms text[] not null default '{}', -- {'android','ios'}
  android_package text,                   -- ör. com.studio.salgin
  ios_app_id text,                        -- App Store sayısal ID
  admob_app_ids text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Her veri kaynağının durumu (AdMob, Play, App Store, Gmail, reklam platformları)
create table if not exists public.connections (
  source text primary key,                -- admob, google_play, app_store, gmail, google_ads, apple_ads, meta, tiktok
  status text not null default 'disconnected' check (status in ('connected','disconnected','pending','error')),
  last_sync_at timestamptz,
  message text,
  updated_at timestamptz not null default now()
);

-- Zamanlanmış işlerin kaydı
create table if not exists public.sync_runs (
  id bigint generated always as identity primary key,
  job text not null,                      -- daily, policy_check, ad_plans, manual
  status text not null check (status in ('running','success','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  message text
);

-- ============================================================
-- 3) Metrikler
-- ============================================================

-- Mağaza metrikleri (Play + App Store), oyun/platform/ülke/gün bazında
create table if not exists public.store_daily (
  date date not null,
  game_id text not null references public.games(id) on delete cascade,
  platform text not null check (platform in ('android','ios')),
  country text not null default 'ALL',
  downloads integer not null default 0,
  iap_revenue numeric(12,2) not null default 0,  -- USD
  rating numeric(3,2),
  crash_rate numeric(6,3),                       -- yüzde
  anr_rate numeric(6,3),                         -- yüzde (sadece Android)
  primary key (date, game_id, platform, country)
);

-- AdMob metrikleri, reklam birimi/ülke/gün bazında
create table if not exists public.admob_daily (
  date date not null,
  game_id text not null references public.games(id) on delete cascade,
  platform text not null check (platform in ('android','ios')),
  country text not null,
  ad_unit_id text not null,
  ad_unit_name text,
  ad_format text,                                -- banner, interstitial, rewarded, app_open
  requests bigint not null default 0,
  matched_requests bigint not null default 0,
  impressions bigint not null default 0,
  revenue numeric(12,4) not null default 0,      -- USD
  primary key (date, game_id, platform, country, ad_unit_id)
);

-- Build ve inceleme durumu
create table if not exists public.builds (
  id bigint generated always as identity primary key,
  game_id text not null references public.games(id) on delete cascade,
  platform text not null check (platform in ('android','ios')),
  version text not null,
  build_number text,
  status text,                                   -- processing, ready, live, rejected ...
  review_status text,                            -- waiting_for_review, in_review, approved, rejected
  updated_at timestamptz not null default now(),
  unique (game_id, platform, version, build_number)
);

-- ============================================================
-- 4) Yorumlar
-- ============================================================

create table if not exists public.reviews (
  id bigint generated always as identity primary key,
  store_review_id text not null unique,
  game_id text not null references public.games(id) on delete cascade,
  platform text not null check (platform in ('android','ios')),
  author text,
  rating smallint check (rating between 1 and 5),
  title text,
  body text,
  language text,
  country text,
  app_version text,
  created_at timestamptz not null,
  store_reply text,                              -- mağazada yayınlanmış cevap
  ai_category text,                              -- crash, bug, suggestion, praise, ads, other
  reply_draft text,                              -- Claude'un taslağı (onaysız gönderilmez)
  reply_status text not null default 'none' check (reply_status in ('none','draft','approved','sent','rejected'))
);

-- ============================================================
-- 5) Uyarılar (politika ve mağaza)
-- ============================================================

create table if not exists public.alerts (
  id bigint generated always as identity primary key,
  external_id text unique,                       -- ör. Gmail mesaj ID'si (tekrar eklemeyi önler)
  level text not null check (level in ('critical','warning','info')),
  source text not null check (source in ('play','app_store','admob','system')),
  game_id text references public.games(id) on delete set null,
  title text not null,
  body text,
  how_to_fix text,                               -- Claude'un adım adım çözümü (markdown)
  console_url text,
  deadline date,
  status text not null default 'open' check (status in ('open','resolved')),
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 6) Yapay zeka çıktıları
-- ============================================================

-- Günün özeti, AdMob önerileri, yorum analizi vb.
create table if not exists public.ai_insights (
  id bigint generated always as identity primary key,
  kind text not null,                            -- daily_summary, admob_advice, review_clusters
  game_id text references public.games(id) on delete cascade,
  content jsonb not null,
  created_at timestamptz not null default now()
);

-- Her oyun için reklam planı (haftalık güncellenir)
create table if not exists public.ad_plans (
  id bigint generated always as identity primary key,
  game_id text not null references public.games(id) on delete cascade,
  content jsonb not null,                        -- kitle, ülkeler, bütçe, kreatifler, platformlar
  created_at timestamptz not null default now()
);

-- Onay bekleyen öneriler. Hiçbir şey onaylanmadan uygulanmaz.
create table if not exists public.recommendations (
  id bigint generated always as identity primary key,
  kind text not null,                            -- ad_campaign, budget_change, mediation, review_reply
  game_id text references public.games(id) on delete cascade,
  title text not null,
  details jsonb not null default '{}',
  estimated_cost numeric(12,2),                  -- USD, para harcayan öneriler için
  status text not null default 'pending' check (status in ('pending','approved','rejected','applied','failed')),
  decided_by text,
  decided_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default now()
);

-- Reklam kampanyaları (platformlar bağlanınca dolar)
create table if not exists public.campaigns (
  platform text not null,                        -- google_ads, apple_ads, meta, tiktok
  external_id text not null,
  game_id text references public.games(id) on delete set null,
  name text not null,
  status text,
  date date not null,
  spend numeric(12,2) not null default 0,
  installs integer not null default 0,
  primary key (platform, external_id, date)
);

-- ============================================================
-- 7) Kullanıcı ayarları ve bildirimler
-- ============================================================

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notify_critical boolean not null default true,
  notify_daily boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 8) RLS: tüm tablolarda açık. Giriş yapmamış biri hiçbir şey göremez.
--    Veri yazma işini Actions "service role" ile yapar (RLS'i atlar).
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array[
    'admins','games','connections','sync_runs','store_daily','admob_daily','builds',
    'reviews','alerts','ai_insights','ad_plans','recommendations','campaigns',
    'user_settings','push_subscriptions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "admin_read" on public.%I', t);
    execute format('create policy "admin_read" on public.%I for select to authenticated using (public.is_admin())', t);
  end loop;
end $$;

-- Panelden yapılabilen değişiklikler (sadece admin + MFA):
drop policy if exists "admin_update" on public.alerts;
create policy "admin_update" on public.alerts for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin_update" on public.recommendations;
create policy "admin_update" on public.recommendations for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin_update" on public.reviews;
create policy "admin_update" on public.reviews for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin_write" on public.games;
create policy "admin_write" on public.games for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Kişisel ayarlar: herkes sadece kendi satırını yönetir.
drop policy if exists "own_rows" on public.user_settings;
create policy "own_rows" on public.user_settings for all to authenticated
  using (public.is_admin() and user_id = auth.uid())
  with check (public.is_admin() and user_id = auth.uid());

drop policy if exists "own_rows" on public.push_subscriptions;
create policy "own_rows" on public.push_subscriptions for all to authenticated
  using (public.is_admin() and user_id = auth.uid())
  with check (public.is_admin() and user_id = auth.uid());

-- Giriş yapmamış (anon) rol hiçbir tabloya erişemesin.
revoke all on all tables in schema public from anon;

-- ============================================================
-- 9) Başlangıç verileri
-- ============================================================

insert into public.games (id, name, genre, platforms) values
  ('salgin', 'Salgın', 'Hastane yönetimi / strateji', '{android,ios}'),
  ('tasinma-kaosu', 'Taşınma Kaosu', 'Co-op nakliyat', '{android,ios}'),
  ('dropshipping', 'Dropshipping', 'İşletme simülasyonu', '{android}')
on conflict (id) do nothing;

insert into public.connections (source, status) values
  ('admob','disconnected'), ('google_play','disconnected'), ('app_store','disconnected'),
  ('gmail','disconnected'), ('google_ads','disconnected'), ('apple_ads','disconnected'),
  ('meta','disconnected'), ('tiktok','disconnected')
on conflict (source) do nothing;
