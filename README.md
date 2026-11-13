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

## School account setup

Choose **Create an account**, enter the administrator name, school name, email, and password, then verify the email. After signing in, complete the school type, country, school email, and portal-access details. The first verified account to create the school profile becomes its administrator and can then use the school dashboard. The signup school name is kept in the browser session to prefill setup; invitation signups skip this field.

Every school profile receives its own workspace URL, such as `/school/harborview-academy-abc123`. Creating a school opens that URL, and administrators can copy it from the workspace. It is a school-specific entry point, not a public-results link: visitors must sign in with a verified account that belongs to that school. The selected school ID is used for all workspace data requests, and server-side membership checks prevent one school's teachers or admins from reading another school's records.

If your account belongs to more than one school, use the workspace selector in the sidebar to switch between those memberships. Each selection opens that school's own workspace URL; the selector never grants access to schools that are not already listed for your account.

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
- `GET /api/schools/:schoolId/dashboard` — return role-scoped school metrics and recent activity
- `GET /api/schools/:schoolId/subjects` — list saved grade subjects for a school member
- `PUT /api/schools/:schoolId/subjects` — replace a grade's subjects (school administrators only)
- `GET /api/schools/:schoolId/classes` — list school classes for a member
- `POST /api/schools/:schoolId/classes` — create a class using saved grade subjects (school administrators only)
- `DELETE /api/schools/:schoolId/classes/:classId` — delete an empty class without published results (school administrators only)
- `GET /api/schools/:schoolId/teaching-assignments` — list all assignments and accepted teachers for admins; teachers only see their own assignments
- `PUT /api/schools/:schoolId/classes/:classId/teaching-assignments` — assign or reassign a teacher to a class subject (school administrators only)
- `DELETE /api/schools/:schoolId/teaching-assignments/:assignmentId` — remove an assignment (school administrators only)
- `GET /api/schools/:schoolId/assessments` — list school assessments for admins or the signed-in teacher's assignments
- `POST /api/schools/:schoolId/assessments` — create an assessment for an assigned class subject (school administrators only)
- `GET /api/schools/:schoolId/result-sheet?classId=:classId&term=Term%201` — calculate the live class result sheet, or return its published snapshot
- `POST /api/schools/:schoolId/result-sheet/publish` — freeze an approved class/term result sheet (school administrators only); every assessment for that term must be approved
- `GET /api/schools/:schoolId/my-results` — list only the authenticated student's published result sheets; no student ID is accepted from the client
- `GET /api/schools/:schoolId/assessments/:assessmentId/marks` — view the assessment's saved roster and marks
- `PUT /api/schools/:schoolId/assessments/:assessmentId/marks` — save draft marks for rostered students (assigned teacher only)
- `POST /api/schools/:schoolId/assessments/:assessmentId/submit` — submit complete marks for administrator review (assigned teacher only)
- `PATCH /api/schools/:schoolId/assessments/:assessmentId/review` — approve submitted marks or return them with a note (school administrators only)
- `GET /api/schools/:schoolId/students` — search and page through the student register (school administrators only)
- `POST /api/schools/:schoolId/students` — enrol a student (school administrators only)
- `PUT /api/schools/:schoolId/students/:studentId` — update a student record (school administrators only)
- `PATCH /api/schools/:schoolId/students/:studentId/status` — archive or reactivate a student (school administrators only)
- `POST /api/schools/:schoolId/invitations` — admins register a teacher by name and email to generate a staff code and seven-day activation link, or create a student invitation tied to a specific student record
- `GET /api/schools/:schoolId/invitations` — list pending and expired invitations for school administrators
- `POST /api/schools/:schoolId/invitations/:invitationId/resend` — rotate an invitation token and issue a new seven-day activation link
- `DELETE /api/schools/:schoolId/invitations/:invitationId` — revoke an unaccepted invitation
- `POST /api/invitations/accept` — accept an invitation for the signed-in, verified email address

School membership is checked on the server for every school API request; CORS is not an authorization boundary. School administrators register teachers by name and verified email on the **Teachers** page. The API generates a unique school staff code and a seven-day activation link; admins must share the link with the named teacher themselves because invitation email delivery is not configured. The **Portal access** page lists pending and expired invitations; admins can rotate a link (which invalidates the previous one) or revoke an invitation before it is accepted. Teachers create their own password during account activation; the generated staff code identifies the teacher but is not a login credential. The account must use the invited email address. A teacher becomes an active school member after verifying that email and accepting the link. Student invitations are created from the corresponding student register row; accepting one atomically connects the verified account to exactly one student record in that school.

## Curriculum subjects

School administrators can choose and save subjects by Primary 1–6, JSS 1–3, and SSS 1–3 under **Classes & subjects**. Saved subjects are scoped to the selected school; teachers can view them but cannot edit them. The catalogue is a starting point, not a claim that every optional subject applies to every school. Confirm current grade-specific subjects with the official NERDC curriculum pages and the relevant state education authority:

- [Revised Basic Education Curriculum](https://nerdc.gov.ng/content_manager/new_curriculum_home.html)
- [Revised Senior Secondary Education Curriculum](https://nerdc.gov.ng/content_manager/new_senior_curriculum_home.html)

## Data readiness

Login, email verification, school profiles, school memberships, invite-only access, subject selections, classes, student records, student-account links, teacher-to-class/subject assignments, assessments, marks, assessment reviews, and published result snapshots are persisted in Neon. Administrators can enrol, search, update, archive, and reactivate student records; class deletion is blocked when student records or published results still reference it. Teacher assignments are visible to the assigned teacher, and teacher class listings, assessments, and result sheets are limited to their assigned classes and subjects. Each assessment snapshots its active class roster when it is created. Teachers can save incomplete mark drafts, but must enter marks for every student on that snapshot before submission. Administrators can approve submitted marks or return them with a required note. The term result sheet includes approved assessments only and calculates each student-subject percentage as total approved points earned divided by total possible approved points; subjects with no approved marks remain ungraded. Publishing requires every assessment in the selected class and term to be approved, saves an immutable snapshot, and prevents adding further assessments to that term. Linked student accounts can view only their own published snapshots; unlinked student accounts see no student records or results.

The overview now loads school-scoped counts, published-result averages, and recent assessment or publication activity from saved records. Administrators see school-wide data, teachers see their assigned classes and subjects, and students see only their linked published reports. Students can print an individual report card from a published snapshot; the overall average is weighted by total approved points, and ungraded subjects are excluded. Letter grades, class positions, configurable grade bands, and separate parent accounts are not implemented. Before using real student information, deploy and test the updated API, confirm privacy requirements and backups, and verify school permissions in the production environment.
