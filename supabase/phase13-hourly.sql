-- 13. aşama: saatlik düzenli güncelleme ve Firebase (Google Analytics) oyuncu verisi.
-- GitHub'ın kendi zamanlaması ücretsiz hesapta saatlerce gecikebiliyor; Supabase'in zamanlayıcısı (pg_cron) her saat
-- başı "trigger-update" fonksiyonunu çağırır, fonksiyon veri toplama (hafif), Asistan ve Yayın Uzmanı işlerini başlatır.
-- Çağrı veritabanında üretilen gizli bir anahtarla yapılır (kimse görmez; sadece yöneticiler ve sunucu okuyabilir).
-- Supabase › SQL Editor'da bir kez çalıştır; tekrar çalıştırmak zararsızdır.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Zamanlayıcı anahtarı (yoksa üretilir)
insert into public.app_settings (key, value)
values ('cron_key', jsonb_build_object('key', encode(extensions.gen_random_bytes(24), 'hex')))
on conflict (key) do nothing;

-- Her saatin 5. dakikasında
select cron.unschedule('panel-saatlik') where exists (select 1 from cron.job where jobname = 'panel-saatlik');
select cron.schedule('panel-saatlik', '5 * * * *', $job$
  select net.http_post(
    url := 'https://tklfwuwfzhsedczstvvg.supabase.co/functions/v1/trigger-update',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', (select value->>'key' from public.app_settings where key = 'cron_key')
    ),
    body := '{"cron": true}'::jsonb
  );
$job$);

-- Firebase / Google Analytics: günlük yeni ve aktif oyuncu (Play'in 2-5 gün gecikmeli indirme sayısının yanında)
alter table public.store_daily add column if not exists new_users integer;
alter table public.store_daily add column if not exists active_users integer;
