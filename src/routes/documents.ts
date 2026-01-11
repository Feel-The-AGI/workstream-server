import { Hono } from "hono";
import { db } from "../lib/db";
import { requireAuth, type AppEnv } from "../middleware/auth";
import { parseDocumentWithGemini } from "../lib/gemini";

export const documentRoutes = new Hono<AppEnv>();

// List all my documents
documentRoutes.get("/", requireAuth, async (c) => {
  const auth = c.get("auth");

  const student = await db.student.findUnique({
    where: { userId: auth.userId },
  });

  if (!student) {
    return c.json({ documents: [] });
  }

  const documents = await db.document.findMany({
    where: { studentId: student.id },
    orderBy: { uploadedAt: "desc" },
  });

  return c.json({ documents });
});

// Create document from external upload (e.g., Uploadthing)
documentRoutes.post("/", requireAuth, async (c) => {
  const auth = c.get("auth");
  
  const student = await db.student.findUnique({
    where: { userId: auth.userId },
  });

  if (!student) {
    return c.json({ error: "Student profile required" }, 400);
  }

  const body = await c.req.json();
  const { type, name, fileName, fileUrl, fileSize, mimeType } = body;

  if (!fileUrl || !type) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  const document = await db.document.create({
    data: {
      studentId: student.id,
      type: type as any,
      name: name || fileName,
      fileName: fileName || "document",
      fileUrl,
      fileSize: fileSize || 0,
      mimeType: mimeType || "application/pdf",
      verificationStatus: "PENDING",
    },
  });

  // Trigger async document parsing with Gemini
  parseDocumentWithGemini(document.id, fileUrl).catch(console.error);

  return c.json({ document }, 201);
});

// Upload document (placeholder - actual file upload would use cloud storage)
documentRoutes.post("/upload", requireAuth, async (c) => {
  const auth = c.get("auth");
  
  // Get student
  const student = await db.student.findUnique({
    where: { userId: auth.userId },
  });

  if (!student) {
    return c.json({ error: "Student profile required" }, 400);
  }

  const body = await c.req.parseBody();
  const file = body.file as File;
  const type = body.type as string;

  if (!file) {
    return c.json({ error: "No file provided" }, 400);
  }

  // In production, upload to cloud storage (S3, Cloudflare R2, etc.)
  // For now, we'll simulate the upload
  const fileUrl = `https://storage.workstream.com/documents/${student.id}/${Date.now()}-${file.name}`;

  // Create document record
  const document = await db.document.create({
    data: {
      studentId: student.id,
      type: type as any,
      name: file.name,
      fileName: file.name,
      fileUrl,
      fileSize: file.size,
      mimeType: file.type,
      verificationStatus: "PENDING",
    },
  });

  // Trigger async document parsing with Gemini
  // In production, this would be a background job
  parseDocumentWithGemini(document.id, fileUrl).catch(console.error);

  return c.json({ document }, 201);
});

// Get my documents
documentRoutes.get("/my", requireAuth, async (c) => {
  const auth = c.get("auth");

  const student = await db.student.findUnique({
    where: { userId: auth.userId },
  });

  if (!student) {
    return c.json({ documents: [] });
  }

  const documents = await db.document.findMany({
    where: { studentId: student.id },
    orderBy: { uploadedAt: "desc" },
  });

  return c.json({ documents });
});

// Get single document
documentRoutes.get("/:id", requireAuth, async (c) => {
  const auth = c.get("auth");
  const id = c.req.param("id");

  const document = await db.document.findUnique({
    where: { id },
    include: { student: true },
  });

  if (!document) {
    return c.json({ error: "Document not found" }, 404);
  }

  // Verify ownership or admin access
  const user = await db.user.findUnique({
    where: { id: auth.userId },
    include: { student: true },
  });

  if (user?.role === "STUDENT" && document.student.userId !== auth.userId) {
    return c.json({ error: "Not authorized" }, 403);
  }

  return c.json({ document });
});

// Attach document to application
documentRoutes.post("/attach", requireAuth, async (c) => {
  const auth = c.get("auth");
  const { documentId, applicationId, required } = await c.req.json();

  // Verify student owns both
  const student = await db.student.findUnique({
    where: { userId: auth.userId },
  });

  if (!student) {
    return c.json({ error: "Student profile required" }, 400);
  }

  const [document, application] = await Promise.all([
    db.document.findFirst({
      where: { id: documentId, studentId: student.id },
    }),
    db.application.findFirst({
      where: { id: applicationId, studentId: student.id },
    }),
  ]);

  if (!document || !application) {
    return c.json({ error: "Document or application not found" }, 404);
  }

  const attached = await db.applicationDocument.create({
    data: {
      applicationId,
      documentId,
      required: required ?? true,
    },
  });

  return c.json({ attached });
});
