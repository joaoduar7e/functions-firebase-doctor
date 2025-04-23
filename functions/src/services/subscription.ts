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
      functions.logger.info("Handling new transaction:", {
        clinicName,
        planId,
        planType,
        transactionId,
      });

      const subscription = await this.subscriptionRepo.getSubscriptionByClinicName(clinicName);
      let subscriptionId: string;

      if (!subscription) {
        functions.logger.info("No existing subscription found, creating new one", {
          clinicName,
          planId,
        });

        subscriptionId = await this.subscriptionRepo.createSubscription({
          clinicName,
          planId,
          planType,
          status: "pending",
          startDate: admin.firestore.FieldValue.serverTimestamp(),
          expirationDate: null,
          paymentMethod: "pix",
          transactionId,
          isCurrentSubscription: true, // Changed to true for new subscriptions
        });
      } else if (subscription.planId !== planId) {
        functions.logger.info("Creating new subscription with different plan", {
          clinicName,
          oldPlanId: subscription.planId,
          newPlanId: planId,
        });

        subscriptionId = await this.subscriptionRepo.createSubscription({
          clinicName,
          planId,
          planType,
          status: "pending",
          startDate: admin.firestore.FieldValue.serverTimestamp(),
          expirationDate: null,
          paymentMethod: "pix",
          transactionId,
          previousSubscriptionId: subscription.subscriptionId,
          isCurrentSubscription: true, // Changed to true for new subscriptions
        });
      } else {
        subscriptionId = subscription.subscriptionId;
        functions.logger.info("Updating existing subscription", {
          subscriptionId,
          clinicName,
          planId,
        });

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
      functions.logger.error("Error handling subscription:", {
        error,
        clinicName,
        planId,
        transactionId,
        stack: error instanceof Error ? error.stack : undefined,
      });

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
      functions.logger.info("Starting payment update:", {
        pagarmeId,
        status,
        paidAt,
      });

      const transaction = await this.transactionRepo.getTransactionByPagarmeId(pagarmeId);
      if (!transaction) {
        functions.logger.error("Transaction not found:", { pagarmeId });
        throw new Error(`Transaction not found for Pagar.me ID: ${pagarmeId}`);
      }

      functions.logger.info("Found transaction:", {
        transactionId: transaction.transactionId,
        clinicName: transaction.clinicName,
        status: transaction.status,
        subscriptionId: transaction.subscriptionId,
      });

      // First try to get subscription by ID if available
      let subscription: Subscription | null = null;
      if (transaction.subscriptionId) {
        subscription = await this.subscriptionRepo.getSubscriptionById(transaction.subscriptionId);
        functions.logger.info("Attempted to get subscription by ID:", {
          subscriptionId: transaction.subscriptionId,
          found: !!subscription,
        });
      }

      // If not found by ID, try by clinic name
      if (!subscription) {
        subscription = await this.subscriptionRepo.getSubscriptionByClinicName(
          transaction.clinicName
        );
        functions.logger.info("Attempted to get subscription by clinic name:", {
          clinicName: transaction.clinicName,
          found: !!subscription,
        });
      }

      if (!subscription) {
        functions.logger.error("Subscription not found:", {
          clinicName: transaction.clinicName,
          transactionId: transaction.transactionId,
          subscriptionId: transaction.subscriptionId,
        });
        throw new Error(`Subscription not found for clinic: ${transaction.clinicName}`);
      }

      functions.logger.info("Found subscription:", {
        subscriptionId: subscription.subscriptionId,
        status: subscription.status,
        planId: subscription.planId,
        isCurrentSubscription: subscription.isCurrentSubscription,
      });

      if (status === "paid") {
        await this.handleSuccessfulPayment(subscription, transaction, paidAt);
      } else {
        await this.handleFailedPayment(subscription, transaction);
      }
    } catch (error) {
      functions.logger.error("Error updating payment status:", {
        error,
        pagarmeId,
        status,
        stack: error instanceof Error ? error.stack : undefined,
      });

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

    // Only deactivate existing subscriptions when the new one is being paid
    await this.subscriptionRepo.deactivateOldSubscriptions(subscription.clinicName);

    // Update the new subscription as current and active
    await this.subscriptionRepo.updateSubscription(subscription.subscriptionId, {
      status: "active",
      lastPaymentDate: admin.firestore.Timestamp.fromDate(paymentDate),
      expirationDate: expirationDate ? admin.firestore.Timestamp.fromDate(expirationDate) : null,
      isCurrentSubscription: true,
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
    functions.logger.info("Handling failed payment:", {
      subscriptionId: subscription.subscriptionId,
      transactionId: transaction.transactionId,
    });

    await this.subscriptionRepo.updateSubscription(subscription.subscriptionId, {
      status: "expired",
      isCurrentSubscription: false,
    });
    await this.transactionRepo.updateTransactionStatus(transaction.transactionId, "failed");

    functions.logger.info("Successfully processed failed payment:", {
      subscriptionId: subscription.subscriptionId,
      transactionId: transaction.transactionId,
    });
  }

  async checkExpiredSubscriptions(): Promise<void> {
    try {
      const expiredSubscriptions = await this.subscriptionRepo.getExpiredSubscriptions();

      functions.logger.info(`Found ${expiredSubscriptions.length} expired subscriptions`);

      for (const subscription of expiredSubscriptions) {
        functions.logger.info("Processing expired subscription:", {
          subscriptionId: subscription.subscriptionId,
          clinicName: subscription.clinicName,
          expirationDate: subscription.expirationDate,
          currentStatus: subscription.status,
        });

        await this.subscriptionRepo.updateSubscription(subscription.subscriptionId, {
          status: "expired",
          isCurrentSubscription: false,
        });

        functions.logger.info(`Subscription expired and updated: ${subscription.subscriptionId}`);
      }
    } catch (error) {
      functions.logger.error("Error checking expired subscriptions:", {
        error,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }
}
