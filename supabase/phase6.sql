-- 6. aşama: detaylı reklam verisi (sonuçlar ve hedef kitle kırılımları).
-- Supabase › SQL Editor'da bir kez çalıştır. Tekrar çalıştırmak zararsızdır.

alter table public.campaigns add column if not exists objective text;
alter table public.campaigns add column if not exists result_type text;      -- Profil ziyareti, Kurulum, Bağlantı tıklaması …
alter table public.campaigns add column if not exists results integer not null default 0;

-- Son 30 günün kırılımları, kampanya bazında (her günlük çalışmada yenilenir)
create table if not exists public.ad_breakdowns (
  platform text not null,
  campaign_id text not null,
  game_id text references public.games(id) on delete set null,
  dimension text not null,                         -- age_gender, placement, country
  key text not null,                               -- "25-34|male", "instagram|feed", "TR"
  spend numeric(12,2) not null default 0,          -- USD
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  reach bigint not null default 0,
  results integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (platform, campaign_id, dimension, key)
);

alter table public.ad_breakdowns enable row level security;
drop policy if exists "admin_read" on public.ad_breakdowns;
create policy "admin_read" on public.ad_breakdowns for select to authenticated using (public.is_admin());
revoke all on public.ad_breakdowns from anon;

-- 50 MB üstü dosyalar parçalı saklanır (ücretsiz planda tek nesne sınırı 50 MB)
alter table public.files add column if not exists parts integer not null default 1;
