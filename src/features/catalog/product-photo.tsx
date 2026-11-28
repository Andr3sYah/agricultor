import Image from "next/image";
import { ProductPhotoPlaceholder } from "./product-photo-placeholder";

type ProductPhotoProps = {
  productName: string;
  category: string;
  photoUrl?: string | null;
  size?: "card" | "detail";
};

function isCloudinaryPhotoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "res.cloudinary.com" &&
      /^\/[a-z0-9][a-z0-9_-]*\/image\/upload\//i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function getCloudinaryPhotoUrl(value: string, size: "card" | "detail"): string {
  const bounds = size === "detail" ? "w_1200,h_675" : "w_256,h_256";
  return value.replace(
    "/image/upload/",
    `/image/upload/c_limit,${bounds},q_auto,f_auto/`,
  );
}

export function ProductPhoto({
  productName,
  category,
  photoUrl,
  size = "card",
}: ProductPhotoProps) {
  if (!photoUrl || !isCloudinaryPhotoUrl(photoUrl)) {
    return (
      <ProductPhotoPlaceholder
        category={category}
        productName={productName}
        size={size}
      />
    );
  }

  const source = getCloudinaryPhotoUrl(photoUrl, size);

  return size === "detail" ? (
    <div className="relative aspect-[16/9] max-h-56 w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface-accent">
      <Image
        alt={`Foto de ${productName}`}
        className="object-contain"
        fill
        src={source}
        unoptimized
      />
    </div>
  ) : (
    <div className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-border bg-surface-accent">
      <Image
        alt={`Foto de ${productName}`}
        className="object-contain"
        fill
        src={source}
        unoptimized
      />
    </div>
  );
}
