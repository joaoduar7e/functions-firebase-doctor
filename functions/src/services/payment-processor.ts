import * as functions from "firebase-functions";
import { WebhookData } from "../types/webhook";
import { SubscriptionService } from "./subscription";

export class PaymentProcessor {
  constructor(private subscriptionService: SubscriptionService) {}

  async processPayment(type: string, data: WebhookData): Promise<void> {
    const charge = data.charges?.[0];
    if (!charge) {
      throw new Error("No charge information found in webhook payload");
    }

    const pagarmeId = data.id;

    switch (type) {
    case "order.paid": {
      await this.handlePaidOrder(data, charge, pagarmeId);
      break;
    }

    case "order.payment_failed":
    case "order.canceled": {
      await this.handleFailedOrder(pagarmeId);
      break;
    }

    default: {
      functions.logger.info(`Ignoring unhandled webhook event type: ${type}`);
    }
    }
  }

  private async handlePaidOrder(
    data: WebhookData,
    charge: WebhookData["charges"][0],
    pagarmeId: string
  ): Promise<void> {
    if (data.status === "paid" && charge.status === "paid") {
      const paidAt = charge.paid_at ? new Date(charge.paid_at) : new Date();
      await this.subscriptionService.handlePaymentUpdate(pagarmeId, "paid", paidAt);
      functions.logger.info("Successfully processed paid order:", {
        pagarmeId,
        paidAt,
        status: data.status,
        chargeStatus: charge.status,
      });
    } else {
      functions.logger.warn("Order marked as paid but status mismatch:", {
        orderStatus: data.status,
        chargeStatus: charge.status,
      });
    }
  }

  private async handleFailedOrder(pagarmeId: string): Promise<void> {
    await this.subscriptionService.handlePaymentUpdate(pagarmeId, "failed");
    functions.logger.info("Successfully processed failed/canceled order:", { pagarmeId });
  }
}
