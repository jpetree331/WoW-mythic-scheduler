import type { Player } from '../types';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:8787';

function getBoard(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('board') || 'default';
  } catch {
    return 'default';
  }
}

export async function fetchPlayers(): Promise<Player[]> {
  const board = getBoard();
  const res = await fetch(`${API_BASE}/players?board=${encodeURIComponent(board)}`);
  if (!res.ok) throw new Error(`Failed to fetch players: ${res.status}`);
  return res.json();
}

export async function createPlayer(input: Omit<Player, 'id'>): Promise<Player> {
  const board = getBoard();
  const res = await fetch(`${API_BASE}/players?board=${encodeURIComponent(board)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, board, clientId: getClientId() }),
  });
  if (!res.ok) throw new Error(`Failed to create player: ${res.status}`);
  return res.json();
}

export async function deletePlayer(id: string): Promise<void> {
  const headers: Record<string, string> = {};
  const token = getAdminToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  headers['X-Client-Id'] = getClientId();
  const res = await fetch(`${API_BASE}/players/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) throw new Error(`Failed to delete player: ${res.status}`);
}

export async function clearPlayers(): Promise<void> {
  const board = getBoard();
  const headers: Record<string, string> = {};
  const token = getAdminToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/players?board=${encodeURIComponent(board)}`, { method: 'DELETE', headers });
  if (!res.ok) throw new Error(`Failed to clear players: ${res.status}`);
}

export function setAdminToken(token: string) {
  try { localStorage.setItem('mff_admin_token', token); } catch {}
}

export function getAdminToken(): string | null {
  try { return localStorage.getItem('mff_admin_token'); } catch { return null; }
}

export function clearAdminToken(): void {
  try { localStorage.removeItem('mff_admin_token'); } catch {}
}

export function subscribeToUpdates(onMessage: () => void): () => void {
  const board = getBoard();
  const es = new EventSource(`${API_BASE}/events?board=${encodeURIComponent(board)}`);
  es.addEventListener('players', () => {
    onMessage();
  });
  es.onerror = () => {
    // basic backoff: close; caller may resubscribe on next focus/load
    try { es.close(); } catch {}
  };
  return () => {
    try { es.close(); } catch {}
  };
}

export function getClientId(): string {
  try {
    const k = 'mff_client_id';
    let id = localStorage.getItem(k);
    if (!id) {
      id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(k, id);
    }
    return id;
  } catch {
    return 'anon';
  }
}

export async function updatePlayer(id: string, data: Partial<Omit<Player, 'id'>>): Promise<Player> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Client-Id': getClientId() };
  const token = getAdminToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/players/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to update player: ${res.status}`);
  return res.json();
}
