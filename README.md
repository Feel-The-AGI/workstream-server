# Workstream Server (Backend API)

A Hono-based TypeScript API powering the Workstream platform - a demand-driven education-to-employment system for Ghana.

## What This Does

This backend handles:
- **Authentication** via Clerk
- **Training Programs** - CRUD for employer-university partnership programs
- **Applications** - Student applications with eligibility checking
- **Document Processing** - Upload & AI parsing with Gemini 2.5 Pro
- **Payments** - Paystack integration for application fees
- **Multi-Portal APIs** - Separate endpoints for Students, Universities, Employers, and Admins
- **Messaging & Notifications** - In-app messaging + Resend email notifications

## Tech Stack

| Technology | Purpose |
|------------|---------|
| **Hono** | Fast, lightweight web framework |
| **TypeScript** | Type safety |
| **Prisma** | Database ORM |
| **PostgreSQL (NeonDB)** | Database |
| **Clerk** | Authentication |
| **Gemini 2.5 Pro** | Document parsing AI |
| **Paystack** | Payment processing |
| **Resend** | Email notifications |

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Environment Variables
Create `.env` file:
```env
# Database (NeonDB)
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"

# Clerk Authentication
CLERK_SECRET_KEY="sk_test_..."

# Gemini AI (Document Parsing)
GEMINI_API_KEY="your-gemini-api-key"

# Paystack (Payments)
PAYSTACK_SECRET_KEY="sk_test_..."

# Resend (Email)
RESEND_API_KEY="re_..."
EMAIL_FROM="Workstream <noreply@yourdomain.com>"

# Frontend URL (for CORS)
FRONTEND_URL="http://localhost:3001"
```

### 3. Set Up Database
```bash
# Push schema to database
npx prisma db push

# Generate Prisma client
npx prisma generate

# Seed with test data (optional)
npx tsx prisma/seed.ts
```

### 4. Run the Server
```bash
npm run dev
```
Server runs at `http://localhost:8000`

## API Routes Overview

| Route | Description | Auth Required |
|-------|-------------|---------------|
| `GET /` | Health check | No |
| `/api/v1/auth/*` | Authentication (sync, me) | Yes |
| `/api/v1/programs/*` | Training programs | Public list, auth for create |
| `/api/v1/applications/*` | Student applications | Yes |
| `/api/v1/documents/*` | Document management | Yes |
| `/api/v1/payments/*` | Payment processing | Yes |
| `/api/v1/messages/*` | In-app messaging | Yes |
| `/api/v1/notifications/*` | User notifications | Yes |
| `/api/v1/university/*` | University portal | UNIVERSITY_ADMIN |
| `/api/v1/employer/*` | Employer portal | EMPLOYER_ADMIN |
| `/api/v1/admin/*` | Platform admin | PLATFORM_ADMIN |

## Project Structure

```
src/
├── index.ts          # App entry, routes registration
├── routes/           # API route handlers
│   ├── auth.ts       # Authentication
│   ├── programs.ts   # Training programs
│   ├── applications.ts
│   ├── documents.ts
│   ├── payments.ts
│   ├── messages.ts
│   ├── notifications.ts
│   ├── universities.ts  # University portal
│   ├── employers.ts     # Employer portal
│   └── admin.ts         # Admin portal
├── middleware/
│   ├── auth.ts       # Clerk auth middleware
│   └── error-handler.ts
└── lib/
    ├── db.ts         # Prisma client
    └── gemini.ts     # Gemini AI integration

prisma/
├── schema.prisma     # Database schema
└── seed.ts           # Test data seeder
```

## Key Concepts

### User Roles
- `STUDENT` - Applies to programs
- `UNIVERSITY_ADMIN` - Manages programs, reviews applications
- `EMPLOYER_ADMIN` - Reviews shortlisted candidates, approves hires
- `PLATFORM_ADMIN` - Full platform management

### Application Flow
1. Student applies to program
2. University reviews & shortlists
3. Employer interviews & approves
4. Student enrolled in training

### Document Processing
Documents uploaded via Uploadthing → stored URL saved → Gemini AI extracts data asynchronously.

## Scripts

```bash
npm run dev      # Development with hot reload
npm run build    # Build for production
npm start        # Run production build
```

## Need Help?

- Check Prisma schema in `prisma/schema.prisma` for data models
- API errors return `{ error: "message" }` with appropriate HTTP status
- All protected routes require `Authorization: Bearer <clerk-token>` header
