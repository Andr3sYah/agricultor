"use server";

import { revalidatePath } from "next/cache";
import { getCurrentIdentity } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { isOrderSellerContactAvailable } from "./order-seller-contact";
import { getSellerPhoneForOrderSharing, isSellerProfileAvailable } from "@/features/sellers/seller-profile";

export async function saveOrderSellerContact(
  orderId: string,
  _previous: { message: string; ok?: boolean },
  formData: FormData,
): Promise<{ message: string; ok?: boolean }> {
  const actor = await getCurrentIdentity();
  if (!actor?.roles.includes("PRODUCER")) return { message: "Necesitas el perfil de vendedor." };
  const order = await prisma.order.findFirst({
    where: { id: orderId, producerId: actor.userId, status: "ACCEPTED" },
    select: { id: true },
  });
  if (!order) return { message: "No encontramos ese pedido aceptado en tu cuenta." };
  if (!await isOrderSellerContactAvailable()) return { message: "Esta opción todavía no está disponible." };

  if (formData.get("operation") === "remove") {
    await prisma.orderSellerContact.deleteMany({ where: { orderId: order.id } });
    revalidatePath("/mi-cuenta/pedidos");
    return { ok: true, message: "Dejamos de compartir tu teléfono con este comprador." };
  }
  if (formData.get("operation") !== "share") return { message: "Elige cómo actualizar el contacto del pedido." };
  if (!await isSellerProfileAvailable()) return { message: "Actualiza primero tu perfil de vendedor." };
  const profile = await prisma.sellerProfile.findUnique({
    where: { ownerId: actor.userId },
    select: { phone: true, whatsapp: true, whatsappLink: true, whatsappPublic: true },
  });
  const phone = profile ? getSellerPhoneForOrderSharing(profile) : null;
  if (!phone) return { message: "Registra un teléfono de contacto válido en tu perfil antes de compartirlo." };

  await prisma.orderSellerContact.upsert({
    where: { orderId: order.id },
    create: { orderId: order.id, phone },
    update: { phone },
  });
  revalidatePath("/mi-cuenta/pedidos");
  return { ok: true, message: "Compartimos tu teléfono de contacto con el comprador de este pedido." };
}
