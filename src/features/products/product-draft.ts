const PRODUCT_DRAFT_FIELD_LIMITS = {
  name: 100,
  category: 100,
  availableQuantity: 13,
  unit: 30,
  pricingType: 20,
  priceCOP: 16,
  municipality: 100,
} as const;

export type ProductDraftField = keyof typeof PRODUCT_DRAFT_FIELD_LIMITS;
export type ProductDraft = Partial<Record<ProductDraftField, string>>;
type DraftStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export function readProductDraft(
  storage: DraftStorage,
  key: string,
): ProductDraft | null {
  const saved = storage.getItem(key);
  if (!saved) return null;

  let value: unknown;
  try {
    value = JSON.parse(saved);
  } catch {
    storage.removeItem(key);
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    storage.removeItem(key);
    return null;
  }

  const draft: ProductDraft = {};
  for (const [field, limit] of Object.entries(PRODUCT_DRAFT_FIELD_LIMITS)) {
    const candidate = (value as Record<string, unknown>)[field];
    if (typeof candidate === "string" && candidate.length <= limit) {
      draft[field as ProductDraftField] = candidate;
    }
  }
  return Object.keys(draft).length ? draft : null;
}

export function writeProductDraft(
  storage: DraftStorage,
  key: string,
  formData: Pick<FormData, "get">,
) {
  const draft: ProductDraft = {};
  for (const field of Object.keys(PRODUCT_DRAFT_FIELD_LIMITS) as ProductDraftField[]) {
    const value = formData.get(field);
    if (
      typeof value === "string" &&
      value.length <= PRODUCT_DRAFT_FIELD_LIMITS[field]
    ) {
      draft[field] = value;
    }
  }
  storage.setItem(key, JSON.stringify(draft));
}
