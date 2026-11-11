# Aster School Platform

Aster is a React dashboard prototype with a Vite development server and an Express API.

## Requirements

- Node.js 22.5 or newer (the API uses Node's built-in SQLite module)
- npm

## Run locally

```sh
npm install
npm run dev
```

Open the Vite URL printed in the terminal (usually `http://localhost:5173`). Vite proxies `/api` requests to the Express API on port `4000`.

The production frontend can be built with `npm run build`; `npm start` serves the built frontend and API on port `4000`.

## Deploy to Vercel

1. Create a Postgres database using the Neon integration in the Vercel Marketplace.
2. Import this repository into Vercel. The checked-in `vercel.json` configures Vite and its `dist` output.
3. Add the database connection string as the `DATABASE_URL` environment variable in the Vercel project settings for Preview and Production.
4. Redeploy after adding the environment variable.

Vercel runs the API handlers in `api/` as serverless functions. School profiles use the hosted Postgres database there; local development continues to use SQLite. Do not point the deployed app at the local SQLite file, since Vercel function filesystems are ephemeral.

## API

- `GET /api/health` — API health check
- `GET /api/schools` — list school profiles
- `POST /api/schools` — validate and save a school profile

School profiles are stored in `data/aster.sqlite`, which is created automatically and excluded from version control.

## Prototype scope

The admin, teacher, and student portals currently use sample dashboard data. School-profile creation is persisted by the API, but authentication, role permissions, real student records, and publishing results are not implemented. Do not use this prototype with real student data until authentication, authorization, and production privacy controls are added.
