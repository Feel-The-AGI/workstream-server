import { verifyToken } from "@clerk/backend";
import type { Context, Next } from "hono";
import { APIError } from "./error-handler";
import { db } from "../lib/db";

export type AuthContext = {
  userId: string;
  clerkUserId: string;
  role: string;
};

export type AppEnv = {
  Variables: {
    auth: AuthContext;
  };
};

export const requireAuth = async (c: Context<AppEnv>, next: Next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    throw new APIError(401, "Missing or invalid authorization header", "UNAUTHORIZED");
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });
    
    if (!payload.sub) {
      throw new APIError(401, "Invalid token", "INVALID_TOKEN");
    }

    // Get or create user in our database
    const user = await db.user.findUnique({
      where: { clerkId: payload.sub },
    });

    if (!user) {
      throw new APIError(401, "User not found", "USER_NOT_FOUND");
    }

    if (!user.isActive) {
      throw new APIError(403, "Account is deactivated", "ACCOUNT_DEACTIVATED");
    }

    // Set auth context
    c.set("auth", {
      userId: user.id,
      clerkUserId: payload.sub,
      role: user.role,
    });

    await next();
  } catch (error) {
    if (error instanceof APIError) throw error;
    throw new APIError(401, "Invalid or expired token", "INVALID_TOKEN");
  }
};

export const requireRole = (...roles: string[]) => {
  return async (c: Context<AppEnv>, next: Next) => {
    const auth = c.get("auth");
    
    if (!auth) {
      throw new APIError(401, "Not authenticated", "UNAUTHORIZED");
    }

    if (!roles.includes(auth.role)) {
      throw new APIError(403, "Insufficient permissions", "FORBIDDEN");
    }

    await next();
  };
};
