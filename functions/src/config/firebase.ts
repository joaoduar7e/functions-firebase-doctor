import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

export function getConfig() {
  const config = functions.config();
  const apiKey = config.pagarme?.api_key;

  if (!apiKey) {
    throw new Error(
      "Pagar.me API key not configured. Use: firebase functions:config:set pagarme.api_key=\"KEY\""
    );
  }

  return { apiKey };
}
