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
      .where("status", "==", "active")
      .where("isCurrentSubscription", "==", true)
      .get();

    return snapshot.docs.map((doc) => ({
      ...doc.data(),
      subscriptionId: doc.id,
    })) as Subscription[];
  }

  async getExpiredSubscriptions(): Promise<Subscription[]> {
    const now = admin.firestore.Timestamp.now();
    const snapshot = await this.subscriptionsRef
      .where("status", "==", "active")
      .where("planType", "!=", "lifetime")
      .where("expirationDate", "<=", now)
      .where("isCurrentSubscription", "==", true)
      .get();

    return snapshot.docs.map((doc) => ({
      ...doc.data(),
      subscriptionId: doc.id,
    })) as Subscription[];
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
