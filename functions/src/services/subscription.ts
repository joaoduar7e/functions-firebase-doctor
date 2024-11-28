import { FirestoreSubscriptionRepository } from "../repositories/subscription";
import { TransactionRepository } from "../repositories/transaction";
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { PlanType, Subscription, Transaction } from "../types/subscription";
import { calculateExpirationDate } from "./expiration";

export class SubscriptionService {
  constructor(
    private subscriptionRepo: FirestoreSubscriptionRepository,
    private transactionRepo: TransactionRepository
  ) {}

  async handleNewTransaction(
    clinicName: string,
    planId: string,
    planType: PlanType,
    transactionId: string
  ): Promise<string> {
    try {
      const subscription = await this.subscriptionRepo.getSubscriptionByClinicName(clinicName);
      let subscriptionId: string;

      if (!subscription) {
        subscriptionId = await this.subscriptionRepo.createSubscription({
          clinicName,
          planId,
          planType,
          status: "pending",
          startDate: admin.firestore.FieldValue.serverTimestamp(),
          expirationDate: null,
          paymentMethod: "pix",
          transactionId,
        });
      } else if (subscription.planId !== planId) {
        const oldSubscriptionId = subscription.subscriptionId;

        subscriptionId = await this.subscriptionRepo.createSubscription({
          clinicName,
          planId,
          planType,
          status: "pending",
          startDate: admin.firestore.FieldValue.serverTimestamp(),
          expirationDate: null,
          paymentMethod: "pix",
          transactionId,
          previousSubscriptionId: oldSubscriptionId,
        });

        await this.subscriptionRepo.updateSubscription(oldSubscriptionId, {
          status: "cancelled",
        });
      } else {
        subscriptionId = subscription.subscriptionId;
        await this.subscriptionRepo.updateSubscription(subscriptionId, {
          status: "pending",
          transactionId,
        });
      }

      await this.transactionRepo.updateTransaction(transactionId, {
        subscriptionId,
      });

      return subscriptionId;
    } catch (error) {
      functions.logger.error("Error handling subscription:", error);
      throw new functions.https.HttpsError(
        "internal",
        "Error processing subscription",
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }

  async handlePaymentUpdate(
    pagarmeId: string,
    status: "paid" | "failed",
    paidAt?: Date
  ): Promise<void> {
    try {
      const transaction = await this.transactionRepo.getTransactionByPagarmeId(pagarmeId);
      if (!transaction) {
        throw new Error(`Transaction not found for Pagar.me ID: ${pagarmeId}`);
      }

      const subscription = await this.subscriptionRepo.getSubscriptionByClinicName(
        transaction.clinicName
      );
      if (!subscription) {
        throw new Error(`Subscription not found for clinic: ${transaction.clinicName}`);
      }

      if (status === "paid") {
        await this.handleSuccessfulPayment(subscription, transaction, paidAt);
      } else {
        await this.handleFailedPayment(subscription, transaction);
      }
    } catch (error) {
      functions.logger.error("Error updating payment status:", error);
      throw new functions.https.HttpsError(
        "internal",
        "Error updating payment status",
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }

  private async handleSuccessfulPayment(
    subscription: Subscription,
    transaction: Transaction,
    paidAt?: Date
  ): Promise<void> {
    const paymentDate = paidAt || new Date();
    const expirationDate = calculateExpirationDate(subscription.planType, paymentDate);

    functions.logger.info("Updating subscription with payment:", {
      subscriptionId: subscription.subscriptionId,
      paymentDate,
      expirationDate,
      planType: subscription.planType,
    });

    await this.subscriptionRepo.updateSubscription(subscription.subscriptionId, {
      status: "active",
      lastPaymentDate: admin.firestore.Timestamp.fromDate(paymentDate),
      expirationDate: expirationDate ? admin.firestore.Timestamp.fromDate(expirationDate) : null,
    });

    await this.transactionRepo.updateTransactionStatus(
      transaction.transactionId,
      "paid",
      paymentDate
    );

    functions.logger.info("Successfully updated subscription and transaction:", {
      subscriptionId: subscription.subscriptionId,
      transactionId: transaction.transactionId,
      status: "paid",
    });
  }

  private async handleFailedPayment(
    subscription: Subscription,
    transaction: Transaction
  ): Promise<void> {
    await this.subscriptionRepo.updateSubscription(subscription.subscriptionId, {
      status: "expired",
    });
    await this.transactionRepo.updateTransactionStatus(transaction.transactionId, "failed");
  }

  async checkExpiredSubscriptions(): Promise<void> {
    try {
      const expiredSubscriptions = await this.subscriptionRepo.getExpiredSubscriptions();

      for (const subscription of expiredSubscriptions) {
        if (subscription.planType !== "lifetime") {
          await this.subscriptionRepo.updateSubscription(subscription.subscriptionId, {
            status: "expired",
          });

          functions.logger.info(`Subscription expired: ${subscription.subscriptionId}`);
        }
      }
    } catch (error) {
      functions.logger.error("Error checking expired subscriptions:", error);
      throw error;
    }
  }
}
