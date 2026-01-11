import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../lib/db";
import { requireAuth, requireRole, type AppEnv } from "../middleware/auth";

export const adminRoutes = new Hono<AppEnv>();

// Get admin dashboard stats
adminRoutes.get("/dashboard", requireAuth, requireRole("PLATFORM_ADMIN"), async (c) => {
  const [
    totalUsers,
    totalStudents,
    totalUniversities,
    totalEmployers,
    totalPrograms,
    totalApplications,
    recentApplications
  ] = await Promise.all([
    db.user.count(),
    db.student.count(),
    db.university.count(),
    db.employer.count(),
    db.program.count(),
    db.application.count(),
    db.application.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        student: {
          include: { user: { select: { firstName: true, lastName: true, email: true } } }
        },
        program: { select: { title: true, slug: true } }
      }
    })
  ]);

  // Get application stats by status
  const applicationsByStatus = await db.application.groupBy({
    by: ["status"],
    _count: { status: true }
  });

  return c.json({
    stats: {
      totalUsers,
      totalStudents,
      totalUniversities,
      totalEmployers,
      totalPrograms,
      totalApplications,
      applicationsByStatus: applicationsByStatus.reduce((acc: Record<string, number>, curr: { status: string; _count: { status: number } }) => {
        acc[curr.status] = curr._count.status;
        return acc;
      }, {} as Record<string, number>)
    },
    recentApplications
  });
});

// List all users
adminRoutes.get("/users", requireAuth, requireRole("PLATFORM_ADMIN"), async (c) => {
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const role = c.req.query("role") as "STUDENT" | "UNIVERSITY_ADMIN" | "EMPLOYER_ADMIN" | "PLATFORM_ADMIN" | undefined;
  const search = c.req.query("search");

  const whereClause: {
    role?: "STUDENT" | "UNIVERSITY_ADMIN" | "EMPLOYER_ADMIN" | "PLATFORM_ADMIN";
    OR?: Array<{ email: { contains: string; mode: "insensitive" } } | { firstName: { contains: string; mode: "insensitive" } } | { lastName: { contains: string; mode: "insensitive" } }>;
  } = {};
  
  if (role) whereClause.role = role;
  if (search) {
    whereClause.OR = [
      { email: { contains: search, mode: "insensitive" } },
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } }
    ];
  }

  const [users, total] = await Promise.all([
    db.user.findMany({
      where: whereClause as any,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    }),
    db.user.count({ where: whereClause as any })
  ]);

  return c.json({
    users,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
});

// Get single user
adminRoutes.get("/users/:id", requireAuth, requireRole("PLATFORM_ADMIN"), async (c) => {
  const userId = c.req.param("id");

  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      student: {
        include: {
          applications: { include: { program: true } },
          documents: true
        }
      },
      universityAdmin: { include: { university: true } },
      employerAdmin: { include: { employer: true } }
    }
  });

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({ user });
});

// Update user
const updateUserSchema = z.object({
  role: z.enum(["STUDENT", "UNIVERSITY_ADMIN", "EMPLOYER_ADMIN", "PLATFORM_ADMIN"]).optional(),
  isActive: z.boolean().optional()
});

adminRoutes.patch(
  "/users/:id",
  requireAuth,
  requireRole("PLATFORM_ADMIN"),
  zValidator("json", updateUserSchema),
  async (c) => {
    const userId = c.req.param("id");
    const data = c.req.valid("json");

    const user = await db.user.update({
      where: { id: userId },
      data
    });

    return c.json({ user });
  }
);

// List all universities
adminRoutes.get("/universities", requireAuth, requireRole("PLATFORM_ADMIN"), async (c) => {
  const universities = await db.university.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { programs: true, admins: true } }
    }
  });

  return c.json({ universities });
});

// Create university
const createUniversitySchema = z.object({
  name: z.string().min(2),
  shortName: z.string().optional(),
  description: z.string().optional(),
  website: z.string().url().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional()
});

adminRoutes.post(
  "/universities",
  requireAuth,
  requireRole("PLATFORM_ADMIN"),
  zValidator("json", createUniversitySchema),
  async (c) => {
    const data = c.req.valid("json");

    const university = await db.university.create({
      data: {
        ...data,
        isVerified: true
      }
    });

    return c.json({ university }, 201);
  }
);

// Update university
adminRoutes.patch("/universities/:id", requireAuth, requireRole("PLATFORM_ADMIN"), async (c) => {
  const universityId = c.req.param("id");
  const data = await c.req.json();

  const university = await db.university.update({
    where: { id: universityId },
    data
  });

  return c.json({ university });
});

// List all employers
adminRoutes.get("/employers", requireAuth, requireRole("PLATFORM_ADMIN"), async (c) => {
  const employers = await db.employer.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { programs: true, admins: true } }
    }
  });

  return c.json({ employers });
});

// Create employer
const createEmployerSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  website: z.string().url().optional(),
  industry: z.string().optional(),
  size: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  headquarters: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional()
});

adminRoutes.post(
  "/employers",
  requireAuth,
  requireRole("PLATFORM_ADMIN"),
  zValidator("json", createEmployerSchema),
  async (c) => {
    const data = c.req.valid("json");

    const employer = await db.employer.create({
      data: {
        ...data,
        isVerified: true
      }
    });

    return c.json({ employer }, 201);
  }
);

// Update employer
adminRoutes.patch("/employers/:id", requireAuth, requireRole("PLATFORM_ADMIN"), async (c) => {
  const employerId = c.req.param("id");
  const data = await c.req.json();

  const employer = await db.employer.update({
    where: { id: employerId },
    data
  });

  return c.json({ employer });
});

// List all programs (with admin controls)
adminRoutes.get("/programs", requireAuth, requireRole("PLATFORM_ADMIN"), async (c) => {
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const status = c.req.query("status") as "DRAFT" | "OPEN" | "CLOSED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | undefined;

  const whereClause: {
    status?: "DRAFT" | "OPEN" | "CLOSED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  } = {};
  if (status) whereClause.status = status;

  const [programs, total] = await Promise.all([
    db.program.findMany({
      where: whereClause as any,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        university: { select: { id: true, name: true, shortName: true } },
        employer: { select: { id: true, name: true, industry: true } },
        _count: { select: { applications: true } }
      }
    }),
    db.program.count({ where: whereClause as any })
  ]);

  return c.json({
    programs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
});

// Create program (admin)
adminRoutes.post(
  "/programs",
  requireAuth,
  requireRole("PLATFORM_ADMIN"),
  async (c) => {
    const data = await c.req.json();

    const slug = `${data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;

    const program = await db.program.create({
      data: {
        ...data,
        slug,
        availableSlots: data.totalSlots,
        applicationDeadline: new Date(data.applicationDeadline),
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate)
      },
      include: {
        university: true,
        employer: true
      }
    });

    return c.json({ program }, 201);
  }
);

// Update program (admin)
adminRoutes.patch("/programs/:id", requireAuth, requireRole("PLATFORM_ADMIN"), async (c) => {
  const programId = c.req.param("id");
  const data = await c.req.json();

  const program = await db.program.update({
    where: { id: programId },
    data: {
      ...data,
      applicationDeadline: data.applicationDeadline ? new Date(data.applicationDeadline) : undefined,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined
    },
    include: {
      university: true,
      employer: true
    }
  });

  return c.json({ program });
});

// Delete program (admin only)
adminRoutes.delete("/programs/:id", requireAuth, requireRole("PLATFORM_ADMIN"), async (c) => {
  const programId = c.req.param("id");

  await db.program.delete({
    where: { id: programId }
  });

  return c.json({ success: true });
});

// Assign university admin
const assignUniversityAdminSchema = z.object({
  userId: z.string(),
  universityId: z.string(),
  title: z.string().optional(),
  department: z.string().optional(),
  canManagePrograms: z.boolean().default(true),
  canReviewApplications: z.boolean().default(true)
});

adminRoutes.post(
  "/assign/university-admin",
  requireAuth,
  requireRole("PLATFORM_ADMIN"),
  zValidator("json", assignUniversityAdminSchema),
  async (c) => {
    const data = c.req.valid("json");

    // Update user role
    await db.user.update({
      where: { id: data.userId },
      data: { role: "UNIVERSITY_ADMIN" }
    });

    // Create university admin record
    const universityAdmin = await db.universityAdmin.create({
      data: {
        userId: data.userId,
        universityId: data.universityId,
        title: data.title,
        department: data.department,
        canManagePrograms: data.canManagePrograms,
        canReviewApplications: data.canReviewApplications
      },
      include: {
        user: true,
        university: true
      }
    });

    return c.json({ universityAdmin }, 201);
  }
);

// Assign employer admin
const assignEmployerAdminSchema = z.object({
  userId: z.string(),
  employerId: z.string(),
  title: z.string().optional(),
  department: z.string().optional(),
  canCreatePrograms: z.boolean().default(false),
  canReviewCandidates: z.boolean().default(true),
  canApproveHires: z.boolean().default(false)
});

adminRoutes.post(
  "/assign/employer-admin",
  requireAuth,
  requireRole("PLATFORM_ADMIN"),
  zValidator("json", assignEmployerAdminSchema),
  async (c) => {
    const data = c.req.valid("json");

    // Update user role
    await db.user.update({
      where: { id: data.userId },
      data: { role: "EMPLOYER_ADMIN" }
    });

    // Create employer admin record
    const employerAdmin = await db.employerAdmin.create({
      data: {
        userId: data.userId,
        employerId: data.employerId,
        title: data.title,
        department: data.department,
        canCreatePrograms: data.canCreatePrograms,
        canReviewCandidates: data.canReviewCandidates,
        canApproveHires: data.canApproveHires
      },
      include: {
        user: true,
        employer: true
      }
    });

    return c.json({ employerAdmin }, 201);
  }
);

// Get all applications (admin view)
adminRoutes.get("/applications", requireAuth, requireRole("PLATFORM_ADMIN"), async (c) => {
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const status = c.req.query("status");
  const programId = c.req.query("programId");

  const whereClause: {
    status?: string;
    programId?: string;
  } = {};
  if (status) whereClause.status = status;
  if (programId) whereClause.programId = programId;

  const [applications, total] = await Promise.all([
    db.application.findMany({
      where: whereClause as any,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        student: {
          include: { user: { select: { firstName: true, lastName: true, email: true } } }
        },
        program: {
          include: {
            university: { select: { name: true, shortName: true } },
            employer: { select: { name: true } }
          }
        }
      }
    }),
    db.application.count({ where: whereClause as any })
  ]);

  return c.json({
    applications,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
});
