-- 3. aşama: Google Play ve App Store
-- Supabase panelinde: SQL Editor › New query › bu dosyanın tamamını yapıştır › Run
-- Dosya tekrar çalıştırılabilir.

-- Gün / oyun / platform bazında mağaza özeti (indirme, IAP, puan, çökme, ANR)
-- Değeri olmayan alanlar boş (null) döner; panel bunları "—" gösterir.
create or replace function public.store_by_day(p_from date)
returns table (date date, game_id text, platform text, downloads bigint, iap_revenue numeric, rating numeric, crash_rate numeric, anr_rate numeric)
language sql stable security invoker set search_path = public
as $$
  select date, game_id, platform, sum(downloads)::bigint, sum(iap_revenue), avg(rating), avg(crash_rate), avg(anr_rate)
  from store_daily
  where date >= p_from
  group by 1, 2, 3
  order by 1;
$$;

revoke all on function public.store_by_day(date) from public, anon;
grant execute on function public.store_by_day(date) to authenticated;

-- AdMob'da verisi olmayan örnek oyunlar panelde boş satır göstermesin
update public.games g set active = false
where g.id in ('tasinma-kaosu', 'dropshipping')
  and not exists (select 1 from public.admob_daily a where a.game_id = g.id)
  and not exists (select 1 from public.store_daily s where s.game_id = g.id);
