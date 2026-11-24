export type AgriculturalPriceReference = {
  productName: string;
  category: string;
  unit: string;
  market: string;
  priceCOP: number;
  source: string;
  publishedAt: Date;
};

export type PriceReferenceMatch =
  | { status: "available"; reference: AgriculturalPriceReference }
  | { status: "stale"; reference: AgriculturalPriceReference }
  | { status: "ambiguous" | "not-covered" | "disabled" };

function normalized(value: string): string {
  return value.trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es-CO");
}

export function selectAgriculturalPriceReference(
  requested: {
    productName: string;
    category: string;
    unit: string;
    market: string | null;
    enabled: boolean;
  },
  references: AgriculturalPriceReference[],
  now = new Date(),
  maxAgeHours = 48,
): PriceReferenceMatch {
  if (!requested.enabled) return { status: "disabled" };
  if (!requested.market?.trim()) return { status: "not-covered" };

  const matches = references.filter(
    (reference) =>
      normalized(reference.productName) === normalized(requested.productName) &&
      normalized(reference.category) === normalized(requested.category) &&
      normalized(reference.unit) === normalized(requested.unit) &&
      normalized(reference.market) === normalized(requested.market!),
  );
  if (matches.length === 0) return { status: "not-covered" };
  if (matches.length !== 1) return { status: "ambiguous" };

  const [reference] = matches;
  const age = now.getTime() - reference.publishedAt.getTime();
  if (
    !Number.isFinite(reference.priceCOP) ||
    reference.priceCOP <= 0 ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > maxAgeHours * 60 * 60 * 1000
  ) {
    return { status: "stale", reference };
  }
  return { status: "available", reference };
}
