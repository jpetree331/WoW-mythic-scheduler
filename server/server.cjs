// Minimal Node.js HTTP server backed by SQLite
const http = require('http');
const { listPlayers, upsertPlayer, deletePlayer, clearPlayers, getPlayer, updatePlayer } = require('./db.cjs');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8787;
// Storage moved to SQLite via server/db.js

function send(res, status, body, headers = {}) {
  const json = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Id',
    ...headers,
  });
  res.end(json);
}

function notFound(res) {
  send(res, 404, { error: 'Not found' });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        // 1MB limit
        req.connection.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!data) return resolve(null);
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

function generateId() {
  return (
    Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
  );
}

// Admin token for destructive actions. Defaults to a preset if not provided via env.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'IXOYEFISH';

function isAuthorized(req) {
  if (!ADMIN_TOKEN) return true; // if no token set, allow all (development)
  const auth = req.headers['authorization'];
  if (!auth || !auth.toString().startsWith('Bearer ')) return false;
  const token = auth.toString().slice('Bearer '.length);
  return token === ADMIN_TOKEN;
}

const server = http.createServer(async (req, res) => {
  // Basic CORS preflight support
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,PATCH,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Id',
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  // Server-Sent Events for live updates
  if (req.method === 'GET' && pathname === '/events') {
    const board = url.searchParams.get('board') || 'default';
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    // send initial comment to establish stream
    res.write(': connected\n\n');
    addClient(board, res);
    req.on('close', () => removeClient(board, res));
    return; // keep connection open
  }

  // Routes
  if (req.method === 'GET' && pathname === '/health') {
    return send(res, 200, { ok: true });
  }

  if (pathname === '/players') {
    const board = url.searchParams.get('board') || 'default';
    if (req.method === 'GET') {
      try {
        const data = listPlayers(board);
        return send(res, 200, data);
      } catch (e) {
        return send(res, 500, { error: e && e.message ? e.message : 'Internal Error' });
      }
    }
    if (req.method === 'POST') {
      try {
        const body = await parseBody(req);
        if (!body || typeof body !== 'object') {
          return send(res, 400, { error: 'Invalid body' });
        }
        const { name, roles, role, availability, notes, timezone, clientId, discordName } = body;
        if (!name || (!roles && !role) || !availability || typeof availability !== 'object') {
          return send(res, 400, { error: 'Missing required fields' });
        }
        const tz = typeof timezone === 'string' && timezone ? timezone : 'America/New_York';
        const newPlayer = { id: generateId(), name, roles: roles || (role ? [role] : ['DPS']), availability, notes, timezone: tz, board, clientId, discordName };
        upsertPlayer(newPlayer);
        broadcast(board, { type: 'player_added', id: newPlayer.id });
        return send(res, 201, newPlayer);
      } catch (e) {
        return send(res, 400, { error: e.message || 'Bad Request' });
      }
    }
    if (req.method === 'DELETE') {
      if (!isAuthorized(req)) {
        return send(res, 401, { error: 'Unauthorized' });
      }
      // DELETE /players[?board=...] -> remove all (optionally limited by board)
      clearPlayers(board);
      broadcast(board, { type: 'players_cleared' });
      return send(res, 200, { ok: true });
    }
  }

  // DELETE /players/:id
  if (req.method === 'DELETE' && pathname.startsWith('/players/')) {
    const id = pathname.split('/')[2];
    if (!id) return notFound(res);
    const owner = getPlayer(id);
    if (!owner) return notFound(res);
    const clientId = req.headers['x-client-id'];
    const authorized = isAuthorized(req) || (clientId && owner.clientId && clientId === owner.clientId);
    if (!authorized) return send(res, 401, { error: 'Unauthorized' });
    const removed = deletePlayer(id);
    broadcast(owner.board, { type: 'player_deleted', id });
    return send(res, removed ? 200 : 404, removed ? { ok: true } : { error: 'Not found' });
  }

  // PATCH /players/:id (owner or admin)
  if (req.method === 'PATCH' && pathname.startsWith('/players/')) {
    const id = pathname.split('/')[2];
    if (!id) return notFound(res);
    const current = getPlayer(id);
    if (!current) return notFound(res);
    const clientId = req.headers['x-client-id'];
    const authorized = isAuthorized(req) || (clientId && current.clientId && clientId === current.clientId);
    if (!authorized) return send(res, 401, { error: 'Unauthorized' });
    try {
      const body = await parseBody(req);
      const patch = {
        id,
        name: body.name ?? current.name,
        roles: Array.isArray(body.roles) ? body.roles : (body.role ? [body.role] : current.roles),
        timezone: body.timezone ?? current.timezone,
        availability: body.availability ?? current.availability,
        notes: body.notes ?? current.notes ?? null,
        discordName: body.discordName ?? current.discordName ?? null,
      };
      const ok = updatePlayer(patch);
      if (!ok) return send(res, 500, { error: 'Failed to update' });
      broadcast(current.board, { type: 'player_updated', id });
      return send(res, 200, patch);
    } catch (e) {
      return send(res, 400, { error: e.message || 'Bad Request' });
    }
  }

  return notFound(res);
});

// --- SSE client management ---
const clientsByBoard = new Map(); // board -> Set<res>

function addClient(board, res) {
  if (!clientsByBoard.has(board)) clientsByBoard.set(board, new Set());
  clientsByBoard.get(board).add(res);
}

function removeClient(board, res) {
  const set = clientsByBoard.get(board);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clientsByBoard.delete(board);
}

function broadcast(board, payload) {
  const set = clientsByBoard.get(board);
  if (!set) return;
  const data = `event: players\n` + `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    try { res.write(data); } catch (_) {}
  }
}

function broadcastAll(payload) {
  for (const [board] of clientsByBoard) {
    broadcast(board, payload);
  }
}

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
