import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../lib/db";
import { requireAuth, requireRole, type AppEnv } from "../middleware/auth";

export const employerRoutes = new Hono<AppEnv>();

// Get employer dashboard stats
employerRoutes.get("/dashboard", requireAuth, requireRole("EMPLOYER_ADMIN"), async (c) => {
  const auth = c.get("auth");
  
  const employerAdmin = await db.employerAdmin.findUnique({
    where: { userId: auth.userId },
    include: { employer: true }
  });

  if (!employerAdmin) {
    return c.json({ error: "Employer admin not found" }, 404);
  }

  const employerId = employerAdmin.employerId;

  // Get stats
  const [programs, totalCandidates, pendingReview, hired] = await Promise.all([
    db.program.findMany({
      where: { employerId },
      include: {
        university: true,
        _count: { select: { applications: true } }
      },
      orderBy: { createdAt: "desc" }
    }),
    db.application.count({
      where: { program: { employerId } }
    }),
    db.application.count({
      where: { 
        program: { employerId },
        status: "SHORTLISTED"
      }
    }),
    db.application.count({
      where: { 
        program: { employerId },
        status: { in: ["ACCEPTED", "ENROLLED"] }
      }
    })
  ]);

  return c.json({
    employer: employerAdmin.employer,
    stats: {
      totalPrograms: programs.length,
      activePrograms: programs.filter((p: { status: string }) => p.status === "OPEN" || p.status === "IN_PROGRESS").length,
      totalCandidates,
      pendingReview,
      hired
    },
    programs
  });
});

// Get employer programs
employerRoutes.get("/programs", requireAuth, requireRole("EMPLOYER_ADMIN"), async (c) => {
  const auth = c.get("auth");
  
  const employerAdmin = await db.employerAdmin.findUnique({
    where: { userId: auth.userId }
  });

  if (!employerAdmin) {
    return c.json({ error: "Employer admin not found" }, 404);
  }

  const programs = await db.program.findMany({
    where: { employerId: employerAdmin.employerId },
    include: {
      university: true,
      _count: { select: { applications: true } }
    },
    orderBy: { createdAt: "desc" }
  });

  return c.json({ programs });
});

// Get shortlisted candidates (ready for employer review)
employerRoutes.get("/candidates", requireAuth, requireRole("EMPLOYER_ADMIN"), async (c) => {
  const auth = c.get("auth");
  const programId = c.req.query("programId");
  const status = c.req.query("status") || "SHORTLISTED";
  
  const employerAdmin = await db.employerAdmin.findUnique({
    where: { userId: auth.userId }
  });

  if (!employerAdmin || !employerAdmin.canReviewCandidates) {
    return c.json({ error: "Not authorized to review candidates" }, 403);
  }

  type WhereClause = {
    program: { employerId: string };
    status: string;
    programId?: string;
  };

  const whereClause: WhereClause = {
    program: { employerId: employerAdmin.employerId },
    status
  };

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
          },
          documents: true
        }
      },
      program: {
        include: { university: true }
      }
    },
    orderBy: { updatedAt: "desc" }
  });

  return c.json({ candidates: applications });
});

// Get single candidate detail
employerRoutes.get("/candidates/:id", requireAuth, requireRole("EMPLOYER_ADMIN"), async (c) => {
  const auth = c.get("auth");
  const applicationId = c.req.param("id");
  
  const employerAdmin = await db.employerAdmin.findUnique({
    where: { userId: auth.userId }
  });

  if (!employerAdmin) {
    return c.json({ error: "Not authorized" }, 403);
  }

  const application = await db.application.findFirst({
    where: { 
      id: applicationId,
      program: { employerId: employerAdmin.employerId }
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
    return c.json({ error: "Candidate not found" }, 404);
  }

  return c.json({ candidate: application });
});

// Approve/reject candidate
const updateCandidateSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  notes: z.string().optional(),
  interviewScore: z.number().min(0).max(100).optional()
});

employerRoutes.patch(
  "/candidates/:id",
  requireAuth,
  requireRole("EMPLOYER_ADMIN"),
  zValidator("json", updateCandidateSchema),
  async (c) => {
    const auth = c.get("auth");
    const applicationId = c.req.param("id");
    const data = c.req.valid("json");
    
    const employerAdmin = await db.employerAdmin.findUnique({
      where: { userId: auth.userId }
    });

    if (!employerAdmin || !employerAdmin.canApproveHires) {
      return c.json({ error: "Not authorized to approve hires" }, 403);
    }

    const existingApplication = await db.application.findFirst({
      where: { 
        id: applicationId,
        program: { employerId: employerAdmin.employerId }
      }
    });

    if (!existingApplication) {
      return c.json({ error: "Candidate not found" }, 404);
    }

    type UpdateData = {
      status: string;
      interviewNotes?: string;
      interviewScore?: number;
      acceptedAt?: Date;
      rejectedAt?: Date;
      rejectionReason?: string;
    };

    const updateData: UpdateData = {
      status: data.decision === "APPROVE" ? "ACCEPTED" : "REJECTED",
      interviewNotes: data.notes,
      interviewScore: data.interviewScore
    };

    if (data.decision === "APPROVE") {
      updateData.acceptedAt = new Date();
    } else {
      updateData.rejectedAt = new Date();
      updateData.rejectionReason = data.notes;
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

    return c.json({ candidate: application });
  }
);

// Schedule interview
const scheduleInterviewSchema = z.object({
  interviewDate: z.string(),
  notes: z.string().optional()
});

employerRoutes.post(
  "/candidates/:id/interview",
  requireAuth,
  requireRole("EMPLOYER_ADMIN"),
  zValidator("json", scheduleInterviewSchema),
  async (c) => {
    const auth = c.get("auth");
    const applicationId = c.req.param("id");
    const data = c.req.valid("json");
    
    const employerAdmin = await db.employerAdmin.findUnique({
      where: { userId: auth.userId }
    });

    if (!employerAdmin) {
      return c.json({ error: "Not authorized" }, 403);
    }

    const existingApplication = await db.application.findFirst({
      where: { 
        id: applicationId,
        program: { employerId: employerAdmin.employerId }
      }
    });

    if (!existingApplication) {
      return c.json({ error: "Candidate not found" }, 404);
    }

    const application = await db.application.update({
      where: { id: applicationId },
      data: {
        status: "INTERVIEW_SCHEDULED",
        interviewDate: new Date(data.interviewDate),
        interviewNotes: data.notes
      },
      include: {
        student: {
          include: { user: true }
        },
        program: true
      }
    });

    return c.json({ candidate: application });
  }
);

// Get list of universities (for reference)
employerRoutes.get("/universities", requireAuth, requireRole("EMPLOYER_ADMIN"), async (c) => {
  const universities = await db.university.findMany({
    where: { isVerified: true },
    orderBy: { name: "asc" }
  });

  return c.json({ universities });
});
