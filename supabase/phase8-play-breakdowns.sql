-- 8. aşama: Google Play toplu raporlarından oyuncu kırılımları (ülke, dil, cihaz, Android sürümü, uygulama sürümü).
-- Supabase › SQL Editor'da bir kez çalıştır. Tekrar çalıştırmak zararsızdır.

-- Günlük satırlar; "overview" boyutu oyunun toplamıdır (key = 'ALL')
create table if not exists public.play_breakdowns (
  game_id text not null references public.games(id) on delete cascade,
  date date not null,
  dimension text not null,                         -- overview, country, language, device, os_version, app_version
  key text not null,                               -- "TR", "tr_TR", "samsung a52q", "Android 13", "42"
  installs integer not null default 0,             -- günlük kullanıcı kurulumu
  uninstalls integer not null default 0,           -- günlük kullanıcı kaldırması
  active_devices integer,                          -- o gün kurulu olduğu cihaz sayısı (Play her raporda vermeyebilir)
  updated_at timestamptz not null default now(),
  primary key (game_id, date, dimension, key)
);

alter table public.play_breakdowns enable row level security;
drop policy if exists "admin_read" on public.play_breakdowns;
create policy "admin_read" on public.play_breakdowns for select to authenticated using (public.is_admin());
revoke all on public.play_breakdowns from anon;

-- Panel ve Claude için özet: boyut başına en çok kurulum yapan 30 anahtar.
-- Kurulum ve kaldırma dönem toplamı; aktif cihaz o boyuttaki en son günün değeri.
drop function if exists public.play_breakdown_summary(text, date);
create function public.play_breakdown_summary(p_game text, p_from date)
returns table (dimension text, key text, installs bigint, uninstalls bigint, active_devices bigint)
language sql stable security invoker set search_path = public
as $$
  with r as (
    select * from play_breakdowns where game_id = p_game and date >= p_from and dimension <> 'overview'
  ), last as (
    select dimension, max(date) as d from r group by 1
  ), s as (
    select r.dimension, r.key, sum(r.installs)::bigint as installs, sum(r.uninstalls)::bigint as uninstalls,
           sum(r.active_devices) filter (where r.date = last.d)::bigint as active_devices
    from r join last using (dimension)
    group by 1, 2
  )
  select dimension, key, installs, uninstalls, active_devices
  from (select s.*, row_number() over (partition by dimension order by installs desc, active_devices desc nulls last) as n from s) x
  where n <= 30
  order by dimension, installs desc;
$$;

revoke all on function public.play_breakdown_summary(text, date) from public, anon;
grant execute on function public.play_breakdown_summary(text, date) to authenticated, service_role;
