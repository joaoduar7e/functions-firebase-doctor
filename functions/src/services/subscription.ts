import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { FirestoreSubscriptionRepository } from "../repositories/subscription";
import { TransactionRepository } from "../repositories/transaction";
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
      functions.logger.info("Starting handleNewTransaction:", {
        clinicName,
        planId,
        planType,
        transactionId,
      });

      const subscription = await this.subscriptionRepo.getSubscriptionByClinicName(clinicName);
      let subscriptionId: string;

      if (!subscription) {
        functions.logger.info("Creating new subscription for clinic:", clinicName);
        subscriptionId = await this.subscriptionRepo.createSubscription({
          clinicName,
          planId,
          planType,
          status: "pending",
          startDate: admin.firestore.FieldValue.serverTimestamp(),
          expirationDate: null,
          paymentMethod: "pix",
          transactionId,
          isCurrentSubscription: true,
        });
      } else if (subscription.planId !== planId) {
        functions.logger.info("Creating new subscription with different plan:", {
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
          isCurrentSubscription: true,
        });
      } else {
        subscriptionId = subscription.subscriptionId;
        functions.logger.info("Updating existing subscription:", {
          clinicName,
          subscriptionId,
        });
        await this.subscriptionRepo.updateSubscription(subscriptionId, {
          status: "pending",
          transactionId,
          isCurrentSubscription: true,
        });
      }

      await this.transactionRepo.updateTransaction(transactionId, {
        subscriptionId,
      });

      functions.logger.info("Successfully handled new transaction:", {
        clinicName,
        subscriptionId,
        transactionId,
      });

      return subscriptionId;
    } catch (error) {
      functions.logger.error("Error handling subscription:", {
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
        } : "Unknown error",
        clinicName,
        planId,
        transactionId,
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
      functions.logger.info("Starting handlePaymentUpdate:", {
        pagarmeId,
        status,
        paidAt: paidAt?.toISOString(),
      });

      const transaction = await this.transactionRepo.getTransactionByPagarmeId(pagarmeId);
      if (!transaction) {
        const error = `Transaction not found for Pagar.me ID: ${pagarmeId}`;
        functions.logger.error(error);
        throw new Error(error);
      }

      functions.logger.info("Found transaction:", {
        pagarmeId,
        transactionId: transaction.transactionId,
        clinicName: transaction.clinicName,
        subscriptionId: transaction.subscriptionId,
      });

      // First try to get subscription by subscriptionId from transaction
      let subscription: Subscription | null = null;
      if (transaction.subscriptionId) {
        subscription = await this.getSubscriptionById(transaction.subscriptionId);
      }

      // If not found, try to get by clinic name
      if (!subscription) {
        subscription = await this.subscriptionRepo.getSubscriptionByClinicName(
          transaction.clinicName
        );
      }

      if (!subscription) {
        const error = `Subscription not found for clinic: ${transaction.clinicName}`;
        functions.logger.error(error, {
          transactionId: transaction.transactionId,
          clinicName: transaction.clinicName,
          subscriptionId: transaction.subscriptionId,
        });
        throw new Error(error);
      }

      functions.logger.info("Found subscription:", {
        subscriptionId: subscription.subscriptionId,
        clinicName: subscription.clinicName,
        status: subscription.status,
      });

      if (status === "paid") {
        await this.handleSuccessfulPayment(subscription, transaction, paidAt);
      } else {
        await this.handleFailedPayment(subscription, transaction);
      }
    } catch (error) {
      functions.logger.error("Error updating payment status:", {
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
        } : "Unknown error",
        pagarmeId,
        status,
      });
      throw error;
    }
  }

  private async getSubscriptionById(subscriptionId: string): Promise<Subscription | null> {
    try {
      const doc = await admin.firestore()
        .collection("subscriptions")
        .doc(subscriptionId)
        .get();

      if (!doc.exists) {
        return null;
      }

      return { ...doc.data(), subscriptionId: doc.id } as Subscription;
    } catch (error) {
      functions.logger.error("Error getting subscription by ID:", {
        subscriptionId,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
        } : "Unknown error",
      });
      return null;
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
      paymentDate: paymentDate.toISOString(),
      expirationDate: expirationDate?.toISOString(),
      planType: subscription.planType,
    });

    await this.subscriptionRepo.deactivateOldSubscriptions(subscription.clinicName);

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

    functions.logger.info("Successfully handled failed payment:", {
      subscriptionId: subscription.subscriptionId,
      transactionId: transaction.transactionId,
    });
  }

  async checkExpiredSubscriptions(): Promise<void> {
    try {
      const expiredSubscriptions = await this.subscriptionRepo.getExpiredSubscriptions();

      for (const subscription of expiredSubscriptions) {
        if (subscription.planType !== "lifetime") {
          await this.subscriptionRepo.updateSubscription(subscription.subscriptionId, {
            status: "expired",
            isCurrentSubscription: false,
          });

          functions.logger.info("Subscription expired:", {
            subscriptionId: subscription.subscriptionId,
            clinicName: subscription.clinicName,
          });
        }
      }
    } catch (error) {
      functions.logger.error("Error checking expired subscriptions:", {
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
        } : "Unknown error",
      });
      throw error;
    }
  }
}
