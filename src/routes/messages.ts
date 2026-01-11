import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../lib/db";
import { requireAuth, type AppEnv } from "../middleware/auth";

export const messageRoutes = new Hono<AppEnv>();

// Get conversations (grouped by user)
messageRoutes.get("/conversations", requireAuth, async (c) => {
  const auth = c.get("auth");

  // Get unique conversations
  const messages = await db.message.findMany({
    where: {
      OR: [{ senderId: auth.userId }, { receiverId: auth.userId }],
    },
    include: {
      sender: {
        select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true, role: true },
      },
      receiver: {
        select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true, role: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Group by conversation partner
  const conversationsMap = new Map<string, {
    partnerId: string;
    partner: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
      avatarUrl: string | null;
      role: string;
    };
    lastMessage: {
      id: string;
      content: string;
      createdAt: Date;
      isRead: boolean;
    };
    unreadCount: number;
  }>();

  for (const msg of messages) {
    const partnerId = msg.senderId === auth.userId ? msg.receiverId : msg.senderId;
    const partner = msg.senderId === auth.userId ? msg.receiver : msg.sender;

    if (!conversationsMap.has(partnerId)) {
      conversationsMap.set(partnerId, {
        partnerId,
        partner,
        lastMessage: {
          id: msg.id,
          content: msg.content,
          createdAt: msg.createdAt,
          isRead: msg.isRead,
        },
        unreadCount: 0,
      });
    }

    // Count unread messages from this partner
    if (msg.receiverId === auth.userId && !msg.isRead) {
      const conv = conversationsMap.get(partnerId)!;
      conv.unreadCount++;
    }
  }

  const conversations = Array.from(conversationsMap.values()).sort(
    (a, b) => b.lastMessage.createdAt.getTime() - a.lastMessage.createdAt.getTime()
  );

  return c.json({ conversations });
});

// Get messages with a specific user
messageRoutes.get("/thread/:userId", requireAuth, async (c) => {
  const auth = c.get("auth");
  const partnerId = c.req.param("userId");

  const messages = await db.message.findMany({
    where: {
      OR: [
        { senderId: auth.userId, receiverId: partnerId },
        { senderId: partnerId, receiverId: auth.userId },
      ],
    },
    include: {
      sender: {
        select: { id: true, firstName: true, lastName: true, avatarUrl: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Mark received messages as read
  await db.message.updateMany({
    where: {
      senderId: partnerId,
      receiverId: auth.userId,
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });

  // Get partner info
  const partner = await db.user.findUnique({
    where: { id: partnerId },
    select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true, role: true },
  });

  return c.json({ messages, partner });
});

// Send a message
const sendMessageSchema = z.object({
  receiverId: z.string(),
  content: z.string().min(1).max(5000),
  subject: z.string().optional(),
  parentId: z.string().optional(),
});

messageRoutes.post(
  "/",
  requireAuth,
  zValidator("json", sendMessageSchema),
  async (c) => {
    const auth = c.get("auth");
    const { receiverId, content, subject, parentId } = c.req.valid("json");

    // Verify receiver exists
    const receiver = await db.user.findUnique({
      where: { id: receiverId },
    });

    if (!receiver) {
      return c.json({ error: "Recipient not found" }, 404);
    }

    const message = await db.message.create({
      data: {
        senderId: auth.userId,
        receiverId,
        content,
        subject,
        parentId,
        type: "USER",
      },
      include: {
        sender: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        },
        receiver: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    // Create notification for receiver
    await db.notification.create({
      data: {
        userId: receiverId,
        title: "New Message",
        message: `You have a new message from ${message.sender.firstName || "Someone"}`,
        type: "message",
        actionUrl: `/messages/${auth.userId}`,
        metadata: { messageId: message.id },
      },
    });

    return c.json({ message }, 201);
  }
);

// Get unread message count
messageRoutes.get("/unread-count", requireAuth, async (c) => {
  const auth = c.get("auth");

  const count = await db.message.count({
    where: {
      receiverId: auth.userId,
      isRead: false,
    },
  });

  return c.json({ count });
});

// Mark messages as read
messageRoutes.post("/mark-read", requireAuth, async (c) => {
  const auth = c.get("auth");
  const { messageIds } = await c.req.json();

  await db.message.updateMany({
    where: {
      id: { in: messageIds },
      receiverId: auth.userId,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });

  return c.json({ success: true });
});

// Delete a message
messageRoutes.delete("/:id", requireAuth, async (c) => {
  const auth = c.get("auth");
  const messageId = c.req.param("id");

  const message = await db.message.findFirst({
    where: {
      id: messageId,
      senderId: auth.userId,
    },
  });

  if (!message) {
    return c.json({ error: "Message not found or unauthorized" }, 404);
  }

  await db.message.delete({
    where: { id: messageId },
  });

  return c.json({ success: true });
});

// Search users to message (for starting new conversations)
messageRoutes.get("/search-users", requireAuth, async (c) => {
  const auth = c.get("auth");
  const query = c.req.query("q") || "";

  if (query.length < 2) {
    return c.json({ users: [] });
  }

  const users = await db.user.findMany({
    where: {
      AND: [
        { id: { not: auth.userId } },
        {
          OR: [
            { email: { contains: query, mode: "insensitive" } },
            { firstName: { contains: query, mode: "insensitive" } },
            { lastName: { contains: query, mode: "insensitive" } },
          ],
        },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      avatarUrl: true,
      role: true,
    },
    take: 10,
  });

  return c.json({ users });
});
