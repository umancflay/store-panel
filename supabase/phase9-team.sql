-- 9. aşama: ekip bildirimleri ve Claude'un haftalık iş bölümü.
-- Supabase › SQL Editor'da bir kez çalıştır. Tekrar çalıştırmak zararsızdır.

-- ============================================================
-- Bildirim kuyruğu: panel ya da tetikleyiciler yazar, "Asistan" işi (10 dakikada bir) telefona gönderir
-- ============================================================
create table if not exists public.notify_outbox (
  id bigint generated always as identity primary key,
  to_email text,                                   -- boşsa herkese
  title text not null,
  body text,
  url text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table public.notify_outbox enable row level security;
drop policy if exists "admin_all" on public.notify_outbox;
create policy "admin_all" on public.notify_outbox for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.notify_outbox from anon;

-- Görev başkasına atanınca o kişiye bildirim (kendine atadığında gitmez)
create or replace function public.notify_task_assigned()
returns trigger language plpgsql security definer set search_path = public
as $$
declare me text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if new.assignee is not null and new.assignee <> 'assistant' and lower(new.assignee) <> me
     and (tg_op = 'INSERT' or new.assignee is distinct from old.assignee) then
    insert into notify_outbox (to_email, title, body, url)
    values (new.assignee, 'Sana görev atandı', left(new.title, 150), './#/gorevler?id=' || new.id);
  end if;
  return new;
end $$;

drop trigger if exists task_assigned_notify on public.tasks;
create trigger task_assigned_notify after insert or update of assignee on public.tasks
  for each row execute function public.notify_task_assigned();

-- Görevine başkası yorum yazınca sana bildirim
create or replace function public.notify_task_comment()
returns trigger language plpgsql security definer set search_path = public
as $$
declare t record;
begin
  if new.task_id is null then return new; end if;
  select id, title, assignee into t from tasks where id = new.task_id;
  if t.assignee is not null and t.assignee <> 'assistant' and lower(t.assignee) <> lower(coalesce(new.author, '')) then
    insert into notify_outbox (to_email, title, body, url)
    values (t.assignee, 'Görevine yorum: ' || left(t.title, 60), left(new.body, 150), './#/gorevler?id=' || t.id);
  end if;
  return new;
end $$;

drop trigger if exists task_comment_notify on public.comments;
create trigger task_comment_notify after insert on public.comments
  for each row execute function public.notify_task_comment();

-- ============================================================
-- Claude'un iş bölümü önerileri: yeni görev ya da mevcut göreve sorumlu. Onaylanmadan hiçbir şey değişmez.
-- ============================================================
create table if not exists public.work_suggestions (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('new_task', 'assign')),
  task_id bigint references public.tasks(id) on delete cascade,   -- assign için
  title text not null,
  game_id text references public.games(id) on delete set null,
  level text not null default 'medium' check (level in ('critical','medium','low')),
  assignee text,                                    -- e-posta ya da 'assistant'
  due_date date,
  why text,
  status text not null default 'pending' check (status in ('pending','accepted','dismissed')),
  created_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz
);

alter table public.work_suggestions enable row level security;
drop policy if exists "admin_all" on public.work_suggestions;
create policy "admin_all" on public.work_suggestions for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.work_suggestions from anon;

do $$ begin
  alter publication supabase_realtime add table public.work_suggestions;
exception when duplicate_object then null; end $$;
