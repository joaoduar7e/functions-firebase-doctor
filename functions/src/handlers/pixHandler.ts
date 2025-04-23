import * as functions from "firebase-functions";
import { z } from "zod";
import { PagarMeService } from "../services/pagarme";
import { TransactionRepository } from "../repositories/transaction";
import { SubscriptionService } from "../services/subscription";
import { PixRequestSchema } from "../schemas/pix";

export class PixHandler {
  constructor(
    private transactionRepo: TransactionRepository,
    private subscriptionService: SubscriptionService,
    private apiKey: string
  ) {}

  async handlePixGeneration(data: unknown, context: functions.https.CallableContext) {
    try {
      const validatedData = PixRequestSchema.parse(data);

      if (!context.auth) {
        throw new functions.https.HttpsError(
          "unauthenticated",
          "O usuário precisa estar autenticado"
        );
      }

      // Normalize clinic name to lowercase before saving
      const normalizedClinicName = validatedData.clinicName.toLowerCase();

      // Ensure payment data has fixed 24-hour expiration
      const pagarmeData = {
        ...validatedData.pagarmeData,
        payments: validatedData.pagarmeData.payments.map((payment) => ({
          ...payment,
          pix: {
            ...payment.pix,
            expires_in: 86400, // 24 hours in seconds (fixed value)
          },
        })),
      };

      const pagarmeService = new PagarMeService(this.apiKey);
      const pagarmeResponse = await pagarmeService.createPixTransaction(pagarmeData);

      const transactionId = await this.transactionRepo.saveTransaction(
        normalizedClinicName,
        validatedData.planId,
        validatedData.amount,
        context.auth.uid,
        pagarmeResponse,
        validatedData.pagarmeData.customer
      );

      const subscriptionId = await this.subscriptionService.handleNewTransaction(
        normalizedClinicName,
        validatedData.planId,
        "monthly", // Default to monthly plan type
        transactionId
      );

      return {
        subscriptionId,
        qrCode: pagarmeResponse.pix_qr_code,
        qrCodeUrl: pagarmeResponse.pix_qr_code_url,
        transactionId: pagarmeResponse.id,
      };
    } catch (error) {
      functions.logger.error("Erro ao gerar PIX:", error);

      if (error instanceof z.ZodError) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Dados inválidos",
          error.errors
        );
      }

      throw new functions.https.HttpsError(
        "internal",
        "Erro ao gerar PIX",
        error instanceof Error ? error.message : "Erro desconhecido"
      );
    }
  }
}
