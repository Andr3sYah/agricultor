import Link from "next/link";
import { redirect } from "next/navigation";
import { SellerProfileForm } from "@/features/sellers/seller-profile-form";
import { getSellerProfileHref, isSellerProfileAvailable } from "@/features/sellers/seller-profile";
import { getCurrentIdentity } from "@/lib/auth/server";
import { prisma } from "@/lib/db";

export default async function SellerProfileSettings({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const identity = await getCurrentIdentity();
  if (!identity) redirect("/iniciar-sesion");
  if (!identity.roles.includes("PRODUCER")) redirect("/mi-cuenta");
  const returnTo =
    params.returnTo === "/mi-cuenta/productos?intent=sell"
      ? params.returnTo
      : "";
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
      <p>Las ofertas públicas muestran tu teléfono y correo si aceptas compartirlos, y tu municipio y departamento. El barrio o vereda es opcional; también puedes dar permiso por separado para publicar una ubicación exacta. Los datos de entrega de cada pedido se mantienen privados.</p>
      {available ? (
        <SellerProfileForm
          displayName={identity.displayName}
          profile={profile}
          returnTo={returnTo}
        />
      ) : <p>Esta opción todavía no está disponible.</p>}
      {profile?.published && <Link className="inline-flex min-h-11 items-center font-semibold text-emerald-900 underline" href={getSellerProfileHref(profile.id)}>Ver mi perfil público</Link>}
    </main>
  );
}
