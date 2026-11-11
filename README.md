# Aster School Platform

Aster is a React dashboard prototype with a Vite development server and an Express API.

## Requirements

- Node.js 22 or newer
- npm

## Configure Neon

1. Create a project and database in Neon.
2. Copy the pooled connection string from the Neon dashboard.
3. Set `DATABASE_URL` to that connection string in `.env.local` or `.env`. `neon init` can link the existing Neon project and generate `.env.local` for you.

Keep `.env` private; it is ignored by Git. Never commit or share the database connection string.

## Run locally

```sh
npm install
npm run dev
```

Open the Vite URL printed in the terminal (usually `http://localhost:5173`). Vite proxies `/api` requests to the Express API on port `4000`. The local API and deployed Render service use the same Neon database and create the `schools` table automatically.

The production frontend can be built with `npm run build`; `npm start` serves the built frontend and API on port `4000`. `DATABASE_URL` must be available to the server.

## Deploy the always-on API to Render

1. In Render, choose **New → Blueprint** and connect this repository. Render reads `render.yaml` and creates the `aster-api` web service.
2. Set `DATABASE_URL` to the Neon **pooled** connection string when Render prompts for it.
3. Set `FRONTEND_ORIGINS` to the exact Vercel frontend origin, such as `https://your-app.vercel.app` (no trailing slash). Include additional trusted origins as a comma-separated list.
4. Deploy the service and verify `https://<your-render-service>.onrender.com/api/health` returns `{"status":"ok"}`.

The service uses the paid `starter` plan so it does not sleep when idle. Render's Free web services sleep after inactivity and are not suitable when an always-running service is required. Render and this Neon project are both configured for Oregon.

## Deploy the frontend to Vercel

1. Import the same repository into Vercel; `vercel.json` builds the Vite app to `dist`.
2. Add `VITE_API_URL` with the Render service's base URL, for example `https://aster-api.onrender.com` (no trailing slash).
3. Deploy or redeploy. `VITE_API_URL` is public frontend configuration, not a secret.

The browser calls the Render API directly. The API only allows origins listed in `FRONTEND_ORIGINS`; update that Render variable if your Vercel domain changes. Local Vite development uses its `/api` proxy instead.

## API

- `GET /api/health` — API health check
- `GET /api/schools` — list school profiles
- `POST /api/schools` — validate and save a school profile

School profiles are stored in the Neon `schools` table, created automatically on the first API request. `FRONTEND_ORIGINS` controls browser CORS access; it does not replace authentication or API authorization.

## Prototype scope

The admin, teacher, and student portals currently use sample dashboard data. School-profile creation is persisted by the API, but authentication, role permissions, real student records, and publishing results are not implemented. Do not use this prototype with real student data until authentication, authorization, and production privacy controls are added.
