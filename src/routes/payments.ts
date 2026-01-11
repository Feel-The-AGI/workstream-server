import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../lib/db";
import { requireAuth, type AppEnv } from "../middleware/auth";

export const paymentRoutes = new Hono<AppEnv>();

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const PAYSTACK_BASE_URL = "https://api.paystack.co";

// Paystack response types
interface PaystackInitResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data: {
    status: string;
    channel: string;
    amount: number;
    metadata: {
      paymentId?: string;
      applicationId?: string;
    };
    reference: string;
  };
}

// Initialize payment
const initializePaymentSchema = z.object({
  applicationId: z.string(),
  callbackUrl: z.string().url().optional(),
});

paymentRoutes.post(
  "/initialize",
  requireAuth,
  zValidator("json", initializePaymentSchema),
  async (c) => {
    const auth = c.get("auth");
    const { applicationId, callbackUrl } = c.req.valid("json");

    // Get student
    const student = await db.student.findUnique({
      where: { userId: auth.userId },
      include: { user: true },
    });

    if (!student) {
      return c.json({ error: "Student profile required" }, 400);
    }

    // Get application
    const application = await db.application.findFirst({
      where: { id: applicationId, studentId: student.id },
      include: { program: true },
    });

    if (!application) {
      return c.json({ error: "Application not found" }, 404);
    }

    // Check if already paid
    const existingPayment = await db.payment.findFirst({
      where: { applicationId, status: "COMPLETED" },
    });

    if (existingPayment) {
      return c.json({ error: "Payment already completed" }, 400);
    }

    const amount = application.program.applicationFee;

    if (amount <= 0) {
      return c.json({ error: "No payment required for this program" }, 400);
    }

    // Create pending payment record
    const payment = await db.payment.create({
      data: {
        studentId: student.id,
        applicationId,
        amount,
        currency: "GHS",
        description: `Application fee for ${application.program.title}`,
        paymentProvider: "paystack",
        status: "PENDING",
      },
    });

    // Initialize Paystack transaction
    const paystackResponse = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: student.user.email,
        amount: Math.round(amount * 100), // Paystack expects amount in pesewas
        currency: "GHS",
        reference: payment.id,
        callback_url: callbackUrl || `${process.env.FRONTEND_URL || "http://localhost:3001"}/payments/callback`,
        metadata: {
          paymentId: payment.id,
          applicationId,
          studentId: student.id,
          programTitle: application.program.title,
        },
      }),
    });

    const paystackData = await paystackResponse.json() as PaystackInitResponse;

    if (!paystackData.status) {
      // Clean up pending payment
      await db.payment.delete({ where: { id: payment.id } });
      return c.json({ error: paystackData.message || "Failed to initialize payment" }, 500);
    }

    // Update payment with provider reference
    await db.payment.update({
      where: { id: payment.id },
      data: { providerRef: paystackData.data.reference },
    });

    return c.json({
      payment: {
        id: payment.id,
        amount,
        currency: "GHS",
      },
      paystack: {
        authorization_url: paystackData.data.authorization_url,
        access_code: paystackData.data.access_code,
        reference: paystackData.data.reference,
      },
    });
  }
);

// Verify payment
paymentRoutes.get("/verify/:reference", requireAuth, async (c) => {
  const reference = c.req.param("reference");

  // Verify with Paystack
  const paystackResponse = await fetch(`${PAYSTACK_BASE_URL}/transaction/verify/${reference}`, {
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
    },
  });

  const paystackData = await paystackResponse.json() as PaystackVerifyResponse;

  if (!paystackData.status) {
    return c.json({ error: "Payment verification failed" }, 400);
  }

  const transaction = paystackData.data;
  const paymentId = transaction.metadata?.paymentId || reference;

  // Update payment record
  const payment = await db.payment.update({
    where: { id: paymentId },
    data: {
      status: transaction.status === "success" ? "COMPLETED" : "FAILED",
      paymentMethod: transaction.channel,
      paidAt: transaction.status === "success" ? new Date() : null,
    },
    include: { application: true },
  });

  // If payment successful, update application
  if (transaction.status === "success" && payment.application) {
    await db.application.update({
      where: { id: payment.applicationId! },
      data: {
        // Application is now ready for review
        status: payment.application.status === "DRAFT" ? "SUBMITTED" : payment.application.status,
        submittedAt: payment.application.status === "DRAFT" ? new Date() : payment.application.submittedAt,
      },
    });
  }

  return c.json({
    payment: {
      id: payment.id,
      status: payment.status,
      amount: payment.amount,
      paidAt: payment.paidAt,
    },
    transaction: {
      status: transaction.status,
      channel: transaction.channel,
      amount: transaction.amount / 100, // Convert from pesewas
    },
  });
});

// Paystack webhook
paymentRoutes.post("/webhook", async (c) => {
  const signature = c.req.header("x-paystack-signature");
  const body = await c.req.text();

  // Verify webhook signature
  const crypto = await import("crypto");
  const hash = crypto.createHmac("sha512", PAYSTACK_SECRET_KEY).update(body).digest("hex");

  if (hash !== signature) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const event = JSON.parse(body);

  if (event.event === "charge.success") {
    const transaction = event.data;
    const paymentId = transaction.metadata?.paymentId || transaction.reference;

    // Update payment
    await db.payment.update({
      where: { id: paymentId },
      data: {
        status: "COMPLETED",
        paymentMethod: transaction.channel,
        paidAt: new Date(),
      },
    });

    // Get payment to update application
    const payment = await db.payment.findUnique({
      where: { id: paymentId },
      include: { application: true },
    });

    if (payment?.application && payment.application.status === "DRAFT") {
      await db.application.update({
        where: { id: payment.applicationId! },
        data: {
          status: "SUBMITTED",
          submittedAt: new Date(),
        },
      });
    }
  }

  return c.json({ received: true });
});

// Get payment history
paymentRoutes.get("/history", requireAuth, async (c) => {
  const auth = c.get("auth");

  const student = await db.student.findUnique({
    where: { userId: auth.userId },
  });

  if (!student) {
    return c.json({ payments: [] });
  }

  const payments = await db.payment.findMany({
    where: { studentId: student.id },
    include: {
      application: {
        include: { program: { select: { title: true, slug: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json({ payments });
});

// Get single payment
paymentRoutes.get("/:id", requireAuth, async (c) => {
  const auth = c.get("auth");
  const paymentId = c.req.param("id");

  const student = await db.student.findUnique({
    where: { userId: auth.userId },
  });

  if (!student) {
    return c.json({ error: "Not authorized" }, 403);
  }

  const payment = await db.payment.findFirst({
    where: { id: paymentId, studentId: student.id },
    include: {
      application: {
        include: { program: true },
      },
    },
  });

  if (!payment) {
    return c.json({ error: "Payment not found" }, 404);
  }

  return c.json({ payment });
});
