import { unstable_cache } from "next/cache";
import { getPublicSellerOfferCondition } from "@/features/sellers/seller-contact";
import { prisma } from "@/lib/db";

export const getPublicCatalogMunicipalities = unstable_cache(
  async () => {
    const rows = await prisma.product.findMany({
      where: {
        isPublished: true,
        ...getPublicSellerOfferCondition(),
        OR: [
          { availableQuantity: { gt: 0 } },
          { reservedQuantity: { gt: 0 } },
        ],
        municipality: { not: "" },
      },
      distinct: ["municipality"],
      select: { municipality: true },
      orderBy: { municipality: "asc" },
    });

    return rows.map(({ municipality }) => municipality);
  },
  ["public-catalog-municipalities-v1"],
  { revalidate: 60 },
);
