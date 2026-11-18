import type { Sql } from '../db.js'

export const SCHEMA = [
  `create table if not exists player (
    id text primary key,
    name text not null,
    experience bigint not null default 0,
    copper bigint not null default 0,
    opened_at timestamptz
  )`,
  `create table if not exists quest (
    key text primary key,
    title text not null,
    web_url text not null,
    difficulty text not null,
    experience integer not null,
    copper bigint not null,
    giver_id text,
    giver_name text,
    completed_at timestamptz not null,
    due_at timestamptz not null,
    distributed_at timestamptz,
    distributed_by text
  )`,
  `create table if not exists share (
    quest_key text not null references quest (key) on delete cascade,
    player_id text not null references player (id),
    proposed double precision not null,
    experience integer,
    copper bigint,
    primary key (quest_key, player_id)
  )`,
  `create table if not exists message (
    id bigserial primary key,
    recipient_id text not null,
    kind text not null,
    quest_key text references quest (key) on delete cascade,
    created_at timestamptz not null default now(),
    read_at timestamptz,
    done_at timestamptz
  )`,
  `create index if not exists message_recipient on message (recipient_id, done_at)`,
  `create index if not exists quest_due on quest (due_at) where distributed_at is null`,
  `create table if not exists setting (
    key text primary key,
    value text not null
  )`,
  `alter table player add column if not exists outfitted_at timestamptz`,
  `create table if not exists inventory (
    player_id text not null references player (id),
    item_id text not null,
    equipped boolean not null default false,
    acquired_at timestamptz not null default now(),
    primary key (player_id, item_id)
  )`,
]

export async function migrate(db: Sql): Promise<void> {
  for (const statement of SCHEMA) await db.query(statement)
}
