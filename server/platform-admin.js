import { subscriptionPlans } from "../shared/billing-plans.js";

const platformBillingStatuses = new Set(["pending", "exempt", "paid"]);
const platformBillingPlanIds = new Set(subscriptionPlans.map((plan) => plan.id));
const platformSchoolPageSize = 50;

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

export function normalizePlatformSchoolBillingDecision(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { billingStatus } = body;
  const planId = body.planId ?? null;
  if (!platformBillingStatuses.has(billingStatus)) return null;

  if (billingStatus === "paid") {
    return typeof planId === "string" && platformBillingPlanIds.has(planId)
      ? { billingStatus, planId }
      : null;
  }
  return planId === null ? { billingStatus, planId: null } : null;
}

export function normalizePlatformSchoolDirectoryQuery(query = {}) {
  if (!query || typeof query !== "object" || Array.isArray(query)) return null;

  const rawPage = query.page ?? 1;
  const validPageValue = (typeof rawPage === "number" && Number.isSafeInteger(rawPage))
    || (typeof rawPage === "string" && /^\d+$/.test(rawPage));
  const page = Number(rawPage);
  const search = query.search ?? "";
  if (!validPageValue || !Number.isSafeInteger(page) || page < 1 || page > 100000) return null;
  if (typeof search !== "string" || search.length > 100) return null;
  return { page, pageSize: platformSchoolPageSize, search: search.trim() };
}

export function normalizePlatformSchoolArchiveInput(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return typeof body.archived === "boolean" ? { archived: body.archived } : null;
}
