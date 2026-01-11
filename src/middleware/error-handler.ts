import type { Context } from "hono";

export class APIError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string
  ) {
    super(message);
    this.name = "APIError";
  }
}

export const errorHandler = (err: Error, c: Context) => {
  console.error("Error:", err);

  if (err instanceof APIError) {
    return c.json(
      {
        error: err.message,
        code: err.code,
      },
      err.statusCode as 400 | 401 | 403 | 404 | 500
    );
  }

  // Prisma errors
  if (err.name === "PrismaClientKnownRequestError") {
    return c.json(
      {
        error: "Database error",
        code: "DATABASE_ERROR",
      },
      500
    );
  }

  // Generic error
  return c.json(
    {
      error: process.env.NODE_ENV === "production" 
        ? "Internal server error" 
        : err.message,
      code: "INTERNAL_ERROR",
    },
    500
  );
};
