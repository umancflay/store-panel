-- 14. aşama: Google Ads ülke kırılımı.
-- Betiğin 2. sürümü kampanyaları ülke ülke de gönderir (son 30 gün toplamı). Bu dosya ingest_ads fonksiyonunu
-- bu kırılımları ad_breakdowns tablosuna (dimension = 'country') yazacak şekilde günceller.
-- Eski betik (1. sürüm) çalışmaya devam eder; sadece ülke verisi gelmez.
-- Sadece okuma verisi yazar: kampanya açmaz, bütçe değiştirmez. Supabase › SQL Editor'da bir kez çalıştır; tekrar çalıştırmak zararsızdır.

create or replace function public.ingest_ads(p_key text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_platform text := p_payload->>'platform';
  v_currency text := upper(coalesce(p_payload->>'currency', 'USD'));
  v_version text := coalesce(p_payload->>'v', '1');
  v_fx jsonb;
  v_last numeric;
  v_rows int := 0;
  v_bd int := 0;
  r jsonb;
  v_rate numeric;
  v_game text;
begin
  select value->>'key' into v_key from app_settings where key = 'ads_ingest_key';
  if v_key is null or p_key is distinct from v_key then
    raise exception 'Yetkisiz' using errcode = '28000';
  end if;
  if v_platform not in ('google_ads', 'apple_ads', 'tiktok', 'unity_ads') then
    raise exception 'Bilinmeyen platform';
  end if;

  -- Panel harcamayı USD saklar; TL ise günün kuruyla çevrilir (kur yoksa son kur)
  select value into v_fx from app_settings where key = 'fx_usd_try';
  select (v_fx->>k)::numeric into v_last from jsonb_object_keys(coalesce(v_fx, '{}'::jsonb)) k order by k desc limit 1;

  for r in select * from jsonb_array_elements(coalesce(p_payload->'rows', '[]'::jsonb)) loop
    v_rate := case when v_currency = 'USD' then 1
                   when v_currency = 'TRY' then coalesce((v_fx->>(r->>'date'))::numeric, v_last)
                   else null end;
    if v_rate is null or v_rate = 0 then continue; end if;
    select id into v_game from games
      where (r->>'appId') is not null and (android_package = r->>'appId' or ios_app_id = r->>'appId')
      limit 1;
    insert into campaigns (platform, external_id, game_id, name, status, date, spend, installs, impressions, clicks, objective, result_type, results)
    values (
      v_platform, r->>'id', v_game, coalesce(r->>'name', r->>'id'), r->>'status', (r->>'date')::date,
      round(coalesce((r->>'cost')::numeric, 0) / v_rate, 2),
      coalesce((r->>'installs')::numeric, 0)::int,
      coalesce((r->>'impressions')::numeric, 0)::bigint,
      coalesce((r->>'clicks')::numeric, 0)::bigint,
      r->>'channel',
      case when r->>'channel' = 'MULTI_CHANNEL' then 'Kurulum' else 'Dönüşüm' end,
      coalesce((r->>'conversions')::numeric, 0)::int
    )
    on conflict (platform, external_id, date) do update set
      game_id = coalesce(excluded.game_id, campaigns.game_id), name = excluded.name, status = excluded.status,
      spend = excluded.spend, installs = excluded.installs, impressions = excluded.impressions, clicks = excluded.clicks,
      objective = excluded.objective, result_type = excluded.result_type, results = excluded.results;
    v_rows := v_rows + 1;
  end loop;

  -- Ülke kırılımı (30 günlük toplam): bu platformun eski satırları silinir, yenileri yazılır (pencere kaydığı için)
  if p_payload ? 'breakdowns' then
    delete from ad_breakdowns where platform = v_platform and dimension = 'country';
    v_rate := case when v_currency = 'USD' then 1 when v_currency = 'TRY' then v_last else null end;
    if v_rate is not null and v_rate <> 0 then
      for r in select * from jsonb_array_elements(p_payload->'breakdowns') loop
        if coalesce(r->>'key', '') = '' then continue; end if;
        select game_id into v_game from campaigns
          where platform = v_platform and external_id = r->>'campaignId' and game_id is not null
          order by date desc limit 1;
        insert into ad_breakdowns (platform, campaign_id, game_id, dimension, key, spend, impressions, clicks, reach, results, updated_at)
        values (
          v_platform, r->>'campaignId', v_game, 'country', upper(r->>'key'),
          round(coalesce((r->>'cost')::numeric, 0) / v_rate, 2),
          coalesce((r->>'impressions')::numeric, 0)::bigint,
          coalesce((r->>'clicks')::numeric, 0)::bigint,
          0,
          coalesce((r->>'conversions')::numeric, 0)::int,
          now()
        )
        on conflict (platform, campaign_id, dimension, key) do update set
          game_id = excluded.game_id, spend = excluded.spend, impressions = excluded.impressions,
          clicks = excluded.clicks, results = excluded.results, updated_at = now();
        v_bd := v_bd + 1;
      end loop;
    end if;
  end if;

  insert into connections (source, status, message, last_sync_at, updated_at)
  values (v_platform, 'connected', format('%s satır, %s ülke satırı, hesap %s, betik v%s', v_rows, v_bd, coalesce(p_payload->>'account', '?'), v_version), now(), now())
  on conflict (source) do update set status = 'connected', message = excluded.message, last_sync_at = now(), updated_at = now();

  return jsonb_build_object('ok', true, 'rows', v_rows, 'countries', v_bd);
end $$;

revoke all on function public.ingest_ads(text, jsonb) from public;
grant execute on function public.ingest_ads(text, jsonb) to anon, authenticated;
