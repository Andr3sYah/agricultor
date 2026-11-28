"use client";

import { useActionState } from "react";
import { ProductPhoto } from "@/features/catalog/product-photo";
import {
  uploadProductPhoto,
  type ProductPhotoUploadState,
} from "./product-actions";

const initialState: ProductPhotoUploadState = {};

type ProductPhotoUploaderProps = {
  productId: string;
  productName: string;
  category: string;
  photoUploadEnabled: boolean;
  photoUrl?: string | null;
};

export function ProductPhotoUploader({
  productId,
  productName,
  category,
  photoUploadEnabled,
  photoUrl,
}: ProductPhotoUploaderProps) {
  const [state, action, pending] = useActionState(uploadProductPhoto, initialState);

  return (
    <section
      aria-label={`Foto opcional de ${productName}`}
      className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">
          Foto del producto <span className="font-normal text-slate-500">(opcional)</span>
        </p>
        <p className="text-xs text-slate-600">JPG, PNG o WebP · máximo 5 MB</p>
      </div>
      <p className="mt-1 text-xs text-slate-600">
        Puedes vender sin foto. La imagen se comparte junto con la oferta pública.
      </p>
      {(state.photoUrl || photoUrl) && (
        <div className="mt-3">
          <ProductPhoto
            category={category}
            photoUrl={state.photoUrl ?? photoUrl}
            productName={productName}
            size="detail"
          />
        </div>
      )}
      {photoUploadEnabled ? (
        <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
          <input name="productId" type="hidden" value={productId} />
          <div className="min-w-0 flex-1">
            <label className="block text-xs font-medium text-slate-700" htmlFor="product-photo">
              {photoUrl || state.photoUrl ? "Cambiar foto" : "Agregar foto"}
            </label>
            <input
              accept="image/jpeg,image/png,image/webp"
              className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm file:mr-2 file:rounded-md file:border-0 file:bg-emerald-50 file:px-2 file:py-1 file:font-semibold file:text-emerald-900"
              id="product-photo"
              name="photo"
              required
              type="file"
            />
          </div>
          <button
            className="min-h-11 rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-60"
            disabled={pending}
            type="submit"
          >
            {pending ? "Subiendo..." : "Subir foto"}
          </button>
        </form>
      ) : (
        <p className="mt-2 text-xs text-slate-600">
          Publica la oferta para agregar una foto; también puedes dejarla sin foto.
        </p>
      )}
      {state.message && (
        <p
          className={`mt-2 text-sm ${state.ok ? "text-emerald-900" : "text-red-800"}`}
          role={state.ok ? "status" : "alert"}
        >
          {state.message}
        </p>
      )}
    </section>
  );
}
