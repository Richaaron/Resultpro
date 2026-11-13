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

Open the Vite URL printed in the terminal (usually `http://localhost:5173`). Vite proxies `/api` requests to the Express API on port `4000`. `neon env pull` writes `NEON_AUTH_BASE_URL` to `.env.local`; Vite uses it as the public auth URL. The API verifies bearer tokens against that branch's Managed Auth JWKS. The API creates school, membership, invitation, subject, class, student, teacher-assignment, assessment, and mark tables automatically.

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
- `GET /api/schools/:schoolId/subjects` — list saved grade subjects for a school member
- `PUT /api/schools/:schoolId/subjects` — replace a grade's subjects (school administrators only)
- `GET /api/schools/:schoolId/classes` — list school classes for a member
- `POST /api/schools/:schoolId/classes` — create a class using saved grade subjects (school administrators only)
- `DELETE /api/schools/:schoolId/classes/:classId` — delete an empty class (school administrators only)
- `GET /api/schools/:schoolId/teaching-assignments` — list all assignments and accepted teachers for admins; teachers only see their own assignments
- `PUT /api/schools/:schoolId/classes/:classId/teaching-assignments` — assign or reassign a teacher to a class subject (school administrators only)
- `DELETE /api/schools/:schoolId/teaching-assignments/:assignmentId` — remove an assignment (school administrators only)
- `GET /api/schools/:schoolId/assessments` — list school assessments for admins or the signed-in teacher's assignments
- `POST /api/schools/:schoolId/assessments` — create an assessment for an assigned class subject (school administrators only)
- `GET /api/schools/:schoolId/result-sheet?classId=:classId&term=Term%201` — calculate the class result sheet from approved marks for the selected term
- `GET /api/schools/:schoolId/assessments/:assessmentId/marks` — view the assessment's saved roster and marks
- `PUT /api/schools/:schoolId/assessments/:assessmentId/marks` — save draft marks for rostered students (assigned teacher only)
- `POST /api/schools/:schoolId/assessments/:assessmentId/submit` — submit complete marks for administrator review (assigned teacher only)
- `PATCH /api/schools/:schoolId/assessments/:assessmentId/review` — approve submitted marks or return them with a note (school administrators only)
- `GET /api/schools/:schoolId/students` — search and page through the student register (school administrators only)
- `POST /api/schools/:schoolId/students` — enrol a student (school administrators only)
- `PUT /api/schools/:schoolId/students/:studentId` — update a student record (school administrators only)
- `PATCH /api/schools/:schoolId/students/:studentId/status` — archive or reactivate a student (school administrators only)
- `POST /api/schools/:schoolId/invitations` — create a seven-day, email-restricted teacher or student invitation
- `POST /api/invitations/accept` — accept an invitation for the signed-in, verified email address

School membership is checked on the server for every school API request; CORS is not an authorization boundary. Admins create invitation links in **Portal access** and send them to invitees themselves. A link can only be accepted by an account with the matching verified email and expires after seven days.

## Curriculum subjects

School administrators can choose and save subjects by Primary 1–6, JSS 1–3, and SSS 1–3 under **Classes & subjects**. Saved subjects are scoped to the selected school; teachers can view them but cannot edit them. The catalogue is a starting point, not a claim that every optional subject applies to every school. Confirm current grade-specific subjects with the official NERDC curriculum pages and the relevant state education authority:

- [Revised Basic Education Curriculum](https://nerdc.gov.ng/content_manager/new_curriculum_home.html)
- [Revised Senior Secondary Education Curriculum](https://nerdc.gov.ng/content_manager/new_senior_curriculum_home.html)

## Data readiness

Login, email verification, school profiles, school memberships, invite-only access, subject selections, classes, student records, teacher-to-class/subject assignments, assessments, marks, and assessment reviews are persisted in Neon. Administrators can enrol, search, update, archive, and reactivate student records; class deletion is blocked when student records still reference it. Teacher assignments are visible to the assigned teacher, and teacher class listings, assessments, and result sheets are limited to their assigned classes and subjects. Each assessment snapshots its active class roster when it is created. Teachers can save incomplete mark drafts, but must enter marks for every student on that snapshot before submission. Administrators can approve submitted marks or return them with a required note. The term result sheet includes approved assessments only and calculates each student-subject percentage as total approved points earned divided by total possible approved points; subjects with no approved marks remain ungraded.

The overview figures and student portal results table still contain sample data. Letter grades, class positions, configurable grade bands, report-card publishing, student account-to-record linking, and parent access are not implemented yet. Approved assessment marks are not term report cards; the result sheet shows calculated percentages only and does not apply a grading policy. Do not use the sample figures or results for school decisions. Before using real student information, deploy and test the updated API, confirm privacy requirements and backups, and verify school permissions in the production environment.
