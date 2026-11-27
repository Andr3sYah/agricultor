ALTER TABLE "SellerProfile"
ADD COLUMN "whatsappLink" VARCHAR(64);

ALTER TABLE "SellerProfile"
ADD CONSTRAINT "SellerProfile_whatsappLink_check"
CHECK (
  "whatsappLink" IS NULL OR (
    "whatsapp" IS NULL AND
    "whatsappLink" ~ '^https://wa\.me/573[0-9]{9}$'
  )
);
