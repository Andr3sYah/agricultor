"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentIdentity } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import {
  getSellerProfileHref,
  getSellerContactVisibility,
  getSellerExactLocationVisibility,
  isSellerProfileAvailable,
  normalizeSellerExactLocation,
  normalizeRequiredSellerContact,
} from "./seller-profile";
import { resolveColombianLocation } from "./colombian-location";

type ProfileState = { message: string; ok?: boolean };

export async function saveSellerProfile(_previous: ProfileState, form: FormData): Promise<ProfileState> {
  const identity = await getCurrentIdentity();
  if (!identity?.roles.includes("PRODUCER")) return { message: "Necesitas el perfil de vendedor." };
  if (!await isSellerProfileAvailable()) return { message: "Esta opción todavía no está disponible." };
  const fields = ["name", "description"] as const;
  const values = Object.fromEntries(fields.map((field) => {
    const value = form.get(field);
    return [field, typeof value === "string" ? value.trim() : ""];
  })) as Record<(typeof fields)[number], string>;
  if (
    values.name.length < 2 || values.name.length > 80 ||
    values.description.length > 600 ||
    fields.some((field) => values[field].includes("\0"))
  ) {
    return { message: "Escribe un nombre válido para tu perfil." };
  }
  const location = resolveColombianLocation(
    form.get("department"),
    form.get("municipality"),
  );
  if (!location) {
    return { message: "Elige un departamento y un municipio de la lista." };
  }
  const contact = normalizeRequiredSellerContact({
    phone: form.get("phone"),
    email: form.get("email"),
    neighborhood: form.get("neighborhood"),
  });
  if (!contact) {
    return { message: "Escribe un celular y un correo válidos. Revisa el barrio si lo agregaste." };
  }
  const { phone, email, neighborhood } = contact;
  const description =
    values.description || "Productor local";
  const rawExactLocation = form.get("exactLocation");
  const exactLocation = normalizeSellerExactLocation(rawExactLocation);
  const publishExactLocation =
    form.get("publishExactLocation") === "on";
  if (
    (typeof rawExactLocation === "string" &&
      rawExactLocation.trim().length > 240) ||
    (publishExactLocation && !exactLocation)
  ) {
    return {
      message: "Escribe una ubicación exacta válida antes de aceptar que sea pública.",
    };
  }
  const exactLocationPublic = getSellerExactLocationVisibility(
    form,
    exactLocation,
  );
  const publishContacts = form.get("publishContacts") === "on";
  const published = form.get("published") === "on" && publishContacts;
  const visibility = getSellerContactVisibility(form, {
    phone,
    email,
  });
  const data = {
    ...values,
    description,
    department: location.department,
    municipality: location.municipality,
    published,
    neighborhood,
    exactLocation,
    exactLocationPublic,
    exactLocationConsentAt:
      exactLocationPublic ? new Date() : null,
    ...visibility,
    phone,
    email,
    publicContactConsentAt: publishContacts ? new Date() : null,
  };
  const profile = await prisma.$transaction(async (transaction) => {
    const savedProfile = await transaction.sellerProfile.upsert({
      where: { ownerId: identity.userId },
      create: { ownerId: identity.userId, ...data },
      update: data,
      select: { id: true },
    });
    if (!publishContacts) {
      await transaction.product.updateMany({
        where: { ownerId: identity.userId, isPublished: true },
        data: { isPublished: false },
      });
    }
    return savedProfile;
  });
  revalidatePath("/mi-cuenta/perfil-vendedor");
  revalidatePath(getSellerProfileHref(profile.id));
  revalidatePath("/catalogo");
  revalidatePath("/catalogo/[productId]", "page");
  revalidatePath("/catalogo/[productId]/pedido", "page");
  const returnTo = form.get("returnTo");
  if (
    publishContacts &&
    returnTo === "/mi-cuenta/productos?intent=sell"
  ) {
    redirect(returnTo);
  }
  return {
    ok: true,
    message: publishContacts
      ? data.published ? "Tu perfil está publicado." : "Guardamos tu perfil como privado."
      : "Guardamos el perfil como privado. Para vender, acepta compartir el teléfono y el correo.",
  };
}
