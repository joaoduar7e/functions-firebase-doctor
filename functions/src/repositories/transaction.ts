import * as admin from "firebase-admin";
import { PagarMeResponse, Customer } from "../types/pagarme";
import { Transaction } from "../types/subscription";
import * as functions from "firebase-functions";

type TransactionUpdateData = {
  status: Transaction["status"];
  updatedAt: admin.firestore.FieldValue;
  paidAt?: admin.firestore.Timestamp;
};

export class TransactionRepository {
  private readonly transactionsRef = admin.firestore().collection("transactions");

  async saveTransaction(
    clinicName: string,
    planId: string,
    amount: number,
    userId: string,
    pagarmeResponse: PagarMeResponse,
    customer: Customer,
  ): Promise<string> {
    try {
      const transaction: Omit<Transaction, "transactionId" | "subscriptionId"> = {
        clinicName,
        planId,
        amount,
        status: "pending",
        paidAt: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        userId,
        pagarmeId: pagarmeResponse.id,
        customerInfo: {
          document: customer.document,
          email: customer.email,
          name: customer.name,
          type: customer.type,
          phone: customer.phones.mobile_phone,
        },
        pix: {
          qrCode: pagarmeResponse.pix_qr_code,
          qrCodeUrl: pagarmeResponse.pix_qr_code_url,
          expirationDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        },
      };

      functions.logger.info("Saving new transaction:", {
        clinicName,
        planId,
        pagarmeId: pagarmeResponse.id,
        timestamp: new Date().toISOString(),
      });

      const docRef = await this.transactionsRef.add(transaction);
      return docRef.id;
    } catch (error) {
      functions.logger.error("Error saving transaction:", {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : String(error),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  async updateTransactionStatus(
    transactionId: string,
    status: Transaction["status"],
    paidAt?: Date
  ): Promise<void> {
    try {
      const updateData: TransactionUpdateData = {
        status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (status === "paid" && paidAt) {
        updateData.paidAt = admin.firestore.Timestamp.fromDate(paidAt);
      }

      functions.logger.info("Updating transaction status:", {
        transactionId,
        status,
        paidAt: paidAt?.toISOString(),
        timestamp: new Date().toISOString(),
      });

      await this.transactionsRef.doc(transactionId).update(updateData);
    } catch (error) {
      functions.logger.error("Error updating transaction status:", {
        transactionId,
        status,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : String(error),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  async updateTransaction(
    transactionId: string,
    data: Partial<Transaction>
  ): Promise<void> {
    try {
      functions.logger.info("Updating transaction:", {
        transactionId,
        updateFields: Object.keys(data),
        timestamp: new Date().toISOString(),
      });

      await this.transactionsRef.doc(transactionId).update({
        ...data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (error) {
      functions.logger.error("Error updating transaction:", {
        transactionId,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : String(error),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  async getTransactionById(transactionId: string): Promise<Transaction | null> {
    try {
      const doc = await this.transactionsRef.doc(transactionId).get();

      functions.logger.info("Getting transaction by ID:", {
        transactionId,
        exists: doc.exists,
        timestamp: new Date().toISOString(),
      });

      if (!doc.exists) {
        return null;
      }
      return { ...doc.data(), transactionId: doc.id } as Transaction;
    } catch (error) {
      functions.logger.error("Error getting transaction by ID:", {
        transactionId,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : String(error),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  async getTransactionByPagarmeId(pagarmeId: string): Promise<Transaction | null> {
    try {
      functions.logger.info("Getting transaction by Pagar.me ID:", {
        pagarmeId,
        timestamp: new Date().toISOString(),
      });

      const snapshot = await this.transactionsRef
        .where("pagarmeId", "==", pagarmeId)
        .limit(1)
        .get();

      if (snapshot.empty) {
        functions.logger.warn("No transaction found for Pagar.me ID:", {
          pagarmeId,
          timestamp: new Date().toISOString(),
        });
        return null;
      }

      const doc = snapshot.docs[0];
      return { ...doc.data(), transactionId: doc.id } as Transaction;
    } catch (error) {
      functions.logger.error("Error getting transaction by Pagar.me ID:", {
        pagarmeId,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : String(error),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }
}
