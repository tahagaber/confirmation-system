# 🚀 System Taha — Bulk WhatsApp Messaging System

A production-grade, automated WhatsApp bulk messaging engine designed for high deliverability, security, and account anti-ban protection. Built with **Node.js**, **Express**, **Socket.io**, and **WhatsApp-Web.js** (Puppeteer), featuring a responsive executive dashboard with real-time delivery tracking.

---

## 🛠️ Tech Stack & System Architecture

- **Backend**: Node.js, Express, Socket.io (WebSocket), `whatsapp-web.js` (Puppeteer Headless Chrome)
- **Frontend**: Vanilla JS (ES6+), HTML5, CSS3 (Executive Dark Slate Design System)
- **Integrations**: Google Sheets API v4, Public CSV Export Fallback, Local Excel/CSV File Parser (SheetJS)
- **Session Auth**: WhatsApp Web Multi-Device Local Storage (`LocalAuth`)

---

## 📁 Repository Structure

```text
├── server.js                   # Main backend application & socket orchestration
├── public/                     # Client-side web dashboard
│   ├── index.html              # Dashboard UI & dynamic controls
│   ├── app.js                  # Frontend state, WebSocket client, & batch handler
│   └── style.css               # Executive Slate & Indigo CSS design system
├── google-apps-script/         # Standalone Google Sheet sidebar integration
│   ├── Code.gs                 # Apps Script backend handler & Google Sheet API
│   └── Index.html              # Apps Script HTML sidebar interface
├── vercel.json                 # Vercel deployment configuration
├── render.yaml                 # Render.com cloud deployment configuration
├── .gitignore                  # Git exclusion list (excludes auth caches & node_modules)
└── package.json                # Project dependencies & scripts
```

---

## ⚡ Quick Start & Development Setup

### 1. Prerequisites
Ensure you have **Node.js** (v16 or higher) installed on your system:
- Check version: `node -v`
- Download from: [https://nodejs.org](https://nodejs.org)

### 2. Installation
Clone the repository and install all project dependencies:
```bash
git clone https://github.com/tahagaber/confirmation-system.git
cd confirmation-system
npm install
```

### 3. Running the Application
Start the Node server locally:
```bash
node server.js
```
or
```bash
npm start
```
The server will initialize the WhatsApp Web Puppeteer client and start listening on:
👉 **`http://localhost:3000`**

---

## 📱 WhatsApp Authentication Flow

1. Open **`http://localhost:3000`** in your browser.
2. The dashboard will present a **WhatsApp QR Code**.
3. Open WhatsApp on your mobile device -> **Linked Devices** -> **Link a Device**.
4. Scan the QR code.
5. The dashboard indicator will change to **`Connected & Authenticated`** (Ready).
6. *Note*: Authentication session data is saved locally in `.wwebjs_auth/` for automatic re-connection upon server restarts.

---

## 🔑 Core Features & Engine Mechanics

### 1. Multi-Source Recipient Ingestion
- **Excel / CSV Upload**: Drag & drop `.xlsx` or `.csv` files directly in the browser.
- **Direct Paste**: Paste raw text formatted as `Name, Phone` or plain phone numbers.
- **Google Sheet URL Integration**: Paste any public or shared Google Sheet URL. The system automatically extracts the clean Spreadsheet ID.

### 2. Dual Deduplication System
The engine automatically filters loaded contacts before sending:
- **Phone Deduplication**: Ignores repeated phone numbers.
- **Name Deduplication**: Ignores duplicate recipient names (excluding generic terms like "Customer").

### 3. Batch Range Slicing
Prevents spam flags by processing contacts in configurable slices:
- Example: Send Batch 1 (#1 to #15), then Batch 2 (#16 to #30).

### 4. Anti-Spam Safety Delays with Jitter
- Configurable delay (default: `8 seconds`) between outgoing messages.
- Introduces random variation (+/- 2 seconds) to mimic natural human typing and sending behavior.

### 5. Dynamic Message Personalization
Use the `{name}` placeholder in your message template:
```text
Hello {name}, your appointment is confirmed for tomorrow.
```

---

## 🌐 Deployment Workflows for Developer Handoff

### Option A: Local Host Development (Default)
Run `node server.js` locally. Access the dashboard via `http://localhost:3000`.

### Option B: Free Online Tunnel (LocalTunnel)
To share your local server with remote team members without cloud hosting:
```bash
npx localtunnel --port 3000
```
This generates a public HTTPS link (e.g., `https://xxxx-xxxx.loca.lt`) accessible worldwide while running on your machine.

### Option C: Hybrid Deployment (Vercel Frontend + Local Backend)
- Deploy the repository to **Vercel**.
- Open the Vercel app URL.
- Use the **BACKEND SERVER** input field at the top of the Vercel header to enter your local server URL (or LocalTunnel URL) and click **Connect**.

### Option D: Cloud Web Service (Render.com)
The project includes a pre-configured `render.yaml` for 1-click cloud service deployment:
1. Connect the GitHub repository to **Render.com**.
2. Select **Web Service** (Node environment).
3. Set build command: `npm install`
4. Set start command: `node server.js`

---

## 🔧 Maintenance & Troubleshooting

### Resetting WhatsApp Authentication Session
If you need to switch the connected WhatsApp account or fix an authentication freeze:
1. Stop the server (`Ctrl + C`).
2. Delete the `.wwebjs_auth/` directory:
   ```bash
   rm -rf .wwebjs_auth
   ```
3. Restart the server (`node server.js`) to generate a fresh QR Code.

### Google Sheets Access Issues
- If fetching private Google Sheets fails, ensure the Google Sheet access is set to **"Anyone with the link can view"**, or place your Google Service Account key in `service-account.json`.

---

## 📄 License
Internal Proprietary — System Taha &copy; 2026. All rights reserved.
