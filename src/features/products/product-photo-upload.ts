import { createHash } from "node:crypto";

export const MAX_PRODUCT_PHOTO_BYTES = 5 * 1024 * 1024;
export const PRODUCT_PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type CloudinaryCredentials = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

export type CloudinaryCredentialsResult =
  | { ok: true; credentials: CloudinaryCredentials }
  | { ok: false; missingVariables: string[] };

export type ProductPhotoValidation =
  | { ok: true }
  | { ok: false; code: "missing" | "too-large" | "invalid-type" };

export type ProductPhotoUploadResult =
  | { ok: true; photoUrl: string }
  | { ok: false; code: "invalid-product" | "network" | "provider" };

function parseCloudinaryUrl(value: string): CloudinaryCredentials | null {
  try {
    const url = new URL(value);
    const cloudName = url.hostname;
    const apiKey = decodeURIComponent(url.username);
    const apiSecret = decodeURIComponent(url.password);

    if (
      url.protocol !== "cloudinary:" ||
      !/^[a-z0-9][a-z0-9_-]*$/i.test(cloudName) ||
      !/^\d+$/.test(apiKey) ||
      !apiSecret ||
      (url.pathname !== "" && url.pathname !== "/") ||
      url.search ||
      url.hash
    ) {
      return null;
    }

    return { cloudName, apiKey, apiSecret };
  } catch {
    return null;
  }
}

export function getCloudinaryCredentials(
  environment: Record<string, string | undefined> = process.env,
): CloudinaryCredentialsResult {
  const cloudinaryUrl = environment.CLOUDINARY_URL?.trim();
  if (cloudinaryUrl) {
    const credentials = parseCloudinaryUrl(cloudinaryUrl);
    return credentials
      ? { ok: true, credentials }
      : { ok: false, missingVariables: ["CLOUDINARY_URL"] };
  }

  const cloudName = environment.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = environment.CLOUDINARY_API_KEY?.trim();
  const apiSecret = environment.CLOUDINARY_API_SECRET?.trim();
  const missingVariables: string[] = [];

  if (!cloudName || !/^[a-z0-9][a-z0-9_-]*$/i.test(cloudName)) {
    missingVariables.push("CLOUDINARY_CLOUD_NAME");
  }
  if (!apiKey || !/^\d+$/.test(apiKey)) {
    missingVariables.push("CLOUDINARY_API_KEY");
  }
  if (!apiSecret) {
    missingVariables.push("CLOUDINARY_API_SECRET");
  }

  if (
    missingVariables.length > 0 ||
    !cloudName ||
    !apiKey ||
    !apiSecret
  ) {
    return { ok: false, missingVariables };
  }

  return {
    ok: true,
    credentials: { cloudName, apiKey, apiSecret },
  };
}

function matchesImageSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (mimeType === "image/webp") {
    return (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }
  return false;
}

export async function validateProductPhoto(
  file: File | null,
): Promise<ProductPhotoValidation> {
  if (!file || file.size === 0) return { ok: false, code: "missing" };
  if (file.size > MAX_PRODUCT_PHOTO_BYTES) {
    return { ok: false, code: "too-large" };
  }
  if (!(PRODUCT_PHOTO_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, code: "invalid-type" };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  return matchesImageSignature(bytes, file.type)
    ? { ok: true }
    : { ok: false, code: "invalid-type" };
}

export function createCloudinarySignature(
  parameters: Record<string, string>,
  apiSecret: string,
): string {
  const canonicalParameters = Object.entries(parameters)
    .filter(([, value]) => value !== "")
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return createHash("sha1")
    .update(`${canonicalParameters}${apiSecret}`)
    .digest("hex");
}

function isCloudinaryPhotoUrl(value: unknown, cloudName: string): value is string {
  if (typeof value !== "string") return false;

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "res.cloudinary.com" &&
      url.pathname.startsWith(`/${cloudName}/image/upload/`)
    );
  } catch {
    return false;
  }
}

export async function uploadProductPhotoToCloudinary(input: {
  productId: string;
  file: File;
  credentials: CloudinaryCredentials;
  fetcher?: typeof fetch;
}): Promise<ProductPhotoUploadResult> {
  if (!/^[a-z0-9_-]{1,128}$/i.test(input.productId)) {
    return { ok: false, code: "invalid-product" };
  }

  const validation = await validateProductPhoto(input.file);
  if (!validation.ok) {
    return { ok: false, code: "provider" };
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  const folder = `products/${input.productId}`;
  const parameters = {
    folder,
    overwrite: "true",
    public_id: "main",
    timestamp,
  };
  const formData = new FormData();
  formData.set("file", input.file, "product-photo");
  formData.set("api_key", input.credentials.apiKey);
  formData.set("folder", folder);
  formData.set("overwrite", "true");
  formData.set("public_id", "main");
  formData.set("timestamp", timestamp);
  formData.set(
    "signature",
    createCloudinarySignature(parameters, input.credentials.apiSecret),
  );

  let response: Response;
  try {
    response = await (input.fetcher ?? fetch)(
      `https://api.cloudinary.com/v1_1/${input.credentials.cloudName}/image/upload`,
      {
        method: "POST",
        body: formData,
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    return { ok: false, code: "network" };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, code: "provider" };
  }
  if (
    !response.ok ||
    typeof payload !== "object" ||
    payload === null ||
    !("secure_url" in payload) ||
    !isCloudinaryPhotoUrl(payload.secure_url, input.credentials.cloudName)
  ) {
    return { ok: false, code: "provider" };
  }

  return { ok: true, photoUrl: payload.secure_url };
}
