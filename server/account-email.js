function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]);
}

function getAppUrl(appBaseUrl) {
  let base;
  try {
    base = new URL(appBaseUrl);
  } catch {
    return null;
  }
  const isLocalHttp = base.protocol === "http:"
    && ["localhost", "127.0.0.1"].includes(base.hostname);
  if (base.protocol !== "https:" && !isLocalHttp) return null;
  return new URL("/", base.origin).toString();
}

async function sendEmail({ to, subject, text, html }, {
  apiKey = process.env.RESEND_API_KEY,
  from = process.env.EMAIL_FROM,
  fetchImpl = fetch,
} = {}) {
  if (!apiKey || !from) {
    return {
      status: "not_configured",
      message: "Email delivery is not configured. Contact Aster support for help.",
    };
  }

  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
    });
    if (!response.ok) {
      return { status: "failed", message: "The email could not be sent. Please try again later." };
    }
  } catch {
    return { status: "failed", message: "The email could not be sent. Please try again later." };
  }

  return { status: "sent", message: `Email sent to ${to}.` };
}

export async function sendAccountWelcomeEmail({ email, userId }, options = {}) {
  const appUrl = getAppUrl(options.appBaseUrl ?? process.env.APP_BASE_URL);
  if (!appUrl) {
    return { status: "failed", message: "The welcome email could not be sent because the app URL is invalid." };
  }

  const safeEmail = escapeHtml(email);
  const safeUserId = escapeHtml(userId);
  const safeAppUrl = escapeHtml(appUrl);
  return sendEmail({
    to: email,
    subject: "Your Aster sign-in details",
    text: `Welcome to Aster.\n\nYour sign-in ID is your verified email address: ${email}\nYour Aster account reference is: ${userId}\n\nSign in at ${appUrl} using the password you created during registration. If you forget it, choose “Forgot your password?” on the sign-in page.\n\nFor your security, Aster never emails passwords.`,
    html: `<p>Welcome to Aster.</p><p>Your sign-in ID is your verified email address: <strong>${safeEmail}</strong></p><p>Your Aster account reference is: <strong>${safeUserId}</strong></p><p><a href="${safeAppUrl}">Sign in to Aster</a> using the password you created during registration. If you forget it, choose “Forgot your password?” on the sign-in page.</p><p>For your security, Aster never emails passwords.</p>`,
  }, options);
}

export async function sendTeacherRegistrationEmail({
  adminEmail,
  teacherEmail,
  teacherName,
  teacherCode,
  schoolName,
}, options = {}) {
  const safeTeacherEmail = escapeHtml(teacherEmail);
  const safeTeacherName = escapeHtml(teacherName);
  const safeTeacherCode = escapeHtml(teacherCode);
  const safeSchoolName = escapeHtml(schoolName);
  return sendEmail({
    to: adminEmail,
    subject: `Teacher registered for ${schoolName}`,
    text: `${teacherName} has been registered as a teacher for ${schoolName}.\n\nTeacher ID: ${teacherCode}\nTeacher sign-in email: ${teacherEmail}\n\nThe one-time activation link is sent separately to the teacher, who creates their own password. For security, passwords are never emailed or shared with school administrators.`,
    html: `<p><strong>${safeTeacherName}</strong> has been registered as a teacher for <strong>${safeSchoolName}</strong>.</p><p>Teacher ID: <strong>${safeTeacherCode}</strong><br>Teacher sign-in email: <strong>${safeTeacherEmail}</strong></p><p>The one-time activation link is sent separately to the teacher, who creates their own password. For security, passwords are never emailed or shared with school administrators.</p>`,
  }, options);
}
