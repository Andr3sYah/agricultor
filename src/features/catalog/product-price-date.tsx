import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

type Offer = { id: string; priceCOP: number; unit: string };

export async function getProductPriceDates(offers: readonly Offer[]) {
  if (offers.length === 0) return new Map<string, Date>();

  // JSON lookup also works while Neon is still on the schema before this migration.
  const rows = await prisma.$queryRaw<(Offer & { priceDate: Date | null })[]>`
    SELECT p."id", p."priceCOP", p."unit",
      (to_jsonb(p)->>'priceUpdatedAt')::timestamp AT TIME ZONE 'UTC' AS "priceDate"
    FROM "Product" p
    WHERE p."id" IN (${Prisma.join(offers.map(({ id }) => id))})
      AND p."isPublished" AND p."availableQuantity" > 0
  `;
  const currentOffers = new Map(rows.map((row) => [row.id, row]));
  const dates = new Map<string, Date>();
  for (const offer of offers) {
    const row = currentOffers.get(offer.id);
    if (row?.priceDate && row.priceCOP === offer.priceCOP && row.unit === offer.unit) {
      dates.set(offer.id, row.priceDate);
    }
  }
  return dates;
}

const priceDateFormatter = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

export function ProductPriceDate({ date }: { date?: Date }) {
  return (
    <dd className="mt-1 text-xs text-foreground/60 sm:text-sm">
      {date ? (
        <>Precio actualizado el <time dateTime={date.toISOString()}>{priceDateFormatter.format(date)}</time></>
      ) : "Fecha del precio no disponible"}
    </dd>
  );
}
