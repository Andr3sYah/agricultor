"use client";

import { useActionState, useState } from "react";
import { createProduct, updateProduct, type ProductFormState } from "./product-actions";
import { PRODUCT_CATEGORIES, PRODUCT_UNITS } from "./product-validation";

export type ProductFormValues = {
  id?: string;
  name: string;
  category: string;
  availableQuantity: string;
  unit: string;
  pricingType: "FIXED" | "NEGOTIABLE";
  priceCOP: string;
  municipality: string;
};

const initialState: ProductFormState = {};

type ProductFormProps = {
  product?: ProductFormValues;
  unitLocked?: boolean;
};

export function ProductForm({ product, unitLocked = false }: ProductFormProps) {
  const [state, action, pending] = useActionState(
    product ? updateProduct : createProduct,
    initialState,
  );
  const [selectedPricingType, setSelectedPricingType] = useState(
    product?.pricingType ?? "FIXED",
  );
  const editing = Boolean(product);
  const values = state.values ?? product;
  const pricingType = selectedPricingType;

  return (
    <form action={action} className="mt-6 space-y-5">
      <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        Las fotos de producto todavía no están disponibles. No se cargará ninguna
        imagen hasta contar con almacenamiento seguro.
      </p>
      {product?.id && <input name="productId" type="hidden" value={product.id} />}
      <div>
        <label className="block text-sm font-medium" htmlFor="name">
          Nombre del producto
        </label>
        <input
          aria-describedby={state.fieldErrors?.name ? "name-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.name)}
          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
          defaultValue={values?.name ?? ""}
          id="name"
          maxLength={100}
          minLength={2}
          name="name"
          required
        />
        {state.fieldErrors?.name && (
          <p className="mt-1 text-sm text-red-800" id="name-error">
            {state.fieldErrors.name}
          </p>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium" htmlFor="category">
          Categoría
        </label>
        <select
          aria-describedby={state.fieldErrors?.category ? "category-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.category)}
          className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
          defaultValue={values?.category ?? ""}
          id="category"
          key={values?.category}
          name="category"
          required
        >
          <option value="">Elige una categoría</option>
          {PRODUCT_CATEGORIES.map((category) => (
            <option key={category.value} value={category.value}>
              {category.label}
            </option>
          ))}
        </select>
        {state.fieldErrors?.category && (
          <p className="mt-1 text-sm text-red-800" id="category-error">
            {state.fieldErrors.category}
          </p>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium" htmlFor="availableQuantity">
          Cantidad disponible
        </label>
        <input
          aria-describedby={
            state.fieldErrors?.availableQuantity
              ? "quantity-hint quantity-error"
              : "quantity-hint"
          }
          aria-invalid={Boolean(state.fieldErrors?.availableQuantity)}
          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
          defaultValue={values?.availableQuantity ?? ""}
          id="availableQuantity"
          inputMode="decimal"
          maxLength={13}
          name="availableQuantity"
          required
          type="text"
        />
        <p className="mt-1 text-sm text-slate-600" id="quantity-hint">
          Por ejemplo, 12,5 si tienes doce kilos y medio.
        </p>
        {state.fieldErrors?.availableQuantity && (
          <p className="mt-1 text-sm text-red-800" id="quantity-error">
            {state.fieldErrors.availableQuantity}
          </p>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium" htmlFor="unit">
          Unidad de medida
        </label>
        <select
          aria-describedby={unitLocked ? "unit-locked" : state.fieldErrors?.unit ? "unit-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.unit)}
          className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
          defaultValue={(unitLocked ? product?.unit : values?.unit) ?? ""}
          disabled={unitLocked}
          id="unit"
          key={unitLocked ? product?.unit : values?.unit}
          name="unit"
          required
        >
          <option value="">Elige una unidad</option>
          {PRODUCT_UNITS.map((unit) => (
            <option key={unit.value} value={unit.value}>
              {unit.label}
            </option>
          ))}
        </select>
        {unitLocked && (
          <>
            <input name="unit" type="hidden" value={product?.unit ?? ""} />
            <p className="mt-1 text-sm text-slate-700" id="unit-locked">
              Responde los pedidos pendientes antes de cambiar la unidad de medida.
            </p>
          </>
        )}
        {state.fieldErrors?.unit && (
          <p className="mt-1 text-sm text-red-800" id="unit-error">
            {state.fieldErrors.unit}
          </p>
        )}
      </div>
      <div>
        <fieldset
          aria-describedby={
            state.fieldErrors?.pricingType ? "pricing-type-error" : undefined
          }
          aria-invalid={Boolean(state.fieldErrors?.pricingType)}
          className="space-y-3"
        >
          <legend className="block text-sm font-medium">Precio de la oferta</legend>
          <label className="flex items-start gap-3 rounded-xl border border-slate-300 p-3">
            <input
              checked={pricingType === "FIXED"}
              className="mt-1 size-4"
              name="pricingType"
              onChange={() => setSelectedPricingType("FIXED")}
              type="radio"
              value="FIXED"
            />
            <span>
              <span className="block font-medium">Indicar un precio</span>
              <span className="text-sm text-slate-600">
                Los compradores pueden enviar solicitudes con el precio publicado.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-slate-300 p-3">
            <input
              checked={pricingType === "NEGOTIABLE"}
              className="mt-1 size-4"
              name="pricingType"
              onChange={() => setSelectedPricingType("NEGOTIABLE")}
              type="radio"
              value="NEGOTIABLE"
            />
            <span>
              <span className="block font-medium">Precio a convenir</span>
              <span className="text-sm text-slate-600">
                El comprador coordinará directamente contigo; la negociación y
                compra continúan fuera de Agricultor.
              </span>
            </span>
          </label>
          {state.fieldErrors?.pricingType && (
            <p className="text-sm text-red-800" id="pricing-type-error">
              {state.fieldErrors.pricingType}
            </p>
          )}
        </fieldset>
      </div>
      {pricingType === "FIXED" && (
        <div>
          <label className="block text-sm font-medium" htmlFor="priceCOP">
            Precio en pesos por unidad (COP)
          </label>
          <input
            aria-describedby={state.fieldErrors?.priceCOP ? "price-hint price-error" : "price-hint"}
            aria-invalid={Boolean(state.fieldErrors?.priceCOP)}
            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
            defaultValue={values?.priceCOP ?? ""}
            id="priceCOP"
            inputMode="numeric"
            maxLength={16}
            name="priceCOP"
            required
            type="text"
          />
          <p className="mt-1 text-sm text-slate-600" id="price-hint">
            Por ejemplo, $2.000 si vendes cada kilo a dos mil pesos.
          </p>
          {state.fieldErrors?.priceCOP && (
            <p className="mt-1 text-sm text-red-800" id="price-error">
              {state.fieldErrors.priceCOP}
            </p>
          )}
        </div>
      )}
      <div>
        <label className="block text-sm font-medium" htmlFor="municipality">
          Municipio o localidad
        </label>
        <input
          aria-describedby={
            state.fieldErrors?.municipality ? "municipality-error" : undefined
          }
          aria-invalid={Boolean(state.fieldErrors?.municipality)}
          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
          defaultValue={values?.municipality ?? ""}
          id="municipality"
          maxLength={100}
          minLength={2}
          name="municipality"
          required
        />
        {state.fieldErrors?.municipality && (
          <p className="mt-1 text-sm text-red-800" id="municipality-error">
            {state.fieldErrors.municipality}
          </p>
        )}
      </div>
      <p className="text-sm text-slate-600">
        La disponibilidad se calcula con la cantidad: más de cero es «Disponible» y
        cero es «Agotado». La publicación se controla por separado.
      </p>
      {state.message && (
        <p
          className={
            state.ok ? "text-sm text-emerald-900" : "text-sm text-red-800"
          }
          role={state.ok ? "status" : "alert"}
        >
          {state.message}
        </p>
      )}
      {state.createdProductId && (
        <a
          className="inline-flex min-h-12 items-center font-semibold text-emerald-900 underline"
          href={`#producto-${state.createdProductId}`}
        >
          Ir al producto guardado para publicarlo
        </a>
      )}
      <button
        className="min-h-12 w-full rounded-xl bg-emerald-800 px-5 py-3 font-semibold text-white hover:bg-emerald-900 disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Guardando..." : editing ? "Guardar cambios" : "Agregar producto"}
      </button>
    </form>
  );
}
