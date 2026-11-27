import { prisma } from "@/lib/db";

export async function isSellerProfileAvailable() {
  const [schema] = await prisma.$queryRaw<{ available: boolean }[]>`
    SELECT to_regclass('"SellerProfile"') IS NOT NULL AS available
  `;
  return schema.available;
}

export function getSellerProfileHref(id: string) {
  return `/vendedores/${encodeURIComponent(id)}`;
}

export function normalizeSellerPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[ ()-]/g, "");
  if (!normalized) return null;
  const number = normalized.replace(/^\+?57(?=3\d{9}$)/, "");
  return /^3\d{9}$/.test(number) ? `57${number}` : null;
}

export function normalizeSellerEmail(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const email = value.trim().slice(0, 254);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function getSellerContactVisibility(
  form: Pick<FormData, "get">,
  contacts: { whatsapp: string | null; phone: string | null; email: string | null },
) {
  return {
    whatsappPublic: Boolean(contacts.whatsapp && form.get("whatsappPublic") === "on"),
    phonePublic: Boolean(contacts.phone && form.get("phonePublic") === "on"),
    emailPublic: Boolean(contacts.email && form.get("emailPublic") === "on"),
  };
}
