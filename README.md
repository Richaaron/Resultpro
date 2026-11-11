# Aster School Platform

Aster is a React dashboard prototype with a Vite development server and an Express API.

## Requirements

- Node.js 22 or newer
- npm

## Configure Neon

1. Create a project and database in Neon.
2. Copy the pooled connection string from the Neon dashboard.
3. Copy `.env.example` to `.env` and set `DATABASE_URL` to that connection string.

Keep `.env` private; it is ignored by Git. Never commit or share the database connection string.

## Run locally

```sh
npm install
npm run dev
```

Open the Vite URL printed in the terminal (usually `http://localhost:5173`). Vite proxies `/api` requests to the Express API on port `4000`. Both local API routes and Vercel functions use the same Neon database and create the `schools` table automatically.

The production frontend can be built with `npm run build`; `npm start` serves the built frontend and API on port `4000`. `DATABASE_URL` must be available to the server.

## Deploy to Vercel

1. Create a Postgres database in Neon (or use the Neon integration in the Vercel Marketplace).
2. Import this repository into Vercel. The checked-in `vercel.json` configures Vite and its `dist` output.
3. Add the Neon pooled connection string as the `DATABASE_URL` environment variable in the Vercel project settings for Preview and Production.
4. Redeploy after adding the environment variable.

Vercel runs the API handlers in `api/` as serverless functions. Local development and Vercel both use the same Neon Postgres database.

## API

- `GET /api/health` — API health check
- `GET /api/schools` — list school profiles
- `POST /api/schools` — validate and save a school profile

School profiles are stored in the Neon `schools` table, created automatically on the first API request.

## Prototype scope

The admin, teacher, and student portals currently use sample dashboard data. School-profile creation is persisted by the API, but authentication, role permissions, real student records, and publishing results are not implemented. Do not use this prototype with real student data until authentication, authorization, and production privacy controls are added.
