import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import {
  createCloudinarySignature,
  getCloudinaryCredentials,
  MAX_PRODUCT_PHOTO_BYTES,
  uploadProductPhotoToCloudinary,
  validateProductPhoto,
} from "./product-photo-upload";

const credentials = {
  cloudName: "test-cloud",
  apiKey: "123456",
  apiSecret: "private-test-secret",
};

const jpegBytes: Uint8Array<ArrayBuffer> = Uint8Array.from([0xff, 0xd8, 0xff, 0x00]);
const pngBytes: Uint8Array<ArrayBuffer> = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const webpBytes: Uint8Array<ArrayBuffer> = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50,
]);

function photo(bytes: Uint8Array<ArrayBuffer>, type: string): File {
  return new File([bytes], "untrusted-filename.svg", { type });
}

describe("Cloudinary product photo upload", () => {
  it("reads either the standard server URL or separate server credentials", () => {
    assert.deepEqual(
      getCloudinaryCredentials({
        CLOUDINARY_URL: "cloudinary://123456:secret%2Fvalue@test-cloud",
      }),
      {
        ok: true,
        credentials: {
          cloudName: "test-cloud",
          apiKey: "123456",
          apiSecret: "secret/value",
        },
      },
    );
    assert.deepEqual(
      getCloudinaryCredentials({
        CLOUDINARY_CLOUD_NAME: "test-cloud",
        CLOUDINARY_API_KEY: "123456",
        CLOUDINARY_API_SECRET: "secret",
      }),
      {
        ok: true,
        credentials: {
          cloudName: "test-cloud",
          apiKey: "123456",
          apiSecret: "secret",
        },
      },
    );
  });

  it("reports missing configuration names without returning credential values", () => {
    assert.deepEqual(getCloudinaryCredentials({}), {
      ok: false,
      missingVariables: [
        "CLOUDINARY_CLOUD_NAME",
        "CLOUDINARY_API_KEY",
        "CLOUDINARY_API_SECRET",
      ],
    });
    assert.deepEqual(
      getCloudinaryCredentials({
        CLOUDINARY_URL: "not-a-cloudinary-url",
        CLOUDINARY_API_SECRET: "secret",
      }),
      { ok: false, missingVariables: ["CLOUDINARY_URL"] },
    );
  });

  it("accepts only bounded JPEG, PNG, and WebP data matching the declared media type", async () => {
    for (const [bytes, type] of [
      [jpegBytes, "image/jpeg"],
      [pngBytes, "image/png"],
      [webpBytes, "image/webp"],
    ] as const) {
      assert.deepEqual(await validateProductPhoto(photo(bytes, type)), { ok: true });
    }

    assert.deepEqual(
      await validateProductPhoto(photo(jpegBytes, "image/png")),
      { ok: false, code: "invalid-type" },
    );
    assert.deepEqual(
      await validateProductPhoto(photo(jpegBytes, "image/svg+xml")),
      { ok: false, code: "invalid-type" },
    );
    assert.deepEqual(
      await validateProductPhoto(
        photo(new Uint8Array(MAX_PRODUCT_PHOTO_BYTES + 1), "image/png"),
      ),
      { ok: false, code: "too-large" },
    );
    assert.deepEqual(await validateProductPhoto(null), { ok: false, code: "missing" });
  });

  it("sends a signed upload to Cloudinary and accepts only its secure image URL", async () => {
    const file = photo(jpegBytes, "image/jpeg");
    const photoUrl =
      "https://res.cloudinary.com/test-cloud/image/upload/v123/products/abc123/main.jpg";
    let requestBody: FormData | undefined;
    let requestUrl = "";
    const result = await uploadProductPhotoToCloudinary({
      productId: "abc123",
      file,
      credentials,
      fetcher: async (input, init) => {
        requestUrl = String(input);
        if (init?.body instanceof FormData) requestBody = init.body;
        return new Response(JSON.stringify({ secure_url: photoUrl }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    assert.deepEqual(result, { ok: true, photoUrl });
    assert.equal(
      requestUrl,
      "https://api.cloudinary.com/v1_1/test-cloud/image/upload",
    );
    assert.equal(requestBody?.get("api_key"), credentials.apiKey);
    assert.equal(requestBody?.get("api_secret"), null);
    assert.equal(requestBody?.get("folder"), "products/abc123");
    assert.equal(requestBody?.get("public_id"), "main");
    assert.equal(requestBody?.get("overwrite"), "true");
    assert.equal(requestBody?.get("file") instanceof File, true);
    assert.equal(String(requestBody?.get("signature")).length, 40);
    assert.equal(
      createCloudinarySignature(
        {
          timestamp: "123",
          public_id: "main",
          overwrite: "true",
          folder: "products/abc123",
        },
        credentials.apiSecret,
      ),
      createHash("sha1")
        .update(
          "folder=products/abc123&overwrite=true&public_id=main&timestamp=123private-test-secret",
        )
        .digest("hex"),
    );
  });

  it("rejects foreign media URLs and reports provider connectivity errors", async () => {
    const file = photo(jpegBytes, "image/jpeg");
    const foreignUrl = await uploadProductPhotoToCloudinary({
      productId: "abc123",
      file,
      credentials,
      fetcher: async () => new Response(
        JSON.stringify({ secure_url: "https://attacker.example/image.jpg" }),
        { status: 200 },
      ),
    });
    assert.deepEqual(foreignUrl, { ok: false, code: "provider" });

    const offline = await uploadProductPhotoToCloudinary({
      productId: "abc123",
      file,
      credentials,
      fetcher: async () => {
        throw new Error("network details must not be returned");
      },
    });
    assert.deepEqual(offline, { ok: false, code: "network" });
  });
});
