-- Site accounts (players, sessions) shared by every game, plus game scores.
-- Safe to run repeatedly.

create table if not exists players (
  id bigserial primary key,
  name text not null unique,            -- lowercase a-z 0-9 _ -, 3–16 characters
  password_hash text not null,          -- scrypt; see src/lib/auth/password.ts
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  token_hash text primary key,          -- sha256 of the cookie token; the token itself is never stored
  player_id bigint not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists sessions_player_idx on sessions (player_id);

-- A ticket issued when a game starts. A score must name an unused ticket, and the
-- ticket's start time bounds how much could have been scored.
create table if not exists runs (
  id uuid primary key,
  game text not null,
  started_at timestamptz not null default now(),
  used_at timestamptz
);
create index if not exists runs_started_idx on runs (started_at);

create table if not exists scores (
  id bigserial primary key,
  run_id uuid not null unique references runs(id),
  player_id bigint not null references players(id) on delete cascade,
  game text not null,
  score integer not null,
  level integer not null,
  words integer not null,
  wpm integer not null,
  accuracy integer not null,
  duration_ms integer not null,
  hidden boolean not null default false, -- moderation: hide without deleting
  created_at timestamptz not null default now()
);
create index if not exists scores_board_idx on scores (game, hidden, created_at);
create index if not exists scores_player_idx on scores (player_id, game, score desc);

-- Sliding-window rate limiting: one row per attempt, pruned as it goes.
create table if not exists rate_limits (
  key text not null,
  at timestamptz not null default now()
);
create index if not exists rate_limits_key_idx on rate_limits (key, at);
