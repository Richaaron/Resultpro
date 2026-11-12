# Aster School Platform

Aster is a React school-results platform with a Vite frontend, Express API, Neon Postgres, and Neon Managed Auth.

## Requirements

- Node.js 22 or newer
- npm

## Configure Neon and authentication

1. Create a project and database in Neon.
2. Copy the pooled connection string from the Neon dashboard.
3. Link the project and production branch with `neon link`, then run `neon deploy` to enable Managed Auth from `neon.ts`.
4. Require verified email addresses with `neon neon-auth config email-password update --enabled --require-email-verification --email-verification-method otp --send-verification-email-on-sign-up`.
5. Add the deployed Vercel origin to Neon Auth's trusted domains with `neon neon-auth domain add https://your-app.vercel.app`.
6. Set `DATABASE_URL` in `.env.local` or `.env`; `neon env pull` can retrieve it after the branch is linked.

Keep `.env` private; it is ignored by Git. Never commit or share the database connection string. Managed Auth is available in this project's AWS region, but cannot be used with Neon IP Allow or Private Networking.

## Run locally

```sh
npm install
npm run dev
```

Open the Vite URL printed in the terminal (usually `http://localhost:5173`). Vite proxies `/api` requests to the Express API on port `4000`. `neon env pull` writes `NEON_AUTH_BASE_URL` to `.env.local`; Vite uses it as the public auth URL. The API verifies bearer tokens against that branch's Managed Auth JWKS. The API creates the school, membership, and invitation tables automatically.

The production frontend can be built with `npm run build`; `npm start` serves the built frontend and API on port `4000`. `DATABASE_URL` must be available to the server.

## Deploy the API to Render

1. In Render, choose **New → Blueprint** and connect this repository. Render reads `render.yaml` and creates the `aster-api` web service.
2. Set `DATABASE_URL` to the Neon **pooled** connection string when Render prompts for it.
3. Set `NEON_AUTH_BASE_URL` to the Managed Auth Base URL shown by `neon env pull` (or in the Neon Auth configuration tab).
4. Set `FRONTEND_ORIGINS` to the exact Vercel frontend origin, such as `https://your-app.vercel.app` (no trailing slash). Include additional trusted origins as a comma-separated list.
5. Deploy the service and verify `https://<your-render-service>.onrender.com/api/health` returns `{"status":"ok"}`.

The service uses Render's **Free** plan. Free web services sleep after inactivity and can take around a minute to wake when the next request arrives, so this is not an always-on backend. Upgrade the service to a paid plan in Render if you later need it to stay awake. Render and this Neon project are both configured for Oregon.

## Deploy the frontend to Vercel

1. Import the same repository into Vercel; `vercel.json` builds the Vite app to `dist`.
2. Add `VITE_API_URL` with the Render service's base URL, for example `https://aster-api.onrender.com` (no trailing slash).
3. Add `VITE_NEON_AUTH_URL` with the same Neon Managed Auth Base URL used by the API.
4. Deploy or redeploy. These URLs are public frontend configuration, not secrets.

The browser calls the Render API directly. The API only allows origins listed in `FRONTEND_ORIGINS`; update that Render variable if your Vercel domain changes. Local Vite development uses its `/api` proxy instead.

## API

- `GET /api/health` — API health check
- `GET /api/schools` — list only schools the signed-in user belongs to
- `POST /api/schools` — create a school and make the verified account its first administrator
- `POST /api/schools/:schoolId/invitations` — create a seven-day, email-restricted teacher or student invitation
- `POST /api/invitations/accept` — accept an invitation for the signed-in, verified email address

School membership is checked on the server for every school API request; CORS is not an authorization boundary. Admins create invitation links in **Portal access** and send them to invitees themselves. A link can only be accepted by an account with the matching verified email and expires after seven days.

## Data readiness

The login, email verification, school profiles, school memberships, and invite-only access are connected to Neon. Dashboard figures and result rows are still sample data; real student records, class management, and publishing results are not implemented. Do not enter real student data until those features and production email/domain settings are complete.
