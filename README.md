<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1kFce6wtiYY2NP37mPZ8IF9z9teUdLgMo

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Install new dependencies (timezone + SQLite):
   `npm install luxon better-sqlite3`

4. Start the backend (new):
   `npm run server`

   The backend runs at `http://localhost:8787` and stores shared player data in a SQLite DB at `server/data/app.db`.

5. Run the frontend:
   `npm run dev`

   Optionally set a custom backend URL with `VITE_API_BASE` in `.env.local`.

## Admin Controls

- To protect destructive operations (delete/clear), set an admin token on the backend:
  - Default admin token: `IXOYEFISH`.
  - To change it: on Railway (or locally) add env var `ADMIN_TOKEN=your-secret` on the server service.
  - The frontend sends `Authorization: Bearer <token>` for delete/clear when you set it via the “Set Admin Token” button.
  - If `ADMIN_TOKEN` is not set, the server uses the default token above.

## Live Updates

- Backend exposes Server‑Sent Events at `GET /events?board=...`.
- Frontend auto‑subscribes and refreshes the list on changes.

## Deploy to Railway (Backend)

1) Create a new Node service from this repo.
2) Set the Start Command: `node server/server.cjs`
3) Add a persistent volume and mount it at `/app/server/data` (this is where the SQLite DB `app.db` is stored).
4) Add environment variables as needed:
   - `ADMIN_TOKEN=choose-a-secret` (optional but recommended)
5) Deploy. Note the service URL (e.g., `https://mff-api.up.railway.app`).

## Deploy to Vercel (Frontend)

1) Import the repo and select the Vite framework.
2) Build: `npm install && npm run build`
3) Output: `dist`
4) Env Var: `VITE_API_BASE` = your Railway URL (e.g., `https://mff-api.up.railway.app`).
5) Deploy and share links like `https://your-app.vercel.app/?board=YourGuild`.
