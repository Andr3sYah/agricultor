import {
  calculateUnitPriceTotal,
  formatAgriculturalValue,
} from "@/features/unit-converter/agricultural-units";

const quantityFormatter = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 });

export function ProductQuantityEstimate({
  quantity,
  unit,
  priceCOP,
}: {
  quantity: string;
  unit: string;
  priceCOP: number;
}) {
  const total = calculateUnitPriceTotal(quantity, String(priceCOP)).value;
  if (total === null) return null;

  return (
    <div className="col-span-2 rounded-2xl border border-primary/15 bg-surface-accent p-4 text-foreground">
      <dt className="text-sm font-bold">
        Total estimado por {quantityFormatter.format(Number(quantity))} {unit}
      </dt>
      <dd className="mt-1 break-words text-lg font-bold text-primary">
        $ {formatAgriculturalValue(total)} COP
      </dd>
    </div>
  );
}
