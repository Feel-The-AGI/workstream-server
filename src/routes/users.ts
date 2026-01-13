import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../lib/db";
import { requireAuth, requireRole, type AppEnv } from "../middleware/auth";

export const userRoutes = new Hono<AppEnv>();

// General profile update schema (for onboarding)
const profileUpdateSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  location: z.string().optional(),
  bio: z.string().optional(),
  education: z.object({
    institution: z.string(),
    degree: z.string(),
    fieldOfStudy: z.string(),
    currentYear: z.number(),
    expectedGraduation: z.string(),
    cgpa: z.number(),
  }).optional(),
});

// Get current user profile
userRoutes.get("/profile", requireAuth, async (c) => {
  const auth = c.get("auth");

  const user = await db.user.findUnique({
    where: { id: auth.userId },
    include: {
      student: true,
      universityAdmin: { include: { university: true } },
      employerAdmin: { include: { employer: true } },
    },
  });

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({ profile: user });
});

// Update current user profile
userRoutes.put("/profile", requireAuth, zValidator("json", profileUpdateSchema), async (c) => {
  const auth = c.get("auth");
  const body = c.req.valid("json");

  // Update user basic info
  const updateData: any = {};
  if (body.firstName) updateData.firstName = body.firstName;
  if (body.lastName) updateData.lastName = body.lastName;
  if (body.phone) updateData.phone = body.phone;

  const user = await db.user.update({
    where: { id: auth.userId },
    data: updateData,
    include: { student: true },
  });

  // Create or update student profile if other data provided
  if (body.dateOfBirth || body.location || body.education) {
    const studentData: any = {};
    if (body.dateOfBirth) studentData.dateOfBirth = new Date(body.dateOfBirth);
    if (body.location) studentData.city = body.location;
    if (body.education) {
      studentData.institution = body.education.institution;
      studentData.fieldOfStudy = body.education.fieldOfStudy;
      studentData.graduationYear = new Date(body.education.expectedGraduation).getFullYear();
      studentData.gpa = body.education.cgpa;
      studentData.highestEducation = body.education.degree;
    }
    studentData.profileComplete = true;

    if (user.student) {
      await db.student.update({
        where: { userId: auth.userId },
        data: studentData,
      });
    } else {
      await db.student.create({
        data: {
          userId: auth.userId,
          ...studentData,
        },
      });
    }
  }

  // Fetch updated user with student profile
  const updatedUser = await db.user.findUnique({
    where: { id: auth.userId },
    include: { student: true },
  });

  return c.json({ profile: updatedUser });
});

// Student profile update schema
const studentProfileSchema = z.object({
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  nationality: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  highestEducation: z.string().optional(),
  institution: z.string().optional(),
  graduationYear: z.number().optional(),
  fieldOfStudy: z.string().optional(),
  gpa: z.number().optional(),
  mathGrade: z.string().optional(),
  englishGrade: z.string().optional(),
  scienceGrade: z.string().optional(),
  interestedFields: z.array(z.string()).optional(),
  preferredLocations: z.array(z.string()).optional(),
});

// Create or update student profile
userRoutes.post("/student/profile", requireAuth, zValidator("json", studentProfileSchema), async (c) => {
  const auth = c.get("auth");
  const body = c.req.valid("json");

  // Get user
  const user = await db.user.findUnique({
    where: { id: auth.userId },
    include: { student: true },
  });

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  let student;

  if (user.student) {
    // Update existing profile
    student = await db.student.update({
      where: { userId: auth.userId },
      data: {
        ...body,
        dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : undefined,
        profileComplete: true,
      },
    });
  } else {
    // Create new profile
    student = await db.student.create({
      data: {
        userId: auth.userId,
        ...body,
        dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : undefined,
        profileComplete: true,
      },
    });
  }

  return c.json({ student });
});

// Get student profile
userRoutes.get("/student/profile", requireAuth, async (c) => {
  const auth = c.get("auth");

  const student = await db.student.findUnique({
    where: { userId: auth.userId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
        },
      },
      documents: true,
      applications: {
        include: {
          program: {
            select: {
              id: true,
              title: true,
              field: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!student) {
    return c.json({ error: "Student profile not found" }, 404);
  }

  return c.json({ student });
});

// Admin: List all users
userRoutes.get("/", requireAuth, requireRole("PLATFORM_ADMIN"), async (c) => {
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const role = c.req.query("role");

  const where = role ? { role: role as any } : {};

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
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
        createdAt: true,
      },
    }),
    db.user.count({ where }),
  ]);

  return c.json({
    users,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});
