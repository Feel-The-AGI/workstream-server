import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../lib/db";
import { requireAuth, type AppEnv } from "../middleware/auth";

export const notificationRoutes = new Hono<AppEnv>();

// Get all notifications
notificationRoutes.get("/", requireAuth, async (c) => {
  const auth = c.get("auth");
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const unreadOnly = c.req.query("unread") === "true";

  const whereClause: { userId: string; isRead?: boolean } = { userId: auth.userId };
  if (unreadOnly) {
    whereClause.isRead = false;
  }

  const [notifications, total] = await Promise.all([
    db.notification.findMany({
      where: whereClause as any,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.notification.count({ where: whereClause }),
  ]);

  return c.json({
    notifications,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Get unread count
notificationRoutes.get("/unread-count", requireAuth, async (c) => {
  const auth = c.get("auth");

  const count = await db.notification.count({
    where: {
      userId: auth.userId,
      isRead: false,
    },
  });

  return c.json({ count });
});

// Mark notification as read
notificationRoutes.post("/:id/read", requireAuth, async (c) => {
  const auth = c.get("auth");
  const notificationId = c.req.param("id");

  const notification = await db.notification.findFirst({
    where: {
      id: notificationId,
      userId: auth.userId,
    },
  });

  if (!notification) {
    return c.json({ error: "Notification not found" }, 404);
  }

  await db.notification.update({
    where: { id: notificationId },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });

  return c.json({ success: true });
});

// Mark all notifications as read
notificationRoutes.post("/mark-all-read", requireAuth, async (c) => {
  const auth = c.get("auth");

  await db.notification.updateMany({
    where: {
      userId: auth.userId,
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });

  return c.json({ success: true });
});

// Delete notification
notificationRoutes.delete("/:id", requireAuth, async (c) => {
  const auth = c.get("auth");
  const notificationId = c.req.param("id");

  const notification = await db.notification.findFirst({
    where: {
      id: notificationId,
      userId: auth.userId,
    },
  });

  if (!notification) {
    return c.json({ error: "Notification not found" }, 404);
  }

  await db.notification.delete({
    where: { id: notificationId },
  });

  return c.json({ success: true });
});

// Create notification (internal use for system notifications)
const createNotificationSchema = z.object({
  userId: z.string(),
  title: z.string(),
  message: z.string(),
  type: z.string(),
  actionUrl: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// Helper function to create notifications (used by other services)
export async function createNotification(data: {
  userId: string;
  title: string;
  message: string;
  type: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}) {
  return db.notification.create({
    data: {
      userId: data.userId,
      title: data.title,
      message: data.message,
      type: data.type,
      actionUrl: data.actionUrl,
      metadata: data.metadata as any,
    },
  });
}

// Send email notification using Resend (if configured)
export async function sendEmailNotification(
  email: string,
  subject: string,
  htmlContent: string
) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  
  if (!RESEND_API_KEY) {
    console.log("Resend API key not configured, skipping email notification");
    return null;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "Workstream <noreply@workstream.com>",
        to: email,
        subject,
        html: htmlContent,
      }),
    });

    if (!response.ok) {
      console.error("Failed to send email:", await response.text());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Error sending email:", error);
    return null;
  }
}

// Notification templates
export const notificationTemplates = {
  applicationSubmitted: (programTitle: string) => ({
    title: "Application Submitted",
    message: `Your application for "${programTitle}" has been submitted successfully.`,
    type: "application",
  }),
  
  applicationStatusChange: (programTitle: string, newStatus: string) => ({
    title: "Application Status Update",
    message: `Your application for "${programTitle}" has been updated to: ${newStatus}`,
    type: "application",
  }),
  
  interviewScheduled: (programTitle: string, date: string) => ({
    title: "Interview Scheduled",
    message: `An interview has been scheduled for your application to "${programTitle}" on ${date}.`,
    type: "application",
  }),
  
  applicationAccepted: (programTitle: string) => ({
    title: "Congratulations! Application Accepted",
    message: `Great news! Your application for "${programTitle}" has been accepted.`,
    type: "application",
  }),
  
  applicationRejected: (programTitle: string) => ({
    title: "Application Update",
    message: `We regret to inform you that your application for "${programTitle}" was not successful.`,
    type: "application",
  }),
  
  paymentReceived: (amount: number, programTitle: string) => ({
    title: "Payment Received",
    message: `Your payment of GHS ${amount.toFixed(2)} for "${programTitle}" has been received.`,
    type: "payment",
  }),
  
  documentVerified: (documentName: string) => ({
    title: "Document Verified",
    message: `Your document "${documentName}" has been verified successfully.`,
    type: "document",
  }),
  
  newMessage: (senderName: string) => ({
    title: "New Message",
    message: `You have a new message from ${senderName}.`,
    type: "message",
  }),
};

// Email templates
export const emailTemplates = {
  applicationSubmitted: (userName: string, programTitle: string) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #f59e0b;">Application Submitted</h1>
      <p>Dear ${userName},</p>
      <p>Your application for <strong>${programTitle}</strong> has been submitted successfully.</p>
      <p>We will review your application and get back to you soon.</p>
      <p>Best regards,<br>The Workstream Team</p>
    </div>
  `,
  
  applicationAccepted: (userName: string, programTitle: string) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #10b981;">Congratulations!</h1>
      <p>Dear ${userName},</p>
      <p>We are delighted to inform you that your application for <strong>${programTitle}</strong> has been <strong>accepted</strong>!</p>
      <p>Please log in to your Workstream account for next steps.</p>
      <p>Best regards,<br>The Workstream Team</p>
    </div>
  `,
  
  interviewScheduled: (userName: string, programTitle: string, date: string, time: string) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #3b82f6;">Interview Scheduled</h1>
      <p>Dear ${userName},</p>
      <p>An interview has been scheduled for your application to <strong>${programTitle}</strong>.</p>
      <p><strong>Date:</strong> ${date}<br><strong>Time:</strong> ${time}</p>
      <p>Please log in to your Workstream account for more details.</p>
      <p>Best regards,<br>The Workstream Team</p>
    </div>
  `,
};
