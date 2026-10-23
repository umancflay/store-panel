-- Admin e-postalarını buraya yaz, sonra SQL Editor'de çalıştır.
-- Önce aynı e-postalarla Authentication › Users › Add user ile hesap açmalısın.
insert into public.admins (email) values
  ('senin-mailin@ornek.com'),
  ('arkadasinin-maili@ornek.com')
on conflict (email) do nothing;
