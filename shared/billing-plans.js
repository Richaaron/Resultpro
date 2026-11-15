export const freePlan = {
  id: "free",
  name: "Free",
  minActiveStudents: 0,
  maxActiveStudents: 500,
  monthlyPrice: 0,
  annualPrice: 0,
};

export const subscriptionPlans = [
  {
    id: "starter",
    name: "Starter",
    minActiveStudents: 501,
    maxActiveStudents: 750,
    monthlyPrice: 8000,
    annualPrice: 86400,
  },
  {
    id: "growth",
    name: "Growth",
    minActiveStudents: 751,
    maxActiveStudents: 1500,
    monthlyPrice: 18000,
    annualPrice: 194400,
  },
  {
    id: "scale",
    name: "Scale",
    minActiveStudents: 1501,
    maxActiveStudents: 3000,
    monthlyPrice: 35000,
    annualPrice: 378000,
  },
];

export const customQuotePlan = {
  id: "custom",
  name: "Custom quote",
  minActiveStudents: 3001,
  maxActiveStudents: null,
};

export const billablePlans = [...subscriptionPlans, customQuotePlan];

export function getPricingTierForActiveStudents(activeStudentCount) {
  if (!Number.isSafeInteger(activeStudentCount) || activeStudentCount < 0) return null;
  if (activeStudentCount <= freePlan.maxActiveStudents) return freePlan;
  return subscriptionPlans.find((plan) => (
    activeStudentCount >= plan.minActiveStudents
    && activeStudentCount <= plan.maxActiveStudents
  )) || customQuotePlan;
}
