-- Panel özellikleri: görevler, notlar, planlar, takvim, otomasyonlar, ortak çalışma
-- Supabase panelinde: SQL Editor › New query › bu dosyanın tamamını yapıştır › Run
-- Dosya tekrar çalıştırılabilir.

-- Kişi bilgisi: menüde ve "Welcome, Umut." yazısında görünen ad
alter table public.admins add column if not exists display_name text;
alter table public.admins add column if not exists role text default 'Stüdyo sahibi';

-- Oyun başına aylık gelir hedefi (Gelir sayfasındaki halka)
alter table public.games add column if not exists monthly_goal numeric(12,2);

-- Mağazadan gelen oyun bilgileri: ikon, toplam indirme (Play), puan veren sayısı
alter table public.games add column if not exists icon_url text;
alter table public.games add column if not exists installs bigint;
alter table public.games add column if not exists installs_label text;
alter table public.games add column if not exists ratings_count integer;

-- Panelde gösterilmesini istemediğin oyunlar (Ayarlar › Oyun listesi)
alter table public.games add column if not exists hidden boolean not null default false;

-- ============================================================
-- Görevler (Kanban)
-- ============================================================
create table if not exists public.tasks (
  id bigint generated always as identity primary key,
  title text not null,
  status text not null default 'open' check (status in ('open','doing','done')),
  level text not null default 'medium' check (level in ('critical','medium','low')),
  game_id text references public.games(id) on delete set null,
  assignee text,                                  -- e-posta ya da 'assistant'
  due_date date,
  tags text[] not null default '{}',
  subtasks jsonb not null default '[]',           -- [{title, done}]
  notes text,
  advice text,                                    -- Claude'un önerisi (4. aşama)
  source text,                                    -- ör. 'alert:12', 'signal:salgin:crash'
  plan_node_id bigint,
  history jsonb not null default '[]',            -- [{what, at}]
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Notlar
-- ============================================================
create table if not exists public.notes (
  id bigint generated always as identity primary key,
  title text not null default 'Yeni not',
  folder text not null default 'Genel',
  tag text,
  body text not null default '',                  -- basit metin: "# başlık", "[x] iş", "- madde"
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Planlar (iş ağı) ve düğümleri
-- ============================================================
create table if not exists public.plans (
  id bigint generated always as identity primary key,
  name text not null,
  target_date date,
  game_id text references public.games(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.plan_nodes (
  id bigint generated always as identity primary key,
  plan_id bigint not null references public.plans(id) on delete cascade,
  title text not null,
  sub text,
  status text not null default 'wait' check (status in ('wait','active','done')),
  assignee text,                                  -- e-posta ya da 'assistant'
  start_date date,
  duration_days int not null default 1,
  depends_on bigint[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ============================================================
-- Takvim etkinlikleri (elle eklenenler; sürüm/son tarih/görevler otomatik gelir)
-- ============================================================
create table if not exists public.events (
  id bigint generated always as identity primary key,
  date date not null,
  title text not null,
  kind text not null default 'event' check (kind in ('deadline','release','event','ad')),
  game_id text references public.games(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Otomasyonlar: sinyal → koşul → eylem
-- ============================================================
create table if not exists public.automations (
  id bigint generated always as identity primary key,
  name text not null,
  enabled boolean not null default true,
  trigger text not null check (trigger in ('crash_rate','anr_rate','rating','fill_rate','policy_mail','rejected','bad_review','weekly_report')),
  threshold numeric,
  actions text[] not null default '{}',           -- task, notify, summary, reply_draft
  runs int not null default 0,
  last_run_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Ortak çalışma: plan sohbeti ve ortak kararlar
-- ============================================================
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  channel text not null default 'plan',
  author text not null,                           -- e-posta ya da 'assistant'
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.decisions (
  id bigint generated always as identity primary key,
  question text not null,
  votes jsonb not null default '{}',              -- {"e-posta": "yes" | "no" | "thinking"}
  status text not null default 'open' check (status in ('open','closed')),
  created_by text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Asistan: sorular (4. aşamada Claude cevaplar) ve genel ayarlar
-- ============================================================
create table if not exists public.assistant_questions (
  id bigint generated always as identity primary key,
  question text not null,
  answer text,
  status text not null default 'pending' check (status in ('pending','answered','failed')),
  asked_by text,
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- ============================================================
-- RLS: sadece admin (+ iki adımlı doğrulama) okur ve yazar
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['tasks','notes','plans','plan_nodes','events','automations','messages','decisions','assistant_questions','app_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "admin_all" on public.%I', t);
    execute format('create policy "admin_all" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Kişi kendi adını değiştirebilsin (Ayarlar › Profil)
drop policy if exists "own_update" on public.admins;
create policy "own_update" on public.admins for update to authenticated
  using (public.is_admin() and lower(email) = lower(auth.jwt() ->> 'email'))
  with check (lower(email) = lower(auth.jwt() ->> 'email'));

-- Adminler birbirinin adını görebilsin (menü, ortak plan)
drop policy if exists "admin_read" on public.admins;
create policy "admin_read" on public.admins for select to authenticated using (public.is_admin());

-- Canlı sohbet için Supabase Realtime'a ekle (zaten ekliyse hata vermez)
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.decisions;
exception when duplicate_object then null;
end $$;

-- Başlangıç otomasyonları (veri toplama bunlara göre çalışır)
insert into public.automations (name, trigger, threshold, actions)
select * from (values
  ('Çökme oranı Google eşiğini aşarsa', 'crash_rate', 1.09, array['task','notify']),
  ('ANR oranı Google eşiğini aşarsa', 'anr_rate', 0.47, array['task','notify']),
  ('App Store sürümü reddedilirse', 'rejected', null, array['task','notify']),
  ('Mağaza puanı 4,0 altına düşerse', 'rating', 4.0, array['task']),
  ('Fill rate %85 altına düşerse', 'fill_rate', 85, array['summary'])
) as v(name, trigger, threshold, actions)
where not exists (select 1 from public.automations);
