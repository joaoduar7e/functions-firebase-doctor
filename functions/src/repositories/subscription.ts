import * as admin from "firebase-admin";
import { Subscription, SubscriptionRepository } from "../types/subscription";

export class FirestoreSubscriptionRepository implements SubscriptionRepository {
  private readonly subscriptionsRef = admin.firestore().collection("subscriptions");

  async createSubscription(
    data: Omit<Subscription, "subscriptionId">
  ): Promise<string> {
    const docRef = await this.subscriptionsRef.add({
      ...data,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return docRef.id;
  }

  async updateSubscription(
    subscriptionId: string,
    data: Partial<Subscription>
  ): Promise<void> {
    await this.subscriptionsRef.doc(subscriptionId).update({
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async getSubscriptionByClinicName(clinicName: string): Promise<Subscription | null> {
    const snapshot = await this.subscriptionsRef
      .where("clinicName", "==", clinicName)
      .where("status", "in", ["active", "pending"])
      .where("isCurrentSubscription", "==", true)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return { ...doc.data(), subscriptionId: doc.id } as Subscription;
  }

  async getActiveSubscriptions(): Promise<Subscription[]> {
    const snapshot = await this.subscriptionsRef
      .where("status", "in", ["active", "testing"])
      .where("isCurrentSubscription", "==", true)
      .get();

    return snapshot.docs.map((doc) => ({
      ...doc.data(),
      subscriptionId: doc.id,
    })) as Subscription[];
  }

  async getExpiredSubscriptions(): Promise<Subscription[]> {
    const now = new Date();
    const snapshot = await this.subscriptionsRef
      .where("status", "in", ["active", "testing"])
      .get();

    // Filtra localmente as subscrições expiradas
    const expiredSubscriptions = snapshot.docs
      .map((doc) => ({ ...doc.data(), subscriptionId: doc.id } as Subscription))
      .filter((sub) => {
        if (!sub.expirationDate) {
          return false;
        }

        let expirationDate: Date;

        // Verifica se é um Timestamp do Firestore
        if (sub.expirationDate instanceof admin.firestore.Timestamp) {
          expirationDate = sub.expirationDate.toDate();
        } else if (typeof sub.expirationDate === "string") {
          expirationDate = new Date(sub.expirationDate);
        } else {
          return false;
        }

        // Verifica se a data é válida
        if (isNaN(expirationDate.getTime())) {
          return false;
        }

        return expirationDate < now;
      });

    return expiredSubscriptions;
  }

  async deactivateOldSubscriptions(clinicName: string): Promise<void> {
    const batch = admin.firestore().batch();

    const oldSubscriptions = await this.subscriptionsRef
      .where("clinicName", "==", clinicName)
      .where("isCurrentSubscription", "==", true)
      .get();

    oldSubscriptions.docs.forEach((doc) => {
      batch.update(doc.ref, {
        isCurrentSubscription: false,
        status: "cancelled",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();
  }
}
