import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { retryDueOrderNotifications } from "@/features/orders/order-notifications";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = Buffer.from(authorization.replace(/^Bearer\s+/i, ""));
  if (!secret || !/^Bearer\s+/i.test(authorization)) return false;
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function retryNotifications(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  try {
    const processed = await retryDueOrderNotifications(prisma);
    return NextResponse.json({ processed });
  } catch {
    console.error("Falló el proceso de reintentos de avisos.", {
      code: "OUTBOX_RETRY_FAILED",
    });
    return NextResponse.json(
      { error: "No se pudieron procesar los avisos." },
      { status: 500 },
    );
  }
}

export const GET = retryNotifications;
export const POST = retryNotifications;
