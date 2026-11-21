import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { RoleName } from "@/generated/prisma/enums";
import {
  assertHasRole,
  AuthenticationRequiredError,
  type UserRole,
} from "@/lib/auth/roles";

export async function getCurrentSession() {
  const requestHeaders = await headers();
  const hasSessionCookie = requestHeaders
    .get("cookie")
    ?.split(";")
    .some((cookie) => {
      const name = cookie.trim().split("=", 1)[0];
      return (
        name === "better-auth.session_token" ||
        name === "__Secure-better-auth.session_token"
      );
    });

  if (!hasSessionCookie) {
    return null;
  }

  return getAuth().api.getSession({
    headers: requestHeaders,
  });
}

export async function getCurrentIdentity(): Promise<{
  userId: string;
  roles: UserRole[];
  displayName: string | null;
} | null> {
  const session = await getCurrentSession();

  if (!session) {
    return null;
  }

  const userRoles = await prisma.userRole.findMany({
    where: { userId: session.user.id },
    select: { role: true },
  });

  const roles = new Set<UserRole>(userRoles.map(({ role }: { role: RoleName }) => role));
  roles.add("BUYER");

  return {
    userId: session.user.id,
    roles: [...roles],
    displayName: session.user.name?.trim() || null,
  };
}

export async function requireRole(requiredRole: UserRole) {
  const identity = await getCurrentIdentity();

  if (!identity) {
    throw new AuthenticationRequiredError();
  }

  assertHasRole(identity.roles, requiredRole);
  return identity;
}
