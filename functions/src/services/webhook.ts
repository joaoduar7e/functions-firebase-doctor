import * as functions from "firebase-functions";
import { WebhookPayload, WebhookPayloadSchema } from "../types/webhook";
import { PaymentProcessor } from "./payment-processor";

export class WebhookService {
  constructor(private paymentProcessor: PaymentProcessor) {}

  async handleWebhook(payload: unknown): Promise<void> {
    try {
      functions.logger.info("Processing webhook payload:", payload);
      const validatedPayload = WebhookPayloadSchema.parse(payload);
      await this.processWebhookEvent(validatedPayload);
    } catch (error) {
      this.handleWebhookError(error);
    }
  }

  private handleWebhookError(error: unknown): never {
    functions.logger.error("Error processing webhook:", error);

    if (error instanceof Error) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        error.message,
        { originalError: error.stack }
      );
    }

    throw new functions.https.HttpsError(
      "internal",
      "Unknown error processing webhook"
    );
  }

  private async processWebhookEvent(payload: WebhookPayload): Promise<void> {
    const { type, data } = payload;
    const pagarmeId = data.id;

    functions.logger.info("Processing webhook event:", {
      type,
      pagarmeId,
      status: data.status,
      charges: data.charges,
    });

    try {
      await this.paymentProcessor.processPayment(type, data);
    } catch (error) {
      functions.logger.error("Error processing webhook event:", {
        type,
        pagarmeId,
        error,
      });

      throw new functions.https.HttpsError(
        "internal",
        "Error processing webhook event",
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }
}
