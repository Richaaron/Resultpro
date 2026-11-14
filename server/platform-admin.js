export function isPlatformAdminEmail(email, configuredEmails = process.env.PLATFORM_ADMIN_EMAILS || "") {
  if (typeof email !== "string") return false;
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return false;

  return configuredEmails
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalizedEmail);
}
