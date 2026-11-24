"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma, type OrderDeliveryDetails } from "@/generated/prisma/client";
import { getCurrentIdentity } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { hasPaymentReceipt, isExternalPaymentAvailable, isPaymentEventAvailable, isPaymentReceiptAvailable, parsePaymentReference, parseWompiPaymentLink } from "./external-payment";

type PaymentState = { message: string; ok?: boolean };

export async function saveExternalPayment(delivery: OrderDeliveryDetails, _previous: PaymentState, form: FormData): Promise<PaymentState> {
  const orderId = delivery.orderId;
  const actor = await getCurrentIdentity();
  if (!actor?.roles.includes("PRODUCER")) return { message: "Necesitas el perfil de vendedor." };
  if (!await isExternalPaymentAvailable()) return { message: "Esta opción todavía no está disponible." };
  const order = await prisma.order.findFirst({
    where: { id: orderId, producerId: actor.userId, status: "ACCEPTED" },
    select: { id: true, sellerContact: { select: { orderId: true } } },
  });
  if (!order) return { message: "No encontramos ese pedido aceptado en tu cuenta." };
  if (await hasPaymentReceipt(orderId)) return { message: "El pago ya está confirmado." };
  if (form.get("operation") === "remove") {
    await prisma.orderExternalPayment.deleteMany({ where: { orderId } });
    revalidatePath("/mi-cuenta/pedidos");
    return { ok: true, message: "Retiramos las instrucciones de pago." };
  }
  if (!order.sellerContact) return { message: "Comparte primero un WhatsApp para atender dudas sobre el pago." };
  const method = form.get("method");
  if (method !== "TRANSFER" && method !== "ON_DELIVERY" && method !== "WOMPI") {
    return { message: "Elige cómo se acordó pagar." };
  }
  const wompiUrl = method === "WOMPI" ? parseWompiPaymentLink(form.get("wompiUrl")) : null;
  if (method === "WOMPI" && (!wompiUrl || form.get("wompiChecked") !== "on")) {
    return { message: "Pega un enlace oficial de Wompi y confirma que corresponde a este pedido." };
  }
  try {
    const saved = await prisma.$executeRaw`
      WITH agreed AS (
        SELECT d."orderId"
        FROM "OrderDeliveryDetails" d
        JOIN "OrderDeliveryConfirmation" c ON c."orderId" = d."orderId"
        WHERE d."orderId" = ${orderId} AND d."method" = ${delivery.method}
          AND d."when" = ${delivery.when} AND d."place" = ${delivery.place}
          AND d."costCOP" = ${delivery.costCOP}
        FOR UPDATE OF d
      )
      INSERT INTO "OrderExternalPayment" ("orderId", "method", "wompiUrl")
      SELECT "orderId", ${method}, ${wompiUrl} FROM agreed
      ON CONFLICT ("orderId") DO UPDATE SET "method" = EXCLUDED."method", "wompiUrl" = EXCLUDED."wompiUrl"
    `;
    if (!saved) return { message: "Los datos de entrega cambiaron o aún no están confirmados." };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) throw error;
    if (error.code === "P2010" && error.meta?.code === "23505") return { message: "Ese enlace ya está vinculado a otro pedido. Genera uno nuevo." };
    if (error.code === "P2010" && error.meta?.code === "23503") return { message: "La entrega cambió. Espera la confirmación del comprador." };
    throw error;
  }
  revalidatePath("/mi-cuenta/pedidos");
  return { ok: true, message: "Guardamos las instrucciones de pago." };
}

export async function confirmExternalPayment(
  orderId: string,
  method: string,
  wompiUrl: string | null,
  expectedAmountCOP: string,
  _previous: PaymentState,
  form: FormData,
): Promise<PaymentState> {
  const actor = await getCurrentIdentity();
  if (!actor?.roles.includes("PRODUCER")) return { message: "Necesitas el perfil de vendedor." };
  if (!await isPaymentReceiptAvailable() || !await isPaymentEventAvailable()) return { message: "Esta opción todavía no está disponible." };
  const paymentReference = parsePaymentReference(form.get("paymentReference"));
  if (form.get("paymentReference") && !paymentReference) {
    return { message: "La referencia debe tener hasta 120 caracteres (letras, números, punto, guion, dos puntos, barra o guion bajo)." };
  }
  const provider = method === "WOMPI" ? "WOMPI" : "MANUAL";
  const [result] = await prisma.$queryRaw<{ eligible: boolean }[]>`
    WITH agreed AS (
      SELECT p."orderId", p."method",
        (round(o."requestedQuantity" * o."priceCOP") + d."costCOP")::bigint AS amount
      FROM "OrderExternalPayment" p
      JOIN "OrderDeliveryDetails" d ON d."orderId" = p."orderId"
      JOIN "Order" o ON o."id" = p."orderId"
      WHERE p."orderId" = ${orderId} AND o."producerId" = ${actor.userId} AND o."status" = 'ACCEPTED'
        AND p."method" = ${method} AND p."wompiUrl" IS NOT DISTINCT FROM ${wompiUrl}::text
        AND round(o."requestedQuantity" * o."priceCOP") + d."costCOP" = ${expectedAmountCOP}::numeric
      FOR UPDATE OF d, p
    ), recorded AS (
      INSERT INTO "OrderPaymentReceipt" ("orderId", "method", "amountCOP")
      SELECT "orderId", "method", amount FROM agreed
      ON CONFLICT ("orderId") DO NOTHING
      RETURNING "orderId", "method", "amountCOP", "confirmedAt"
    ), audited AS (
      INSERT INTO "OrderPaymentEvent" (
        "id", "orderId", "actorId", "provider", "method", "externalReference",
        "amountCOP", "currency", "status", "idempotencyKey", "createdAt"
      )
      SELECT ${randomUUID()}, recorded."orderId", ${actor.userId}, ${provider},
        recorded."method", ${paymentReference}, recorded."amountCOP", 'COP',
        'CONFIRMED', 'manual-confirm:' || recorded."orderId", recorded."confirmedAt"
      FROM recorded
      ON CONFLICT ("orderId", "idempotencyKey") DO NOTHING
      RETURNING "orderId"
    )
    SELECT EXISTS (SELECT 1 FROM audited) AS eligible
  `;
  revalidatePath("/mi-cuenta/pedidos");
  return result.eligible
    ? { ok: true, message: "Registramos tu confirmación del pago." }
    : { message: "El acuerdo cambió o el pedido no está disponible. Revisa el importe antes de confirmar." };
}
