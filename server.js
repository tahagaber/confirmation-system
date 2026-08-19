const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const { google } = require('googleapis');
const QRCode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const https = require('https');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Global state
let wwebStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'qr' | 'ready'
let lastQrCode = '';
let currentJob = {
    isRunning: false,
    isPaused: false,
    spreadsheetId: '',
    range: '',
    messageTemplate: '',
    safetyDelaySec: 8,
    total: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    currentIndex: 0,
    list: []
};

// Initialize WhatsApp Web Client
console.log('System Taha: Initializing WhatsApp Web Client...');
wwebStatus = 'connecting';

const wwebClient = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

// WhatsApp Events
wwebClient.on('qr', async (qr) => {
    wwebStatus = 'qr';
    lastQrCode = qr;
    console.log('\n--- WhatsApp QR Code Received ---');
    console.log('Scan QR code to authenticate:');
    qrcodeTerminal.generate(qr, { small: true });
    console.log('---------------------------------\n');
    
    try {
        const qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
        io.emit('whatsapp-status', { status: 'qr', qr, qrDataUrl });
    } catch (err) {
        console.error('Failed to generate QR data URL:', err);
        io.emit('whatsapp-status', { status: 'qr', qr });
    }
});

wwebClient.on('ready', () => {
    wwebStatus = 'ready';
    lastQrCode = '';
    console.log('System Taha: WhatsApp Web Client is connected and ready!');
    io.emit('whatsapp-status', { status: 'ready' });
});

wwebClient.on('authenticated', () => {
    console.log('WhatsApp authenticated successfully.');
});

wwebClient.on('auth_failure', (msg) => {
    wwebStatus = 'disconnected';
    console.error('WhatsApp authentication failure:', msg);
    io.emit('whatsapp-status', { status: 'disconnected', error: msg });
});

wwebClient.on('disconnected', (reason) => {
    wwebStatus = 'disconnected';
    console.log('WhatsApp client disconnected:', reason);
    io.emit('whatsapp-status', { status: 'disconnected', reason });
});

wwebClient.initialize().catch(err => {
    console.error('Failed to initialize WhatsApp client:', err);
    wwebStatus = 'disconnected';
});

// Helper: Get Google Sheets Client
function getSheetsClient() {
    const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'service-account.json';
    const resolvedPath = path.resolve(__dirname, credsPath);
    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Google Service Account JSON file not found.`);
    }
    const auth = new google.auth.GoogleAuth({
        keyFile: resolvedPath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return google.sheets({ version: 'v4', auth });
}

// Fallback: Fetch Public Google Sheet via CSV
function fetchPublicSheetCsv(spreadsheetId) {
    return new Promise((resolve, reject) => {
        const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv`;
        https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return https.get(res.headers.location, (res2) => processCsvResponse(res2, resolve, reject));
            }
            processCsvResponse(res, resolve, reject);
        }).on('error', (err) => reject(err));
    });
}

function processCsvResponse(res, resolve, reject) {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        if (res.statusCode !== 200) {
            return reject(new Error('Cannot access Google Sheet. Make sure sheet permission is set to "Anyone with the link can view".'));
        }
        const lines = data.split('\n');
        const rows = lines.map(line => {
            return line.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map(cell => cell.replace(/^"|"$/g, '').trim());
        });
        resolve(rows);
    });
}

// Helper: Normalize Egyptian/International Phone Numbers
function normalizePhoneNumber(phone) {
    if (!phone) return null;
    let cleaned = String(phone).replace(/\D/g, '');
    if (cleaned.length === 0) return null;
    
    if (cleaned.startsWith('01') && cleaned.length === 11) {
        cleaned = '2' + cleaned;
    } else if (cleaned.startsWith('1') && cleaned.length === 10) {
        cleaned = '20' + cleaned;
    } else if (cleaned.startsWith('00')) {
        cleaned = cleaned.slice(2);
    }
    
    return cleaned + '@c.us';
}

// Helper: Check if input target is a WhatsApp Group (Link or JID)
function isGroupTarget(phone) {
    if (!phone) return false;
    const str = String(phone).trim();
    return str.includes('chat.whatsapp.com') || str.endsWith('@g.us');
}

// Helper: Resolve Target JID (Supports individual numbers and Group Links / Group JIDs)
async function resolveTargetJid(phone) {
    if (!phone) return null;
    let input = String(phone).trim();

    // 1. If it's a WhatsApp Group Link
    if (input.includes('chat.whatsapp.com')) {
        try {
            const cleanInput = input.split('?')[0].split('#')[0].trim();
            const match = cleanInput.match(/chat\.whatsapp\.com\/([a-zA-Z0-9_-]+)/);
            const inviteCode = match ? match[1] : cleanInput.split('chat.whatsapp.com/')[1].split('/')[0];

            if (inviteCode) {
                console.log(`[Group Resolver] Attempting to resolve invite code: "${inviteCode}"...`);

                // Try 1: getInviteInfo
                if (wwebClient && typeof wwebClient.getInviteInfo === 'function') {
                    try {
                        const inviteInfo = await wwebClient.getInviteInfo(inviteCode);
                        console.log('[Group Resolver] getInviteInfo output:', inviteInfo);
                        if (inviteInfo) {
                            if (typeof inviteInfo === 'string' && inviteInfo.includes('@g.us')) {
                                return inviteInfo.endsWith('@g.us') ? inviteInfo : `${inviteInfo}@g.us`;
                            }
                            if (typeof inviteInfo.id === 'string') {
                                return inviteInfo.id.endsWith('@g.us') ? inviteInfo.id : `${inviteInfo.id}@g.us`;
                            }
                            if (inviteInfo.id && inviteInfo.id._serialized) {
                                return inviteInfo.id._serialized;
                            }
                            if (inviteInfo.id && inviteInfo.id.user) {
                                return `${inviteInfo.id.user}@g.us`;
                            }
                            if (inviteInfo.gid) {
                                const gidStr = typeof inviteInfo.gid === 'string' ? inviteInfo.gid : inviteInfo.gid.user;
                                return gidStr.endsWith('@g.us') ? gidStr : `${gidStr}@g.us`;
                            }
                        }
                    } catch (inviteErr) {
                        console.log('[Group Resolver] getInviteInfo warning:', inviteErr.message);
                    }
                }

                // Try 2: acceptInvite
                if (wwebClient && typeof wwebClient.acceptInvite === 'function') {
                    try {
                        const groupId = await wwebClient.acceptInvite(inviteCode);
                        console.log('[Group Resolver] acceptInvite output:', groupId);
                        if (groupId) {
                            if (typeof groupId === 'string') {
                                return groupId.endsWith('@g.us') ? groupId : `${groupId}@g.us`;
                            }
                            if (groupId._serialized) return groupId._serialized;
                            if (groupId.user) return `${groupId.user}@g.us`;
                        }
                    } catch (acceptErr) {
                        console.log('[Group Resolver] acceptInvite warning:', acceptErr.message);
                    }
                }

                // Try 3: Search existing joined group chats in WhatsApp client
                if (wwebClient && typeof wwebClient.getChats === 'function') {
                    try {
                        const chats = await wwebClient.getChats();
                        const groups = chats.filter(c => c.isGroup);
                        console.log(`[Group Resolver] Searching across ${groups.length} active group chats...`);
                        
                        for (const group of groups) {
                            if (!group || !group.id) continue;
                            const groupJid = group.id._serialized || `${group.id.user}@g.us`;

                            if (typeof group.getInviteCode === 'function') {
                                try {
                                    const code = await group.getInviteCode();
                                    if (code === inviteCode) {
                                        console.log('[Group Resolver] Matched group invite code via getInviteCode():', groupJid);
                                        return groupJid;
                                    }
                                } catch (e) {}
                            }
                        }
                    } catch (chatErr) {
                        console.log('[Group Resolver] getChats search warning:', chatErr.message);
                    }
                }
            }
        } catch (err) {
            console.error('Error resolving group invite link:', err.message);
        }
    }

    // 2. If it's already a Group JID (e.g., 120363048593849302@g.us)
    if (input.endsWith('@g.us')) {
        return input;
    }

    // 3. Fallback to standard individual phone normalization
    return normalizePhoneNumber(input);
}

// Helper: Fetch Rows (Fast Public CSV first, Service Account fallback)
async function fetchRowsAnyWay(spreadsheetId, range) {
    try {
        const rows = await fetchPublicSheetCsv(spreadsheetId);
        if (rows && rows.length > 0) return rows;
    } catch (e) {
        console.log('Public CSV fetch failed, falling back to Service Account...', e.message);
    }
    try {
        const sheets = getSheetsClient();
        let sheetTitle = 'Sheet1';
        try {
            const meta = await sheets.spreadsheets.get({ spreadsheetId });
            if (meta.data && meta.data.sheets && meta.data.sheets.length > 0) {
                sheetTitle = meta.data.sheets[0].properties.title;
            }
        } catch (mErr) {}

        const targetRange = range || `'${sheetTitle}'!A:Z`;
        const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: targetRange });
        if (response.data.values && response.data.values.length > 0) {
            return response.data.values;
        }
    } catch (e) {
        console.log('Service Account fetch failed:', e.message);
    }
    return [];
}

// Background Bulk Messaging Loop
async function runBulkSender() {
    while (currentJob.isRunning) {
        if (currentJob.isPaused) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
        }

        if (currentJob.currentIndex >= currentJob.list.length) {
            currentJob.isRunning = false;
            console.log('System Taha: Batch messaging completed successfully.');
            io.emit('job-status', { type: 'complete', job: currentJob });
            break;
        }

        const item = currentJob.list[currentJob.currentIndex];

        // Skip logic (Duplicate phone, duplicate name, or invalid)
        if (item.status.startsWith('Skipped')) {
            currentJob.skipped++;
            currentJob.currentIndex++;
            io.emit('job-status', { type: 'progress', job: currentJob, log: `Skipping Contact #${item.sheetRowIndex} (${item.name}): ${item.status}` });
            continue;
        }

        if (wwebStatus !== 'ready') {
            currentJob.isPaused = true;
            io.emit('job-status', { type: 'paused', job: currentJob, log: 'WhatsApp client disconnected. Batch paused automatically.' });
            continue;
        }

        const isGroup = item.isGroup || isGroupTarget(item.phone);
        console.log(`Sending message to ${isGroup ? 'Group: ' : ''}${item.name} (${item.phone})...`);
        io.emit('job-status', { type: 'progress', job: currentJob, log: `Sending message to ${isGroup ? 'Group: ' : ''}${item.name} (#${item.sheetRowIndex})...` });

        let wwebJid = null;
        if (isGroup) {
            wwebJid = await resolveTargetJid(item.phone);
        } else {
            wwebJid = normalizePhoneNumber(item.phone);
        }

        if (!wwebJid) {
            item.status = isGroup ? 'Failed (Invalid Group Link)' : 'Failed (Invalid Phone)';
            currentJob.failed++;
            currentJob.currentIndex++;
            io.emit('job-status', { type: 'progress', job: currentJob, log: `Contact #${item.sheetRowIndex}: Invalid ${isGroup ? 'group link' : 'phone number'}.` });
            continue;
        }

        try {
            // Support Spintax {Hello|Hi|Greetings} and {name} template variables
            let personalizedMessage = parseSpintax(currentJob.messageTemplate);
            personalizedMessage = personalizedMessage.replace(/{name}/gi, item.name);
            
            // Check if target is registered on WhatsApp (Only for individual chats, NOT groups)
            let isRegistered = true;
            if (!wwebJid.endsWith('@g.us')) {
                try {
                    if (typeof wwebClient.isRegisteredUser === 'function') {
                        isRegistered = await wwebClient.isRegisteredUser(wwebJid);
                    }
                } catch (regErr) {
                    console.log('User registration check skipped:', regErr.message);
                }
            }

            if (!isRegistered) {
                item.status = 'Failed (No WhatsApp)';
                currentJob.failed++;
                console.log(`Contact ${item.name} (${item.phone}) is not registered on WhatsApp.`);
                io.emit('job-status', { type: 'progress', job: currentJob, log: `❌ ${item.name} (${item.phone}): Number not on WhatsApp!` });
            } else {
                await wwebClient.sendMessage(wwebJid, personalizedMessage);
                item.status = 'Sent';
                currentJob.sent++;
                console.log(`Successfully sent to ${isGroup ? 'Group: ' : ''}${item.name}`);
                io.emit('job-status', { type: 'progress', job: currentJob, log: `✅ Successfully sent to ${isGroup ? 'Group: ' : ''}${item.name} (${item.phone})` });
            }
        } catch (error) {
            console.error(`Error sending message to ${item.name}:`, error.message);
            item.status = `Failed (${error.message.includes('not registered') ? 'No WhatsApp' : error.message})`;
            currentJob.failed++;
            io.emit('job-status', { type: 'progress', job: currentJob, log: `❌ Failed to send to ${item.name}: ${error.message}` });
        }

        currentJob.currentIndex++;

        // Anti-spam Safety Delay between messages
        if (currentJob.currentIndex < currentJob.list.length && currentJob.isRunning && !currentJob.isPaused) {
            const baseDelay = currentJob.safetyDelaySec || 8;
            // Add a small 1-3 second random jitter to make sending behavior human-like
            const jitter = Math.floor(Math.random() * 3);
            const delaySeconds = baseDelay + jitter;

            console.log(`Safety Delay: Waiting ${delaySeconds} seconds before sending next message...`);
            io.emit('job-status', { type: 'delay', delaySeconds, job: currentJob });
            
            for (let d = 0; d < delaySeconds; d++) {
                if (!currentJob.isRunning || currentJob.isPaused) break;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }
}

// Helper: Parse Spintax {Option 1|Option 2|Option 3}
function parseSpintax(text) {
    if (!text) return '';
    return text.replace(/\{([^{}]+)\}/g, (match, choices) => {
        const options = choices.split('|');
        if (options.length > 1) {
            return options[Math.floor(Math.random() * options.length)].trim();
        }
        return match;
    });
}

// REST Endpoint: Update Google Sheet Status & Comment
app.post('/api/update-sheet-record', async (req, res) => {
    const { spreadsheetId, sheetRowIndex, status, comment } = req.body;
    if (!spreadsheetId || !sheetRowIndex) {
        return res.status(400).json({ error: 'spreadsheetId and sheetRowIndex are required.' });
    }

    // Update in memory currentJob list if active
    if (currentJob && currentJob.list) {
        const target = currentJob.list.find(i => i.sheetRowIndex === parseInt(sheetRowIndex, 10));
        if (target) {
            if (status) target.status = status;
            if (comment !== undefined) target.comment = comment;
        }
    }

    try {
        const sheets = getSheetsClient();
        let targetRange = `C${sheetRowIndex}:D${sheetRowIndex}`;

        try {
            const meta = await sheets.spreadsheets.get({ spreadsheetId });
            if (meta.data && meta.data.sheets && meta.data.sheets.length > 0) {
                const sheetTitle = meta.data.sheets[0].properties.title;
                targetRange = `'${sheetTitle}'!C${sheetRowIndex}:D${sheetRowIndex}`;
            }
        } catch (mErr) {
            console.log('Sheet metadata fetch fallback:', mErr.message);
        }

        try {
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: targetRange,
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: [[status || '', comment || '']]
                }
            });
        } catch (firstErr) {
            console.log(`First update attempt (${targetRange}) failed:`, firstErr.message, '. Retrying with un-prefixed range...');
            // Fallback: Retry with simple range without sheet title prefix
            const simpleRange = `C${sheetRowIndex}:D${sheetRowIndex}`;
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: simpleRange,
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: [[status || '', comment || '']]
                }
            });
            targetRange = simpleRange;
        }

        console.log(`Updated Sheet Row #${sheetRowIndex} (${targetRange}): Status="${status}", Comment="${comment}"`);
        res.json({ success: true, message: `Sheet Row #${sheetRowIndex} updated successfully.` });
    } catch (error) {
        console.log('Google Sheet update error / fallback:', error.message);
        if (error.message && (error.message.includes('does not have permission') || error.message.includes('403'))) {
            return res.status(403).json({
                success: false,
                error: 'Google Sheet permission required: Click Share in your sheet and set to "Anyone with the link can Edit", or add confirmation@calls-502909.iam.gserviceaccount.com as Editor.'
            });
        }
        res.json({ success: true, warning: 'Updated locally in app state.' });
    }
});

// REST Endpoint: Send Single Test Message
app.post('/api/send-single-message', async (req, res) => {
    const { phone, name, message } = req.body;
    if (!phone || !message) {
        return res.status(400).json({ error: 'Phone number/Group link and message text are required.' });
    }
    if (wwebStatus !== 'ready') {
        return res.status(400).json({ error: 'WhatsApp client is not connected.' });
    }

    const isGroup = isGroupTarget(phone);
    let wwebJid = null;
    if (isGroup) {
        wwebJid = await resolveTargetJid(phone);
    } else {
        wwebJid = normalizePhoneNumber(phone);
    }

    if (!wwebJid) {
        return res.status(400).json({ error: `Invalid ${isGroup ? 'group link' : 'phone number'} format.` });
    }

    try {
        let textToSend = parseSpintax(message);
        textToSend = textToSend.replace(/{name}/gi, name || 'Customer');
        
        await wwebClient.sendMessage(wwebJid, textToSend);
        console.log(`Single message sent to ${isGroup ? 'Group' : 'Phone'} (${phone})`);
        res.json({ success: true, message: `Test message sent successfully to ${isGroup ? 'Group' : phone}` });
    } catch (err) {
        console.error(`Single message failed for ${phone}:`, err.message);
        res.status(500).json({ error: `Failed to send message: ${err.message}` });
    }
});

// REST Endpoint: Logout / Reset WhatsApp Session
app.post('/api/logout-whatsapp', async (req, res) => {
    try {
        wwebStatus = 'disconnected';
        io.emit('whatsapp-status', { status: 'disconnected', reason: 'User requested session logout' });
        
        try {
            await wwebClient.logout();
        } catch (e) {
            console.log('Client logout warning:', e.message);
        }

        console.log('Resetting WhatsApp client session...');
        wwebStatus = 'connecting';
        io.emit('whatsapp-status', { status: 'connecting' });
        
        setTimeout(() => {
            wwebClient.initialize().catch(err => {
                console.error('Failed to re-initialize WhatsApp client:', err);
                wwebStatus = 'disconnected';
                io.emit('whatsapp-status', { status: 'disconnected', error: err.message });
            });
        }, 2000);

        res.json({ success: true, message: 'WhatsApp session reset initialized. New QR code incoming...' });
    } catch (err) {
        res.status(500).json({ error: err.message || 'Failed to logout WhatsApp session.' });
    }
});

// REST Endpoints
app.get('/api/status', (req, res) => {
    res.json({ whatsapp: wwebStatus, job: currentJob });
});

// REST Endpoint: Get User's Joined WhatsApp Groups
app.get('/api/groups', async (req, res) => {
    if (wwebStatus !== 'ready') {
        return res.status(400).json({ error: 'WhatsApp client is not connected.' });
    }

    try {
        const chats = await wwebClient.getChats();
        const groups = chats
            .filter(chat => chat.isGroup)
            .map(group => ({
                id: group.id._serialized,
                name: group.name
            }));

        res.json({ success: true, groups });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch WhatsApp groups: ' + err.message });
    }
});

// REST Endpoint: Preview Sheet
app.post('/api/preview-sheet', async (req, res) => {
    const { spreadsheetId, range } = req.body;
    if (!spreadsheetId) {
        return res.status(400).json({ error: 'Spreadsheet URL or ID is required.' });
    }

    try {
        const rows = await fetchRowsAnyWay(spreadsheetId, range);
        if (!rows || rows.length === 0) {
            return res.json({ records: [] });
        }

        const records = [];
        const seenPhones = new Set();
        const seenNames = new Set();
        const startIndex = rows.length > 1 && isNaN(rows[0][1]) ? 1 : 0;

        let nameColIdx = 0;
        let phoneColIdx = 1;

        if (rows.length > startIndex) {
            const sampleRow = rows[startIndex];
            const valA = String(sampleRow[0] || '').replace(/\D/g, '');
            const valB = String(sampleRow[1] || '').replace(/\D/g, '');
            const isAOrBGroup = isGroupTarget(sampleRow[0]) || isGroupTarget(sampleRow[1]);
            if (!isAOrBGroup && valA.length >= 8 && valB.length < 8) {
                phoneColIdx = 0;
                nameColIdx = 1;
            }
        }

        for (let i = startIndex; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;

            let name = '';
            let phone = '';
            let isGroup = false;

            // 1. Scan entire row for WhatsApp group link
            for (let c = 0; c < row.length; c++) {
                const cellVal = row[c] ? String(row[c]).trim() : '';
                if (isGroupTarget(cellVal)) {
                    phone = cellVal;
                    isGroup = true;
                    // Extract name from another non-link cell in the same row
                    for (let n = 0; n < row.length; n++) {
                        if (n !== c && row[n]) {
                            const possibleName = String(row[n]).trim();
                            if (possibleName && !isGroupTarget(possibleName) && possibleName !== 'Attending' && possibleName !== 'Pending' && possibleName !== 'No Response' && possibleName !== 'Issue') {
                                name = possibleName;
                                break;
                            }
                        }
                    }
                    break;
                }
            }

            // 2. If no group link found in row cells, use column indices
            if (!phone) {
                let colA = row[0] ? String(row[0]).trim() : '';
                let colB = row[1] ? String(row[1]).trim() : '';

                if (!colA && !colB) continue;

                name = row[nameColIdx] ? String(row[nameColIdx]).trim() : 'Customer';
                phone = row[phoneColIdx] ? String(row[phoneColIdx]).trim() : '';

                if (!phone && isGroupTarget(name)) {
                    phone = name;
                    name = 'جروب واتساب';
                    isGroup = true;
                }
            }

            if (!phone) continue;

            if (isGroup || isGroupTarget(phone)) {
                isGroup = true;
                if (!name || name === 'Customer') {
                    name = 'جروب واتساب';
                }
            }

            let rowStatus = 'Pending';
            const wwebJid = isGroup ? phone : normalizePhoneNumber(phone);
            const normName = name.toLowerCase();

            if (!wwebJid) {
                rowStatus = isGroup ? 'Invalid Group Link' : 'Invalid Phone';
            } else if (seenPhones.has(wwebJid)) {
                rowStatus = isGroup ? 'Skipped (Duplicate Group)' : 'Skipped (Duplicate Phone)';
            } else if (seenNames.has(normName) && normName !== 'customer' && normName !== 'عميلنا العزيز' && normName !== 'جروب واتساب') {
                rowStatus = 'Skipped (Duplicate Name)';
            } else {
                seenPhones.add(wwebJid);
                if (normName) seenNames.add(normName);
            }

            const rawStatus = row[2] ? String(row[2]).trim() : '';
            const rawComment = row[3] ? String(row[3]).trim() : '';

            records.push({
                name,
                phone,
                isGroup,
                status: rowStatus,
                sheetStatus: rawStatus || 'Attending',
                comment: rawComment || '',
                sheetRowIndex: i + 1
            });
        }

        res.json({ records });
    } catch (error) {
        console.error('Error fetching sheets data:', error);
        res.status(500).json({ error: error.message || 'Failed to parse Google Sheet.' });
    }
});

// REST Endpoint: Send Custom List (Excel upload / Manual text / Sliced range)
app.post('/api/send-custom-list', async (req, res) => {
    const { records, messageTemplate, safetyDelaySec } = req.body;
    if (!records || !records.length || !messageTemplate) {
        return res.status(400).json({ error: 'Contact list and message template are required.' });
    }

    if (wwebStatus !== 'ready') {
        return res.status(400).json({ error: 'WhatsApp client is not connected. Scan QR code first.' });
    }

    if (currentJob.isRunning) {
        return res.status(400).json({ error: 'A batch sending job is already active.' });
    }

    const list = [];
    const seenPhones = new Set();
    const seenNames = new Set();

    records.forEach((rec) => {
        const name = rec.name ? String(rec.name).trim() : 'Customer';
        const phone = rec.phone ? String(rec.phone).trim() : '';
        if (!phone) return;

        const isGroup = isGroupTarget(phone) || Boolean(rec.isGroup);
        const wwebJid = isGroup ? phone : normalizePhoneNumber(phone);
        const normName = name.toLowerCase();
        let status = 'Pending';

        if (!wwebJid) {
            status = isGroup ? 'Failed (Invalid Group Link)' : 'Failed (Invalid Phone)';
        } else if (seenPhones.has(wwebJid)) {
            status = isGroup ? 'Skipped (Duplicate Group)' : 'Skipped (Duplicate Phone)';
        } else if (seenNames.has(normName) && normName !== 'customer' && normName !== 'عميلنا العزيز') {
            status = 'Skipped (Duplicate Name)';
        } else {
            seenPhones.add(wwebJid);
            if (normName) seenNames.add(normName);
        }

        list.push({
            name,
            phone,
            isGroup,
            status,
            sheetRowIndex: rec.sheetRowIndex || (list.length + 1)
        });
    });

    currentJob = {
        isRunning: true,
        isPaused: false,
        spreadsheetId: 'Custom Batch List',
        range: 'N/A',
        messageTemplate,
        safetyDelaySec: parseInt(safetyDelaySec, 10) || 8,
        total: list.length,
        sent: 0,
        failed: list.filter(item => item.status.startsWith('Failed')).length,
        skipped: list.filter(item => item.status.startsWith('Skipped')).length,
        currentIndex: 0,
        list
    };

    runBulkSender();
    io.emit('job-status', { type: 'start', job: currentJob });
    res.json({ success: true, job: currentJob });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Unhandled express error:', err);
    res.status(500).json({ error: err.message || 'Server error occurred.' });
});

// Socket.io Events
io.on('connection', async (socket) => {
    if (wwebStatus === 'qr' && lastQrCode) {
        try {
            const qrDataUrl = await QRCode.toDataURL(lastQrCode, { width: 300, margin: 2 });
            socket.emit('whatsapp-status', { status: wwebStatus, qr: lastQrCode, qrDataUrl });
        } catch (err) {
            socket.emit('whatsapp-status', { status: wwebStatus, qr: lastQrCode });
        }
    } else {
        socket.emit('whatsapp-status', { status: wwebStatus, qr: lastQrCode });
    }
    socket.emit('job-status', { type: 'sync', job: currentJob });

    socket.on('control-job', (action) => {
        if (!currentJob.isRunning) return;

        if (action === 'pause') {
            currentJob.isPaused = true;
            io.emit('job-status', { type: 'paused', job: currentJob, log: '⏸️ Batch job paused by user.' });
        } else if (action === 'resume') {
            currentJob.isPaused = false;
            io.emit('job-status', { type: 'resume', job: currentJob, log: '▶️ Batch job resumed by user.' });
        } else if (action === 'stop') {
            currentJob.isRunning = false;
            io.emit('job-status', { type: 'stopped', job: currentJob, log: '⏹️ Batch job stopped by user.' });
        }
    });
});

// Run Server
server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 System Taha: WhatsApp Sender is running on http://localhost:${PORT}`);
    console.log(`======================================================\n`);
});
