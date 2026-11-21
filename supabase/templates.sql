-- テンプレート保管用のテーブル（spec.md 13.2）
-- Supabase の SQL Editor で実行する

create table public.templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,          -- テンプレート名（保存時に決める）
  svg        text not null,                 -- テンプレートの SVG（spec.md 7.3 の形式）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ログインなしで使うため、anon ロールに読み書きを許可する
-- （anon key を知っている人は誰でも読み書きできる。ローカルでだけ使う前提。spec.md 13.2）
alter table public.templates enable row level security;
create policy "templates_all_anon" on public.templates
  for all to anon using (true) with check (true);
