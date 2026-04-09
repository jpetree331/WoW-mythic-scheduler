# Mythic+ Friend Finder

A scheduling tool for World of Warcraft guilds to find overlapping Mythic+ availability across timezones. Players enter their weekly windows, and the app computes every time slot where a valid 5-player group (1 Tank, 1 Healer, 3 DPS) can form — accounting for multi-role players.

Each guild gets its own board via URL slug. Updates sync in real time across all connected browsers.

## How It Works

1. Players add their name, role(s), timezone, and weekly availability
2. The matching engine converts all time slots to a shared reference timezone, bins the week into 30-minute windows, and finds every overlap
3. A backtracking search checks which overlaps can fill a valid group comp (Tank/Healer/3×DPS), handling players who queue multiple roles
4. Results update live via Server-Sent Events — no refresh needed

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Luxon
- **Backend:** Node.js (raw `http` module), SQLite (better-sqlite3, WAL mode)
- **Deployment:** Vercel (frontend) + Railway (backend with persistent volume)

## Quick Start

```bash
npm install

# Start backend (port 8787)
npm run server

# Start frontend (port 3000)
npm run dev

# Open http://localhost:3000/?board=your-guild-name
```

Set `ADMIN_TOKEN` in your environment before deploying — the default is not secure for production use.

## Features

- **Multi-board** — One instance serves multiple guilds via `?board=` URL parameter
- **Timezone-aware matching** — Players enter availability in their local time; the algorithm handles conversion
- **Multi-role support** — Players who can Tank *or* DPS get correctly slotted by the group composition solver
- **Real-time sync** — SSE pushes changes to all connected clients on the same board
- **Per-browser ownership** — Players can only edit/delete their own entries; admin token for moderation

## Deployment

**Backend (Railway):**
1. Start command: `node server/server.cjs`
2. Mount a persistent volume at `/app/server/data` for the SQLite database
3. Set env var: `ADMIN_TOKEN=your-secret`

**Frontend (Vercel):**
1. Framework: Vite | Build: `npm run build` | Output: `dist/`
2. Set env var: `VITE_API_BASE=https://your-railway-url`

Share links as `https://your-app.vercel.app/?board=GuildName`.

## License

MIT
