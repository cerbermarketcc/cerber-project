create table if not exists profiles (
  login_key text primary key,
  login text not null,
  password_hash text not null,
  name text not null,
  role text not null default 'user',
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  token text primary key,
  login_key text not null references profiles(login_key) on delete cascade,
  created_at timestamptz not null default now()
);

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
