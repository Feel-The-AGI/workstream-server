import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../lib/db";
import { requireAuth, requireRole, type AppEnv } from "../middleware/auth";

export const programRoutes = new Hono<AppEnv>();

// List programs (public)
programRoutes.get("/", async (c) => {
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const field = c.req.query("field");
  const status = c.req.query("status") || "OPEN";

  const where = {
    isPublished: true,
    status: status as any,
    ...(field && { field }),
  };

  const [programs, total] = await Promise.all([
    db.program.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { applicationDeadline: "asc" },
      include: {
        university: {
          select: { id: true, name: true, shortName: true, logoUrl: true },
        },
        employer: {
          select: { id: true, name: true, logoUrl: true, industry: true },
        },
        _count: {
          select: { applications: true },
        },
      },
    }),
    db.program.count({ where }),
  ]);

  return c.json({
    programs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Get single program
programRoutes.get("/:slug", async (c) => {
  const slug = c.req.param("slug");

  const program = await db.program.findUnique({
    where: { slug },
    include: {
      university: true,
      employer: {
        select: {
          id: true,
          name: true,
          description: true,
          logoUrl: true,
          industry: true,
          size: true,
          website: true,
        },
      },
    },
  });

  if (!program) {
    return c.json({ error: "Program not found" }, 404);
  }

  return c.json({ program });
});

// Create program (admin/university)
const createProgramSchema = z.object({
  title: z.string().min(5),
  description: z.string().min(50),
  shortDescription: z.string().optional(),
  universityId: z.string(),
  employerId: z.string(),
  field: z.string(),
  specialization: z.string().optional(),
  jobRole: z.string(),
  totalSlots: z.number().min(1),
  applicationDeadline: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  durationWeeks: z.number(),
  minEducation: z.string().optional(),
  requiredGrades: z.record(z.string()).optional(),
  additionalRequirements: z.array(z.string()).optional(),
  applicationFee: z.number().default(0),
  isFunded: z.boolean().default(true),
  stipendAmount: z.number().optional(),
  hasInternship: z.boolean().default(true),
  internshipDuration: z.number().optional(),
  tags: z.array(z.string()).optional(),
});

programRoutes.post(
  "/",
  requireAuth,
  requireRole("PLATFORM_ADMIN", "UNIVERSITY_ADMIN"),
  zValidator("json", createProgramSchema),
  async (c) => {
    const body = c.req.valid("json");

    // Generate slug from title
    const slug = body.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      + "-" + Date.now().toString(36);

    const program = await db.program.create({
      data: {
        ...body,
        slug,
        availableSlots: body.totalSlots,
        applicationDeadline: new Date(body.applicationDeadline),
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        status: "DRAFT",
      },
    });

    return c.json({ program }, 201);
  }
);

// Update program status
programRoutes.patch(
  "/:id/status",
  requireAuth,
  requireRole("PLATFORM_ADMIN", "UNIVERSITY_ADMIN"),
  async (c) => {
    const id = c.req.param("id");
    const { status, isPublished } = await c.req.json();

    const program = await db.program.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(isPublished !== undefined && { isPublished }),
      },
    });

    return c.json({ program });
  }
);

// Get programs by university (for university admins)
programRoutes.get("/university/:universityId", requireAuth, async (c) => {
  const universityId = c.req.param("universityId");

  const programs = await db.program.findMany({
    where: { universityId },
    include: {
      employer: {
        select: { id: true, name: true, logoUrl: true },
      },
      _count: {
        select: { applications: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json({ programs });
});

// Get programs by employer (for employer admins)
programRoutes.get("/employer/:employerId", requireAuth, async (c) => {
  const employerId = c.req.param("employerId");

  const programs = await db.program.findMany({
    where: { employerId },
    include: {
      university: {
        select: { id: true, name: true, shortName: true },
      },
      _count: {
        select: { applications: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json({ programs });
});
