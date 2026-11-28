import { prisma } from "@/lib/db";

export type OptionalOrderSchemaAvailability = {
  contacts: boolean;
  delivery: boolean;
  confirmation: boolean;
  receipt: boolean;
  externalPayment: boolean;
  paymentReceipt: boolean;
  paymentEvent: boolean;
};

export async function getOptionalOrderSchemaAvailability() {
  const [schema] = await prisma.$queryRaw<OptionalOrderSchemaAvailability[]>`
    SELECT
      to_regclass('"OrderSellerContact"') IS NOT NULL AS contacts,
      to_regclass('"OrderDeliveryDetails"') IS NOT NULL AS delivery,
      to_regclass('"OrderDeliveryConfirmation"') IS NOT NULL AS confirmation,
      to_regclass('"OrderReceipt"') IS NOT NULL AS receipt,
      to_regclass('"OrderExternalPayment"') IS NOT NULL AS "externalPayment",
      to_regclass('"OrderPaymentReceipt"') IS NOT NULL AS "paymentReceipt",
      to_regclass('"OrderPaymentEvent"') IS NOT NULL AS "paymentEvent"
  `;

  if (!schema) {
    throw new Error("No se pudo verificar el esquema opcional de pedidos.");
  }
  return schema;
}
