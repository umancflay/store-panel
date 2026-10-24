-- 4. aşama: Gmail politika mailleri, Claude analizi, telefon bildirimleri
-- Supabase panelinde: SQL Editor › New query › bu dosyanın tamamını yapıştır › Run
-- Dosya tekrar çalıştırılabilir.

-- Hangi kritik uyarı için telefona bildirim gönderildi (aynı uyarı iki kez gönderilmesin)
alter table public.alerts add column if not exists notified_at timestamptz;

-- Mailden gelen uyarının gönderildiği tarih ve gönderen (panelde kaynağı göstermek için)
alter table public.alerts add column if not exists mail_from text;
alter table public.alerts add column if not exists mail_date timestamptz;

-- Claude'un ürettiği özetleri hızlı bulmak için
create index if not exists ai_insights_kind_created on public.ai_insights (kind, created_at desc);

-- Bağlantı durum satırları (Ayarlar sayfasında görünür)
insert into public.connections (source, status) values
  ('gmail', 'disconnected'), ('claude', 'disconnected'), ('push', 'disconnected')
on conflict (source) do nothing;
