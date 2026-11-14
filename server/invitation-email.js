function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]);
}

function createActivationUrl(appBaseUrl, schoolSlug, token) {
  let base;
  try {
    base = new URL(appBaseUrl);
  } catch {
    return null;
  }
  const isLocalHttp = base.protocol === "http:"
    && ["localhost", "127.0.0.1"].includes(base.hostname);
  if (base.protocol !== "https:" && !isLocalHttp) return null;

  const activationUrl = new URL(`/school/${encodeURIComponent(schoolSlug)}`, base.origin);
  activationUrl.hash = `invite=${encodeURIComponent(token)}`;
  return activationUrl.toString();
}

export async function sendInvitationEmail(invitation, {
  apiKey = process.env.RESEND_API_KEY,
  from = process.env.EMAIL_FROM,
  appBaseUrl = process.env.APP_BASE_URL,
  fetchImpl = fetch,
} = {}) {
  if (!apiKey || !from || !appBaseUrl) {
    return {
      status: "not_configured",
      message: "Invitation email is not configured. Copy the activation link and send it manually.",
    };
  }

  const activationUrl = createActivationUrl(appBaseUrl, invitation.schoolSlug, invitation.token);
  if (!activationUrl) {
    return {
      status: "failed",
      message: "Invitation email could not be sent because the app URL is invalid. Copy the activation link and send it manually.",
    };
  }

  const inviteeName = invitation.role === "teacher" ? invitation.teacherName : null;
  const greeting = inviteeName ? `Hello ${inviteeName},` : "Hello,";
  const schoolName = escapeHtml(invitation.schoolName);
  const safeGreeting = escapeHtml(greeting);
  const safeUrl = escapeHtml(activationUrl);
  const roleLabel = invitation.role === "teacher" ? "teacher" : "student";
  const subject = `You are invited to join ${invitation.schoolName} on Aster`;
  const text = `${greeting}\n\nYou have been invited to join ${invitation.schoolName}'s ${roleLabel} portal on Aster. Accept this invitation within seven days:\n\n${activationUrl}\n\nIf you were not expecting this invitation, you can ignore this email.`;
  const html = `<p>${safeGreeting}</p><p>You have been invited to join ${schoolName}'s ${roleLabel} portal on Aster. Accept this invitation within seven days:</p><p><a href="${safeUrl}">Accept invitation</a></p><p>If you were not expecting this invitation, you can ignore this email.</p>`;

  let response;
  try {
    response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [invitation.email], subject, text, html }),
    });
  } catch {
    return {
      status: "failed",
      message: "Invitation email could not be sent. Copy the activation link and send it manually.",
    };
  }

  if (!response.ok) {
    return {
      status: "failed",
      message: "Invitation email could not be sent. Copy the activation link and send it manually.",
    };
  }

  return {
    status: "sent",
    message: `Invitation email sent to ${invitation.email}.`,
  };
}
