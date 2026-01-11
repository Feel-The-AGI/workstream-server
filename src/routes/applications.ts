import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db } from "../lib/db";
import { requireAuth, type AppEnv } from "../middleware/auth";

export const applicationRoutes = new Hono<AppEnv>();

// Create application
const createApplicationSchema = z.object({
  programId: z.string(),
  motivationLetter: z.string().optional(),
  additionalAnswers: z.record(z.string()).optional(),
});

applicationRoutes.post(
  "/",
  requireAuth,
  zValidator("json", createApplicationSchema),
  async (c) => {
    const auth = c.get("auth");
    const body = c.req.valid("json");

    // Get student
    const student = await db.student.findUnique({
      where: { userId: auth.userId },
    });

    if (!student) {
      return c.json({ error: "Student profile required" }, 400);
    }

    // Check program exists and is open
    const program = await db.program.findUnique({
      where: { id: body.programId },
    });

    if (!program) {
      return c.json({ error: "Program not found" }, 404);
    }

    if (program.status !== "OPEN") {
      return c.json({ error: "Program is not accepting applications" }, 400);
    }

    if (program.availableSlots <= 0) {
      return c.json({ error: "No slots available" }, 400);
    }

    // Check if already applied
    const existing = await db.application.findUnique({
      where: {
        studentId_programId: {
          studentId: student.id,
          programId: body.programId,
        },
      },
    });

    if (existing) {
      return c.json({ error: "Already applied to this program" }, 400);
    }

    // Create application
    const applicationNumber = `WS-${new Date().getFullYear()}-${nanoid(8).toUpperCase()}`;

    const application = await db.application.create({
      data: {
        applicationNumber,
        studentId: student.id,
        programId: body.programId,
        motivationLetter: body.motivationLetter,
        additionalAnswers: body.additionalAnswers,
        status: "DRAFT",
      },
      include: {
        program: {
          select: { title: true, field: true },
        },
      },
    });

    return c.json({ application }, 201);
  }
);

// Submit application
applicationRoutes.post("/:id/submit", requireAuth, async (c) => {
  const auth = c.get("auth");
  const id = c.req.param("id");

  const student = await db.student.findUnique({
    where: { userId: auth.userId },
  });

  if (!student) {
    return c.json({ error: "Student profile required" }, 400);
  }

  const application = await db.application.findFirst({
    where: { id, studentId: student.id },
    include: { program: true },
  });

  if (!application) {
    return c.json({ error: "Application not found" }, 404);
  }

  if (application.status !== "DRAFT") {
    return c.json({ error: "Application already submitted" }, 400);
  }

  // Check if payment is required
  if (application.program.applicationFee > 0) {
    const payment = await db.payment.findFirst({
      where: {
        applicationId: id,
        status: "COMPLETED",
      },
    });

    if (!payment) {
      return c.json({ error: "Payment required before submission" }, 400);
    }
  }

  // Update application status
  const updated = await db.application.update({
    where: { id },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
    },
  });

  return c.json({ application: updated });
});

// Get my applications
applicationRoutes.get("/my", requireAuth, async (c) => {
  const auth = c.get("auth");

  const student = await db.student.findUnique({
    where: { userId: auth.userId },
  });

  if (!student) {
    return c.json({ applications: [] });
  }

  const applications = await db.application.findMany({
    where: { studentId: student.id },
    include: {
      program: {
        include: {
          university: {
            select: { name: true, shortName: true },
          },
          employer: {
            select: { name: true, logoUrl: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json({ applications });
});

// Get single application
applicationRoutes.get("/:id", requireAuth, async (c) => {
  const auth = c.get("auth");
  const id = c.req.param("id");

  const student = await db.student.findUnique({
    where: { userId: auth.userId },
  });

  const application = await db.application.findUnique({
    where: { id },
    include: {
      program: {
        include: {
          university: true,
          employer: true,
        },
      },
      documents: {
        include: { document: true },
      },
      payments: true,
    },
  });

  if (!application) {
    return c.json({ error: "Application not found" }, 404);
  }

  // Ensure student owns this application
  if (student && application.studentId !== student.id) {
    // Check if user is admin/university/employer
    const user = await db.user.findUnique({
      where: { id: auth.userId },
    });

    if (user?.role === "STUDENT") {
      return c.json({ error: "Not authorized" }, 403);
    }
  }

  return c.json({ application });
});

// University: Update application status
applicationRoutes.patch("/:id/review", requireAuth, async (c) => {
  const auth = c.get("auth");
  const id = c.req.param("id");
  const { status, reviewNotes } = await c.req.json();

  // Verify user is university admin
  const user = await db.user.findUnique({
    where: { id: auth.userId },
    include: { universityAdmin: true },
  });

  if (!user?.universityAdmin) {
    return c.json({ error: "Not authorized" }, 403);
  }

  const application = await db.application.update({
    where: { id },
    data: {
      status,
      reviewNotes,
      reviewedBy: auth.userId,
      reviewedAt: new Date(),
      ...(status === "ACCEPTED" && { acceptedAt: new Date() }),
      ...(status === "REJECTED" && { rejectedAt: new Date() }),
    },
  });

  return c.json({ application });
});
