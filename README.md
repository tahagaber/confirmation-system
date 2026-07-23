# EduPulse WhatsApp Bulk Sender

A premium, production-grade bulk WhatsApp messaging system for educators. This application fetches records from a live Google Sheet, allows real-time preview, sends personalized WhatsApp messages with smart random delays (to prevent bans), and updates the status of each message ("Sent", "Failed", etc.) directly back to the Google Sheet. It features a beautiful, glassmorphic dark-themed web dashboard with live sockets and real-time terminal logs.

---

## 🛠️ Step-by-Step Setup Instructions

### 1. Install Project Dependencies
Ensure you have [Node.js](https://nodejs.org/) installed (v16+ recommended).
Open a terminal in the project root directory (`d:\Car Rental App`) and install the dependencies:
```bash
npm install
```

### 2. Prepare the Google Sheet
Your online Google Sheet should have the following format:
1. Create a Google Sheet on your Google account.
2. In the first tab (e.g. `Sheet1`), name the columns in the first row (headers):
   - **Column A**: Name (الاسم)
   - **Column B**: Phone Number (الرقم)
   - **Column C**: Status (الحالة)
3. Fill in the names and phone numbers of the teachers (e.g., `01012345678` or `+201234567890`). Leave the `Status` column empty for new rows.
4. Save the **Spreadsheet ID** from the URL. The URL is structured as:
   `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit#gid=0`
   Copy the `SPREADSHEET_ID` part.

---

## ☁️ Google Cloud Console Configuration

To allow the application to access and modify your Google Sheet:

### 1. Create a Google Cloud Project
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Log in with your Google account.
3. Click the project dropdown list at the top and select **New Project**.
4. Enter a name (e.g., `EduPulse-WhatsApp-Sender`) and click **Create**.

### 2. Enable Google Sheets API
1. In the sidebar menu, navigate to **APIs & Services** > **Library**.
2. Search for `Google Sheets API`.
3. Click on **Google Sheets API** and then click the **Enable** button.

### 3. Create a Service Account
1. Go to **APIs & Services** > **Credentials**.
2. Click **+ Create Credentials** at the top and choose **Service Account**.
3. Fill in the details:
   - **Service account name**: e.g., `sheets-editor`
   - Click **Create and Continue**.
   - (Optional) Assign a role (e.g., **Project** > **Editor** or **Browser**). You can leave it blank and click **Continue**.
   - Click **Done**.
4. In the Service Accounts list, locate your newly created account and copy its **Email address** (e.g., `sheets-editor@your-project-id.iam.gserviceaccount.com`).
5. **CRITICAL STEP**: Open your Google Sheet, click the **Share** button at the top right, paste this Service Account email, select **Editor** permissions, and click **Share**. This grants the app write permissions to your sheet.

### 4. Download Credentials JSON Key
1. In the Google Cloud Console Credentials menu, click on the name/email of the Service Account you just created.
2. Click the **Keys** tab at the top.
3. Click **Add Key** > **Create new key**.
4. Select **JSON** as the key type and click **Create**.
5. Save the downloaded JSON file into the project root directory (`d:\Car Rental App`) and rename it to:
   **`service-account.json`**

---

## 🚀 Running the Application

1. Open `.env` and set your defaults (optional):
   - Set `DEFAULT_SPREADSHEET_ID` to your Google Sheet ID.
2. Start the application:
   ```bash
   npm start
   ```
3. A WhatsApp login QR Code will print in your terminal, and the server will launch:
   - Web Dashboard: **`http://localhost:3000`**
4. Open the Web Dashboard. If WhatsApp is not authenticated yet, you will see a QR Code displayed on the screen. Scan it with your phone's WhatsApp (Link Devices) to connect.
5. Once connected:
   - Enter your **Google Spreadsheet ID** and **Sheet Range** (e.g., `Sheet1!A:C`).
   - Write your message template (e.g., `السلام عليكم أستاذ {name}، نرجو الحضور...`).
   - Click **Load Sheet Preview** to fetch the list of teachers and display their details.
   - Click **Start Bulk Sending** to begin. The app will send messages, bypass duplicates, apply random delays, and sync statuses back to your Google Sheet!
