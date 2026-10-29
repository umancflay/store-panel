-- 12. aşama: reklam platformlarından veri alma kapısı (Google Ads betiği ve sonraki platformlar).
-- Google Ads hesabındaki betik (Araçlar › Betikler) her saat kampanya sonuçlarını buraya gönderir.
-- Kapı sadece panelin ürettiği gizli anahtarla açılır (app_settings.ads_ingest_key; sadece yöneticiler görebilir).
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
  v_fx jsonb;
  v_last numeric;
  v_rows int := 0;
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

  insert into connections (source, status, message, last_sync_at, updated_at)
  values (v_platform, 'connected', format('%s satır, hesap %s', v_rows, coalesce(p_payload->>'account', '?')), now(), now())
  on conflict (source) do update set status = 'connected', message = excluded.message, last_sync_at = now(), updated_at = now();

  return jsonb_build_object('ok', true, 'rows', v_rows);
end $$;

revoke all on function public.ingest_ads(text, jsonb) from public;
grant execute on function public.ingest_ads(text, jsonb) to anon, authenticated;
