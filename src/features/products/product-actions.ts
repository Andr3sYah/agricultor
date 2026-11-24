"use server";

import { Prisma } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";
import {
  getPublicProductHref,
  getPublicProductOrderHref,
} from "@/features/catalog/public-products";
import { getCurrentIdentity } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { canEditProduct, canManageProducts } from "./product-access";
import { updateManualProductPrice } from "./product-price-audit";
import { hasManualPriceReferenceConsent } from "./price-reference";
import {
  parseProductPrice,
  parseProductQuantity,
  PRODUCT_PRICE_ERROR,
  PRODUCT_QUANTITY_ERROR,
  validateProductInput,
  type ProductField,
  type ProductFieldErrors,
} from "./product-validation";

export type ProductFormState = {
  ok?: boolean;
  message?: string;
  fieldErrors?: ProductFieldErrors;
  values?: Partial<Record<ProductField, string>>;
  createdProductId?: string;
};

function productData(data: {
  name: string;
  category: string;
  availableQuantity: string;
  unit: string;
  priceCOP: number;
  municipality: string;
}) {
  return {
    name: data.name,
    category: data.category,
    availableQuantity: new Prisma.Decimal(data.availableQuantity),
    unit: data.unit,
    priceCOP: data.priceCOP,
    municipality: data.municipality,
  };
}

function validationResult(formData: FormData) {
  return validateProductInput(Object.fromEntries(formData.entries()));
}

function revalidatePublicProduct(productId: string) {
  revalidatePath("/catalogo");
  revalidatePath(getPublicProductHref(productId));
  revalidatePath(getPublicProductOrderHref(productId));
}

const MAX_PRODUCT_INVENTORY = new Prisma.Decimal("999999999.999");

function submittedValues(formData: FormData): ProductFormState["values"] {
  const values: Partial<Record<ProductField, string>> = {};
  const fields: ProductField[] = [
    "name", "category", "availableQuantity", "unit", "priceCOP", "municipality",
  ];
  for (const field of fields) {
    const value = formData.get(field);
    if (typeof value === "string") values[field] = value.slice(0, 100);
  }
  return values;
}

export async function createProduct(
  _previousState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const identity = await getCurrentIdentity();
  if (!identity) {
    return { message: "Inicia sesión para gestionar tus productos." };
  }
  if (!canManageProducts(identity.roles)) {
    return { message: "Agrega el perfil de productor para gestionar productos." };
  }

  const result = validationResult(formData);
  if (!result.ok) {
    return {
      message: "Revisa los datos del producto.",
      fieldErrors: result.errors,
      values: submittedValues(formData),
    };
  }

  const product = await prisma.product.create({
    data: {
      ownerId: identity.userId,
      ...productData(result.data),
    },
    select: { id: true },
  });

  revalidatePath("/mi-cuenta");
  revalidatePath("/mi-cuenta/productos");
  return {
    ok: true,
    message: "Guardamos el producto en tu cuenta.",
    createdProductId: product.id,
  };
}

export async function updateProduct(
  _previousState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const identity = await getCurrentIdentity();
  if (!identity) {
    return { message: "Inicia sesión para gestionar tus productos." };
  }
  if (!canManageProducts(identity.roles)) {
    return { message: "Agrega el perfil de productor para gestionar productos." };
  }

  const productId = formData.get("productId");
  if (typeof productId !== "string" || productId.length === 0) {
    return { message: "No encontramos ese producto en tu cuenta." };
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { ownerId: true },
  });

  if (!product || !canEditProduct(identity, product.ownerId)) {
    return { message: "No encontramos ese producto en tu cuenta." };
  }

  const result = validationResult(formData);
  if (!result.ok) {
    return {
      message: "Revisa los datos del producto.",
      fieldErrors: result.errors,
      values: submittedValues(formData),
    };
  }

  const updatedCount = await prisma.$transaction(async (transaction) => {
    const current = await transaction.product.findFirst({
      where: { id: productId, ownerId: identity.userId },
      select: { priceCOP: true },
    });
    if (!current) return 0;

    const updated = await transaction.product.updateMany({
      where: {
        id: productId,
        ownerId: identity.userId,
        priceCOP: current.priceCOP,
        OR: [{ unit: result.data.unit }, { reservedQuantity: 0 }],
        reservedQuantity: {
          lte: MAX_PRODUCT_INVENTORY.minus(
            result.data.availableQuantity,
          ),
        },
      },
      data: productData(result.data),
    });
    if (updated.count !== 1) return 0;

    if (current.priceCOP !== result.data.priceCOP) {
      const appliedAt = new Date();
      await transaction.productPriceChange.create({
        data: {
          productId,
          actorId: identity.userId,
          oldPriceCOP: current.priceCOP,
          newPriceCOP: result.data.priceCOP,
          source: "PRODUCER_MANUAL",
          observedAt: appliedAt,
          appliedAt,
          reason: "Precio confirmado manualmente por el productor.",
        },
        select: { id: true },
      });
    }

    return 1;
  });

  if (updatedCount !== 1) {
    const current = await prisma.product.findFirst({
      where: { id: productId, ownerId: identity.userId },
      select: { unit: true, reservedQuantity: true },
    });
    if (current?.reservedQuantity.gt(0) && current.unit !== result.data.unit) {
      return {
        message: "Revisa los datos del producto.",
        fieldErrors: {
          unit: "Responde los pedidos pendientes antes de cambiar la unidad de medida.",
        },
        values: submittedValues(formData),
      };
    }

    return {
      message:
        "No encontramos ese producto o la cantidad disponible más las reservas supera el inventario permitido.",
      values: submittedValues(formData),
    };
  }

  revalidatePath("/mi-cuenta");
  revalidatePath("/mi-cuenta/productos");
  revalidatePath(`/mi-cuenta/productos/${productId}/editar`);
  revalidatePublicProduct(productId);
  return { ok: true, message: "Actualizamos el producto." };
}

export async function updateProductPrice(
  productId: string,
  unit: string,
  previousPrice: number,
  _previousState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const identity = await getCurrentIdentity();
  if (!identity || !canManageProducts(identity.roles)) {
    return { message: "Necesitas el perfil de productor para cambiar el precio." };
  }

  const priceCOP = parseProductPrice(formData.get("priceCOP"));
  if (priceCOP === null) {
    return {
      fieldErrors: { priceCOP: PRODUCT_PRICE_ERROR },
      values: submittedValues(formData),
    };
  }

  const result = await updateManualProductPrice(
    identity,
    {
      productId,
      unit,
      expectedPriceCOP: previousPrice,
      newPriceCOP: priceCOP,
    },
    prisma,
  );
  if (!result.ok && result.code !== "unauthorized") {
    revalidatePath("/mi-cuenta/productos");
    return {
      message: result.code === "not-found"
        ? "No encontramos ese producto en tu cuenta."
        : "El producto o su precio cambió. Revisa el valor actual antes de guardar.",
    };
  }
  if (!result.ok) {
    return { message: "Necesitas el perfil de productor para cambiar el precio." };
  }

  revalidatePath("/mi-cuenta/productos");
  revalidatePath(`/mi-cuenta/productos/${productId}/editar`);
  revalidatePath("/mi-cuenta/favoritos");
  revalidatePublicProduct(productId);
  return { ok: true, message: "Guardamos el precio." };
}

export async function setProductPriceReferenceOptIn(
  _previousState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const identity = await getCurrentIdentity();
  if (!identity || !canManageProducts(identity.roles)) {
    return { message: "Necesitas el perfil de productor para cambiar esta opción." };
  }

  const productId = formData.get("productId");
  const enabled = formData.get("enabled");
  if (
    typeof productId !== "string" ||
    productId.length === 0 ||
    (enabled !== "true" && enabled !== "false")
  ) {
    return { message: "No pudimos actualizar la opción de referencia." };
  }
  if (
    !hasManualPriceReferenceConsent(
      enabled === "true",
      formData.get("consent"),
    )
  ) {
    return {
      message: "Confirma que usarás las referencias solo para revisión manual.",
    };
  }

  const updated = await prisma.product.updateMany({
    where: { id: productId, ownerId: identity.userId },
    data: {
      priceReferenceEnabled: enabled === "true",
      priceReferenceConsentAt: enabled === "true" ? new Date() : null,
    },
  });
  if (updated.count !== 1) {
    return { message: "No encontramos ese producto en tu cuenta." };
  }

  revalidatePath("/mi-cuenta/productos");
  revalidatePath(`/mi-cuenta/productos/${productId}/editar`);
  return {
    ok: true,
    message: enabled === "true"
      ? "Activamos tu preferencia para revisar referencias manualmente."
      : "Desactivamos tu preferencia para revisar referencias.",
  };
}

export async function updateProductAvailability(
  productId: string,
  unit: string,
  previousQuantity: string,
  _previousState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const identity = await getCurrentIdentity();
  if (!identity || !canManageProducts(identity.roles)) {
    return { message: "Necesitas el perfil de productor para cambiar la cantidad." };
  }

  const quantity = parseProductQuantity(formData.get("availableQuantity"));
  if (quantity === null) {
    return {
      fieldErrors: { availableQuantity: PRODUCT_QUANTITY_ERROR },
      values: submittedValues(formData),
    };
  }

  const availableQuantity = new Prisma.Decimal(quantity);
  const where = { id: productId, ownerId: identity.userId, unit };
  const updated = await prisma.product.updateMany({
    where: {
      ...where,
      availableQuantity: { equals: previousQuantity, not: availableQuantity },
      reservedQuantity: { lte: MAX_PRODUCT_INVENTORY.minus(availableQuantity) },
    },
    data: { availableQuantity },
  });
  if (updated.count === 0) {
    const current = await prisma.product.findFirst({
      where,
      select: { availableQuantity: true, reservedQuantity: true },
    });
    if (current?.availableQuantity.equals(previousQuantity) &&
        current.reservedQuantity.plus(availableQuantity).gt(MAX_PRODUCT_INVENTORY)) {
      return {
        fieldErrors: { availableQuantity: "La cantidad disponible más la reservada supera el límite de inventario." },
        values: submittedValues(formData),
      };
    }
    if (!current?.availableQuantity.equals(availableQuantity)) {
      revalidatePath("/mi-cuenta/productos");
      return { message: "La cantidad o la unidad cambió. Revisa lo disponible antes de guardar." };
    }
  }

  revalidatePath("/mi-cuenta");
  revalidatePath("/mi-cuenta/productos");
  revalidatePath(`/mi-cuenta/productos/${productId}/editar`);
  revalidatePath("/mi-cuenta/favoritos");
  revalidatePublicProduct(productId);
  return { ok: true, message: "Guardamos la cantidad disponible." };
}

export async function setProductPublication(
  _previousState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const identity = await getCurrentIdentity();
  if (!identity) {
    return { message: "Inicia sesión para publicar tus productos." };
  }
  if (!canManageProducts(identity.roles)) {
    return { message: "Agrega el perfil de productor para publicar productos." };
  }

  const productId = formData.get("productId");
  const publishedValue = formData.get("isPublished");
  if (
    typeof productId !== "string" ||
    productId.length === 0 ||
    (publishedValue !== "true" && publishedValue !== "false")
  ) {
    return { message: "No pudimos actualizar la publicación del producto." };
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { ownerId: true },
  });
  if (!product || !canEditProduct(identity, product.ownerId)) {
    return { message: "No encontramos ese producto en tu cuenta." };
  }

  const isPublished = publishedValue === "true";
  const updated = await prisma.product.updateMany({
    where: {
      id: productId,
      ownerId: identity.userId,
      ...(isPublished ? { availableQuantity: { gt: 0 } } : {}),
    },
    data: { isPublished },
  });

  if (updated.count !== 1) {
    return {
      message:
        "No pudimos actualizar el producto. Verifica que sea tuyo y que tenga cantidad disponible para publicarlo.",
    };
  }

  revalidatePath("/mi-cuenta/productos");
  revalidatePublicProduct(productId);
  return {
    ok: true,
    message: isPublished ? "Publicamos el producto." : "Retiramos el producto.",
  };
}
