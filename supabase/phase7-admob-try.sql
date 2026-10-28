-- AdMob kazancını TL olarak da sakla: panel TL gösterirken AdMob'un kendi kurunu kullansın (kuruşu kuruşuna aynı).
-- Supabase › SQL Editor'da bir kez çalıştır. Tekrar çalıştırmak zararsızdır.

alter table public.admob_daily add column if not exists revenue_try numeric;

-- Dönüş tipleri değiştiği için fonksiyonlar silinip yeniden kurulur.
-- has_try: o gruptaki her satırın TL tutarı var mı (yoksa panel kendi kuruyla çevirir)
drop function if exists public.admob_by_day(date);
create function public.admob_by_day(p_from date)
returns table (date date, game_id text, platform text, requests bigint, matched bigint, impressions bigint, revenue numeric, revenue_try numeric, has_try boolean)
language sql stable security invoker set search_path = public
as $$
  select date, game_id, platform, sum(requests)::bigint, sum(matched_requests)::bigint, sum(impressions)::bigint, sum(revenue),
         sum(revenue_try), bool_and(revenue_try is not null)
  from admob_daily
  where date >= p_from
  group by 1, 2, 3
  order by 1;
$$;

drop function if exists public.admob_by_country(date, date);
create function public.admob_by_country(p_from date, p_to date)
returns table (country text, impressions bigint, revenue numeric, revenue_try numeric, has_try boolean)
language sql stable security invoker set search_path = public
as $$
  select country, sum(impressions)::bigint, sum(revenue), sum(revenue_try), bool_and(revenue_try is not null)
  from admob_daily
  where date between p_from and p_to
  group by 1
  order by 3 desc
  limit 50;
$$;

drop function if exists public.admob_by_unit(date, date);
create function public.admob_by_unit(p_from date, p_to date)
returns table (ad_unit_id text, ad_unit_name text, ad_format text, game_id text, platform text, requests bigint, matched bigint, impressions bigint, revenue numeric, revenue_try numeric, has_try boolean)
language sql stable security invoker set search_path = public
as $$
  select ad_unit_id, max(ad_unit_name), max(ad_format), max(game_id), max(platform),
         sum(requests)::bigint, sum(matched_requests)::bigint, sum(impressions)::bigint, sum(revenue),
         sum(revenue_try), bool_and(revenue_try is not null)
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
