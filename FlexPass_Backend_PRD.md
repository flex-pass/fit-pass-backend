# FlexPass — Backend Engineering PRD

**Node.js + PostgreSQL + Redis Architecture**
Version 1.0 | June 2026 | Confidential

---

## Table of Contents

1. Backend Overview
2. System Architecture
3. Folder Structure
4. Database Schema (Prisma)
5. Complete API Reference
6. Core Business Logic
7. Authentication and Authorization
8. Third-Party Integrations
9. Background Jobs
10. Error Handling and Logging
11. Security Requirements
12. Performance, Indexing, and Scaling
13. Testing Strategy
14. Deployment and Environments
15. Environment Variables
16. Backend Development Timeline
17. Acceptance Criteria Summary

---

## 1. Backend Overview

### 1.1 Purpose

This document specifies everything the backend engineering team needs to build, test, and ship the FlexPass API layer. The backend is the single source of truth for credits, check-ins, payouts, and fraud prevention — every client (website today, Flutter app later) consumes the same API surface.

### 1.2 Core Responsibilities

- User, gym owner, and corporate authentication (phone OTP + JWT)
- Gym discovery with real-time dynamic credit pricing
- Credits engine — issuance, deduction, rollover, top-up, breakage tracking
- Fraud-proof QR check-in system (15-second expiry, geo-fenced)
- Razorpay subscription billing and webhook processing
- Gym owner payout calculation and disbursement tracking
- Corporate HR bulk employee management
- Admin control plane — approvals, pricing, fraud review
- Background jobs — monthly resets, bi-weekly payouts, analytics aggregation

### 1.3 Out of Scope for Backend Team

- Frontend rendering (Next.js team owns this — backend only exposes REST APIs)
- Flutter mobile app (Phase 2 — will reuse the exact same APIs documented here)
- Payment UI (Razorpay Checkout is embedded client-side; backend only creates orders/subscriptions and verifies webhooks)

---

## 2. System Architecture

### 2.1 Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Runtime | Node.js 20 LTS | Stability, long-term support |
| Language | TypeScript | Type safety across a financial/credits system |
| Framework | Express.js | Mature, simple, huge ecosystem |
| ORM | Prisma | Type-safe queries, easy migrations |
| Database | PostgreSQL 15 | ACID compliance — required for credits and payments |
| Cache / Ephemeral Store | Redis (Upstash or self-hosted) | Sub-millisecond QR token validation |
| Job Queue | BullMQ (Redis-backed) | Reliable background jobs with retries |
| Validation | Zod | Runtime schema validation for every request body |
| Auth | jsonwebtoken + bcrypt | JWT access/refresh token pattern |
| Payments | Razorpay Node SDK | Subscriptions, webhooks, payouts |
| File Storage | AWS S3 | Gym photos, documents |
| Logging | Pino | Fast structured JSON logging |
| Error Tracking | Sentry | Production error visibility |
| Testing | Jest + Supertest | Unit and integration tests |
| Containerization | Docker | Consistent dev/staging/prod environments |
| CI/CD | GitHub Actions | Automated test + deploy pipeline |
| Hosting | Railway or AWS EC2 + RDS | Managed Postgres, simple scaling |

### 2.2 High-Level Request Flow

```
Client (Next.js / Flutter)
        |
        v
  [ Nginx / Load Balancer ]
        |
        v
  [ Express API Server ] ----> [ Redis ] (QR tokens, cache, sessions)
        |
        v
  [ Prisma ORM ]
        |
        v
  [ PostgreSQL ]

  Background:
  [ BullMQ Workers ] <---- [ Redis Queue ]
        |
        v
  Cron Jobs: monthly reset, payouts, analytics
```

### 2.3 Monolith-First Approach

Build as a modular monolith, not microservices. At this stage microservices add deployment complexity with zero benefit. Structure the codebase in clearly separated modules (auth, gyms, credits, checkin, payments, corporate, admin) so that any module can be extracted into its own service later if traffic demands it. Only the BullMQ worker process should run separately from the main API process from day one, since cron jobs should never block API request handling.

---

## 3. Folder Structure

```
flexpass-backend/
  src/
    config/
      database.ts              -- Prisma client singleton
      redis.ts                 -- Redis client singleton
      razorpay.ts               -- Razorpay SDK init
      logger.ts                 -- Pino logger config
    modules/
      auth/
        auth.routes.ts
        auth.controller.ts
        auth.service.ts
        auth.validation.ts      -- Zod schemas
      gyms/
        gym.routes.ts
        gym.controller.ts
        gym.service.ts
        gym.pricing.ts          -- dynamic credit cost logic
      checkin/
        checkin.routes.ts
        checkin.controller.ts
        qr.service.ts           -- generate + validate QR
        fraud.service.ts        -- fraud detection rules
      credits/
        credits.routes.ts
        credits.controller.ts
        credits.service.ts      -- balance, rollover, breakage
      subscriptions/
        subscription.routes.ts
        subscription.controller.ts
        razorpay.service.ts
        webhook.controller.ts
      payouts/
        payout.routes.ts
        payout.service.ts       -- bi-weekly calculation
      corporate/
        corporate.routes.ts
        corporate.controller.ts
        corporate.service.ts
      admin/
        admin.routes.ts
        admin.controller.ts
    middleware/
      auth.middleware.ts        -- JWT verification + role check
      rateLimit.middleware.ts
      errorHandler.middleware.ts
      validate.middleware.ts    -- Zod request validation
    jobs/
      queues/
        notification.queue.ts
        payout.queue.ts
      cron/
        monthlyReset.cron.ts
        biweeklyPayout.cron.ts
        analyticsAggregate.cron.ts
      workers/
        index.ts                -- standalone worker process
    utils/
      geo.ts                    -- haversine distance calc
      tokens.ts                 -- secure random token gen
      response.ts               -- standard API response shape
    prisma/
      schema.prisma
      migrations/
      seed.ts
    app.ts                      -- Express app setup
    server.ts                   -- entry point
  tests/
    unit/
    integration/
  Dockerfile
  docker-compose.yml            -- local Postgres + Redis
  .env.example
  package.json
  tsconfig.json
```

---

## 4. Database Schema (Prisma)

Full relational schema. All monetary values stored as `Decimal`, never `Float`, to avoid rounding errors in financial calculations.

### 4.1 Core Models

```prisma
model User {
  id              String   @id @default(uuid())
  phoneNumber     String   @unique
  name            String?
  email           String?
  city            String?
  role            Role     @default(USER)
  creditsBalance  Int      @default(0)
  planType        PlanType @default(NONE)
  planExpiryDate  DateTime?
  corporateId     String?
  corporate       Corporate? @relation(fields: [corporateId], references: [id])
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  checkins        Checkin[]
  transactions    CreditTransaction[]
  subscription    Subscription?
  ownedGyms       Gym[]    @relation("GymOwner")

  @@index([phoneNumber])
  @@index([corporateId])
}

model Gym {
  id                  String   @id @default(uuid())
  name                String
  ownerId             String
  owner               User     @relation("GymOwner", fields: [ownerId], references: [id])
  address             String
  latitude            Decimal  @db.Decimal(10, 8)
  longitude           Decimal  @db.Decimal(11, 8)
  tier                Int      // 1 = premium, 2 = mid, 3 = budget
  peakCreditCost      Int
  offpeakCreditCost   Int
  peakStartMorning    String   // "06:00"
  peakEndMorning      String   // "09:00"
  peakStartEvening    String   // "18:00"
  peakEndEvening      String   // "21:00"
  payoutPerCredit     Decimal  @db.Decimal(10, 2)
  killSwitch          Boolean  @default(false)
  isApproved          Boolean  @default(false)
  monthlyGuarantee    Decimal? @db.Decimal(10, 2)
  createdAt           DateTime @default(now())
  checkins            Checkin[]
  photos              GymPhoto[]

  @@index([latitude, longitude])
  @@index([isApproved, killSwitch])
}

model Checkin {
  id               String       @id @default(uuid())
  userId           String
  user             User         @relation(fields: [userId], references: [id])
  gymId            String
  gym              Gym          @relation(fields: [gymId], references: [id])
  checkedInAt      DateTime     @default(now())
  creditsUsed      Int
  gymPayoutAmount  Decimal      @db.Decimal(10, 2)
  userLat          Decimal      @db.Decimal(10, 8)
  userLng          Decimal      @db.Decimal(11, 8)
  qrToken          String
  status           CheckinStatus @default(SUCCESS)

  @@index([userId, gymId, checkedInAt])
  @@index([gymId, checkedInAt])
}

model CreditTransaction {
  id            String   @id @default(uuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  amount        Int      // positive = credit, negative = debit
  type          TxnType  // SUBSCRIPTION | TOPUP | CHECKIN | ROLLOVER | REFERRAL
  referenceId   String?
  createdAt     DateTime @default(now())

  @@index([userId, createdAt])
}

model Subscription {
  id                      String   @id @default(uuid())
  userId                  String   @unique
  user                    User     @relation(fields: [userId], references: [id])
  planType                PlanType
  creditsPerMonth         Int
  price                   Decimal  @db.Decimal(10, 2)
  razorpaySubscriptionId  String?  @unique
  startDate               DateTime
  endDate                 DateTime?
  status                  SubStatus @default(ACTIVE)
}

model Payout {
  id                  String   @id @default(uuid())
  gymId               String
  gym                 Gym      @relation(fields: [gymId], references: [id])
  periodStart         DateTime
  periodEnd           DateTime
  totalCheckins       Int
  totalCreditsUsed    Int
  amountOwed          Decimal  @db.Decimal(10, 2)
  amountPaid          Decimal  @default(0) @db.Decimal(10, 2)
  status              PayoutStatus @default(PENDING)
  paidAt              DateTime?

  @@index([gymId, status])
}

model Corporate {
  id              String   @id @default(uuid())
  companyName     String
  hrName          String
  hrEmail         String   @unique
  employeeCount   Int
  monthlyFee      Decimal  @db.Decimal(10, 2)
  status          CorpStatus @default(PENDING)
  startDate       DateTime?
  employees       User[]
}

model FraudLog {
  id          String   @id @default(uuid())
  userId      String?
  gymId       String?
  reason      String
  metadata    Json?
  createdAt   DateTime @default(now())

  @@index([userId])
}

enum Role { USER GYM_OWNER CORPORATE_ADMIN SUPER_ADMIN }
enum PlanType { NONE BASIC STANDARD PREMIUM CORPORATE }
enum TxnType { SUBSCRIPTION TOPUP CHECKIN ROLLOVER REFERRAL }
enum SubStatus { ACTIVE CANCELLED EXPIRED HALTED }
enum PayoutStatus { PENDING PROCESSING PAID FAILED }
enum CorpStatus { PENDING ACTIVE CANCELLED }
enum CheckinStatus { SUCCESS FAILED FRAUD }
```

### 4.2 Redis Key Design

| Key Pattern | Value | TTL | Purpose |
|---|---|---|---|
| `qr:{token}` | JSON: `{userId, gymId, creditsRequired}` | 15 sec | QR validation |
| `checkin:today:{userId}:{gymId}` | `1` | Until midnight IST | Prevent duplicate same-day check-in |
| `ratelimit:qr:{userId}` | counter | 1 hour | Max 5 QR generations/hour |
| `ratelimit:otp:{phone}` | counter | 1 hour | Max 5 OTP attempts/hour |
| `nearby:{lat}:{lng}:{radius}` | JSON gym list | 60 sec | Cache nearby gyms query |
| `session:{refreshToken}` | userId | 30 days | Refresh token validity |

---

## 5. Complete API Reference

Base URL: `/api/v1`. All responses follow a standard envelope: `{ success: boolean, data: object|null, error: string|null }`.

### 5.1 Authentication

**POST /auth/send-otp**
```json
Request:  { "phoneNumber": "+919876543210" }
Response: { "success": true, "data": { "otpSent": true } }
```

**POST /auth/verify-otp**
```json
Request:  { "phoneNumber": "+919876543210", "otp": "482913" }
Response: {
  "success": true,
  "data": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "8f3a2c...",
    "user": { "id": "...", "name": "Rahul", "creditsBalance": 43 }
  }
}
```

### 5.2 Gym Discovery

**GET /gyms/nearby?lat=28.627&lng=77.374&radius=5000**
```json
Response: {
  "success": true,
  "data": [{
    "id": "gym_123",
    "name": "PowerHouse Gym",
    "distanceMeters": 820,
    "currentCreditCost": 2,
    "pricingType": "off-peak",
    "rating": 4.1,
    "killSwitch": false
  }]
}
```

### 5.3 Check-in Flow

**POST /checkin/generate-qr**
```json
Request:  { "gymId": "gym_123", "userLat": 28.6271, "userLng": 77.3743 }
Response: {
  "success": true,
  "data": {
    "qrToken": "a1b2c3...",
    "expiresInSeconds": 15,
    "creditsRequired": 2
  }
}

Error Response (insufficient credits): {
  "success": false,
  "error": "INSUFFICIENT_CREDITS"
}
```

**POST /checkin/validate** (called by Gym Owner Scanner)
```json
Request:  { "qrToken": "a1b2c3...", "scannerLat": 28.6272, "scannerLng": 77.3744 }
Response: {
  "success": true,
  "data": {
    "userName": "Rahul K.",
    "creditsDeducted": 2,
    "gymEarning": 60.00
  }
}
```

### 5.4 Credits

| Method | Endpoint | Description |
|---|---|---|
| GET | `/credits/balance` | Current credit balance |
| GET | `/credits/history?page=1&limit=20` | Paginated transaction history |
| POST | `/credits/topup` | Purchase additional credits |

### 5.5 Subscriptions and Payments

| Method | Endpoint | Description |
|---|---|---|
| GET | `/plans` | List all subscription plans |
| POST | `/subscriptions/create` | Create Razorpay subscription, returns short_url |
| POST | `/subscriptions/cancel` | Cancel active subscription |
| GET | `/subscriptions/current` | Current plan and renewal date |
| POST | `/webhooks/razorpay` | Webhook receiver — HMAC verified |

### 5.6 Gym Owner

| Method | Endpoint | Description |
|---|---|---|
| POST | `/gyms` | Register new gym (pending admin approval) |
| PUT | `/gyms/:id` | Update gym details |
| PATCH | `/gyms/:id/kill-switch` | Toggle aggregator traffic on/off |
| GET | `/gyms/:id/dashboard` | Today/month stats, recent check-ins |
| GET | `/gyms/:id/payouts` | Payout history and pending amount |

### 5.7 Corporate

| Method | Endpoint | Description |
|---|---|---|
| POST | `/corporate/register` | New corporate account (pending approval) |
| POST | `/corporate/invite-employees` | Bulk CSV invite |
| GET | `/corporate/dashboard` | Utilization stats |
| GET | `/corporate/reports?format=csv` | Downloadable usage report |

### 5.8 Admin

| Method | Endpoint | Description |
|---|---|---|
| GET | `/admin/gyms?status=pending` | Review gyms awaiting approval |
| PATCH | `/admin/gyms/:id/approve` | Approve a gym |
| PATCH | `/admin/users/:id/credits` | Manually adjust user credits |
| GET | `/admin/fraud-logs` | Review flagged fraud attempts |
| GET | `/admin/analytics/overview` | Platform-wide KPIs |
| PATCH | `/admin/payouts/:id/mark-paid` | Mark a payout as disbursed |

---

## 6. Core Business Logic

### 6.1 Dynamic Credit Pricing

```
function getCreditCost(gym, currentTime):
  isPeak = isWithinRange(currentTime, gym.peakStartMorning, gym.peakEndMorning)
        OR isWithinRange(currentTime, gym.peakStartEvening, gym.peakEndEvening)
  return isPeak ? gym.peakCreditCost : gym.offpeakCreditCost
```

### 6.2 QR Generation — Full Validation Sequence

1. Verify JWT and extract userId
2. Fetch gym by gymId — must exist, be approved, and killSwitch must be false
3. Compute current credit cost using section 6.1 logic
4. Check `user.creditsBalance >= creditsRequired` — else return `INSUFFICIENT_CREDITS`
5. Check Redis key `checkin:today:{userId}:{gymId}` — if exists, return `ALREADY_CHECKED_IN`
6. Compute haversine distance between userLat/userLng and gym coordinates — must be within 200m, else return `TOO_FAR`
7. Generate cryptographically random 64-character token (`crypto.randomBytes`)
8. Store in Redis: `SET qr:{token} {userId, gymId, creditsRequired} EX 15`
9. Return token and expiry to client

### 6.3 QR Validation — Full Sequence (Atomic Transaction)

1. Gym scanner sends qrToken + scanner GPS coordinates
2. `GET qr:{token}` from Redis — if null, log `FraudLog(reason: TOKEN_NOT_FOUND_OR_EXPIRED)`, return 401
3. Verify token's gymId matches the scanning gym's id — mismatch logs `FraudLog(reason: GYM_MISMATCH)`, return 401
4. `DEL qr:{token}` immediately (atomic single-use enforcement) — if DEL returns 0, token was already consumed by a race condition, return 401
5. Re-check `user.creditsBalance` in a database transaction (in case balance changed between QR generation and scan)
6. Within one Prisma transaction: decrement `user.creditsBalance`, insert `Checkin` row, increment gym's running payout total, `SET checkin:today:{userId}:{gymId}` EX until midnight
7. Insert `CreditTransaction` row (type: `CHECKIN`, amount: `-creditsUsed`)
8. Return success with userName, creditsDeducted, gymEarning

> **Critical:** steps 4-7 must happen inside a single atomic operation. If any step fails after credits are deducted, the entire transaction must roll back — use Prisma's `$transaction` wrapper.

### 6.4 Monthly Credit Rollover (Cron — 1st of month, 00:00 IST)

```
for each user with subscription.status == ACTIVE:
  unused = user.creditsBalance
  maxRollover = subscription.creditsPerMonth
  rollover = min(unused, maxRollover)
  newBalance = rollover + subscription.creditsPerMonth

  update user.creditsBalance = newBalance
  insert CreditTransaction(type: ROLLOVER, amount: +subscription.creditsPerMonth)
  if rollover > 0:
    insert CreditTransaction(type: ROLLOVER, amount: +rollover, note: 'carried over')

  enqueue notification job: 'X credits added, Y rolled over'
```

### 6.5 Bi-Weekly Gym Payout Calculation (Cron — every 1st and 16th)

```
for each active gym:
  checkins = Checkin.findMany({
    gymId: gym.id,
    status: 'SUCCESS',
    checkedInAt: { gte: periodStart, lte: periodEnd }
  })

  totalCredits = sum(checkins.creditsUsed)
  amountOwed = sum(checkins.gymPayoutAmount)

  if gym.monthlyGuarantee exists:
    amountOwed = max(amountOwed, gym.monthlyGuarantee / 2)  // half of monthly MRG per cycle

  create Payout record with status PENDING
  enqueue notification to gym owner
```

### 6.6 Fraud Detection Rules

| Rule | Trigger | Action |
|---|---|---|
| Expired token reuse | QR scanned after 15s window | Log fraud, deny, no penalty (likely network lag) |
| Duplicate token scan | Same token validated twice | Log fraud, flag user account |
| Wrong gym scan | Token's gymId != scanner gymId | Log fraud, flag both user and scanning device |
| GPS spoofing suspicion | User location jumps >50km in <5 min between check-ins | Log fraud, require manual review before next check-in |
| Repeated failures | 3+ failed validations in 24 hours | Auto-flag account, restrict QR generation for 24 hours |

---

## 7. Authentication and Authorization

### 7.1 JWT Structure

```
Access Token Payload:
{ userId, role, iat, exp }   // expires in 1 hour

Refresh Token:
Random 64-char string stored in Redis as session:{token} -> userId, TTL 30 days
```

### 7.2 Roles and Permissions

| Role | Can Access |
|---|---|
| USER | Gym discovery, check-in, credits, subscription, profile |
| GYM_OWNER | Own gym dashboard, kill switch, payouts, check-in logs |
| CORPORATE_ADMIN | Own company dashboard, employee management, reports |
| SUPER_ADMIN | Everything — gym approval, fraud review, pricing, payouts |

### 7.3 Middleware Chain

```javascript
router.patch(
  '/gyms/:id/kill-switch',
  authMiddleware,              // verifies JWT, attaches req.user
  requireRole('GYM_OWNER'),    // checks role
  requireGymOwnership,         // checks req.user owns this specific gym
  validate(killSwitchSchema),  // Zod body validation
  gymController.toggleKillSwitch
);
```

---

## 8. Third-Party Integrations

### 8.1 Razorpay — Subscription Lifecycle

1. Create Plans once in Razorpay Dashboard (Basic/Standard/Premium), save plan IDs in env
2. `POST /subscriptions/create` calls `razorpay.subscriptions.create()` with the plan ID and customer notify settings
3. Return `short_url` to frontend, which redirects user to Razorpay's hosted checkout
4. Razorpay sends webhook events to `/webhooks/razorpay`
5. Verify webhook using HMAC-SHA256 with `RAZORPAY_WEBHOOK_SECRET` before trusting the payload
6. On `subscription.activated`: set `Subscription.status = ACTIVE`, credit the plan's monthly credits
7. On `subscription.charged` (monthly renewal): trigger the same credit logic as the monthly cron, but event-driven instead of time-driven
8. On `subscription.halted` (payment failure): set status `HALTED`, start a 3-day grace period before downgrading access

### 8.2 OTP Provider (MSG91)

- Generate 6-digit OTP server-side, never trust client-generated OTPs
- Store OTP hash (not plaintext) in Redis: `otp:{phone}` with 5 minute TTL
- Rate limit: max 5 OTP requests per phone per hour
- On verify, compare hash, delete key immediately on success (single use)

### 8.3 Google Maps

- Use Geocoding API only at gym registration time to convert address to lat/lng once
- Nearby gym search uses the haversine formula directly in PostgreSQL — do not call Google Maps API per search, it is unnecessary cost
- Frontend renders the map tiles client-side using the Maps JavaScript API key — backend never proxies map tiles

### 8.4 AWS S3 — Gym Photo Upload

1. Frontend requests a presigned upload URL: `POST /gyms/:id/photo-upload-url`
2. Backend generates a presigned S3 PUT URL valid for 5 minutes, scoped to a specific key path
3. Frontend uploads directly to S3 using that URL — backend never touches the binary file
4. Frontend confirms upload completion: `POST /gyms/:id/photos` with the final S3 key
5. Backend saves the S3 key reference in the `GymPhoto` table

---

## 9. Background Jobs

| Job | Schedule | Purpose |
|---|---|---|
| `monthlyReset.cron` | 1st of month, 00:00 IST | Reset and rollover credits for all active subscriptions |
| `biweeklyPayout.cron` | 1st and 16th, 02:00 IST | Calculate and create payout records for all gyms |
| `analyticsAggregate.cron` | Daily, 01:00 IST | Pre-aggregate utilization stats for admin dashboard |
| `trialExpiryReminder.cron` | Daily, 09:00 IST | Notify users 2 days before trial or subscription expiry |
| `fraudDigest.cron` | Daily, 08:00 IST | Email admin a summary of flagged accounts from the last 24 hours |
| `notification.queue` (BullMQ) | Event-driven | Send SMS/email for check-ins, payouts, renewals — never block the main request thread |

All cron jobs must run on a separate worker process (`npm run worker`), never inside the main API process. This guarantees a slow analytics job never delays a user's check-in request.

---

## 10. Error Handling and Logging

### 10.1 Standard Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_CREDITS",
    "message": "You need 2 more credits to check in here."
  }
}
```

### 10.2 HTTP Status Code Map

| Status | Use Case |
|---|---|
| 400 | Validation error (Zod schema failure) |
| 401 | Missing/invalid/expired JWT, or fraud-flagged QR token |
| 402 | Insufficient credits |
| 403 | Valid auth but insufficient role/ownership permission |
| 404 | Resource not found |
| 409 | Conflict — e.g. already checked in today |
| 429 | Rate limit exceeded |
| 500 | Unhandled server error — always logged to Sentry |

### 10.3 Logging Levels

- **info** — every successful check-in, payment, payout
- **warn** — failed validation, rate limit hits, near-miss fraud checks
- **error** — unhandled exceptions, third-party API failures (Razorpay, S3)
- Every log line includes `requestId`, `userId` (if available), and route for traceability

---

## 11. Security Requirements

- All traffic over HTTPS only — enforce via HSTS header
- Helmet.js for standard security headers
- CORS restricted to known frontend origins only (flexpass.in, app domains)
- Rate limiting on all public endpoints — 100 req/min per IP, stricter limits on OTP and QR endpoints
- Every request body validated with Zod before reaching controller logic
- Prisma parameterized queries eliminate SQL injection risk by default — never use raw string-interpolated queries
- Passwords are not used (phone OTP only) — eliminates password breach risk entirely
- Razorpay webhook signature verified via HMAC before processing any webhook payload
- PII (phone numbers, names) encrypted at rest using PostgreSQL column-level encryption where feasible
- Comply with India's Digital Personal Data Protection (DPDP) Act — store user data only as long as needed, support data deletion requests
- Secrets (.env) never committed to Git — use a secrets manager (AWS Secrets Manager or Railway's built-in vault) in production

---

## 12. Performance, Indexing, and Scaling

### 12.1 Database Indexing Strategy

- Composite index on `(userId, gymId, checkedInAt)` for the daily duplicate check-in lookup
- Index on `(latitude, longitude)` for nearby gym queries — use PostGIS extension if gym count exceeds ~5,000 for true geospatial indexing; haversine in plain SQL is sufficient below that scale
- Index on `(isApproved, killSwitch)` for the nearby gyms filter
- Index on `(gymId, status)` for payout aggregation queries

### 12.2 Connection Pooling

Use Prisma's connection pool with a max of 10-20 connections per backend instance. For serverless or high-concurrency deployments, place PgBouncer in front of PostgreSQL to avoid exhausting database connections.

### 12.3 Caching Rules

| Data | Cache Location | TTL | Invalidation |
|---|---|---|---|
| Nearby gym search results | Redis | 60 sec | Time-based only — acceptable staleness |
| Gym detail page | Redis | 5 min | Invalidate on gym update |
| User credit balance | Not cached | — | Always read fresh — financial accuracy required |
| QR tokens | Redis | 15 sec | Deleted immediately on use |

### 12.4 Performance Targets

| Endpoint | Target Response Time (p95) |
|---|---|
| GET /gyms/nearby | Under 300ms |
| POST /checkin/generate-qr | Under 200ms |
| POST /checkin/validate | Under 150ms (Redis-backed) |
| GET /credits/balance | Under 100ms |
| POST /webhooks/razorpay | Under 500ms (must respond within Razorpay's timeout window) |

---

## 13. Testing Strategy

### 13.1 Unit Tests (Jest)

- Credits engine: rollover math, breakage calculation, top-up math — test every edge case (zero balance, exact match, overflow above max rollover)
- Dynamic pricing: peak vs off-peak boundary times (e.g. exactly 06:00:00, 08:59:59, 09:00:01)
- Haversine distance calculation accuracy against known coordinate pairs
- Fraud rule functions in isolation with mocked Redis/DB calls

### 13.2 Integration Tests (Supertest)

- Full auth flow: send-otp -> verify-otp -> receive valid JWT
- Full check-in flow against a test database: generate-qr -> validate -> confirm credits deducted and Checkin row created
- Duplicate check-in attempt on the same day returns 409
- Expired QR token (wait 16 seconds in test) returns 401
- Razorpay webhook with invalid signature is rejected with 401

### 13.3 Load Testing

Before launch, load test `POST /checkin/validate` specifically — this endpoint will see concentrated traffic during gym peak hours (6-9 AM, 6-9 PM) across all partner gyms simultaneously. Use k6 or Artillery to simulate 200 concurrent check-ins and confirm p95 latency stays under 150ms with no failed transactions.

### 13.4 Deliverables

- Postman collection covering every endpoint in this document, with example requests for both success and error cases
- Minimum 80% code coverage on the credits and checkin modules specifically (these are the financial-correctness-critical modules)

---

## 14. Deployment and Environments

### 14.1 Environments

| Environment | Purpose | Database |
|---|---|---|
| Local | Developer machines via Docker Compose | Local Postgres + Redis containers |
| Staging | QA testing before production release | Separate Postgres instance, Razorpay test mode |
| Production | Live traffic | Managed Postgres (RDS/Railway), Razorpay live mode |

### 14.2 CI/CD Pipeline (GitHub Actions)

1. On every pull request: run lint, run unit tests, run integration tests against an ephemeral test database
2. On merge to main: build Docker image, run Prisma migrations against staging, deploy to staging automatically
3. Production deploy is manual-trigger only after staging QA sign-off
4. Health check endpoint `GET /health` must return 200 before the load balancer routes traffic to a new instance

### 14.3 Database Migrations

- Use `prisma migrate dev` locally, `prisma migrate deploy` in CI/CD for staging and production
- Never run `prisma db push` against production — migrations must be versioned and reviewable
- Take an automatic database snapshot immediately before every production migration

---

## 15. Environment Variables

```
# Database
DATABASE_URL=postgresql://user:pass@host:5432/flexpass

# Redis
REDIS_URL=redis://host:6379

# JWT
JWT_SECRET=min_32_char_random_string
JWT_ACCESS_EXPIRY=1h
REFRESH_TOKEN_EXPIRY_DAYS=30

# Razorpay
RAZORPAY_KEY_ID=rzp_live_xxxx
RAZORPAY_KEY_SECRET=xxxx
RAZORPAY_WEBHOOK_SECRET=xxxx
RAZORPAY_PLAN_ID_BASIC=plan_xxxx
RAZORPAY_PLAN_ID_STANDARD=plan_xxxx
RAZORPAY_PLAN_ID_PREMIUM=plan_xxxx

# OTP
MSG91_AUTH_KEY=xxxx
MSG91_TEMPLATE_ID=xxxx

# AWS
AWS_ACCESS_KEY_ID=xxxx
AWS_SECRET_ACCESS_KEY=xxxx
AWS_S3_BUCKET=flexpass-media
AWS_REGION=ap-south-1

# Observability
SENTRY_DSN=https://xxxx
LOG_LEVEL=info

# App
PORT=4000
NODE_ENV=production
FRONTEND_URL=https://flexpass.in
```

---

## 16. Backend Development Timeline

| Week | Deliverable |
|---|---|
| Week 1 | Project scaffold, Docker Compose (Postgres + Redis), Prisma schema, migrations, auth module (OTP + JWT) |
| Week 2 | Gym module — CRUD, nearby search with haversine, dynamic pricing logic, Zod validation across all routes |
| Week 3 | Credits module, QR generate/validate with full fraud sequence, Redis integration, atomic transaction handling |
| Week 4 | Razorpay subscriptions, webhook handler with HMAC verification, top-up flow |
| Week 5 | Payout module, bi-weekly cron job, BullMQ worker process setup, monthly reset cron |
| Week 6 | Corporate module — registration, bulk employee invite, utilization reports |
| Week 7 | Admin module — gym approval, fraud log review, manual credit adjustment, analytics aggregation |
| Week 8 | Integration tests, load testing on check-in endpoint, Postman collection, staging deployment, security review |

### 16.1 Definition of Done — Every Module

- All endpoints documented in this PRD are implemented and match the request/response shapes exactly
- Zod validation on every request body — no unvalidated input reaches business logic
- Unit tests written for all business logic functions (credits, pricing, fraud rules)
- Integration test covers the full happy path and at least 2 failure paths per endpoint
- No `console.log` statements — all output goes through the Pino logger
- Postman collection updated and committed alongside the code

---

## 17. Acceptance Criteria Summary

| Module | Acceptance Criteria |
|---|---|
| Auth | OTP cannot be brute-forced (rate limited); JWT refresh works seamlessly; logout invalidates refresh token immediately |
| Credits | Balance never goes negative; rollover never exceeds the documented cap; every balance change has a corresponding CreditTransaction row |
| Check-in | A QR token can never be used twice, even under concurrent requests; expired tokens are always rejected; geo-fence cannot be bypassed by spoofed coordinates beyond the 200m tolerance |
| Payments | Webhook processing is idempotent — receiving the same Razorpay event twice does not double-credit a user |
| Payouts | Payout totals reconcile exactly against the sum of underlying Checkin records for that period |
| Fraud | Every fraud rule trigger creates a FraudLog row with enough metadata to investigate without needing to reproduce the bug |

---

*FlexPass Backend PRD v1.0 | Confidential | June 2026*
