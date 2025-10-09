// SQLite database setup with simple migration runner
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'app.db');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getDb() {
  ensureDirs();
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  return db;
}

function runMigrations(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY);`);
  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version)
  );
  if (!fs.existsSync(MIGRATIONS_DIR)) return;
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const insertVersion = db.prepare('INSERT INTO schema_migrations (version) VALUES (?)');
  for (const file of files) {
    const version = file.split('_')[0].replace('.sql', '');
    if (applied.has(version)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const tx = db.transaction(() => {
      db.exec(sql);
      insertVersion.run(version);
    });
    tx();
  }
}

// Initialize DB and migrations
const db = getDb();
runMigrations(db);

// Data access helpers
const selectAllByBoard = db.prepare(
  `SELECT id, name, role, roles, timezone, availability, notes, discord_name, created_at, board, client_id FROM players WHERE board = @board ORDER BY created_at ASC`
);
const selectById = db.prepare(
  `SELECT id, name, role, roles, timezone, availability, notes, discord_name, created_at, board, client_id FROM players WHERE id = ?`
);
const insertPlayer = db.prepare(
  `INSERT INTO players (id, name, role, roles, timezone, availability, notes, discord_name, created_at, board, client_id)
   VALUES (@id, @name, @roleSingle, @rolesJson, @timezone, @availability, @notes, @discord_name, @created_at, @board, @client_id)`
);
const updatePlayerStmt = db.prepare(
  `UPDATE players SET name=@name, role=@roleSingle, roles=@rolesJson, timezone=@timezone, availability=@availability, notes=@notes, discord_name=@discord_name WHERE id=@id`
);
const deleteByIdStmt = db.prepare(`DELETE FROM players WHERE id = ?`);
const deleteAllStmt = db.prepare(`DELETE FROM players`);

function listPlayers(board) {
  const rows = selectAllByBoard.all({ board });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    roles: r.roles ? JSON.parse(r.roles) : [r.role],
    timezone: r.timezone,
    availability: JSON.parse(r.availability),
    notes: r.notes || undefined,
    discordName: r.discord_name || undefined,
    board: r.board,
    clientId: r.client_id || undefined,
  }));
}

function upsertPlayer(p) {
  insertPlayer.run({
    id: p.id,
    name: p.name,
    roleSingle: Array.isArray(p.roles) && p.roles.length ? p.roles[0] : (p.role || 'DPS'),
    rolesJson: JSON.stringify(Array.isArray(p.roles) ? p.roles : (p.role ? [p.role] : ['DPS'])),
    timezone: p.timezone,
    availability: JSON.stringify(p.availability),
    notes: p.notes || null,
    discord_name: p.discordName || null,
    created_at: Date.now(),
    board: p.board || 'default',
    client_id: p.clientId || null,
  });
}

function deletePlayer(id) {
  const info = deleteByIdStmt.run(id);
  return info.changes > 0;
}

function clearPlayers(board) {
  if (board) {
    db.prepare('DELETE FROM players WHERE board = ?').run(board);
  } else {
    deleteAllStmt.run();
  }
}

function getPlayer(id) {
  const r = selectById.get(id);
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    roles: r.roles ? JSON.parse(r.roles) : [r.role],
    timezone: r.timezone,
    availability: JSON.parse(r.availability),
    notes: r.notes || undefined,
    discordName: r.discord_name || undefined,
    board: r.board,
    clientId: r.client_id || undefined,
  };
}

function updatePlayer(p) {
  const info = updatePlayerStmt.run({
    id: p.id,
    name: p.name,
    roleSingle: Array.isArray(p.roles) && p.roles.length ? p.roles[0] : 'DPS',
    rolesJson: JSON.stringify(Array.isArray(p.roles) ? p.roles : ['DPS']),
    timezone: p.timezone,
    availability: JSON.stringify(p.availability),
    notes: p.notes || null,
    discord_name: p.discordName || null,
  });
  return info.changes > 0;
}

module.exports = {
  listPlayers,
  upsertPlayer,
  deletePlayer,
  clearPlayers,
  getPlayer,
  updatePlayer,
};
