# PMPilot — Decision Intelligence Platform for Product Managers

> **Evidence-grounded product decisions from customer signals to engineering delivery.**  
> Every recommendation carries evidence provenance, contradiction detection, and version-bound human approval.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-blue.svg)](https://react.dev)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](https://www.docker.com/)
[![Switch AI](https://img.shields.io/badge/Fabric-Switch%20Agent%20Protocol%20v1-7c3aed.svg)](https://switchagents.ai)
[![Linear](https://img.shields.io/badge/Delivery-Linear%20OAuth%202.0-5e6ad2.svg)](https://linear.app)

---

## 🎯 Product Vision & Architecture

Product Managers are overwhelmed by disjointed feedback across conversations, telemetry, customer tickets, design files, and issue trackers. Generic AI chatbots hallucinate roadmaps without provenance, and teams suffer from silent contradictions and unapproved scope creep.

**PMPilot** is a deterministic decision-intelligence system of record. It helps teams:

1. **Capture Signals**: Ingest unstructured customer feedback, bug reports, and competitor observations.
2. **Epistemic Classification**: Categorize evidence into `OBSERVED`, `INFERRED`, `ASSUMED`, and `UNKNOWN`.
3. **Contradiction Gate**: Automatically detect conflicting requirements and block downstream release until resolved.
4. **Multi-Agent Collaboration**: Collaborate with humans and AI agents in **Switch AI** rooms around active product decisions.
5. **Human Approval Gate**: Require explicit, version-bound sign-off from verified Product Managers before engineering delivery.
6. **Delivery Execution**: Export synchronized, approved backlog issues directly to **Linear** and documents to Markdown/Notion.
7. **Multi-Tenant Isolation**: Complete workspace boundaries with owner and member access controls.

---

## 🏗️ System Architecture

```text
 ┌────────────────────────────────────────────────────────────────────────┐
 │                    PMPilot Frontend (React + Vite)                     │
 │   • SaaS Dashboard   • Decisions Directory   • Evidence Graph          │
 │   • Contradiction Gate   • Switch Chat Fabric   • Linear Backlog Sync  │
 └───────────────────────────────────┬────────────────────────────────────┘
                                     │ HTTPS / JWT Bearer Authentication
                                     ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │                      PMPilot Core Agent Engine                         │
 │                                                                        │
 │  ┌───────────────────────┐ ┌───────────────────────┐ ┌──────────────┐  │
 │  │ Authentication & RBAC │ │ Multi-Tenant Isolation│ │ Rate Limiter │  │
 │  │ PBKDF2 / SHA-512 JWTs │ │ Workspace Boundaries  │ │ Sliding Win  │  │
 │  └───────────────────────┘ └───────────────────────┘ └──────────────┘  │
 │                                                                        │
 │  ┌──────────────────────────────────────────────────────────────────┐  │
 │  │                   Deterministic State Machine                    │  │
 │  │   DRAFT ➔ CONFLICT_REVIEW ➔ RECOMMENDATION_READY                 │  │
 │  │   ➔ AWAITING_APPROVAL ➔ APPROVED ➔ ARTIFACT_GENERATED            │  │
 │  │   *Any material mutation increments version & relocks approval*  │  │
 │  └──────────────────────────────────────────────────────────────────┘  │
 └───────────────────────┬──────────────────────────┬─────────────────────┘
                         │                          │
                         ▼                          ▼
 ┌─────────────────────────────────┐      ┌───────────────────────────────┐
 │       Switch AI Fabric          │      │     Linear Delivery Sync      │
 │  • Agent Protocol v1 (HTTP+SSE) │      │  • OAuth 2.0 PKCE Flow        │
 │  • Decision-Bound Rooms         │      │  • AES-256-GCM Token Crypto   │
 │  • Versioned Change Proposals   │      │  • Guarded Backlog Issue Sync │
 └─────────────────────────────────┘      └───────────────────────────────┘
```

---

## 🔒 Security, Multi-Tenancy & Data Protection

- **Tenant Isolation**: When users register, they are provisioned a private workspace. Users can only access decisions and signals belonging to workspaces where they are members. Demo fixtures are strictly isolated.
- **Cryptographic Password Hashing**: Passwords hashed using PBKDF2 (100,000 iterations, SHA-512, 16-byte random salts).
- **Session Security**: HMAC-SHA256 signed JWT tokens with expiration and persistent token revocation stored in SQLite (`revoked_tokens`).
- **AES-256-GCM Token Encryption**: Integration secrets and OAuth refresh tokens are encrypted at rest using AES-256-GCM with distinct IVs and authentication tags.
- **Rate Limiting**: Sliding-window in-memory rate limiting defends authentication routes against brute-force attacks.
- **Deterministic Concurrency Guard**: Optimistic versioning prevents race conditions; stale approvals are automatically invalidated upon any decision mutation.

---

## 🌐 Integrations

### 1. Switch AI Collaboration Fabric
- Real Agent Protocol v1 implementation with endpoint autodetection.
- Decisions automatically associate with dedicated Switch rooms.
- Real-time room briefings with safe context sanitization.
- Structured proposals capture change rationales and track source vs. merged decision versions.

### 2. Linear Backlog Export
- Full OAuth 2.0 PKCE authorization with AES-256-GCM encrypted tokens.
- Server-side guard strictly blocks issue export until the active decision version is explicitly approved by a verified PM.
- If a proposal or mutation advances the decision version, export is automatically relocked.

---

## 🚀 Quickstart & Local Development

### Prerequisites
- Node.js (v18+)
- npm (v9+)
- Docker (optional, for local Switch Core)

### 1. Clone & Install
```bash
git clone https://github.com/rmanne24/prod-man-hunt.git
cd prod-man-hunt

# Install workspace dependencies
npm install
npm --prefix backend install
npm --prefix frontend install
```

### 2. Environment Configuration
Copy `.env.production.example` to `backend/.env`:
```bash
cp .env.production.example backend/.env
```
Generate secure random secrets:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Place the generated strings into `SESSION_SECRET` and `INTEGRATION_ENCRYPTION_KEY`.

### 3. Launch Development Server
```bash
# Runs backend on port 4000 and frontend on port 5173
npm start
```
Visit **`http://localhost:5173`** in your browser.

---

## 🐳 Production Deployment

### Option A: Docker Compose (Recommended)
PMPilot provides a multi-stage Docker build and Docker Compose configuration:
```bash
# Build and start PMPilot and Switch Core
docker compose up -d --build
```
This starts:
- `pmpilot`: Production application server on `http://localhost:4000` with static UI serving.
- `switch`: Switch Core instance on `http://localhost:8000`.
- Persistent SQLite storage in named volumes.

### Option B: Standalone Container
```bash
# Build Docker image
docker build -t pmpilot:latest .

# Run container with mounted volume for persistent database
docker run -d \
  -p 4000:4000 \
  --env-file backend/.env \
  -v pmpilot_data:/app/backend/data \
  --name pmpilot \
  pmpilot:latest
```

---

## 🧪 Comprehensive Test Suite

PMPilot includes 80 comprehensive automated tests covering unit logic, state machines, OAuth encryption, multi-tenant workspace isolation, and full 10-step lifecycle integration sequences.

```bash
# Run all backend unit & integration tests
npm --prefix backend run test:all

# Verify frontend lint & production bundle
npm --prefix frontend run lint
npm --prefix frontend run build
```

---

## 👥 Authors & License
- **Author**: Sairishita Manne ([@rmanne24](https://github.com/rmanne24))
- **Repository**: [https://github.com/rmanne24/prod-man-hunt](https://github.com/rmanne24/prod-man-hunt)
- **License**: MIT
