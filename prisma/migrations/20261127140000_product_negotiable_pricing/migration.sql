CREATE TYPE "ProductPricingType" AS ENUM ('FIXED', 'NEGOTIABLE');

ALTER TABLE "Product"
ADD COLUMN "pricingType" "ProductPricingType" NOT NULL DEFAULT 'FIXED',
ALTER COLUMN "priceCOP" DROP NOT NULL;

ALTER TABLE "Product"
ADD CONSTRAINT "Product_price_pricingType_check"
CHECK (
  ("pricingType" = 'FIXED' AND "priceCOP" IS NOT NULL)
  OR ("pricingType" = 'NEGOTIABLE' AND "priceCOP" IS NULL)
);
