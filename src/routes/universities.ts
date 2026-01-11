import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../lib/db";
import { requireAuth, requireRole, type AppEnv } from "../middleware/auth";

export const universityRoutes = new Hono<AppEnv>();

// Get university dashboard stats
universityRoutes.get("/dashboard", requireAuth, requireRole("UNIVERSITY_ADMIN"), async (c) => {
  const auth = c.get("auth");
  
  const universityAdmin = await db.universityAdmin.findUnique({
    where: { userId: auth.userId },
    include: { university: true }
  });

  if (!universityAdmin) {
    return c.json({ error: "University admin not found" }, 404);
  }

  const universityId = universityAdmin.universityId;

  // Get stats
  const [programs, totalApplications, pendingReview, shortlisted] = await Promise.all([
    db.program.findMany({
      where: { universityId },
      include: {
        employer: true,
        _count: { select: { applications: true } }
      },
      orderBy: { createdAt: "desc" }
    }),
    db.application.count({
      where: { program: { universityId } }
    }),
    db.application.count({
      where: { 
        program: { universityId },
        status: { in: ["SUBMITTED", "UNDER_REVIEW"] }
      }
    }),
    db.application.count({
      where: { 
        program: { universityId },
        status: "SHORTLISTED"
      }
    })
  ]);

  return c.json({
    university: universityAdmin.university,
    stats: {
      totalPrograms: programs.length,
      activePrograms: programs.filter((p: { status: string }) => p.status === "OPEN").length,
      totalApplications,
      pendingReview,
      shortlisted
    },
    programs
  });
});

// Get university programs
universityRoutes.get("/programs", requireAuth, requireRole("UNIVERSITY_ADMIN"), async (c) => {
  const auth = c.get("auth");
  
  const universityAdmin = await db.universityAdmin.findUnique({
    where: { userId: auth.userId }
  });

  if (!universityAdmin) {
    return c.json({ error: "University admin not found" }, 404);
  }

  const programs = await db.program.findMany({
    where: { universityId: universityAdmin.universityId },
    include: {
      employer: true,
      _count: { select: { applications: true } }
    },
    orderBy: { createdAt: "desc" }
  });

  return c.json({ programs });
});

// Create program schema
const createProgramSchema = z.object({
  title: z.string().min(5),
  description: z.string().min(20),
  shortDescription: z.string().optional(),
  employerId: z.string(),
  field: z.string(),
  specialization: z.string().optional(),
  jobRole: z.string(),
  totalSlots: z.number().min(1),
  applicationDeadline: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  durationWeeks: z.number().min(1),
  minEducation: z.string().optional(),
  requiredGrades: z.record(z.string()).optional(),
  additionalRequirements: z.array(z.string()).optional(),
  applicationFee: z.number().min(0).optional(),
  isFunded: z.boolean().optional(),
  stipendAmount: z.number().optional(),
  hasInternship: z.boolean().optional(),
  internshipDuration: z.number().optional(),
  tags: z.array(z.string()).optional()
});

// Create new program
universityRoutes.post(
  "/programs",
  requireAuth,
  requireRole("UNIVERSITY_ADMIN"),
  zValidator("json", createProgramSchema),
  async (c) => {
    const auth = c.get("auth");
    const data = c.req.valid("json");
    
    const universityAdmin = await db.universityAdmin.findUnique({
      where: { userId: auth.userId }
    });

    if (!universityAdmin || !universityAdmin.canManagePrograms) {
      return c.json({ error: "Not authorized to manage programs" }, 403);
    }

    // Generate slug
    const slug = `${data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;

    const program = await db.program.create({
      data: {
        ...data,
        slug,
        universityId: universityAdmin.universityId,
        availableSlots: data.totalSlots,
        applicationDeadline: new Date(data.applicationDeadline),
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        status: "DRAFT"
      },
      include: {
        university: true,
        employer: true
      }
    });

    return c.json({ program }, 201);
  }
);

// Update program
universityRoutes.patch("/programs/:id", requireAuth, requireRole("UNIVERSITY_ADMIN"), async (c) => {
  const auth = c.get("auth");
  const programId = c.req.param("id");
  const data = await c.req.json();
  
  const universityAdmin = await db.universityAdmin.findUnique({
    where: { userId: auth.userId }
  });

  if (!universityAdmin || !universityAdmin.canManagePrograms) {
    return c.json({ error: "Not authorized to manage programs" }, 403);
  }

  // Verify program belongs to this university
  const existingProgram = await db.program.findFirst({
    where: { id: programId, universityId: universityAdmin.universityId }
  });

  if (!existingProgram) {
    return c.json({ error: "Program not found" }, 404);
  }

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

// Publish/unpublish program
universityRoutes.post("/programs/:id/publish", requireAuth, requireRole("UNIVERSITY_ADMIN"), async (c) => {
  const auth = c.get("auth");
  const programId = c.req.param("id");
  
  const universityAdmin = await db.universityAdmin.findUnique({
    where: { userId: auth.userId }
  });

  if (!universityAdmin || !universityAdmin.canManagePrograms) {
    return c.json({ error: "Not authorized to manage programs" }, 403);
  }

  const existingProgram = await db.program.findFirst({
    where: { id: programId, universityId: universityAdmin.universityId }
  });

  if (!existingProgram) {
    return c.json({ error: "Program not found" }, 404);
  }

  const program = await db.program.update({
    where: { id: programId },
    data: { 
      isPublished: !existingProgram.isPublished,
      status: !existingProgram.isPublished ? "OPEN" : "DRAFT"
    }
  });

  return c.json({ program });
});

// Get applications for university programs
universityRoutes.get("/applications", requireAuth, requireRole("UNIVERSITY_ADMIN"), async (c) => {
  const auth = c.get("auth");
  const status = c.req.query("status");
  const programId = c.req.query("programId");
  
  const universityAdmin = await db.universityAdmin.findUnique({
    where: { userId: auth.userId }
  });

  if (!universityAdmin || !universityAdmin.canReviewApplications) {
    return c.json({ error: "Not authorized to review applications" }, 403);
  }

  type WhereClause = {
    program: { universityId: string };
    status?: string;
    programId?: string;
  };

  const whereClause: WhereClause = {
    program: { universityId: universityAdmin.universityId }
  };

  if (status) {
    whereClause.status = status;
  }
  if (programId) {
    whereClause.programId = programId;
  }

  const applications = await db.application.findMany({
    where: whereClause as any,
    include: {
      student: {
        include: {
          user: {
            select: { firstName: true, lastName: true, email: true, avatarUrl: true }
          }
        }
      },
      program: {
        include: { employer: true }
      },
      documents: {
        include: { document: true }
      }
    },
    orderBy: { submittedAt: "desc" }
  });

  return c.json({ applications });
});

// Get single application detail
universityRoutes.get("/applications/:id", requireAuth, requireRole("UNIVERSITY_ADMIN"), async (c) => {
  const auth = c.get("auth");
  const applicationId = c.req.param("id");
  
  const universityAdmin = await db.universityAdmin.findUnique({
    where: { userId: auth.userId }
  });

  if (!universityAdmin) {
    return c.json({ error: "Not authorized" }, 403);
  }

  const application = await db.application.findFirst({
    where: { 
      id: applicationId,
      program: { universityId: universityAdmin.universityId }
    },
    include: {
      student: {
        include: {
          user: true,
          documents: true
        }
      },
      program: {
        include: { employer: true, university: true }
      },
      documents: {
        include: { document: true }
      },
      payments: true
    }
  });

  if (!application) {
    return c.json({ error: "Application not found" }, 404);
  }

  return c.json({ application });
});

// Update application status (review)
const updateApplicationSchema = z.object({
  status: z.enum(["UNDER_REVIEW", "SHORTLISTED", "INTERVIEW_SCHEDULED", "ACCEPTED", "REJECTED"]),
  reviewNotes: z.string().optional(),
  rejectionReason: z.string().optional(),
  interviewDate: z.string().optional()
});

universityRoutes.patch(
  "/applications/:id",
  requireAuth,
  requireRole("UNIVERSITY_ADMIN"),
  zValidator("json", updateApplicationSchema),
  async (c) => {
    const auth = c.get("auth");
    const applicationId = c.req.param("id");
    const data = c.req.valid("json");
    
    const universityAdmin = await db.universityAdmin.findUnique({
      where: { userId: auth.userId }
    });

    if (!universityAdmin || !universityAdmin.canReviewApplications) {
      return c.json({ error: "Not authorized to review applications" }, 403);
    }

    const existingApplication = await db.application.findFirst({
      where: { 
        id: applicationId,
        program: { universityId: universityAdmin.universityId }
      }
    });

    if (!existingApplication) {
      return c.json({ error: "Application not found" }, 404);
    }

    type UpdateData = {
      status: string;
      reviewNotes?: string;
      reviewedBy: string;
      reviewedAt: Date;
      rejectedAt?: Date;
      rejectionReason?: string;
      acceptedAt?: Date;
      interviewDate?: Date;
    };

    const updateData: UpdateData = {
      status: data.status,
      reviewNotes: data.reviewNotes,
      reviewedBy: auth.userId,
      reviewedAt: new Date()
    };

    if (data.status === "REJECTED") {
      updateData.rejectedAt = new Date();
      updateData.rejectionReason = data.rejectionReason;
    }

    if (data.status === "ACCEPTED") {
      updateData.acceptedAt = new Date();
    }

    if (data.status === "INTERVIEW_SCHEDULED" && data.interviewDate) {
      updateData.interviewDate = new Date(data.interviewDate);
    }

    const application = await db.application.update({
      where: { id: applicationId },
      data: updateData as any,
      include: {
        student: {
          include: { user: true }
        },
        program: true
      }
    });

    return c.json({ application });
  }
);

// Get list of employers (for program creation)
universityRoutes.get("/employers", requireAuth, requireRole("UNIVERSITY_ADMIN"), async (c) => {
  const employers = await db.employer.findMany({
    where: { isVerified: true },
    orderBy: { name: "asc" }
  });

  return c.json({ employers });
});
