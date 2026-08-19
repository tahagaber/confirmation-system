<div align="center">

# System Taha

### Enterprise WhatsApp Confirmation & Messaging Engine

[![Node.js](https://img.shields.io/badge/Node.js-v16+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![WhatsApp](https://img.shields.io/badge/WhatsApp_Web.js-1.34-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://github.com/pedroslopez/whatsapp-web.js)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.7-010101?style=for-the-badge&logo=socketdotio&logoColor=white)](https://socket.io)
[![Google Sheets](https://img.shields.io/badge/Google_Sheets_API-v4-34A853?style=for-the-badge&logo=googlesheets&logoColor=white)](https://developers.google.com/sheets/api)
[![License](https://img.shields.io/badge/License-Proprietary-1a1a2e?style=for-the-badge)](#license)

<br />

A production-grade, real-time WhatsApp bulk messaging and confirmation system with a premium executive dashboard, live Google Sheets synchronization, and intelligent anti-spam protection.

<br />

---

</div>

## ✨ Overview

**System Taha** is a full-stack messaging automation platform that connects directly to WhatsApp Web via Puppeteer, enabling businesses to send personalized bulk messages with real-time delivery tracking, automatic contact deduplication, and bidirectional Google Sheets synchronization — all from an elegant dark-themed dashboard.

<br />

## 🏗️ Architecture & Tech Stack

| Layer | Technology | Purpose |
|:---|:---|:---|
| **Runtime** | Node.js (v16+) | Server-side JavaScript engine |
| **Framework** | Express 4.x | REST API & static file serving |
| **Real-Time** | Socket.io 4.7 | WebSocket-based live event streaming |
| **WhatsApp** | whatsapp-web.js + Puppeteer | Headless Chrome WhatsApp Web automation |
| **Data Source** | Google Sheets API v4 | Cloud-based recipient list management |
| **Auth Persistence** | LocalAuth (Multi-Device) | Session persistence across restarts |
| **Frontend** | Vanilla JS (ES6+), HTML5, CSS3 | Executive dark-slate design system |

<br />

## 📁 Project Structure

```
confirmation-system/
│
├── server.js                        # Core backend — API routes, Socket.io, WhatsApp client
├── .env                             # Environment variables (PORT, API keys)
│
├── public/                          # Client-side dashboard
│   ├── index.html                   # Dashboard layout & UI components
│   ├── app.js                       # Frontend logic, WebSocket client, chart engine
│   └── style.css                    # Executive Slate & Emerald design system
│
├── google-apps-script/              # Standalone Google Sheet sidebar (optional)
│   ├── Code.gs                      # Apps Script backend handler
│   └── Index.html                   # Apps Script sidebar interface
│
├── calls-502909-*.json              # Google Cloud Service Account credentials
├── vercel.json                      # Vercel deployment configuration
├── render.yaml                      # Render.com deployment blueprint
├── firebase.json                    # Firebase Hosting configuration
├── package.json                     # Dependencies & npm scripts
└── .gitignore                       # Exclusion rules (auth cache, node_modules, .env)
```

<br />

## ⚡ Quick Start

### Prerequisites

- **Node.js** v16 or higher — [Download](https://nodejs.org)
- **Google Chrome** installed (required by Puppeteer for WhatsApp Web)

### Installation

```bash
# Clone the repository
git clone https://github.com/tahagaber/confirmation-system.git
cd confirmation-system

# Install dependencies
npm install
```

### Launch

```bash
npm start
```

The server initializes the WhatsApp Web Puppeteer client and starts listening at:

```
🚀 http://localhost:3000
```

<br />

## 📱 WhatsApp Authentication

1. Open `http://localhost:3000` in your browser.
2. A **QR code** will appear on the dashboard header.
3. On your phone: **WhatsApp → Settings → Linked Devices → Link a Device**.
4. Scan the QR code displayed on the dashboard.
5. The status indicator transitions to **Connected & Authenticated**.

> **Note:** Session data is persisted in `.wwebjs_auth/` for automatic reconnection on server restarts. Delete this directory to force a fresh QR code.

<br />

## 🔑 Core Features

### 📥 Multi-Source Contact Ingestion
- **Google Sheets** — Paste any public or shared Google Sheet URL. The system auto-extracts the Spreadsheet ID and dynamically resolves the sheet tab name (supports Arabic tab names like `جدول_1`).
- **Excel / CSV Upload** — Drag & drop `.xlsx` or `.csv` files directly into the browser.
- **Manual Text Input** — Paste raw `Name, Phone` pairs or plain phone numbers.

### 🔄 Bidirectional Google Sheets Sync
- **Read:** Imports recipient name (Col A), phone (Col B), status (Col C), and comments (Col D) from the sheet.
- **Write:** Every status change or comment typed in the dashboard is synced back to the Google Sheet in real-time via the Google Sheets API v4.
- **Smart Range Resolution:** Automatically detects the active sheet tab name — no hardcoded `Sheet1` assumptions. Includes dual-layer retry fallback for maximum reliability.

### 🧹 Dual Deduplication Engine
- **Phone Deduplication** — Detects and skips repeated phone numbers.
- **Name Deduplication** — Flags duplicate recipient names (excluding generic terms like "Customer").

### 📊 Live Analytics Dashboard
- **KPI Cards** — Total contacts, sent count, failed count, and skip rate — all updating in real-time via WebSocket.
- **Response Distribution Chart** — SVG-based donut chart visualizing delivery outcomes.
- **Peak Messaging Hours** — Animated line chart tracking message throughput over time with emerald-themed data nodes.
- **Dispatch Control Panel** — Live countdown timer, batch progress ring, and next-dispatch countdown.

### 🛡️ Anti-Spam & Throttle Engine
- **Configurable Safety Delay** — Default `8 seconds` between messages with random jitter (±2s) to simulate human behavior.
- **Speed Mode Selector** — Choose from `Stealth`, `Normal`, `Fast`, or `Turbo` presets with visual feedback.
- **Batch Range Slicing** — Process contacts in configurable sub-batches (e.g., #1–15, then #16–30) to minimize spam detection risk.

### ✍️ Message Personalization
- **Template Variables** — Use `{name}` in your message template for per-contact personalization.
- **Spintax Support** — Write `{Hello|Hi|Greetings}` and the engine randomly rotates variants per message to avoid pattern detection.

### 🔍 Contact Table Features
- **Live Search & Filter** — Instant filtering across names, phone numbers, and notes.
- **Inline Status Editing** — Change sheet status (Attending / No Response / Issue) directly from the table dropdown — syncs to Google Sheet instantly.
- **Inline Comment Editing** — Type notes directly in the table with debounced auto-sync — no focus loss while typing.
- **Per-Row Sync Button** — Force-sync any individual row to Google Sheets on demand.

<br />

## 🌐 Deployment Options

### Option A: Local Development (Default)
```bash
npm start
# Dashboard available at http://localhost:3000
```

### Option B: Public Tunnel (LocalTunnel)
Share your local server with remote team members without cloud hosting:
```bash
npx localtunnel --port 3000
# Generates a public HTTPS URL (e.g., https://xxxx-xxxx.loca.lt)
```

### Option C: Hybrid (Vercel Frontend + Local Backend)
1. Deploy the repository to **Vercel** (frontend auto-deploys from `public/`).
2. Open the Vercel app URL.
3. Enter your local backend URL (or tunnel URL) in the **Backend Server** input field and click **Connect**.

### Option D: Cloud Deployment (Render.com)
The project includes a pre-configured `render.yaml`:
1. Connect the GitHub repository to [Render.com](https://render.com).
2. Select **Web Service** → Node environment.
3. Build command: `npm install`
4. Start command: `node server.js`

### Option E: Firebase Hosting
```bash
npm run login:firebase
npm run deploy:firebase
```

<br />

## 🔐 Google Sheets API Configuration

For **write-back sync** (updating status & comments from the dashboard to Google Sheets), the connected Google Sheet must grant edit access to the service account:

**Option 1 — Open Access:**
> Share the Google Sheet → General Access → **Anyone with the link → Editor**

**Option 2 — Service Account Only:**
> Share the Google Sheet with:
> ```
> confirmation@calls-502909.iam.gserviceaccount.com
> ```
> Set role to **Editor**.

The service account credentials file (`calls-502909-*.json`) is referenced automatically by `server.js`.

<br />

## 🔧 Troubleshooting

| Issue | Solution |
|:---|:---|
| **QR code not appearing** | Delete `.wwebjs_auth/` and `.wwebjs_cache/` directories, then restart the server. |
| **Port 3000 already in use** | Kill existing Node processes: `Stop-Process -Name node -Force` (Windows) or `killall node` (macOS/Linux), then restart. |
| **Google Sheet permission error** | Ensure the sheet is shared with the service account email as Editor (see above). |
| **`Unable to parse range`** | The system auto-resolves sheet tab names. Ensure the Range field in the import modal is set to `A:D` (not `Sheet1!A:D`). |
| **WhatsApp disconnects mid-batch** | The batch auto-pauses and resumes when reconnected. Check your phone's internet connection. |

<br />

## 📜 API Endpoints

| Method | Endpoint | Description |
|:---|:---|:---|
| `GET` | `/api/status` | Returns WhatsApp connection status & current job state |
| `POST` | `/api/preview-sheet` | Fetches and parses records from a Google Sheet |
| `POST` | `/api/send-custom-list` | Starts a bulk messaging batch with provided contacts |
| `POST` | `/api/send-single-message` | Sends a one-off test message to a single number |
| `POST` | `/api/update-sheet-record` | Syncs status & comment back to a Google Sheet row |
| `POST` | `/api/logout-whatsapp` | Resets WhatsApp session and generates a new QR code |

<br />

## 🧑‍💻 Environment Variables

Create a `.env` file in the project root:

```env
PORT=3000
GOOGLE_SERVICE_ACCOUNT_PATH=./calls-502909-980003b5787d.json
```

<br />

## 📄 License

**Proprietary** — System Taha © 2026. All rights reserved.

Built & maintained by [Taha Gaber](https://github.com/tahagaber).
