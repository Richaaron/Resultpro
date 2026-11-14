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

Open the Vite URL printed in the terminal (usually `http://localhost:5173`). Vite proxies `/api` requests to the Express API on port `4000`. `neon env pull` writes `NEON_AUTH_BASE_URL` to `.env.local`; Vite uses it as the public auth URL. The API verifies bearer tokens against that branch's Managed Auth JWKS. The API creates school, membership, invitation, subject, class, student, teacher-assignment, attendance, assessment, and mark tables automatically.

The production frontend can be built with `npm run build`; `npm start` serves the built frontend and API on port `4000`. `DATABASE_URL` must be available to the server.

## Deploy the API to Render

1. In Render, choose **New → Blueprint** and connect this repository. Render reads `render.yaml` and creates the `aster-api` web service.
2. Set `DATABASE_URL` to the Neon **pooled** connection string when Render prompts for it.
3. Set `NEON_AUTH_BASE_URL` to the Managed Auth Base URL shown by `neon env pull` (or in the Neon Auth configuration tab).
4. Set `FRONTEND_ORIGINS` to the exact Vercel frontend origin, such as `https://your-app.vercel.app` (no trailing slash). Include additional trusted origins as a comma-separated list.
5. In Resend, verify a sender domain. Set `RESEND_API_KEY`, `EMAIL_FROM` (for example, `Aster <invites@yourdomain.com>`), and `APP_BASE_URL` to your Vercel origin in the Render service environment.
6. Deploy the service and verify `https://<your-render-service>.onrender.com/api/health` returns `{"status":"ok"}`.
7. Optionally add a comma-separated list of verified platform-operator emails to the Render API service’s `PLATFORM_ADMIN_EMAILS` environment variable to enable the read-only platform operations page.

Invitation emails are sent by the API through Resend. Keep the Resend API key only in Render or a private local `.env` file; never add it to the frontend or commit it. Until all three email settings are configured, Aster reports that delivery is unavailable and provides the activation link for manual sharing.

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
- `GET /api/platform/access` — report whether the signed-in verified account is allowlisted as a platform administrator
- `GET /api/platform/overview` — return cross-school aggregate counts and the 100 most recently created schools (platform administrators only)
- `GET /api/schools` — list only schools the signed-in user belongs to
- `POST /api/schools` — create a school and make the verified account its first administrator
- `GET /api/schools/:schoolId/dashboard` — return role-scoped school metrics and recent activity
- `GET /api/schools/:schoolId/subjects` — list saved grade subjects for a school member
- `PUT /api/schools/:schoolId/subjects` — replace a grade's subjects (school administrators only)
- `GET /api/schools/:schoolId/classes` — list school classes for a member
- `GET /api/schools/:schoolId/attendance?classId=:classId&date=YYYY-MM-DD` — load the active class roster and saved attendance for a school day
- `GET /api/schools/:schoolId/attendance/report?classId=:classId&from=YYYY-MM-DD&to=YYYY-MM-DD` — summarize student attendance counts over a range of up to 366 days
- `PUT /api/schools/:schoolId/attendance` — save complete daily attendance for a class (school administrators and assigned teachers)
- `POST /api/schools/:schoolId/classes` — create a class using saved grade subjects (school administrators only)
- `DELETE /api/schools/:schoolId/classes/:classId` — delete an empty class without published results (school administrators only)
- `GET /api/schools/:schoolId/teaching-assignments` — list all assignments and accepted teachers for admins; teachers only see their own assignments
- `PUT /api/schools/:schoolId/classes/:classId/teaching-assignments` — assign or reassign a teacher to a class subject (school administrators only)
- `DELETE /api/schools/:schoolId/teaching-assignments/:assignmentId` — remove an assignment (school administrators only)
- `GET /api/schools/:schoolId/assessments` — list school assessments for admins or the signed-in teacher's assignments
- `POST /api/schools/:schoolId/assessments` — create an assessment for an assigned class subject (school administrators only)
- `GET /api/schools/:schoolId/result-sheet?classId=:classId&term=Term%201` — calculate the live class result sheet, or return its published snapshot
- `POST /api/schools/:schoolId/result-sheet/publish` — freeze an approved class/term result sheet (school administrators only); every assessment for that term must be approved
- `GET /api/schools/:schoolId/grading-settings` — read the school’s grade bands and class-position rules (school administrators only)
- `PUT /api/schools/:schoolId/grading-settings` — save grade bands and class-position rules for future publications (school administrators only)
- `GET /api/schools/:schoolId/my-results` — list only the authenticated student's results or the explicitly linked children’s results for a verified parent account
- `GET /api/schools/:schoolId/assessments/:assessmentId/marks` — view the assessment's saved roster and marks
- `PUT /api/schools/:schoolId/assessments/:assessmentId/marks` — save draft marks for rostered students (assigned teacher only)
- `POST /api/schools/:schoolId/assessments/:assessmentId/submit` — submit complete marks for administrator review (assigned teacher only)
- `PATCH /api/schools/:schoolId/assessments/:assessmentId/review` — approve submitted marks or return them with a note (school administrators only)
- `GET /api/schools/:schoolId/students` — search and page through the student register (school administrators only)
- `POST /api/schools/:schoolId/students` — enrol a student (school administrators only)
- `POST /api/schools/:schoolId/students/import` — atomically import 1–200 students into one school class (school administrators only; JSON body: `{ "classId": "<class UUID>", "students": [{ "firstName": "...", "lastName": "...", "admissionNumber": "...", "guardianEmail": "...", "guardianPhone": "..." }] }`)
- `PUT /api/schools/:schoolId/students/:studentId` — update a student record (school administrators only)
- `PATCH /api/schools/:schoolId/students/:studentId/status` — archive or reactivate a student (school administrators only)
- `POST /api/schools/:schoolId/invitations` — admins invite a teacher, a student, or a parent/guardian linked to one specific student record
- `GET /api/schools/:schoolId/invitations` — list pending and expired invitations for school administrators
- `POST /api/schools/:schoolId/invitations/:invitationId/resend` — rotate an invitation token and issue a new seven-day activation link
- `DELETE /api/schools/:schoolId/invitations/:invitationId` — revoke an unaccepted invitation
- `POST /api/invitations/accept` — accept an invitation for the signed-in, verified email address

School membership is checked on the server for every school API request; CORS is not an authorization boundary. School administrators register teachers by name and verified email on the **Teachers** page. The API generates a unique school staff code and seven-day activation link, then emails the invitation through Resend when email delivery is configured. If delivery is unavailable or fails, admins see the status and can share the displayed link themselves. The **Portal access** page lists pending and expired invitations; admins can rotate a link (which invalidates the previous one and attempts to email the new link) or revoke an invitation before it is accepted. Teachers create their own password during account activation; the generated staff code identifies the teacher but is not a login credential. The account must use the invited email address. A teacher becomes an active school member after verifying that email and accepting the link. Student invitations are created from the corresponding student register row; accepting one atomically connects the verified account to exactly one student record in that school. Parent invitations are also created from the student register, but only to that student’s saved guardian email. After the invited address is verified and the invitation accepted, the parent can view published reports only for explicitly linked children. If a school changes a child’s guardian email, the previous parent link is removed. A parent invitation does not link or replace the student’s own portal account.

The optional **Platform operations** page is read-only and available only to verified emails listed in `PLATFORM_ADMIN_EMAILS` on the API host. The server independently checks that allowlist for every platform overview request. The page shows school names and school-level totals, but not student records or school contact emails. It also displays the approved informational pricing proposal; payment checkout, subscription records, student-cap enforcement, and school-management actions are not active until a payment provider and billing workflow are selected.

Administrators can also import students from the student register using the downloadable CSV template. The required columns are `firstName`, `lastName`, and `admissionNumber`; `guardianEmail` and `guardianPhone` are optional. Header matching ignores capitalization, spaces, underscores, and hyphens. Imports support files under 1 MB and up to 200 student rows, assign the entire batch to one selected class, and show validation errors and a row preview before submission. The API rejects duplicate admission numbers within the file or already registered at the school; the batch is all-or-nothing, so a conflict imports no students.

## Curriculum subjects

School administrators can choose and save subjects by Primary 1–6, JSS 1–3, and SSS 1–3 under **Classes & subjects**. Saved subjects are scoped to the selected school; teachers can view them but cannot edit them. The catalogue is a starting point, not a claim that every optional subject applies to every school. Confirm current grade-specific subjects with the official NERDC curriculum pages and the relevant state education authority:

- [Revised Basic Education Curriculum](https://nerdc.gov.ng/content_manager/new_curriculum_home.html)
- [Revised Senior Secondary Education Curriculum](https://nerdc.gov.ng/content_manager/new_senior_curriculum_home.html)

## Data readiness

Login, email verification, school profiles, school memberships, invite-only access, subject selections, classes, student records, student-account links, parent-to-student links, teacher-to-class/subject assignments, daily attendance, assessments, marks, assessment reviews, and published result snapshots are persisted in Neon. Administrators can enrol, search, update, archive, and reactivate student records; class deletion is blocked when student records or published results still reference it. Teacher assignments are visible to the assigned teacher, and teacher class listings, assessments, attendance, and result sheets are limited to their assigned classes and subjects. Each attendance record is scoped to a school, class, date, and active student roster. Each assessment snapshots its active class roster when it is created. Teachers can save incomplete mark drafts, but must enter marks for every student on that snapshot before submission. Administrators can approve submitted marks or return them with a required note. The term result sheet includes approved assessments only and calculates each student-subject percentage as total approved points earned divided by total possible approved points; subjects with no approved marks remain ungraded. Publishing requires every assessment in the selected class and term to be approved, saves an immutable snapshot, and prevents adding further assessments to that term. Linked student accounts can view only their own published snapshots; parent accounts can view only the published snapshots for children explicitly linked through verified, student-specific guardian invitations.

The overview now loads school-scoped counts, published-result averages, and recent assessment or publication activity from saved records. Administrators see school-wide data, teachers see their assigned classes and subjects, students see their own published reports, and parents see reports only for explicitly linked children. Administrators and assigned teachers can save daily attendance for each active student using present, absent, late, or excused statuses and review student totals across a date range. Students can print an individual report card, parents can select and print a linked child’s report, and administrators can print one card per student from a published class snapshot. Each school can edit its grade bands, tie rule, and incomplete-results policy under **Grading rules**. The default is an editable A1–F9 template; class positions use competition ranking and wait until all configured subjects are graded. New publications snapshot these rules, subject grades, overall grades, and eligible class positions; changing settings does not alter older reports. Parent portal access requires an administrator to record the guardian’s email and send that guardian a student-specific invitation. Before using real student information, deploy and test the updated API, confirm privacy requirements and backups, and verify school permissions in the production environment.
