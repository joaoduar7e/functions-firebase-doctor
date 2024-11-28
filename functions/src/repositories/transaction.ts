import * as admin from "firebase-admin";
import { PagarMeResponse, Customer } from "../types/pagarme";
import { Transaction } from "../types/subscription";

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

    const docRef = await this.transactionsRef.add(transaction);
    return docRef.id;
  }

  async updateTransactionStatus(
    transactionId: string,
    status: Transaction["status"],
    paidAt?: Date
  ): Promise<void> {
    const updateData: TransactionUpdateData = {
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (status === "paid" && paidAt) {
      updateData.paidAt = admin.firestore.Timestamp.fromDate(paidAt);
    }

    await this.transactionsRef.doc(transactionId).update(updateData);
  }

  async updateTransaction(
    transactionId: string,
    data: Partial<Transaction>
  ): Promise<void> {
    await this.transactionsRef.doc(transactionId).update({
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async getTransactionById(transactionId: string): Promise<Transaction | null> {
    const doc = await this.transactionsRef.doc(transactionId).get();
    if (!doc.exists) {
      return null;
    }
    return { ...doc.data(), transactionId: doc.id } as Transaction;
  }

  async getTransactionByPagarmeId(pagarmeId: string): Promise<Transaction | null> {
    const snapshot = await this.transactionsRef
      .where("pagarmeId", "==", pagarmeId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return { ...doc.data(), transactionId: doc.id } as Transaction;
  }
}
