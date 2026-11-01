import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { auth } from "@/auth";
import { db } from "./db";
import { DomainError, ensure } from "./errors";
import { rateLimit } from "./security";
export async function actor(request?: Request, staff = false, pending = false) {
  if (request && request.method !== "GET") {
    ensure(
      new URL(request.url).origin === process.env.APP_ORIGIN,
      "SERVER_ORIGIN_CONFIG",
      503,
    );
    ensure(
      request.headers.get("origin") === process.env.APP_ORIGIN,
      "INVALID_ORIGIN",
      403,
    );
  }
  const session = await auth();
  ensure(session?.user?.id, "UNAUTHENTICATED", 401);
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  ensure(user && user.status !== "SUSPENDED", "FORBIDDEN", 403);
  if (!pending) ensure(user.status === "ACTIVE", "REGISTRATION_REQUIRED", 403);
  if (staff)
    ensure(
      ["EMPLOYEE", "SUPERVISOR"].includes(user.role),
      "STAFF_REQUIRED",
      403,
    );
  await rateLimit(`user:${user.id}`, 120);
  return user;
}
export function api(fn: (req: Request) => Promise<unknown>) {
  return async (req: Request) => {
    try {
      const result = await fn(req);
      return NextResponse.json(result, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      if (error instanceof DomainError)
        return NextResponse.json(
          {
            error: error.code,
            ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
          },
          {
            status: error.status,
            headers: {
              "Cache-Control": "no-store",
              ...(error.retryAfter
                ? { "Retry-After": String(error.retryAfter) }
                : {}),
            },
          },
        );
      if (error instanceof ZodError)
        return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
      console.error(
        "API_INTERNAL_ERROR",
        error instanceof Error ? error.name : "Unknown",
      );
      return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
    }
  };
}
