import Link from "next/link";
import { redirect } from "next/navigation";
import { SellerProfileForm } from "@/features/sellers/seller-profile-form";
import { getSellerProfileHref, isSellerProfileAvailable } from "@/features/sellers/seller-profile";
import { getCurrentIdentity } from "@/lib/auth/server";
import { prisma } from "@/lib/db";

export default async function SellerProfileSettings() {
  const identity = await getCurrentIdentity();
  if (!identity) redirect("/iniciar-sesion");
  if (!identity.roles.includes("PRODUCER")) redirect("/mi-cuenta");
  const available = await isSellerProfileAvailable();
  const profile = available
    ? await prisma.sellerProfile.findUnique({ where: { ownerId: identity.userId } })
    : null;

  return (
    <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-8">
      <Link className="inline-flex min-h-11 items-center font-semibold text-emerald-900 underline" href="/mi-cuenta">
        Volver a mi cuenta
      </Link>
      <h1 className="text-3xl font-semibold">Perfil de vendedor</h1>
      <p>Las ofertas públicas muestran tu celular y correo cuando aceptas compartirlos. Por separado, puedes aceptar publicar una ubicación exacta; si no lo haces, solo se muestra el barrio o vereda y el municipio. Los datos exactos de entrega de cada pedido se mantienen privados para las personas autorizadas. No incluyas cédulas ni información de terceros.</p>
      {available ? <SellerProfileForm profile={profile} /> : <p>Esta opción todavía no está disponible.</p>}
      {profile?.published && <Link className="inline-flex min-h-11 items-center font-semibold text-emerald-900 underline" href={getSellerProfileHref(profile.id)}>Ver mi perfil público</Link>}
    </main>
  );
}
