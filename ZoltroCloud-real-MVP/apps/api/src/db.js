import pg from "pg";
const { Pool } = pg;

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      email TEXT UNIQUE,
      password_hash TEXT,
      display_name TEXT NOT NULL,
      steam_id TEXT UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      store TEXT NOT NULL,
      app_id TEXT NOT NULL,
      image_url TEXT,
      executable TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gpu_hosts (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      region TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'offline',
      active_session_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      game_id TEXT NOT NULL REFERENCES games(id),
      host_id UUID REFERENCES gpu_hosts(id),
      status TEXT NOT NULL,
      stream_url TEXT,
      started_at TIMESTAMPTZ,
      ended_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    INSERT INTO games (id,name,store,app_id,image_url,executable)
    VALUES
      ('steam-730','Counter-Strike 2','steam','730','https://cdn.cloudflare.steamstatic.com/steam/apps/730/header.jpg','cs2.exe'),
      ('steam-570','Dota 2','steam','570','https://cdn.cloudflare.steamstatic.com/steam/apps/570/header.jpg','dota2.exe'),
      ('steam-1174180','Red Dead Redemption 2','steam','1174180','https://cdn.cloudflare.steamstatic.com/steam/apps/1174180/header.jpg','RDR2.exe')
    ON CONFLICT (id) DO NOTHING
  `);
}
