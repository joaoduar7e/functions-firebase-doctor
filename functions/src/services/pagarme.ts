import axios, { AxiosError } from "axios";
import * as functions from "firebase-functions";
import { PagarMeResponse, PagarMeRequest } from "../types/pagarme";

export class PagarMeService {
  private readonly apiKey: string;
  private readonly baseURL = "https://api.pagar.me/core/v5";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async createPixTransaction(pagarmeData: PagarMeRequest): Promise<PagarMeResponse> {
    try {
      // Convert amount from real to cents
      const modifiedData = {
        ...pagarmeData,
        items: pagarmeData.items.map((item) => ({
          ...item,
          amount: Math.round(item.amount * 100),
        })),
      };

      const response = await axios.post(
        `${this.baseURL}/orders`,
        modifiedData,
        {
          headers: {
            "Authorization": `Basic ${Buffer.from(this.apiKey + ":").toString("base64")}`,
            "Content-Type": "application/json",
          },
        }
      );

      functions.logger.info("Resposta Pagar.me:", JSON.stringify(response.data, null, 2));

      const charge = response.data.charges?.[0];
      const lastTransaction = charge?.last_transaction;

      if (!lastTransaction?.qr_code) {
        functions.logger.error("Resposta sem QR Code:", JSON.stringify(response.data, null, 2));
        throw new Error("QR Code não encontrado na resposta da Pagar.me");
      }

      return {
        pix_qr_code: lastTransaction.qr_code,
        pix_qr_code_url: lastTransaction.qr_code_url,
        status: response.data.status,
        id: response.data.id,
      };
    } catch (error) {
      let errorMessage = "Erro desconhecido";
      let errorData = {};

      if (error instanceof AxiosError) {
        errorMessage = error.response?.data?.message || error.message;
        errorData = {
          status: error.response?.status,
          data: error.response?.data,
          headers: error.response?.headers,
        };
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      functions.logger.error("Erro na requisição Pagar.me:", {
        message: errorMessage,
        ...errorData,
      });

      if (error instanceof AxiosError && error.response?.status === 401) {
        throw new functions.https.HttpsError(
          "unauthenticated",
          "Erro de autenticação com a Pagar.me. Verifique a chave de API.",
          error.response?.data
        );
      }

      throw new functions.https.HttpsError(
        "internal",
        "Erro ao criar transação PIX",
        errorMessage
      );
    }
  }
}
