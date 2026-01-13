import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../lib/db";
import type { AppEnv } from "../middleware/auth";

export const authRoutes = new Hono<AppEnv>();

// Webhook to sync Clerk users to our database
const webhookSchema = z.object({
  type: z.string(),
  data: z.object({
    id: z.string(),
    email_addresses: z.array(z.object({
      email_address: z.string(),
    })),
    first_name: z.string().nullable(),
    last_name: z.string().nullable(),
    image_url: z.string().nullable(),
  }),
});

authRoutes.post("/webhook/clerk", zValidator("json", webhookSchema), async (c) => {
  const body = c.req.valid("json");
  
  const primaryEmail = body.data.email_addresses[0]?.email_address;
  
  if (!primaryEmail) {
    return c.json({ error: "No email found" }, 400);
  }

  switch (body.type) {
    case "user.created": {
      await db.user.create({
        data: {
          clerkId: body.data.id,
          email: primaryEmail,
          firstName: body.data.first_name,
          lastName: body.data.last_name,
          avatarUrl: body.data.image_url,
          role: "STUDENT", // Default role
        },
      });
      break;
    }
    
    case "user.updated": {
      await db.user.update({
        where: { clerkId: body.data.id },
        data: {
          email: primaryEmail,
          firstName: body.data.first_name,
          lastName: body.data.last_name,
          avatarUrl: body.data.image_url,
        },
      });
      break;
    }
    
    case "user.deleted": {
      await db.user.delete({
        where: { clerkId: body.data.id },
      });
      break;
    }
  }

  return c.json({ received: true });
});

// Manual sync endpoint (called from frontend after signup)
const syncSchema = z.object({
  clerkId: z.string(),
  email: z.string().email(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  imageUrl: z.string().nullable(),
});

authRoutes.post("/sync", zValidator("json", syncSchema), async (c) => {
  const body = c.req.valid("json");

  // Check if user already exists
  const existingUser = await db.user.findUnique({
    where: { clerkId: body.clerkId },
  });

  if (existingUser) {
    return c.json({ user: existingUser });
  }

  // Create new user
  const user = await db.user.create({
    data: {
      clerkId: body.clerkId,
      email: body.email,
      firstName: body.firstName,
      lastName: body.lastName,
      avatarUrl: body.imageUrl,
      role: "STUDENT", // Default role
    },
  });

  return c.json({ user });
});

// Get current user profile
authRoutes.get("/me", async (c) => {
  const auth = c.get("auth");
  
  if (!auth) {
    return c.json({ error: "Not authenticated" }, 401);
  }

  const user = await db.user.findUnique({
    where: { id: auth.userId },
    include: {
      student: true,
      universityAdmin: { include: { university: true } },
      employerAdmin: { include: { employer: true } },
    },
  });

  return c.json({ user });
});
