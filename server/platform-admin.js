import { subscriptionPlans } from "../shared/billing-plans.js";

const platformBillingStatuses = new Set(["pending", "exempt", "paid"]);
const platformBillingPlanIds = new Set(subscriptionPlans.map((plan) => plan.id));

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
