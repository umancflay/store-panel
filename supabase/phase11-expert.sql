-- 11. aşama: Yayın Uzmanı. Panele bırakılan build'ler, inceleme raporları ve onay bekleyen yayın eylemleri.
-- Supabase › SQL Editor'da bir kez çalıştır. Tekrar çalıştırmak zararsızdır.

create table if not exists public.store_builds (
  id bigint generated always as identity primary key,
  game_id text references public.games(id) on delete set null,
  platform text not null default 'android' check (platform in ('android', 'ios')),
  file_id bigint references public.files(id) on delete set null,   -- build dosyası (gizli "files" kovası, parçalı)
  file_name text,
  package_name text,
  version_code integer,
  version_name text,
  -- uploaded → inspecting → blocked | ready → internal → awaiting_approval → publishing → live | failed
  status text not null default 'uploaded'
    check (status in ('uploaded', 'inspecting', 'blocked', 'ready', 'internal', 'awaiting_approval', 'publishing', 'live', 'failed')),
  report jsonb,                                    -- { verdict, counts, findings[], build{…} }
  summary text,                                    -- kural raporu ya da kendi modelin sade özeti
  error text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Oyunculara giden her işlem burada onay bekler; onay sadece panelden (MFA'lı yönetici)
create table if not exists public.expert_actions (
  id bigint generated always as identity primary key,
  build_id bigint references public.store_builds(id) on delete cascade,
  kind text not null check (kind in ('publish_production', 'increase_rollout', 'halt')),
  params jsonb not null default '{}',              -- { userFraction: 0.1 }
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'done', 'failed')),
  result text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['store_builds', 'expert_actions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "admin_all" on public.%I', t);
    execute format('create policy "admin_all" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('revoke all on public.%I from anon', t);
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
