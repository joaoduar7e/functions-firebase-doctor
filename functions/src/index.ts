import * as functions from "firebase-functions";
import { FirestoreSubscriptionRepository } from "./repositories/subscription";
import { TransactionRepository } from "./repositories/transaction";
import { SubscriptionService } from "./services/subscription";
import { WebhookService } from "./services/webhook";
import { PaymentProcessor } from "./services/payment-processor";
import { PixHandler } from "./handlers/pixHandler";
import { getConfig } from "./config/firebase";

const { apiKey } = getConfig();

const subscriptionRepo = new FirestoreSubscriptionRepository();
const transactionRepo = new TransactionRepository();
const subscriptionService = new SubscriptionService(subscriptionRepo, transactionRepo);
const paymentProcessor = new PaymentProcessor(subscriptionService);
const webhookService = new WebhookService(paymentProcessor);
const pixHandler = new PixHandler(transactionRepo, subscriptionService, apiKey);

export const gerarPix = functions.https.onCall((data, context) =>
  pixHandler.handlePixGeneration(data, context)
);

export const handlePaymentWebhook = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    functions.logger.info("Received webhook request:", {
      body: req.body,
      headers: req.headers,
    });

    await webhookService.handleWebhook(req.body);
    res.status(200).send("Webhook processed successfully");
  } catch (error) {
    functions.logger.error("Error processing webhook:", error);

    if (error instanceof functions.https.HttpsError) {
      res.status(400).json({
        error: error.message,
        details: error.details,
      });
    } else {
      res.status(500).send("Internal Server Error");
    }
  }
});

// New scheduled function to check expired subscriptions
export const checkExpiredSubscriptions = functions.pubsub
  .schedule("46 11 * * *") // Runs at 15:20 every day
  .timeZone("America/Sao_Paulo")
  .onRun(async () => {
    try {
      await subscriptionService.checkExpiredSubscriptions();
      functions.logger.info("Successfully checked expired subscriptions");
      return null;
    } catch (error) {
      functions.logger.error("Error checking expired subscriptions:", error);
      throw error;
    }
  });
