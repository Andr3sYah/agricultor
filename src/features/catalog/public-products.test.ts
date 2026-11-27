import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getCatalogOrderBy,
  getCatalogPageHref,
  getCatalogPagination,
  getPublicProductWhere,
  getPublicProductHref,
  getPublicProductMetadata,
  getPublicProductOrderHref,
  getPublicProducts,
  parseCatalogFilters,
  PUBLIC_CATALOG_PAGE_SIZE,
} from "./public-products";
import { getPublicSellerOfferCondition } from "@/features/sellers/seller-contact";

describe("public catalog projection", () => {
  it("excludes private, withdrawn, and zero-quantity products", () => {
    const products = [
      {
        id: "published-yuca",
        name: "Yuca",
        category: "TUBERS",
        availableQuantity: "4.5",
        unit: "KG",
        priceCOP: 3200,
        municipality: "La Vega",
        isPublished: true,
      },
      {
        id: "private-corn",
        name: "Maíz privado",
        category: "GRAINS",
        availableQuantity: "8",
        unit: "KG",
        priceCOP: 2800,
        municipality: "La Vega",
        isPublished: false,
      },
      {
        id: "withdrawn-beans",
        name: "Fríjol retirado",
        category: "GRAINS",
        availableQuantity: "6",
        unit: "KG",
        priceCOP: 5000,
        municipality: "La Vega",
        isPublished: false,
      },
      {
        id: "sold-out-product",
        name: "Producto agotado",
        category: "OTHER",
        availableQuantity: "0",
        unit: "UNIT",
        priceCOP: 1000,
        municipality: "La Vega",
        isPublished: true,
      },
    ];

    assert.deepEqual(getPublicProducts(products), [
      {
        id: "published-yuca",
        name: "Yuca",
        category: "TUBERS",
        availableQuantity: "4.5",
        unit: "KG",
        priceCOP: 3200,
        municipality: "La Vega",
      },
    ]);
    assert.equal(
      getPublicProductOrderHref(getPublicProducts(products)[0].id),
      "/catalogo/published-yuca/pedido",
    );
    assert.equal(
      getPublicProductHref(getPublicProducts(products)[0].id),
      "/catalogo/published-yuca",
    );
  });

  it("keeps a published product visible when only reserved stock remains", () => {
    const products = [
      {
        id: "reserved-product",
        name: "Yuca reservada",
        category: "TUBERS",
        availableQuantity: "0",
        reservedQuantity: "2.5",
        unit: "KG",
        priceCOP: 3200,
        municipality: "La Vega",
        isPublished: true,
      },
    ];

    assert.deepEqual(getPublicProducts(products).map(({ id }) => id), [
      "reserved-product",
    ]);
  });

  it("returns only approved public fields, even if private fields are present", () => {
    const product = {
      id: "public-yuca-id",
      name: "Yuca",
      category: "TUBERS",
      availableQuantity: "4.5",
      unit: "KG",
      priceCOP: 3200,
      municipality: "La Vega",
      isPublished: true,
      ownerId: "owner-private",
      email: "private@example.test",
      phone: "3000000000",
      preciseAddress: "Dirección privada 123",
    };

    const [publicProduct] = getPublicProducts([product]);

    assert.deepEqual(Object.keys(publicProduct), [
      "id",
      "name",
      "category",
      "availableQuantity",
      "unit",
      "priceCOP",
      "municipality",
    ]);
    assert.equal("ownerId" in publicProduct, false);
    assert.equal("email" in publicProduct, false);
    assert.equal("phone" in publicProduct, false);
    assert.equal("preciseAddress" in publicProduct, false);
  });

  it("builds Open Graph metadata from only the public product fields", () => {
    const privateProduct = {
      id: "shared-yuca",
      name: "Yuca",
      category: "TUBERS",
      availableQuantity: "4.5",
      unit: "KG",
      priceCOP: 3200,
      municipality: "La Vega",
      isPublished: true,
      ownerId: "private-owner",
      preciseAddress: "Dirección privada 123",
    };
    const product = getPublicProducts([
      privateProduct,
    ])[0];
    const metadata = getPublicProductMetadata(
      product,
      new URL("https://agricultor.example"),
    );

    assert.equal(
      metadata.openGraph.url.toString(),
      "https://agricultor.example/catalogo/shared-yuca",
    );
    assert.equal(
      metadata.alternates.canonical.toString(),
      metadata.openGraph.url.toString(),
    );
    assert.match(metadata.title, /Yuca/);
    assert.match(metadata.description, /Tubérculos/);
    assert.match(metadata.description, /4,5 Kilogramo \(kg\) disponibles/);
    assert.match(metadata.description, /La Vega/);
    assert.doesNotMatch(metadata.description, /private-owner|Dirección privada/);
  });
});

describe("public catalog query and pagination", () => {
  it("only exposes offers with explicitly accepted public contact details", () => {
    assert.deepEqual(getPublicSellerOfferCondition(), {
      owner: {
        is: {
          sellerProfile: {
            is: {
              neighborhood: { not: null },
              publicContactConsentAt: { not: null },
              phone: { not: null },
              phonePublic: true,
              email: { not: null },
              emailPublic: true,
            },
          },
        },
      },
    });
  });

  it("trims a name filter and treats SQL pattern characters literally", () => {
    const filters = parseCatalogFilters({ producto: "  Papa %_  " });
    assert.equal(filters.name, "Papa %_");
    assert.deepEqual(getPublicProductWhere(filters).name, {
      contains: "Papa \\%\\_",
      mode: "insensitive",
    });
    for (const producto of [" ", "x".repeat(101), "Papa\0", ["Papa", "Yuca"]]) {
      assert.equal(parseCatalogFilters({ producto }).name, undefined);
    }
  });

  it("round-trips catalog context through a product detail URL", () => {
    const filters = {
      name: "Yuca fresca",
      category: "TUBERS",
      municipality: "San José & La Vega",
      sort: "precio-desc",
      page: 2,
    } as const;
    const detail = new URL(
      getPublicProductHref("shared/yuca", filters),
      "https://agricultor.example",
    );
    assert.equal(detail.pathname, "/catalogo/shared%2Fyuca");
    const restored = parseCatalogFilters(Object.fromEntries(detail.searchParams));
    assert.deepEqual(restored, filters);
    assert.equal(
      getCatalogPageHref(restored, restored.page),
      "/catalogo?producto=Yuca+fresca&categoria=TUBERS&municipio=San+Jos%C3%A9+%26+La+Vega&orden=precio-desc&pagina=2",
    );
    assert.equal(getPublicProductHref("yuca", { page: 1 }), "/catalogo/yuca");
  });

  it("parses optional filters and ignores unknown categories and invalid pages", () => {
    assert.deepEqual(
      parseCatalogFilters({
        categoria: "TUBERS",
        municipio: "  La Vega  ",
        orden: "precio-asc",
        pagina: "3",
      }),
      {
        category: "TUBERS",
        municipality: "La Vega",
        sort: "precio-asc",
        page: 3,
      },
    );
    assert.deepEqual(
      parseCatalogFilters({
        categoria: "inventada",
        municipio: "x".repeat(101),
        orden: "precio-invalido",
        pagina: "-2",
      }),
      {
        category: undefined,
        municipality: undefined,
        sort: undefined,
        page: 1,
      },
    );
    assert.deepEqual(
      parseCatalogFilters({
        categoria: ["TUBERS", "GRAINS"],
        municipio: ["La Vega"],
        orden: ["precio-desc", "precio-asc"],
        pagina: ["2"],
      }),
      {
        category: undefined,
        municipality: undefined,
        sort: undefined,
        page: 1,
      },
    );
  });

  it("breaks ties by product ID for recency and price orders", () => {
    assert.deepEqual(getCatalogOrderBy(undefined), [
      { updatedAt: "desc" },
      { id: "asc" },
    ]);
    assert.deepEqual(getCatalogOrderBy("precio-asc"), [
      { priceCOP: "asc" },
      { id: "asc" },
    ]);
    assert.deepEqual(getCatalogOrderBy("precio-desc"), [
      { priceCOP: "desc" },
      { id: "asc" },
    ]);
  });

  it("always scopes database filters to published products with stock", () => {
    assert.deepEqual(
      getPublicProductWhere({
        category: "FRUITS",
        municipality: "La Vega",
      }),
      {
        isPublished: true,
        ...getPublicSellerOfferCondition(),
        OR: [
          { availableQuantity: { gt: 0 } },
          { reservedQuantity: { gt: 0 } },
        ],
        category: "FRUITS",
        municipality: { equals: "La Vega", mode: "insensitive" },
      },
    );
    assert.deepEqual(getPublicProductWhere({}), {
      isPublished: true,
      ...getPublicSellerOfferCondition(),
      OR: [
        { availableQuantity: { gt: 0 } },
        { reservedQuantity: { gt: 0 } },
      ],
    });
  });

  it("applies a positive stock threshold only within the selected sale unit", () => {
    const filters = parseCatalogFilters({ unidad: "KG", cantidad: "5,125" });
    assert.deepEqual(getPublicProductWhere(filters), {
      isPublished: true,
      ...getPublicSellerOfferCondition(),
      availableQuantity: { gte: "5.125" },
      unit: "KG",
    });
    assert.equal(getCatalogPageHref(filters, 2), "/catalogo?unidad=KG&cantidad=5.125&pagina=2");
    assert.equal(parseCatalogFilters({ cantidad: "5" }).minimumQuantity, undefined);
    assert.equal(parseCatalogFilters({ unidad: "KG", cantidad: "0" }).minimumQuantity, undefined);
    assert.equal(parseCatalogFilters({ unidad: "KG", cantidad: "1.1234" }).minimumQuantity, undefined);
  });

  it("validates and applies inclusive unit-price bounds", () => {
    const filters = parseCatalogFilters({
      precioMin: "2000",
      precioMax: "10000",
      categoria: "FRUITS",
    });

    assert.deepEqual(filters, {
      category: "FRUITS",
      municipality: undefined,
      sort: undefined,
      minimumPrice: 2000,
      maximumPrice: 10000,
      page: 1,
    });
    assert.deepEqual(getPublicProductWhere(filters), {
      isPublished: true,
      ...getPublicSellerOfferCondition(),
      OR: [
        { availableQuantity: { gt: 0 } },
        { reservedQuantity: { gt: 0 } },
      ],
      priceCOP: { gte: 2000, lte: 10000 },
      category: "FRUITS",
    });
    assert.equal(
      getCatalogPageHref(filters, 2),
      "/catalogo?categoria=FRUITS&precioMin=2000&precioMax=10000&pagina=2",
    );
    assert.deepEqual(
      parseCatalogFilters({
        precioMin: "2000",
        precioMax: "10000",
        categoria: "FRUITS",
      }),
      filters,
    );
  });

  it("rejects malformed, out-of-range, repeated, and inverted price bounds", () => {
    for (const searchParams of [
      { precioMin: "0" },
      { precioMax: "2147483648" },
      { precioMin: "2.000" },
      { precioMin: ["1000", "2000"] },
      { precioMin: "5000", precioMax: "1000" },
    ]) {
      const filters = parseCatalogFilters(searchParams);
      assert.ok(filters.priceFilterError);
      assert.equal(filters.minimumPrice, undefined);
      assert.equal(filters.maximumPrice, undefined);
      assert.deepEqual(getPublicProductWhere(filters).priceCOP, undefined);
    }

    assert.deepEqual(parseCatalogFilters({ precioMin: "" }), {
      category: undefined,
      municipality: undefined,
      sort: undefined,
      page: 1,
    });
  });

  it("paginates consistently and clamps pages beyond the available results", () => {
    assert.deepEqual(
      getCatalogPagination(PUBLIC_CATALOG_PAGE_SIZE * 2 + 1, 2),
      {
        page: 2,
        pageCount: 3,
        skip: PUBLIC_CATALOG_PAGE_SIZE,
        take: PUBLIC_CATALOG_PAGE_SIZE,
      },
    );
    assert.deepEqual(getCatalogPagination(1, 99), {
      page: 1,
      pageCount: 1,
      skip: 0,
      take: PUBLIC_CATALOG_PAGE_SIZE,
    });
    assert.deepEqual(getCatalogPagination(0, 1), {
      page: 1,
      pageCount: 1,
      skip: 0,
      take: PUBLIC_CATALOG_PAGE_SIZE,
    });
  });

  it("encodes Spanish filter values and preserves them in pagination links", () => {
    const href = getCatalogPageHref(
      {
        category: "TUBERS",
        municipality: "San José del Guaviare",
        sort: "precio-desc",
      },
      2,
    );
    const query = new URL(href, "https://agricultor.example").searchParams;

    assert.equal(query.get("categoria"), "TUBERS");
    assert.equal(query.get("municipio"), "San José del Guaviare");
    assert.equal(query.get("orden"), "precio-desc");
    assert.equal(query.get("pagina"), "2");
    assert.equal(
      getCatalogPageHref({ category: undefined, municipality: undefined }, 1),
      "/catalogo",
    );
  });
});
