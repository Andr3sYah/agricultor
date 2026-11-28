type ProductPhotoPlaceholderProps = {
  productName: string;
  category: string;
  size?: "card" | "detail";
};

export function ProductPhotoPlaceholder({
  productName,
  category,
  size = "card",
}: ProductPhotoPlaceholderProps) {
  const detail = size === "detail";

  return (
    <div
      aria-label={`Sin foto de ${productName}. Categoría: ${category}.`}
      className={
        detail
          ? "flex min-h-32 w-full max-w-xl items-center gap-4 rounded-2xl border border-border bg-surface-accent px-5 py-4 text-primary sm:min-h-40"
          : "flex size-16 shrink-0 flex-col items-center justify-center rounded-xl border border-border bg-surface-accent text-primary"
      }
      role="img"
    >
      <svg
        aria-hidden="true"
        className={detail ? "size-10 shrink-0 sm:size-12" : "size-6"}
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          d="M20 4c-8-1-16 3-16 9a7 7 0 0 0 7 7c6 0 10-8 9-16Z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
        <path
          d="M7 17c2-3 5-5 9-7"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.7"
        />
      </svg>
      <span className={detail ? "text-sm font-semibold" : "mt-1 text-[10px] font-semibold"}>
        {detail ? `Sin foto · ${category}` : "Sin foto"}
      </span>
    </div>
  );
}
