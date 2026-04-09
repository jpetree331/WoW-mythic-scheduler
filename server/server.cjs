// Minimal Node.js HTTP server backed by SQLite
const http = require('http');
const { listPlayers, upsertPlayer, deletePlayer, clearPlayers, getPlayer, updatePlayer } = require('./db.cjs');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8787;

// Admin token — must be set via ADMIN_TOKEN env var. No default fallback.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || null;

// Allowed CORS origins — comma-separated list via env var.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// --- Helpers ---

function corsHeaders(origin) {
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,PATCH,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Id',
    };
  }
  return {};
}

function send(req, res, status, body, extraHeaders = {}) {
  const origin = req.headers['origin'];
  const json = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(origin),
    ...extraHeaders,
  });
  res.end(json);
}

function notFound(req, res) {
  send(req, res, 404, { error: 'Not found' });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
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

// Returns true if the request carries a valid admin bearer token.
// Returns false if no token is configured (callers handle the 503 case).
function isAuthorized(req) {
  if (!ADMIN_TOKEN) return false;
  const auth = req.headers['authorization'];
  if (!auth || !auth.toString().startsWith('Bearer ')) return false;
  const token = auth.toString().slice('Bearer '.length);
  return token === ADMIN_TOKEN;
}

// --- Input validation ---

const VALID_ROLES = new Set(['Tank', 'Healer', 'DPS']);
const VALID_DAYS = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);

function validatePlayerInput(body) {
  const { name, roles, role, availability, timezone } = body;

  if (typeof name !== 'string' || name.trim() === '' || name.length > 100) {
    return 'name must be a non-empty string of at most 100 characters';
  }

  const resolvedRoles = Array.isArray(roles) ? roles : (role ? [role] : null);
  if (!resolvedRoles || resolvedRoles.length === 0) {
    return 'roles must be a non-empty array';
  }
  for (const r of resolvedRoles) {
    if (!VALID_ROLES.has(r)) {
      return `invalid role "${r}"; must be Tank, Healer, or DPS`;
    }
  }

  if (typeof timezone !== 'string' || timezone.trim() === '') {
    return 'timezone must be a non-empty string';
  }

  if (!availability || typeof availability !== 'object' || Array.isArray(availability)) {
    return 'availability must be an object';
  }
  for (const [day, slots] of Object.entries(availability)) {
    if (!VALID_DAYS.has(day)) {
      return `invalid day "${day}"; must be a full weekday name (e.g. Monday)`;
    }
    if (!Array.isArray(slots)) {
      return `availability.${day} must be an array of time slots`;
    }
    for (const slot of slots) {
      if (
        typeof slot.start !== 'number' ||
        !Number.isInteger(slot.start) ||
        slot.start < 0 ||
        slot.start > 1439
      ) {
        return `${day}: slot start must be an integer between 0 and 1439`;
      }
      if (
        typeof slot.end !== 'number' ||
        !Number.isInteger(slot.end) ||
        slot.end < 0 ||
        slot.end > 1439
      ) {
        return `${day}: slot end must be an integer between 0 and 1439`;
      }
      if (slot.start >= slot.end) {
        return `${day}: slot start must be less than slot end`;
      }
    }
  }

  return null; // valid
}

// --- HTTP server ---

const server = http.createServer(async (req, res) => {
  const origin = req.headers['origin'];

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(origin));
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  // Server-Sent Events for live updates
  if (req.method === 'GET' && pathname === '/events') {
    const board = url.searchParams.get('board') || 'default';
    const sseHeaders = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      ...corsHeaders(origin),
    };
    res.writeHead(200, sseHeaders);
    res.write(': connected\n\n');
    addClient(board, res);
    req.on('close', () => removeClient(board, res));
    return;
  }

  // Routes
  if (req.method === 'GET' && pathname === '/health') {
    return send(req, res, 200, { ok: true });
  }

  if (pathname === '/players') {
    const board = url.searchParams.get('board') || 'default';

    if (req.method === 'GET') {
      try {
        const data = listPlayers(board);
        return send(req, res, 200, data);
      } catch (e) {
        return send(req, res, 500, { error: e && e.message ? e.message : 'Internal Error' });
      }
    }

    if (req.method === 'POST') {
      try {
        const body = await parseBody(req);
        if (!body || typeof body !== 'object') {
          return send(req, res, 400, { error: 'Invalid body' });
        }

        const validationError = validatePlayerInput(body);
        if (validationError) {
          return send(req, res, 400, { error: validationError });
        }

        const { name, roles, role, availability, notes, timezone, clientId, discordName } = body;
        const resolvedRoles = Array.isArray(roles) ? roles : (role ? [role] : ['DPS']);
        const newPlayer = {
          id: generateId(),
          name: name.trim(),
          roles: resolvedRoles,
          availability,
          notes,
          timezone,
          board,
          clientId,
          discordName,
        };
        upsertPlayer(newPlayer);
        broadcast(board, { type: 'player_added', id: newPlayer.id });
        return send(req, res, 201, newPlayer);
      } catch (e) {
        return send(req, res, 400, { error: e.message || 'Bad Request' });
      }
    }

    if (req.method === 'DELETE') {
      if (!ADMIN_TOKEN) {
        return send(req, res, 503, { error: 'Admin token not configured' });
      }
      if (!isAuthorized(req)) {
        return send(req, res, 401, { error: 'Unauthorized' });
      }
      clearPlayers(board);
      broadcast(board, { type: 'players_cleared' });
      return send(req, res, 200, { ok: true });
    }
  }

  // DELETE /players/:id
  if (req.method === 'DELETE' && pathname.startsWith('/players/')) {
    const id = pathname.split('/')[2];
    if (!id) return notFound(req, res);
    const owner = getPlayer(id);
    if (!owner) return notFound(req, res);
    const clientId = req.headers['x-client-id'];
    const authorized = isAuthorized(req) || (clientId && owner.clientId && clientId === owner.clientId);
    if (!authorized) return send(req, res, 401, { error: 'Unauthorized' });
    const removed = deletePlayer(id);
    broadcast(owner.board, { type: 'player_deleted', id });
    return send(req, res, removed ? 200 : 404, removed ? { ok: true } : { error: 'Not found' });
  }

  // PATCH /players/:id (owner or admin)
  if (req.method === 'PATCH' && pathname.startsWith('/players/')) {
    const id = pathname.split('/')[2];
    if (!id) return notFound(req, res);
    const current = getPlayer(id);
    if (!current) return notFound(req, res);
    const clientId = req.headers['x-client-id'];
    const authorized = isAuthorized(req) || (clientId && current.clientId && clientId === current.clientId);
    if (!authorized) return send(req, res, 401, { error: 'Unauthorized' });
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
      if (!ok) return send(req, res, 500, { error: 'Failed to update' });
      broadcast(current.board, { type: 'player_updated', id });
      return send(req, res, 200, patch);
    } catch (e) {
      return send(req, res, 400, { error: e.message || 'Bad Request' });
    }
  }

  return notFound(req, res);
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
  const data = `event: players\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    try { res.write(data); } catch (_) {}
  }
}

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  if (!ADMIN_TOKEN) {
    console.warn('[WARN] ADMIN_TOKEN is not set. Admin endpoints (bulk clear) are disabled.');
  }
  if (ALLOWED_ORIGINS.length === 1 && ALLOWED_ORIGINS[0] === 'http://localhost:3000') {
    console.warn('[WARN] ALLOWED_ORIGINS not set — defaulting to http://localhost:3000 only.');
  }
});
