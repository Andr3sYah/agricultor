export function getPublicAppBaseUrl(): string {
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (host) {
    let url: URL;
    try {
      url = new URL(`https://${host}`);
    } catch {
      throw new Error("La URL pública de la aplicación no es válida.");
    }
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("La URL pública de la aplicación no es válida.");
    }
    return url.origin;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("La URL pública de la aplicación no está configurada.");
  }
  return "http://localhost:3000";
}
