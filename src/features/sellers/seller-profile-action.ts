"use server";

import { revalidatePath } from "next/cache";
import { getCurrentIdentity } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import {
  getSellerProfileHref,
  isSellerProfileAvailable,
  normalizeSellerEmail,
  normalizeSellerPhone,
} from "./seller-profile";

type ProfileState = { message: string; ok?: boolean };

export async function saveSellerProfile(_previous: ProfileState, form: FormData): Promise<ProfileState> {
  const identity = await getCurrentIdentity();
  if (!identity?.roles.includes("PRODUCER")) return { message: "Necesitas el perfil de vendedor." };
  if (!await isSellerProfileAvailable()) return { message: "Esta opción todavía no está disponible." };
  const fields = ["name", "description", "municipality"] as const;
  const values = Object.fromEntries(fields.map((field) => {
    const value = form.get(field);
    return [field, typeof value === "string" ? value.trim() : ""];
  })) as Record<(typeof fields)[number], string>;
  if (
    values.name.length < 2 || values.name.length > 80 ||
    values.municipality.length < 2 || values.municipality.length > 100 ||
    !values.description || values.description.length > 600 ||
    fields.some((field) => values[field].includes("\0"))
  ) {
    return { message: "Revisa el nombre, el municipio y la descripción." };
  }
  const rawWhatsapp = form.get("whatsapp");
  const rawPhone = form.get("phone");
  const rawEmail = form.get("email");
  const whatsapp = normalizeSellerPhone(rawWhatsapp);
  const phone = normalizeSellerPhone(rawPhone);
  const email = normalizeSellerEmail(rawEmail);
  if ((typeof rawWhatsapp === "string" && rawWhatsapp.trim() && !whatsapp) ||
      (typeof rawPhone === "string" && rawPhone.trim() && !phone) ||
      (typeof rawEmail === "string" && rawEmail.trim() && !email)) {
    return { message: "Revisa el WhatsApp, el teléfono y el correo." };
  }
  const whatsappPublic = Boolean(whatsapp && form.get("whatsappPublic") === "on");
  const phonePublic = Boolean(phone && form.get("phonePublic") === "on");
  const emailPublic = Boolean(email && form.get("emailPublic") === "on");
  const data = {
    ...values,
    published: form.get("published") === "on",
    whatsapp,
    whatsappPublic,
    phone,
    phonePublic,
    email,
    emailPublic,
  };
  const profile = await prisma.sellerProfile.upsert({
    where: { ownerId: identity.userId },
    create: { ownerId: identity.userId, ...data },
    update: data,
    select: { id: true },
  });
  revalidatePath("/mi-cuenta/perfil-vendedor");
  revalidatePath(getSellerProfileHref(profile.id));
  revalidatePath("/catalogo/[productId]", "page");
  return { ok: true, message: data.published ? "Tu perfil está publicado." : "Guardamos tu perfil como privado." };
}
