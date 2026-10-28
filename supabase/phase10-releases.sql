-- 10. aşama: sürüm çıkarma yardımcısı. Her oyun sürümü için mağaza kontrol listesi.
-- Supabase › SQL Editor'da bir kez çalıştır. Tekrar çalıştırmak zararsızdır.

create table if not exists public.releases (
  id bigint generated always as identity primary key,
  game_id text references public.games(id) on delete cascade,
  platform text not null default 'android' check (platform in ('android', 'ios', 'both')),
  version text not null,
  status text not null default 'prep' check (status in ('prep', 'review', 'live')),
  target_date date,
  changes text,                                    -- bu sürümde ne değişti (Claude sürüm notunu buradan yazar)
  checklist jsonb not null default '[]',           -- [{id, group, title, done}]
  task_id bigint references public.tasks(id) on delete set null,   -- Claude'un sürüm notu görevi
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.releases enable row level security;
drop policy if exists "admin_all" on public.releases;
create policy "admin_all" on public.releases for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.releases from anon;

do $$ begin
  alter publication supabase_realtime add table public.releases;
exception when duplicate_object then null; end $$;
