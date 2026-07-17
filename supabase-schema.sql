create table if not exists profiles (
  login_key text primary key,
  login text not null,
  password_hash text not null,
  name text not null,
  role text not null default 'user',
  created_at timestamptz not null default now()
);

alter table profiles add column if not exists language text not null default 'ru';

create table if not exists sessions (
  token text primary key,
  login_key text not null references profiles(login_key) on delete cascade,
  created_at timestamptz not null default now()
);

alter table sessions add column if not exists ip text;
alter table sessions add column if not exists user_agent text;
create index if not exists sessions_login_key_idx on sessions(login_key);
create index if not exists sessions_created_at_idx on sessions(created_at);

create table if not exists stores (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists app_settings (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
