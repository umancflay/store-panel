-- 2. aşama: AdMob
-- Supabase panelinde: SQL Editor › New query › bu dosyanın tamamını yapıştır › Run
-- Dosya tekrar çalıştırılabilir.

-- Panelin hızlı açılması için AdMob verisini veritabanında özetleyen fonksiyonlar.
-- "security invoker" oldukları için RLS kuralları aynen geçerlidir:
-- sadece admin + iki adımlı doğrulamayı geçmiş kişi sonuç alır.

-- Gün / oyun / platform bazında toplam (grafikler ve özet kartları)
create or replace function public.admob_by_day(p_from date)
returns table (date date, game_id text, platform text, requests bigint, matched bigint, impressions bigint, revenue numeric)
language sql stable security invoker set search_path = public
as $$
  select date, game_id, platform, sum(requests)::bigint, sum(matched_requests)::bigint, sum(impressions)::bigint, sum(revenue)
  from admob_daily
  where date >= p_from
  group by 1, 2, 3
  order by 1;
$$;

-- Ülke bazında toplam (seçilen tarih aralığı)
create or replace function public.admob_by_country(p_from date, p_to date)
returns table (country text, impressions bigint, revenue numeric)
language sql stable security invoker set search_path = public
as $$
  select country, sum(impressions)::bigint, sum(revenue)
  from admob_daily
  where date between p_from and p_to
  group by 1
  order by 3 desc
  limit 50;
$$;

-- Reklam birimi bazında toplam (seçilen tarih aralığı)
create or replace function public.admob_by_unit(p_from date, p_to date)
returns table (ad_unit_id text, ad_unit_name text, ad_format text, game_id text, platform text, requests bigint, matched bigint, impressions bigint, revenue numeric)
language sql stable security invoker set search_path = public
as $$
  select ad_unit_id, max(ad_unit_name), max(ad_format), max(game_id), max(platform),
         sum(requests)::bigint, sum(matched_requests)::bigint, sum(impressions)::bigint, sum(revenue)
  from admob_daily
  where date between p_from and p_to
  group by 1
  order by 9 desc;
$$;

revoke all on function public.admob_by_day(date) from public, anon;
revoke all on function public.admob_by_country(date, date) from public, anon;
revoke all on function public.admob_by_unit(date, date) from public, anon;
grant execute on function public.admob_by_day(date) to authenticated;
grant execute on function public.admob_by_country(date, date) to authenticated;
grant execute on function public.admob_by_unit(date, date) to authenticated;
