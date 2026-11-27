import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/catalogo/"],
        disallow: [
          "/api/",
          "/mi-cuenta/",
          "/iniciar-sesion",
          "/crear-cuenta",
          "/recuperar-contrasena",
          "/restablecer-contrasena",
        ],
      },
    ],
    sitemap: "https://agricultor-blond.vercel.app/sitemap.xml",
  };
}
