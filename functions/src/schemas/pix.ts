import { z } from "zod";

const CustomerSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  email: z.string().email("Email inválido"),
  document: z.string().min(11, "Documento inválido"),
  type: z.enum(["individual", "company"]),
  phones: z.object({
    mobile_phone: z.object({
      country_code: z.string(),
      area_code: z.string(),
      number: z.string(),
    }),
  }),
});

const ItemSchema = z.object({
  amount: z.number(),
  description: z.string(),
  quantity: z.number(),
});

const PixPaymentSchema = z.object({
  payment_method: z.literal("pix"),
  pix: z.object({
    expires_in: z.number(),
    additional_information: z.array(
      z.object({
        name: z.string(),
        value: z.string(),
      })
    ).optional(),
  }),
});

const PagarmeDataSchema = z.object({
  items: z.array(ItemSchema),
  customer: CustomerSchema,
  payments: z.array(PixPaymentSchema),
});

export const PixRequestSchema = z.object({
  clinicName: z.string().min(1, "Nome da clínica é obrigatório"),
  planId: z.string().min(1, "ID do plano é obrigatório"),
  amount: z.number().positive("Valor deve ser positivo"),
  pagarmeData: PagarmeDataSchema,
});

export type PixRequest = z.infer<typeof PixRequestSchema>;
