import { PlanType } from "../types/subscription";

export function calculateExpirationDate(planType: PlanType, startDate: Date): Date | null {
  if (planType === "monthly") {
    const expirationDate = new Date(startDate);
    expirationDate.setDate(expirationDate.getDate() + 30);
    return expirationDate;
  }

  if (planType === "yearly") {
    const yearlyExpiration = new Date(startDate);
    yearlyExpiration.setFullYear(yearlyExpiration.getFullYear() + 1);
    return yearlyExpiration;
  }

  if (planType === "lifetime") {
    return null;
  }

  throw new Error(`Invalid plan type: ${planType}`);
}
