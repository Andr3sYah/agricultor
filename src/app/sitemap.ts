import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { getPublicProductHref } from "@/features/catalog/public-products";
import { getPublicSellerOfferCondition } from "@/features/sellers/seller-contact";

export const dynamic = "force-dynamic";

function getSiteUrl(): URL {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  }
  if (process.env.VERCEL_URL) {
    return new URL(`https://${process.env.VERCEL_URL}`);
  }
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL);
  }
  return new URL("https://agricultor-blond.vercel.app");
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const entries: MetadataRoute.Sitemap = [
    {
      url: siteUrl.origin,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: new URL("/catalogo", siteUrl).toString(),
      changeFrequency: "daily",
      priority: 0.9,
    },
  ];

  const products = await prisma.product.findMany({
    where: {
      isPublished: true,
      ...getPublicSellerOfferCondition(),
      OR: [
        { availableQuantity: { gt: 0 } },
        { reservedQuantity: { gt: 0 } },
      ],
    },
    select: {
      id: true,
      updatedAt: true,
    },
  });

  for (const product of products) {
    entries.push({
      url: new URL(getPublicProductHref(product.id), siteUrl).toString(),
      lastModified: product.updatedAt,
      changeFrequency: "daily",
      priority: 0.8,
    });
  }

  return entries;
}
