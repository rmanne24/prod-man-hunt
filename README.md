# PMPilot — Associate PM: Browser-Based Research Agent for Product Managers

> **From browser context to a validated product decision.**  
> Every recommendation carries evidence, uncertainty, and an executable next step.

[![CopilotKit](https://img.shields.io/badge/UI-CopilotKit-6366f1.svg)](https://copilotkit.ai)
[![OpenAI Agents SDK](https://img.shields.io/badge/Brain-OpenAI%20Agents%20SDK-10a37f.svg)](https://openai.com)
[![Exa AI](https://img.shields.io/badge/Search-Exa%20AI-0284c7.svg)](https://exa.ai)
[![Trigger.dev](https://img.shields.io/badge/Jobs-Trigger.dev-84cc16.svg)](https://trigger.dev)
[![Mozilla.ai](https://img.shields.io/badge/Trust-Mozilla.ai-ea580c.svg)](https://mozilla.ai)
[![Redis](https://img.shields.io/badge/Memory-Redis-dc2626.svg)](https://redis.io)

---

## 🎯 Executive Summary & The Problem

Product Managers spend countless hours tab-switching between **Notion** PRDs, **Linear** issue backlogs, **Figma** design flows, and **competitor websites** to gather requirements. Context switches kill velocity and breed duplicate or conflicting tickets. Worse, generic LLM tools hallucinate PRDs out of thin air with zero source provenance or evidence linking.

**PMPilot (Associate PM)** lives directly in the browser. It monitors active PM workflows, sanitizes and extracts trustworthy context, runs deep real-time market research on competitors via Exa, flags contradictions before sprint lock, and outputs verifiable PRDs, user stories, and Linear tickets in a single click.

---

## 🏗️ Architecture & Organizer Sponsor Mapping

```text
 ┌─────────────────────────────────────────────────────────────┐
 │                  Browser PM Surface                         │
 │                                                             │
 │  Chrome Extension (Manifest V3) + CopilotKit In-App Overlay │
 └──────────────────────────────┬──────────────────────────────┘
                                │ Live Tab DOM & Multimodal Context
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │                  Mozilla.ai Trust Engine                    │
 │                                                             │
 │  • Content Sanitizer & Boilerplate Remover                  │
 │  • Epistemic Classification: OBSERVED vs INFERRED vs ASSUMED│
 └──────────────────────────────┬──────────────────────────────┘
                                │ Clean Provenance Stream
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │             OpenAI Agents SDK / Agent Brain                 │
 │                                                             │
 │  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────┐ │
 │  │  Context Agent  │  │Requirements Agent│  │Research Agent│ │
 │  └────────┬────────┘  └────────┬─────────┘  └──────┬──────┘ │
 │           │                    │                   │        │
 │           └────────────────────┼───────────────────┘        │
 │                                ▼                            │
 │                     Product Strategist Agent                │
 │                     (Contradiction Gatekeeper)              │
 │                                │                            │
 │                                ▼                            │
 │                       Delivery Agent                        │
 └──────────────────────────────┬──────────────────────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          ▼                     ▼                     ▼
 ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
 │   Exa Engine    │   │ Trigger.dev Job │   │  Redis Session  │
 │ Market Research │   │ Async PRD &     │   │ Memory & Tab    │
 │ & Competitor    │   │ Sprint Pipeline │   │ State Caching   │
 │ Intelligence    │   │                 │   │                 │
 └─────────────────┘   └─────────────────┘   └─────────────────┘
          │                     │                     │
          └─────────────────────┼─────────────────────┘
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │         CopilotKit UI + Webhooks (Linear, Slack, Jira)      │
 └─────────────────────────────────────────────────────────────┘
```

### Sponsor-to-Feature Mapping

| Organizer Technology | PMPilot Responsibility |
|---|---|
| **CopilotKit** | Agent UI, browser sidebar overlay, generative UI, in-app action pills (`Shrink to 2-week MVP`, `Challenge decision`, `Resolve contradiction`). |
| **OpenAI Agents SDK** | Multi-agent orchestration layer (Context Agent, Requirements Agent, Research Agent, Product Strategist, Delivery Agent). |
| **OpenAI (GPT-4o)** | Requirement extraction, user story formulation, reasoning, and synthesis. |
| **Exa** | Real-time competitor product intelligence, UX pattern analysis, and market gap discovery. |
| **Redis** | Working agent memory, active project tab state, session persistence, and decision history. |
| **Trigger.dev** | Long-running asynchronous PRD generation, sprint planning, and competitor scanning workflows. |
| **Mozilla.ai** | Trust and privacy engine, boilerplate stripping, and epistemic classification (`OBSERVED`, `INFERRED`, `ASSUMED`, `UNKNOWN`). |
| **OpenRouter** | Intelligent model routing and resilient fallback gateway. |
| **Auth0** | Workspace identity and tenant permission boundary. |

---

## 🛡️ Epistemic Trust & No-Hallucination Contract

Unlike typical GPT wrappers that present assumptions as facts, PMPilot enforces **Mozilla.ai-aligned epistemic classification**:

- **OBSERVED**: Extracted verbatim with direct proof from Figma frame 3A, Notion §4, or Linear ENG-142.
- **INFERRED**: Deduced through cross-source synthesis (e.g. drop-off metrics + user quotes).
- **ASSUMED**: Unverified PM/engineering hypothesis flagged with a caution indicator.
- **UNKNOWN / VALIDATE**: Missing critical data requiring telemetry or user experiments before sprint lock.

Every single node in the **Evidence Graph** provides click-to-inspect proof and full source provenance!

---

## 🚦 Contradiction Gate: The Hero Decision Layer

When sources conflict (e.g. **Figma UX spec allows max 3 items in cart comparison drawer** vs. **Linear ENG-142 requested 5 items**), PMPilot **refuses to silently hallucinate a compromise**.

Instead, it gates the decision with a **Contradiction Gate**:
1. Flags the blocking contradiction and its mobile viewport risk.
2. Offers one-click resolutions based on empirical UX evidence.
3. Automatically recalculates Decision Health confidence from **88% to 96%** upon resolution and records the rationale to **Decision Memory**.

---

## ⚡ Edge-Case & Failure Resilience Matrix

| Feature | Happy Path | Missing Context | Conflicting Sources | API Offline | Recovery Mechanism |
|---|---|---|---|---|---|
| **Tab Context Ingestion** | Full DOM & specs captured | Prompts for tab selection | Surfaces discrepancy in Contradiction Gate | Local storage fallback | In-memory session preserved |
| **Exa Competitor Search** | Live matrix generated | Prompts for niche keywords | Highlights market variance | Synthetic benchmark dataset fallback | Zero blank screens or crashes |
| **PRD Generation** | Trigger.dev pipeline completes | Flags missing criteria | Recommends validation plan | Local sync generator fallback | Preserves partial research |
| **Redis Memory** | Real-time cache sync | Creates new session | — | In-Memory MemoryStore fallback | Survives local development |

---

## 🚀 Getting Started & Local Run Guide

### Prerequisites
- Node.js (v18+)
- npm (v9+)
- Google Chrome (for extension)

### 1. Clone & Install Dependencies
```bash
# Clone the repository
git clone https://github.com/rmanne24/pmpilot.git
cd pmpilot

# Install Backend Dependencies
cd backend
npm install

# Install Frontend Dependencies
cd ../frontend
npm install
```

### 2. Configure Environment (Optional)
Copy `.env.example` to `.env` in `backend/`:
```bash
cp .env.example .env
```
*(Note: PMPilot includes a built-in resilient simulation and fallback layer so it works out-of-the-box immediately even without external API keys!)*

### 3. Launch Development Servers
```bash
# Terminal 1: Backend Server (Port 4000)
cd backend
npm run dev

# Terminal 2: Frontend Web App (Port 5173)
cd frontend
npm run dev
```
Open **`http://localhost:5173`** in your browser!

### 4. Load the Chrome Extension
1. Open Google Chrome and navigate to `chrome://extensions`.
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked** and select the `pmpilot/extension` directory.
4. Navigate to any tab (Figma, Notion, Linear, Stripe) and click the **Associate PM** floating widget or popup to capture context!

---

## 🎬 2-Minute Video Demo Script

- **[0:00 - 0:25] The Problem**: Show 4 browser tabs open (Figma design frame, Notion PRD, Linear ticket backlog, Stripe checkout). Explain how PMs lose 2 hours daily context-switching and reconciling contradictions.
- **[0:25 - 0:50] The Capture**: Click the PMPilot extension. Show Mozilla.ai extracting clean text, stripping tracking cookies, and synchronizing with Redis state.
- **[0:50 - 1:20] The Evidence Graph & Contradiction Gate**: Open `http://localhost:5173`. Click node 3 to show proof provenance. Show the blocking conflict (3 vs 5 products). Click "Resolve with 3 (Figma UX pattern)" and watch Evidence Confidence jump from 88% to 96%!
- **[1:20 - 1:45] Exa Competitor Matrix & Copilot Actions**: Show Exa's competitor analysis (Stripe, Shopify, Amazon). Click "Shrink to 2-week MVP" in the Copilot sidebar to trim non-essential scope.
- **[1:45 - 2:00] Trigger.dev One-Click Delivery**: Click "Generate decision pack". Watch the Trigger.dev async pipeline finish, reveal the complete evidence-backed PRD, and push tickets directly to Linear!

---

## 👥 Contributors & Event Submission
- **Project**: PMPilot (Associate PM)
- **Author**: Sairishita Manne ([@rmanne24](https://github.com/rmanne24))
- **License**: MIT
