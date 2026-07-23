// Determine socket server target (supports Vercel hybrid deployment)
let socketServerUrl = window.location.origin;
const savedBackendUrl = localStorage.getItem('system_taha_backend_url');

if (window.location.hostname.includes('vercel.app')) {
    const box = document.getElementById('server-url-box');
    const input = document.getElementById('custom-backend-input');
    const btnSave = document.getElementById('btn-save-backend');
    
    if (box) box.style.display = 'flex';
    if (input) input.value = savedBackendUrl || '';
    if (savedBackendUrl) socketServerUrl = savedBackendUrl;

    if (btnSave) {
        btnSave.addEventListener('click', () => {
            const val = input.value.trim();
            if (val) {
                localStorage.setItem('system_taha_backend_url', val);
                window.location.reload();
            }
        });
    }
}

// Establish Socket.io Connection
const socket = io(socketServerUrl, { transports: ['websocket', 'polling'] });

// DOM Elements
const connectionDot = document.getElementById('connection-dot');
const connectionText = document.getElementById('connection-text');
const connectionRadar = document.getElementById('connection-radar');

const spreadsheetIdInput = document.getElementById('spreadsheet-id');
const sheetRangeInput = document.getElementById('sheet-range');
const messageTemplateInput = document.getElementById('message-template');
const rangeFromInput = document.getElementById('range-from');
const rangeToInput = document.getElementById('range-to');
const safetyDelayInput = document.getElementById('range-delay');

const btnPreview = document.getElementById('btn-preview');
const btnStart = document.getElementById('btn-start');
const btnPause = document.getElementById('btn-pause');
const btnResume = document.getElementById('btn-resume');
const btnStop = document.getElementById('btn-stop');

const jobControls = document.getElementById('job-controls');
const progressFill = document.getElementById('progress-fill');
const progressPercentage = document.getElementById('progress-percentage');
const progressCounts = document.getElementById('progress-counts');

const qrCanvas = document.getElementById('qr-canvas');
const qrImage = document.getElementById('qr-image');
const qrLoadingOverlay = document.getElementById('qr-loading-overlay');
const qrSuccessOverlay = document.getElementById('qr-success-overlay');
const qrInstructionText = document.getElementById('qr-instruction-text');

const statTotal = document.getElementById('stat-total');
const statSent = document.getElementById('stat-sent');
const statFailed = document.getElementById('stat-failed');
const statSkipped = document.getElementById('stat-skipped');

const delayBanner = document.getElementById('delay-banner');
const delayMessage = document.getElementById('delay-message');

const consoleLogs = document.getElementById('console-logs');
const teachersTableBody = document.getElementById('teachers-table-body');

// Local UI state
let isWhatsappConnected = false;
let allLoadedRecords = [];
let slicedBatchRecords = [];
let activeSourceMode = 'file'; // 'file' | 'text' | 'sheet'
let currentCountdownInterval = null;

// Helper to extract spreadsheet ID if a full URL is pasted
function extractSpreadsheetId(val) {
    if (!val) return '';
    const match = val.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : val.trim();
}

// Auto-extract Spreadsheet ID on paste/input
if (spreadsheetIdInput) {
    spreadsheetIdInput.addEventListener('input', (e) => {
        const val = e.target.value;
        const extracted = extractSpreadsheetId(val);
        if (extracted && extracted !== val) {
            spreadsheetIdInput.value = extracted;
            addLog(`Extracted Google Sheet ID: ${extracted}`, 'system');
        }
    });

    spreadsheetIdInput.addEventListener('paste', () => {
        setTimeout(() => {
            const val = spreadsheetIdInput.value;
            const extracted = extractSpreadsheetId(val);
            if (extracted) {
                spreadsheetIdInput.value = extracted;
                addLog(`Extracted Google Sheet ID: ${extracted}`, 'system');
            }
        }, 50);
    });
}

// Switch active input source tab
function switchSource(mode, btnElem) {
    activeSourceMode = mode;
    document.querySelectorAll('.source-tab').forEach(b => b.classList.remove('active'));
    btnElem.classList.add('active');

    document.querySelectorAll('.input-source-section').forEach(sec => sec.style.display = 'none');
    document.getElementById(`section-${mode}`).style.display = 'block';

    updateStartButtonState();
}

function updateStartButtonState() {
    if (isWhatsappConnected) {
        if (slicedBatchRecords.length > 0 || (activeSourceMode === 'sheet' && spreadsheetIdInput.value.trim().length > 0)) {
            btnStart.disabled = false;
            return;
        }
    }
    btnStart.disabled = true;
}

// Apply Batch Range Filter (e.g. #1 to #15)
function applyRangeFilter() {
    if (!allLoadedRecords || allLoadedRecords.length === 0) return;

    let fromIdx = parseInt(rangeFromInput.value, 10) || 1;
    let toIdx = parseInt(rangeToInput.value, 10) || 15;

    if (fromIdx < 1) fromIdx = 1;
    if (toIdx < fromIdx) toIdx = fromIdx;

    slicedBatchRecords = allLoadedRecords.slice(fromIdx - 1, toIdx);

    const seenPhones = new Set();
    const seenNames = new Set();

    slicedBatchRecords.forEach((rec) => {
        const normPhone = String(rec.phone).replace(/\D/g, '');
        const normName = String(rec.name).trim().toLowerCase();

        if (seenPhones.has(normPhone)) {
            rec.status = 'Skipped (Duplicate Phone)';
        } else if (seenNames.has(normName) && normName !== 'customer' && normName !== 'عميلنا العزيز') {
            rec.status = 'Skipped (Duplicate Name)';
        } else {
            seenPhones.add(normPhone);
            if (normName) seenNames.add(normName);
            rec.status = 'Pending Batch';
        }
    });

    renderTeachersTable(slicedBatchRecords);
    statTotal.textContent = slicedBatchRecords.length;
    statSkipped.textContent = slicedBatchRecords.filter(r => r.status.startsWith('Skipped')).length;

    addLog(`Batch range selected: #${fromIdx} to #${toIdx} (${slicedBatchRecords.length} contacts).`, 'system');

    updateStartButtonState();
}

// Handle Excel / CSV File Upload
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    addLog(`Reading Excel file: ${file.name}...`, 'system');
    const reader = new FileReader();

    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            if (rows.length === 0) {
                alert('File is empty. Select a valid Excel file.');
                return;
            }

            allLoadedRecords = [];
            let startIdx = 0;
            if (rows.length > 1 && isNaN(rows[0][1])) {
                startIdx = 1;
            }

            for (let i = startIdx; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length === 0) continue;

                let name = row[0] ? String(row[0]).trim() : 'Customer';
                let phone = row[1] ? String(row[1]).trim() : '';

                if (String(row[0]).replace(/\D/g, '').length >= 8) {
                    phone = String(row[0]).trim();
                    name = row[1] ? String(row[1]).trim() : 'Customer';
                }

                if (phone) {
                    allLoadedRecords.push({
                        sheetRowIndex: i + 1,
                        name: name,
                        phone: phone,
                        status: 'Pending Batch'
                    });
                }
            }

            rangeFromInput.value = 1;
            rangeToInput.value = Math.min(15, allLoadedRecords.length);

            applyRangeFilter();
            addLog(`Loaded ${allLoadedRecords.length} total contacts from file. Range #1 to #${rangeToInput.value} selected.`, 'success');
        } catch (err) {
            console.error(err);
            alert('Error reading Excel file: ' + err.message);
            addLog('File reading error: ' + err.message, 'error');
        }
    };

    reader.readAsArrayBuffer(file);
}

// Parse manually pasted text
function parseManualText() {
    const text = document.getElementById('manual-paste-area').value.trim();
    if (!text) {
        alert('Please paste or enter contact list first.');
        return;
    }

    const lines = text.split('\n');
    allLoadedRecords = [];

    lines.forEach((line, idx) => {
        const parts = line.split(/[,;\t]/);
        let name = 'Customer';
        let phone = '';

        if (parts.length >= 2) {
            name = parts[0].trim();
            phone = parts[1].trim();
        } else {
            phone = parts[0].trim();
        }

        if (phone) {
            allLoadedRecords.push({
                sheetRowIndex: idx + 1,
                name: name,
                phone: phone,
                status: 'Pending Batch'
            });
        }
    });

    rangeFromInput.value = 1;
    rangeToInput.value = Math.min(15, allLoadedRecords.length);

    applyRangeFilter();
    addLog(`Parsed ${allLoadedRecords.length} contacts from text input.`, 'success');
}

// Event Action: Fetch Google Sheet
async function fetchGoogleSheetRecords() {
    const rawId = spreadsheetIdInput.value.trim();
    const spreadsheetId = extractSpreadsheetId(rawId);
    const range = sheetRangeInput ? sheetRangeInput.value.trim() : 'Sheet1!A:C';

    if (!spreadsheetId) {
        alert('Please enter a valid Google Sheet URL or ID.');
        return false;
    }

    spreadsheetIdInput.value = spreadsheetId;

    if (btnPreview) btnPreview.disabled = true;
    addLog(`Fetching Google Sheet records (ID: ${spreadsheetId})...`, 'system');

    try {
        const response = await fetch(`${socketServerUrl}/api/preview-sheet`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ spreadsheetId, range })
        });

        const data = await response.json();
        if (!response.ok || data.error) {
            throw new Error(data.error || 'Failed to fetch Google Sheet.');
        }

        allLoadedRecords = data.records || [];
        rangeFromInput.value = 1;
        rangeToInput.value = Math.min(15, allLoadedRecords.length);

        applyRangeFilter();
        addLog(`Fetched ${allLoadedRecords.length} records from Google Sheet.`, 'success');
        return true;
    } catch (error) {
        console.error(error);
        addLog(`Google Sheet error: ${error.message}`, 'error');
        alert(`Google Sheet Error:\n${error.message}`);
        return false;
    } finally {
        if (btnPreview) btnPreview.disabled = false;
    }
}

if (btnPreview) {
    btnPreview.addEventListener('click', fetchGoogleSheetRecords);
}

// Helper: Log message to UI console
function addLog(message, type = 'default') {
    const time = new Date().toLocaleTimeString();
    const logLine = document.createElement('div');
    logLine.className = `log-line ${type}`;
    logLine.textContent = `[${time}] ${message}`;
    consoleLogs.appendChild(logLine);
    consoleLogs.scrollTop = consoleLogs.scrollHeight;
}

// Socket.io Events: WhatsApp status
socket.on('whatsapp-status', (data) => {
    const { status, qrDataUrl } = data;
    
    connectionDot.className = 'status-dot';
    connectionRadar.className = 'pulse-radar';

    if (status === 'disconnected') {
        isWhatsappConnected = false;
        connectionDot.classList.add('disconnected');
        connectionText.textContent = 'Disconnected';
        
        qrLoadingOverlay.style.display = 'flex';
        qrSuccessOverlay.style.display = 'none';
        qrInstructionText.style.display = 'block';
        qrImage.style.display = 'none';
        qrCanvas.style.display = 'none';
        
        btnStart.disabled = true;
    } 
    else if (status === 'connecting') {
        isWhatsappConnected = false;
        connectionDot.classList.add('connecting');
        connectionRadar.classList.add('connecting');
        connectionText.textContent = 'Connecting...';
        
        qrLoadingOverlay.style.display = 'flex';
        qrSuccessOverlay.style.display = 'none';
        qrInstructionText.style.display = 'block';
        qrImage.style.display = 'none';
        qrCanvas.style.display = 'none';
        
        btnStart.disabled = true;
    } 
    else if (status === 'qr') {
        isWhatsappConnected = false;
        connectionDot.classList.add('qr');
        connectionRadar.classList.add('qr');
        connectionText.textContent = 'Scan QR Code';
        
        qrLoadingOverlay.style.display = 'none';
        qrSuccessOverlay.style.display = 'none';
        qrInstructionText.style.display = 'block';
        btnStart.disabled = true;
        
        if (qrDataUrl) {
            qrImage.src = qrDataUrl;
            qrImage.style.display = 'block';
            qrCanvas.style.display = 'none';
        }
    } 
    else if (status === 'ready') {
        isWhatsappConnected = true;
        connectionDot.classList.add('ready');
        connectionRadar.classList.add('ready');
        connectionText.textContent = 'Connected (Ready)';
        
        qrLoadingOverlay.style.display = 'none';
        qrSuccessOverlay.style.display = 'flex';
        qrInstructionText.style.display = 'none';
        qrImage.style.display = 'none';
        qrCanvas.style.display = 'none';
        
        updateStartButtonState();
        addLog('WhatsApp connection is authenticated and ready!', 'success');
    }
});

// Socket.io Events: Job status
socket.on('job-status', (data) => {
    const { type, job, log, delaySeconds } = data;
    
    statTotal.textContent = job.total || 0;
    statSent.textContent = job.sent || 0;
    statFailed.textContent = job.failed || 0;
    statSkipped.textContent = job.skipped || 0;

    if (log) {
        let logType = 'default';
        if (log.includes('✅') || log.includes('Successfully')) logType = 'success';
        else if (log.includes('❌') || log.includes('Failed')) logType = 'error';
        else if (log.includes('Skipping')) logType = 'warning';
        addLog(log, logType);
    }

    if (type === 'start' || (type === 'sync' && job.isRunning)) {
        jobControls.style.display = 'block';
        btnStart.disabled = true;
        
        if (job.isPaused) {
            btnPause.style.display = 'none';
            btnResume.style.display = 'inline-block';
        } else {
            btnPause.style.display = 'inline-block';
            btnResume.style.display = 'none';
        }
        
        if (job.list && job.list.length > 0) {
            renderTeachersTable(job.list);
        }
        updateProgressBar(job);
    }

    if (type === 'progress') {
        updateProgressBar(job);
        if (job.list && job.list[job.currentIndex - 1]) {
            const lastUpdatedItem = job.list[job.currentIndex - 1];
            updateTableRowStatus(lastUpdatedItem.sheetRowIndex, lastUpdatedItem.status);
        }
        delayBanner.style.display = 'none';
        if (currentCountdownInterval) clearInterval(currentCountdownInterval);
    }

    if (type === 'delay') {
        startDelayCountdown(delaySeconds);
    }

    if (type === 'stopped' || type === 'complete') {
        jobControls.style.display = 'none';
        updateStartButtonState();
        delayBanner.style.display = 'none';
        if (currentCountdownInterval) clearInterval(currentCountdownInterval);

        if (type === 'complete') {
            addLog('🎉 Batch messaging completed successfully!', 'success');
            alert('🎉 Batch messaging finished successfully!');
        }
    }
});

function startDelayCountdown(seconds) {
    if (currentCountdownInterval) clearInterval(currentCountdownInterval);
    delayBanner.style.display = 'flex';
    let remaining = seconds;
    delayMessage.textContent = `Anti-Spam Delay: Waiting ${remaining} seconds before next message...`;

    currentCountdownInterval = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            clearInterval(currentCountdownInterval);
            delayBanner.style.display = 'none';
        } else {
            delayMessage.textContent = `Anti-Spam Delay: Waiting ${remaining} seconds before next message...`;
        }
    }, 1000);
}

function updateProgressBar(job) {
    const total = job.total || 1;
    const processed = job.currentIndex || 0;
    const percent = Math.min(Math.round((processed / total) * 100), 100);
    
    progressFill.style.width = `${percent}%`;
    progressPercentage.textContent = `${percent}% Completed`;
    progressCounts.textContent = `${processed} / ${total} Messages`;
}

function renderTeachersTable(records) {
    if (records.length === 0) {
        teachersTableBody.innerHTML = `<tr><td colspan="4" class="empty-table-msg">No contacts loaded for this batch.</td></tr>`;
        return;
    }

    teachersTableBody.innerHTML = records.map((record) => {
        let badgeClass = 'pending';
        if (record.status.startsWith('Skipped')) badgeClass = 'skipped';
        else if (record.status.startsWith('Sent')) badgeClass = 'sent';
        else if (record.status.startsWith('Failed')) badgeClass = 'failed';

        return `
            <tr id="row-${record.sheetRowIndex}">
                <td>${record.sheetRowIndex}</td>
                <td><strong>${record.name}</strong></td>
                <td>${record.phone}</td>
                <td><span class="badge ${badgeClass}" id="badge-${record.sheetRowIndex}">${record.status}</span></td>
            </tr>
        `;
    }).join('');
}

function updateTableRowStatus(sheetRowIndex, status) {
    const badge = document.getElementById(`badge-${sheetRowIndex}`);
    if (badge) {
        badge.textContent = status;
        if (status.startsWith('Skipped')) badge.className = 'badge skipped';
        else if (status.startsWith('Sent')) badge.className = 'badge sent';
        else if (status.startsWith('Failed')) badge.className = 'badge failed';
    }
}

// Action: Trigger sending active batch
btnStart.addEventListener('click', async () => {
    const messageTemplate = messageTemplateInput.value.trim();
    const safetyDelaySec = parseInt(safetyDelayInput.value, 10) || 8;

    if (!messageTemplate) {
        alert('Please enter a message template.');
        return;
    }

    if (!isWhatsappConnected) {
        alert('WhatsApp client is not connected. Please scan QR code first.');
        return;
    }

    if (activeSourceMode === 'sheet' && slicedBatchRecords.length === 0) {
        const fetched = await fetchGoogleSheetRecords();
        if (!fetched || slicedBatchRecords.length === 0) {
            alert('Could not fetch records from Google Sheet. Check the link or permission.');
            return;
        }
    }

    if (!slicedBatchRecords || slicedBatchRecords.length === 0) {
        alert('No contacts loaded. Upload Excel or load contacts first.');
        return;
    }

    const fromIdx = rangeFromInput.value;
    const toIdx = rangeToInput.value;

    if (!confirm(`Are you sure you want to start sending batch #${fromIdx} to #${toIdx} (${slicedBatchRecords.length} contacts)?`)) {
        return;
    }

    btnStart.disabled = true;
    addLog(`Starting batch sending (#${fromIdx} to #${toIdx})...`, 'system');

    try {
        const response = await fetch(`${socketServerUrl}/api/send-custom-list`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                records: slicedBatchRecords,
                messageTemplate,
                safetyDelaySec
            })
        });

        const data = await response.json();
        if (!response.ok || data.error) {
            throw new Error(data.error || 'Failed to start batch sending.');
        }
        
        addLog('Batch sending initialized successfully!', 'success');
    } catch (error) {
        console.error(error);
        addLog(`Sending failed: ${error.message}`, 'error');
        alert(`Sending Error:\n${error.message}`);
        btnStart.disabled = false;
    }
});

btnPause.addEventListener('click', () => socket.emit('control-job', 'pause'));
btnResume.addEventListener('click', () => socket.emit('control-job', 'resume'));
btnStop.addEventListener('click', () => {
    if (confirm('Are you sure you want to cancel current batch messaging?')) {
        socket.emit('control-job', 'stop');
    }
});
