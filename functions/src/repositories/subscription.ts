import * as admin from "firebase-admin";
import { Subscription, SubscriptionRepository } from "../types/subscription";
import * as functions from "firebase-functions";

export class FirestoreSubscriptionRepository implements SubscriptionRepository {
  private readonly subscriptionsRef = admin.firestore().collection("subscriptions");

  async createSubscription(
    data: Omit<Subscription, "subscriptionId">
  ): Promise<string> {
    const normalizedClinicName = data.clinicName.toLowerCase();

    functions.logger.info("Creating subscription:", {
      clinicName: normalizedClinicName,
      planId: data.planId,
      planType: data.planType,
      status: data.status,
    });

    const docRef = await this.subscriptionsRef.add({
      ...data,
      clinicName: normalizedClinicName,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    functions.logger.info("Subscription created successfully:", {
      subscriptionId: docRef.id,
      clinicName: normalizedClinicName,
    });

    return docRef.id;
  }

  async updateSubscription(
    subscriptionId: string,
    data: Partial<Subscription>
  ): Promise<void> {
    functions.logger.info("Updating subscription:", {
      subscriptionId,
      updateData: data,
    });

    const updateData = {
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (updateData.clinicName) {
      updateData.clinicName = updateData.clinicName.toLowerCase();
    }

    await this.subscriptionsRef.doc(subscriptionId).update(updateData);

    functions.logger.info("Subscription updated successfully:", {
      subscriptionId,
      clinicName: updateData.clinicName,
      status: updateData.status,
    });
  }

  async getSubscriptionById(subscriptionId: string): Promise<Subscription | null> {
    functions.logger.info("Getting subscription by ID:", { subscriptionId });

    const doc = await this.subscriptionsRef.doc(subscriptionId).get();

    if (!doc.exists) {
      functions.logger.info("No subscription found for ID:", { subscriptionId });
      return null;
    }

    const subscription = { ...doc.data(), subscriptionId: doc.id } as Subscription;

    functions.logger.info("Found subscription by ID:", {
      subscriptionId,
      clinicName: subscription.clinicName,
      status: subscription.status,
      planId: subscription.planId,
    });

    return subscription;
  }

  async getSubscriptionByClinicName(clinicName: string): Promise<Subscription | null> {
    const normalizedClinicName = clinicName.toLowerCase();

    functions.logger.info("Getting subscription by clinic name:", {
      clinicName: normalizedClinicName,
    });

    const snapshot = await this.subscriptionsRef
      .where("clinicName", "==", normalizedClinicName)
      .where("status", "in", ["active", "pending"])
      .where("isCurrentSubscription", "==", true)
      .limit(1)
      .get();

    if (snapshot.empty) {
      functions.logger.info("No subscription found for clinic:", {
        clinicName: normalizedClinicName,
      });
      return null;
    }

    const doc = snapshot.docs[0];
    const subscription = { ...doc.data(), subscriptionId: doc.id } as Subscription;

    functions.logger.info("Found subscription:", {
      subscriptionId: doc.id,
      clinicName: subscription.clinicName,
      status: subscription.status,
      planId: subscription.planId,
    });

    return subscription;
  }

  async getActiveSubscriptions(): Promise<Subscription[]> {
    functions.logger.info("Getting active subscriptions");

    const snapshot = await this.subscriptionsRef
      .where("status", "in", ["active", "testing"])
      .where("isCurrentSubscription", "==", true)
      .get();

    const subscriptions = snapshot.docs.map((doc) => ({
      ...doc.data(),
      subscriptionId: doc.id,
    })) as Subscription[];

    functions.logger.info("Found active subscriptions:", {
      count: subscriptions.length,
      subscriptions: subscriptions.map((s) => ({
        subscriptionId: s.subscriptionId,
        clinicName: s.clinicName,
        status: s.status,
      })),
    });

    return subscriptions;
  }

  async getExpiredSubscriptions(): Promise<Subscription[]> {
    functions.logger.info("Getting expired subscriptions");

    const now = admin.firestore.Timestamp.now();
    // Calcula a data de 15 dias atrás para limitar o range de busca
    const fifteenDaysAgo = admin.firestore.Timestamp.fromMillis(
      now.toMillis() - 15 * 24 * 60 * 60 * 1000
    );

    // Query otimizada: busca apenas assinaturas que expiraram nos últimos 15 dias
    // Isso reduz drasticamente o consumo de leituras do Firestore
    // Assinaturas que expiraram há mais tempo provavelmente já foram processadas
    // Usa <= para incluir assinaturas que expiram exatamente no momento da verificação
    // O Firestore ignora documentos com expirationDate = null em comparações
    const activeSnapshot = await this.subscriptionsRef
      .where("status", "==", "active")
      .where("expirationDate", ">=", fifteenDaysAgo)
      .where("expirationDate", "<=", now)
      .get();

    const testingSnapshot = await this.subscriptionsRef
      .where("status", "==", "testing")
      .where("expirationDate", ">=", fifteenDaysAgo)
      .where("expirationDate", "<=", now)
      .get();

    const expiredSubscriptions = [
      ...activeSnapshot.docs,
      ...testingSnapshot.docs,
    ]
      .map((doc) => ({ ...doc.data(), subscriptionId: doc.id } as Subscription))
      // Filtro adicional para garantir (caso de lifetime plans)
      .filter((sub) => sub.expirationDate !== null);

    functions.logger.info("Found expired subscriptions:", {
      count: expiredSubscriptions.length,
      subscriptions: expiredSubscriptions.map((s) => ({
        subscriptionId: s.subscriptionId,
        clinicName: s.clinicName,
        status: s.status,
        expirationDate: s.expirationDate,
      })),
    });

    return expiredSubscriptions;
  }

  async deactivateOldSubscriptions(clinicName: string): Promise<void> {
    const normalizedClinicName = clinicName.toLowerCase();

    functions.logger.info("Deactivating old subscriptions:", {
      clinicName: normalizedClinicName,
    });

    const batch = admin.firestore().batch();

    const oldSubscriptions = await this.subscriptionsRef
      .where("clinicName", "==", normalizedClinicName)
      .where("isCurrentSubscription", "==", true)
      .get();

    functions.logger.info("Found old subscriptions to deactivate:", {
      count: oldSubscriptions.size,
      subscriptions: oldSubscriptions.docs.map((doc) => ({
        subscriptionId: doc.id,
        clinicName: doc.data().clinicName,
        status: doc.data().status,
      })),
    });

    oldSubscriptions.docs.forEach((doc) => {
      batch.update(doc.ref, {
        isCurrentSubscription: false,
        status: "cancelled",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();

    functions.logger.info("Successfully deactivated old subscriptions:", {
      clinicName: normalizedClinicName,
      count: oldSubscriptions.size,
    });
  }
}
