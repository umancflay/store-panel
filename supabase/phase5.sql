-- 5. aşama: ortak çalışma (dosyalar, yorumlar, ekip akışı, canlı güncelleme) ve Meta reklam verisi.
-- Supabase › SQL Editor'da bir kez çalıştır. Tekrar çalıştırmak zararsızdır.

-- ============================================================
-- Reklam kampanyaları: gösterim ve tıklama
-- ============================================================
alter table public.campaigns add column if not exists impressions bigint not null default 0;
alter table public.campaigns add column if not exists clicks bigint not null default 0;

-- ============================================================
-- Dosyalar: Supabase Storage'daki "files" kovasına yüklenir, burada kaydı tutulur
-- ============================================================
create table if not exists public.files (
  id bigint generated always as identity primary key,
  name text not null,
  path text not null unique,                       -- kovadaki yol
  size bigint not null default 0,
  mime text,
  folder text not null default 'Genel',
  game_id text references public.games(id) on delete set null,
  task_id bigint references public.tasks(id) on delete set null,
  note_id bigint references public.notes(id) on delete set null,
  uploaded_by text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Yorumlar: görev ve notların altında konuşma
-- ============================================================
create table if not exists public.comments (
  id bigint generated always as identity primary key,
  task_id bigint references public.tasks(id) on delete cascade,
  note_id bigint references public.notes(id) on delete cascade,
  body text not null,
  author text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Ekip akışı: kim ne yaptı (görev açtı, bitirdi, dosya yükledi …)
-- ============================================================
create table if not exists public.activity (
  id bigint generated always as identity primary key,
  who text,
  what text not null,
  link text,                                       -- panel içi adres, ör. '/gorevler?id=12'
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['files','comments','activity'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "admin_all" on public.%I', t);
    execute format('create policy "admin_all" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ============================================================
-- Depolama kovası: gizli, dosya başına en çok 50 MB (ücretsiz plan sınırı)
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "files_admin_all" on storage.objects;
create policy "files_admin_all" on storage.objects for all to authenticated
  using (bucket_id = 'files' and public.is_admin())
  with check (bucket_id = 'files' and public.is_admin());

-- ============================================================
-- Canlı güncelleme: ortağın yaptığı değişiklik sayfayı yenilemeden görünsün
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['tasks','notes','files','comments','activity','plan_nodes','events'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
