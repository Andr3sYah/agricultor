"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPublicProductOrderHref } from "@/features/catalog/public-products";
import { getCurrentIdentity } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { decideOrder, requestOrder } from "./order-service";

export type OrderFormState = {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  submittedQuantity?: string;
};

function messageFor(code: string): string {
  switch (code) {
    case "unauthenticated":
      return "Inicia sesión para continuar.";
    case "unauthorized":
      return "Necesitas el perfil correspondiente para continuar.";
    case "invalid":
      return "Revisa los datos del pedido.";
    case "unavailable":
      return "No pudimos reservar esa cantidad. Prueba con una cantidad menor o vuelve al catálogo si la oferta fue retirada.";
    case "price-unavailable":
      return "Esta oferta tiene precio a convenir. Comunícate con el vendedor para negociar y continuar la compra fuera de Agricultor.";
    case "offer-changed":
      return "La oferta cambió. Revisa el precio y la unidad antes de enviar la solicitud otra vez.";
    case "idempotency-conflict":
      return "Esta solicitud ya fue enviada con otros datos. Actualiza el formulario para intentarlo de nuevo.";
    case "not-found":
      return "No encontramos ese pedido en tu cuenta.";
    case "already-decided":
      return "Este pedido ya fue atendido.";
    default:
      return "No pudimos actualizar el pedido.";
  }
}

export async function requestOrderAction(
  _previousState: OrderFormState,
  formData: FormData,
): Promise<OrderFormState> {
  const identity = await getCurrentIdentity();
  const quantity = formData.get("quantity");
  const productId = formData.get("productId");
  const result = await requestOrder(
    identity,
    {
      productId,
      expectedUnit: formData.get("expectedUnit"),
      expectedPriceCOP: formData.get("expectedPriceCOP"),
      quantity,
      idempotencyKey: formData.get("idempotencyKey"),
    },
    prisma,
  );

  if (!result.ok) {
    if (result.code === "offer-changed" && typeof productId === "string") {
      revalidatePath(getPublicProductOrderHref(productId.trim()));
    }
    return {
      message: messageFor(result.code),
      fieldErrors: result.fieldErrors,
      submittedQuantity: typeof quantity === "string" ? quantity.slice(0, 13) : undefined,
    };
  }

  revalidatePath("/catalogo");
  revalidatePath("/mi-cuenta");
  revalidatePath("/mi-cuenta/pedidos");
  revalidatePath("/mi-cuenta/avisos");
  const orderId = encodeURIComponent(result.orderId);
  redirect(`/mi-cuenta/pedidos?registrada=${orderId}#solicitud-${orderId}`);
}

export async function decideOrderAction(
  _previousState: OrderFormState,
  formData: FormData,
): Promise<OrderFormState> {
  const identity = await getCurrentIdentity();
  const result = await decideOrder(
    identity,
    formData.get("orderId"),
    formData.get("decision"),
    prisma,
  );

  if (!result.ok) {
    return { message: messageFor(result.code) };
  }

  revalidatePath("/mi-cuenta/pedidos");
  revalidatePath("/mi-cuenta/avisos");
  revalidatePath("/mi-cuenta");
  revalidatePath("/catalogo");
  return {
    ok: true,
    message:
      formData.get("decision") === "ACCEPTED"
        ? "Aceptamos el pedido y confirmamos la salida de la cantidad reservada."
        : "Rechazamos el pedido y devolvimos la cantidad a disponibilidad.",
  };
}
