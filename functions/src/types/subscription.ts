import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { Phone } from "./pagarme";

export interface CustomerInfo {
  document: string;
  email: string;
  name: string;
  type: "individual" | "company";
  phone: Phone;
}

export interface Transaction {
  transactionId: string;
  pagarmeId: string;
  clinicName: string;
  amount: number;
  createdAt: FieldValue;
  paidAt: FieldValue | null;
  status: "pending" | "paid" | "failed";
  pix: {
    qrCode: string;
    qrCodeUrl: string;
    expirationDate: string;
  };
  planId: string;
  userId: string;
  customerInfo: CustomerInfo;
  subscriptionId: string;
}

export type PlanType = "monthly" | "yearly" | "lifetime";

export interface Subscription {
  subscriptionId: string;
  clinicName: string;
  planId: string;
  planType: PlanType;
  status: "active" | "pending" | "expired" | "cancelled";
  startDate: FieldValue;
  expirationDate: Timestamp | null;
  lastPaymentDate?: FieldValue;
  paymentMethod: "pix";
  transactionId?: string;
  previousSubscriptionId?: string;
}

export interface SubscriptionRepository {
  createSubscription(data: Omit<Subscription, "subscriptionId">): Promise<string>;
  updateSubscription(subscriptionId: string, data: Partial<Subscription>): Promise<void>;
  getSubscriptionByClinicName(clinicName: string): Promise<Subscription | null>;
  getActiveSubscriptions(): Promise<Subscription[]>;
  getExpiredSubscriptions(): Promise<Subscription[]>;
}
