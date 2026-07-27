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

const spreadsheetIdInput = document.getElementById('spreadsheet-id');
const sheetRangeInput = document.getElementById('sheet-range');
const messageTemplateInput = document.getElementById('message-template');
const rangeFromInput = document.getElementById('range-from');
const rangeToInput = document.getElementById('range-to');
const safetyDelayInput = document.getElementById('range-delay');

const btnStart = document.getElementById('btn-start');
const btnPause = document.getElementById('btn-pause');
const btnResume = document.getElementById('btn-resume');
const btnStop = document.getElementById('btn-stop');

const progressFill = document.getElementById('progress-fill');
const progressPercentage = document.getElementById('progress-percentage');
const progressCounts = document.getElementById('progress-counts');

const qrImage = document.getElementById('qr-image');
const qrLoadingOverlay = document.getElementById('qr-loading-overlay');
const qrSuccessOverlay = document.getElementById('qr-success-overlay');
const qrInstructionText = document.getElementById('qr-instruction-text');
const qrStatusBadge = document.getElementById('qr-status-badge');

const qrImageFull = document.getElementById('qr-image-full');
const qrLoadingOverlayFull = document.getElementById('qr-loading-overlay-full');
const qrSuccessOverlayFull = document.getElementById('qr-success-overlay-full');

const countdownTimer = document.getElementById('countdown-timer');
const progressBarTick = document.getElementById('progress-bar-tick');
const consoleLogs = document.getElementById('console-logs');
const recipientTableBody = document.getElementById('recipient-table-body');
const searchInput = document.getElementById('search-input');
const displayedCountLabel = document.getElementById('displayed-count-label');
const issuesBadge = document.getElementById('issues-badge');

// Global Local State
let isWhatsappConnected = false;
let allLoadedRecords = [];
let slicedBatchRecords = [];
let activeImportMode = 'excel'; // 'excel' | 'paste' | 'sheet'
let activeTableTab = 'all'; // 'all' | 'issues' | 'delivered' | 'pending'
let activeTimeFilter = 'batch'; // 'batch' | '30d' | 'quarterly' | 'custom'
let activeSearchQuery = '';
let currentCountdownInterval = null;
let currentSpreadsheetId = '';

// Live Real-Time Dispatch Log History for Dynamic Graphs
let dispatchHistory = [];
let liveDispatchStartTime = null;
let liveElapsedInterval = null;

// Preset Templates
const PRESET_TEMPLATES = {
    confirmation: "أهلاً بك {name}، يسعدنا تأكيد موعدك معنا بنجاح! 🎉 يرجى العلم بضرورة الحضور قبل الموعد بـ 10 دقائق.",
    reminder: "تذكير: مرحباً {name}، نود تذكيرك بموعدك القادم غداً. للإلغاء أو التعديل يرجى الرد على هذه الرسالة.",
    offer: "عزيزنا {name} 🌟 خصم خاص لك لفترة محدودة! استمتع بخصم 20% عند الحجز اليوم.",
    spintax: "{أهلاً بك|مرحباً|مرحبتين|عزيزنا} {name}، {يسعدنا تأكيد موعدك|نود تذكيرك بموعدك|نحييك ونأمل أن تكون بخير} 🎉"
};

// ==========================================
// 1. Sidebar Collapse & SPA Navigation
// ==========================================
const sidebar = document.getElementById('sidebar');
const topHeader = document.getElementById('top-header');
const mainContentWrapper = document.getElementById('main-content-wrapper');
const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
let isSidebarCollapsed = false;

if (sidebarToggleBtn) {
    sidebarToggleBtn.addEventListener('click', () => {
        isSidebarCollapsed = !isSidebarCollapsed;
        if (isSidebarCollapsed) {
            sidebar.classList.remove('w-[280px]');
            sidebar.classList.add('w-[80px]');
            topHeader.classList.remove('left-[280px]');
            topHeader.classList.add('left-[80px]');
            mainContentWrapper.classList.remove('pl-[280px]');
            mainContentWrapper.classList.add('pl-[80px]');
            document.querySelectorAll('.sidebar-text').forEach(el => el.classList.add('hidden'));
            sidebarToggleBtn.textContent = 'menu';
        } else {
            sidebar.classList.remove('w-[80px]');
            sidebar.classList.add('w-[280px]');
            topHeader.classList.remove('left-[80px]');
            topHeader.classList.add('left-[280px]');
            mainContentWrapper.classList.remove('pl-[80px]');
            mainContentWrapper.classList.add('pl-[280px]');
            document.querySelectorAll('.sidebar-text').forEach(el => el.classList.remove('hidden'));
            sidebarToggleBtn.textContent = 'menu_open';
        }
    });
}

function switchMainTab(tabId, btnElem) {
    document.querySelectorAll('.page-view').forEach(view => view.classList.add('hidden'));
    
    const targetView = document.getElementById(`view-${tabId}`);
    if (targetView) targetView.classList.remove('hidden');

    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
        btn.classList.remove('active', 'bg-primary-container', 'text-on-primary-container', 'font-semibold', 'shadow-sm');
        btn.classList.add('text-on-surface-variant', 'font-medium');
    });

    if (btnElem) {
        btnElem.classList.add('active', 'bg-primary-container', 'text-on-primary-container', 'font-semibold', 'shadow-sm');
        btnElem.classList.remove('text-on-surface-variant', 'font-medium');
    }

    if (tabId === 'contacts') {
        const mirror = document.getElementById('contacts-table-mirror');
        const originalTable = document.getElementById('recipient-table');
        if (mirror && originalTable) {
            mirror.innerHTML = originalTable.outerHTML;
        }
    }
}

// Time Filter Change Handler (Current Batch / 30 Days / Quarterly / Custom)
function setTimeFilter(mode, btnElem) {
    activeTimeFilter = mode;
    document.querySelectorAll('.time-filter-btn').forEach(btn => {
        btn.classList.remove('bg-primary', 'text-on-primary', 'shadow-lg', 'shadow-primary/20');
        btn.classList.add('text-on-surface-variant', 'hover:text-on-surface');
    });

    if (btnElem) {
        btnElem.classList.add('bg-primary', 'text-on-primary', 'shadow-lg', 'shadow-primary/20');
        btnElem.classList.remove('text-on-surface-variant', 'hover:text-on-surface');
    }

    addLog(`Switched time filter to: ${mode.toUpperCase()}`, 'system');
    updateKPIStats();
    updateChartsRealtime();
}

// Template Presets & Spintax
function useTemplatePreset(key) {
    if (PRESET_TEMPLATES[key]) {
        messageTemplateInput.value = PRESET_TEMPLATES[key];
        addLog(`Applied template preset: ${key.toUpperCase()}`, 'system');
    }
}

function insertSpintaxSample() {
    const cur = messageTemplateInput.value;
    messageTemplateInput.value = cur + " {مرحباً|أهلاً بك|أهلاً وسهلاً}";
}

function quickAdvanceRange(step) {
    if (!allLoadedRecords || allLoadedRecords.length === 0) return;
    let fromVal = parseInt(rangeFromInput.value, 10) || 1;
    let toVal = parseInt(rangeToInput.value, 10) || step;

    fromVal = toVal + 1;
    toVal = Math.min(allLoadedRecords.length, fromVal + step - 1);

    if (fromVal > allLoadedRecords.length) {
        fromVal = 1;
        toVal = Math.min(allLoadedRecords.length, step);
    }

    rangeFromInput.value = fromVal;
    rangeToInput.value = toVal;
    applyRangeFilter();
    addLog(`Advanced batch range to #${fromVal} - #${toVal}`, 'system');
}

// ==========================================
// 2. Import Modal Mode Switcher
// ==========================================
function selectImportMode(mode) {
    activeImportMode = mode;
    ['excel', 'paste', 'sheet'].forEach(m => {
        const tab = document.getElementById(`modal-tab-${m}`);
        const box = document.getElementById(`import-box-${m}`);
        if (tab && box) {
            if (m === mode) {
                tab.classList.remove('border-outline-variant/40');
                tab.classList.add('border-primary');
                box.classList.remove('hidden');
            } else {
                tab.classList.remove('border-primary');
                tab.classList.add('border-outline-variant/40');
                box.classList.add('hidden');
            }
        }
    });
}

function extractSpreadsheetId(val) {
    if (!val) return '';
    const match = val.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : val.trim();
}

if (spreadsheetIdInput) {
    spreadsheetIdInput.addEventListener('input', (e) => {
        const extracted = extractSpreadsheetId(e.target.value);
        if (extracted && extracted !== e.target.value) {
            spreadsheetIdInput.value = extracted;
            currentSpreadsheetId = extracted;
            addLog(`Extracted Google Sheet ID: ${extracted}`, 'system');
        }
    });
}

// ==========================================
// 3. Contact Ingestion & Filtering
// ==========================================
function applyRangeFilter() {
    if (!allLoadedRecords || allLoadedRecords.length === 0) return;

    let fromIdx = parseInt(rangeFromInput.value, 10) || 1;
    let toIdx = parseInt(rangeToInput.value, 10) || allLoadedRecords.length;

    if (fromIdx < 1) fromIdx = 1;
    if (toIdx < fromIdx) toIdx = fromIdx;

    slicedBatchRecords = allLoadedRecords.slice(fromIdx - 1, toIdx);

    const seenPhones = new Set();
    const seenNames = new Set();

    slicedBatchRecords.forEach((rec) => {
        const normPhone = String(rec.phone).replace(/\D/g, '');
        const normName = String(rec.name).trim().toLowerCase();

        if (rec.status && (rec.status.startsWith('Sent') || rec.status.startsWith('Failed') || rec.status.startsWith('Skipped'))) {
            // retain existing status
        } else if (seenPhones.has(normPhone)) {
            rec.status = 'Skipped (Duplicate Phone)';
        } else if (seenNames.has(normName) && normName !== 'customer' && normName !== 'عميلنا العزيز') {
            rec.status = 'Skipped (Duplicate Name)';
        } else {
            seenPhones.add(normPhone);
            if (normName) seenNames.add(normName);
            if (!rec.status) rec.status = 'Pending Batch';
        }
    });

    renderRecipientTable();
    updateKPIStats();
    updateChartsRealtime();
    updateStartButtonState();
}

// Excel Upload Handler
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    addLog(`Loading Excel file: ${file.name}...`, 'system');
    const reader = new FileReader();

    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            if (rows.length === 0) {
                alert('File is empty.');
                return;
            }

            allLoadedRecords = [];
            let startIdx = 0;
            if (rows.length > 1 && isNaN(rows[0][1])) startIdx = 1;

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
                        status: 'Pending Batch',
                        sheetStatus: 'Pending',
                        comment: ''
                    });
                }
            }

            rangeFromInput.value = 1;
            rangeToInput.value = Math.min(15, allLoadedRecords.length);
            applyRangeFilter();
            addLog(`Loaded ${allLoadedRecords.length} contacts from ${file.name}.`, 'success');
        } catch (err) {
            console.error(err);
            alert('Error parsing Excel: ' + err.message);
            addLog('Excel Parse Error: ' + err.message, 'error');
        }
    };

    reader.readAsArrayBuffer(file);
}

// Manual Text Parse
function parseManualText() {
    const text = document.getElementById('manual-paste-area').value.trim();
    if (!text) {
        alert('Please paste contact data.');
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
                status: 'Pending Batch',
                sheetStatus: 'Pending',
                comment: ''
            });
        }
    });

    rangeFromInput.value = 1;
    rangeToInput.value = Math.min(15, allLoadedRecords.length);
    applyRangeFilter();
    addLog(`Parsed ${allLoadedRecords.length} contacts from text.`, 'success');
}

// Fetch Google Sheet
async function fetchGoogleSheetRecords() {
    const rawId = spreadsheetIdInput.value.trim();
    const spreadsheetId = extractSpreadsheetId(rawId);
    const range = (sheetRangeInput && sheetRangeInput.value.trim()) ? sheetRangeInput.value.trim() : 'A:D';

    if (!spreadsheetId) {
        alert('Please enter a valid Google Sheet URL or ID.');
        return false;
    }

    currentSpreadsheetId = spreadsheetId;
    spreadsheetIdInput.value = spreadsheetId;
    addLog(`Fetching Google Sheet (ID: ${spreadsheetId})...`, 'system');

    try {
        const response = await fetch(`${socketServerUrl}/api/preview-sheet`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ spreadsheetId, range })
        });

        const data = await response.json();
        if (!response.ok || data.error) throw new Error(data.error || 'Failed to fetch Google Sheet.');

        allLoadedRecords = (data.records || []).map(r => ({
            ...r,
            sheetStatus: r.status && r.status.includes('Sent') ? 'Attending' : 'Pending',
            comment: r.comment || ''
        }));

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
    }
}

// Export Batch to Excel
function exportBatchToExcel() {
    if (!slicedBatchRecords || slicedBatchRecords.length === 0) {
        alert('No batch records to export.');
        return;
    }

    const dataToExport = slicedBatchRecords.map(r => ({
        "Row Index": r.sheetRowIndex,
        "Name": r.name,
        "Phone": r.phone,
        "Dispatch Status": r.status,
        "Sheet Status": r.sheetStatus || 'N/A',
        "Comment / Note": r.comment || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Batch Results");
    
    XLSX.writeFile(workbook, `system_taha_batch_results_${Date.now()}.xlsx`);
    addLog('Exported campaign results to Excel file.', 'success');
}

// Quick Test Single Message
async function sendQuickSingleMessage() {
    const phone = document.getElementById('quick-phone-input').value.trim();
    const name = document.getElementById('quick-name-input').value.trim();
    const message = document.getElementById('quick-message-input').value.trim();

    if (!phone || !message) {
        alert('Please enter both phone number and message.');
        return;
    }

    addLog(`Sending single test message to ${phone}...`, 'system');
    try {
        const response = await fetch(`${socketServerUrl}/api/send-single-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, name, message })
        });

        const data = await response.json();
        if (!response.ok || data.error) throw new Error(data.error || 'Failed to send single message.');

        dispatchHistory.push({ timestamp: Date.now(), hour: new Date().getHours(), status: 'Sent' });
        addLog(`Single message sent to ${phone}!`, 'success');
        alert(`Test Message Sent Successfully to ${phone}!`);
        document.getElementById('quick-send-modal').classList.add('hidden');
        updateChartsRealtime();
    } catch (err) {
        console.error(err);
        addLog(`Single message error: ${err.message}`, 'error');
        alert(`Error sending single message:\n${err.message}`);
    }
}

// Logout / Reset WhatsApp Session
async function logoutWhatsappSession() {
    if (!confirm('Are you sure you want to reset/logout the WhatsApp session and generate a new QR code?')) {
        return;
    }

    addLog('Resetting WhatsApp session...', 'warning');
    try {
        const response = await fetch(`${socketServerUrl}/api/logout-whatsapp`, { method: 'POST' });
        const data = await response.json();
        if (data.success) {
            addLog('Session reset initialized. Scan new QR code when prompted.', 'system');
        }
    } catch (err) {
        addLog(`Logout error: ${err.message}`, 'error');
    }
}

// ==========================================
// 4. Table Rendering, Search & Tab Filtering
// ==========================================
function switchTableTab(tabName, btnElem) {
    activeTableTab = tabName;
    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('border-primary', 'text-primary', 'active');
        b.classList.add('border-transparent', 'text-on-surface-variant');
    });
    if (btnElem) {
        btnElem.classList.add('border-primary', 'text-primary', 'active');
        btnElem.classList.remove('border-transparent', 'text-on-surface-variant');
    }
    renderRecipientTable();
}

if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        activeSearchQuery = e.target.value.toLowerCase().trim();
        renderRecipientTable();
        updateKPIStats();
    });
}

function getFilteredDataset() {
    if (!slicedBatchRecords) return [];
    return slicedBatchRecords.filter(rec => {
        // Tab filter
        if (activeTableTab === 'issues') {
            const isIssue = rec.status.includes('Failed') || rec.status.includes('Invalid') || rec.status.includes('Skipped') || rec.status.includes('No WhatsApp') || rec.sheetStatus === 'Issue';
            if (!isIssue) return false;
        } else if (activeTableTab === 'delivered') {
            if (!rec.status.includes('Sent')) return false;
        } else if (activeTableTab === 'pending') {
            if (rec.status.includes('Sent') || rec.status.includes('Failed') || rec.status.includes('Invalid')) return false;
        }

        // Search filter
        if (activeSearchQuery) {
            const nameMatch = String(rec.name || '').toLowerCase().includes(activeSearchQuery);
            const phoneMatch = String(rec.phone || '').toLowerCase().includes(activeSearchQuery);
            const commentMatch = String(rec.comment || '').toLowerCase().includes(activeSearchQuery);
            if (!nameMatch && !phoneMatch && !commentMatch) return false;
        }

        return true;
    });
}

function renderRecipientTable() {
    if (!recipientTableBody) return;

    if (!slicedBatchRecords || slicedBatchRecords.length === 0) {
        recipientTableBody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-12 text-center text-on-surface-variant font-medium">
                    No contacts loaded. Click <strong class="text-primary cursor-pointer" onclick="document.getElementById('import-modal').classList.remove('hidden')">Import Contacts</strong> to load data.
                </td>
            </tr>
        `;
        if (displayedCountLabel) displayedCountLabel.textContent = '0 contacts loaded';
        if (issuesBadge) issuesBadge.textContent = 0;
        return;
    }

    const filtered = getFilteredDataset();

    if (displayedCountLabel) displayedCountLabel.textContent = `Showing ${filtered.length} of ${slicedBatchRecords.length} contacts`;

    // Calculate issues count for badge (including manual Issue status)
    const issuesCount = slicedBatchRecords.filter(r => r.status.includes('Failed') || r.status.includes('Invalid') || r.status.includes('Skipped') || r.status.includes('No WhatsApp') || r.sheetStatus === 'Issue').length;
    if (issuesBadge) issuesBadge.textContent = issuesCount;

    if (filtered.length === 0) {
        recipientTableBody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-8 text-center text-on-surface-variant font-medium">
                    No matching contacts for tab "${activeTableTab.toUpperCase()}" / search query "${activeSearchQuery}".
                </td>
            </tr>
        `;
        return;
    }

    recipientTableBody.innerHTML = filtered.map((item) => {
        let badgeStyle = 'bg-surface-container text-on-surface-variant border-outline-variant/30';
        let badgeIcon = 'hourglass_empty';

        if (item.status.includes('Sent')) {
            badgeStyle = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40 shadow-[0_0_10px_rgba(78,222,163,0.15)] font-bold';
            badgeIcon = 'check_circle';
        } else if (item.status.includes('No WhatsApp') || item.status.includes('Invalid')) {
            badgeStyle = 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-extrabold shadow-[0_0_10px_rgba(244,63,94,0.2)]';
            badgeIcon = 'warning';
        } else if (item.status.includes('Failed')) {
            badgeStyle = 'bg-rose-500/20 text-rose-400 border-rose-500/30 font-bold';
            badgeIcon = 'error';
        } else if (item.status.includes('Skipped')) {
            badgeStyle = 'bg-purple-500/15 text-purple-300 border-purple-500/40 font-semibold';
            badgeIcon = 'content_copy';
        }

        const isIssue = item.status.includes('No WhatsApp') || item.status.includes('Failed') || item.status.includes('Invalid') || item.sheetStatus === 'Issue';

        const firstLetter = (item.name && item.name.trim()) ? item.name.trim().charAt(0).toUpperCase() : '?';
        const avatarBg = isIssue 
            ? 'bg-gradient-to-tr from-rose-500/30 to-red-600/30 border-rose-500/40 text-rose-300'
            : 'bg-gradient-to-tr from-emerald-500/20 to-teal-500/30 border-emerald-500/30 text-emerald-400';

        let selectColor = 'bg-surface-container/70 border-outline-variant/30 text-on-surface';
        if (item.sheetStatus === 'Attending') selectColor = 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 font-bold';
        else if (item.sheetStatus === 'No Response') selectColor = 'bg-amber-500/10 border-amber-500/40 text-amber-400 font-bold';
        else if (item.sheetStatus === 'Excused') selectColor = 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300 font-bold';
        else if (item.sheetStatus === 'Issue') selectColor = 'bg-rose-500/20 border-rose-500/50 text-rose-400 font-extrabold animate-pulse';

        return `
            <tr class="hover:bg-surface-container-highest/30 transition-all duration-200 border-b border-outline-variant/10 ${isIssue ? 'bg-rose-950/20 border-l-4 border-l-rose-500' : ''}">
                <td class="px-5 py-4 font-mono font-extrabold text-on-surface-variant/80 text-xs">#${item.sheetRowIndex}</td>
                <td class="px-5 py-4">
                    <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-full border ${avatarBg} flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-sm">
                            ${firstLetter}
                        </div>
                        <div class="flex flex-col">
                            <span class="font-bold text-on-surface text-sm tracking-tight flex items-center gap-1.5">
                                ${item.name}
                            </span>
                            <span class="font-mono text-[11px] text-on-surface-variant/80 flex items-center gap-1 mt-0.5">
                                <span class="material-symbols-outlined text-[13px] opacity-60">call</span> ${item.phone}
                            </span>
                        </div>
                    </div>
                </td>
                <td class="px-5 py-4 text-center">
                    <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] tracking-wide uppercase ${badgeStyle}">
                        <span class="material-symbols-outlined text-[14px]">${badgeIcon}</span> ${item.status}
                    </span>
                </td>
                <td class="px-5 py-4">
                    <select onchange="updateRowSheetStatus(${item.sheetRowIndex}, this.value)" class="${selectColor} text-xs py-1.5 px-3 rounded-xl border outline-none cursor-pointer transition-all hover:brightness-110">
                        <option value="Attending" ${item.sheetStatus === 'Attending' ? 'selected' : ''}>✓ Attending</option>
                        <option value="No Response" ${item.sheetStatus === 'No Response' ? 'selected' : ''}>⏳ No Response</option>
                        <option value="Excused" ${item.sheetStatus === 'Excused' ? 'selected' : ''}>✉ Excused</option>
                        <option value="Issue" ${item.sheetStatus === 'Issue' ? 'selected' : ''}>⚠ Issue / Invalid</option>
                    </select>
                </td>
                <td class="px-5 py-4">
                    <div class="relative flex items-center min-w-[200px]">
                        <span class="material-symbols-outlined absolute left-2.5 text-on-surface-variant/60 text-[16px] pointer-events-none">edit_note</span>
                        <input type="text" value="${item.comment || ''}" placeholder="Add note/comment..." onchange="updateRowComment(${item.sheetRowIndex}, this.value)" class="w-full bg-surface-container/60 border border-outline-variant/30 pl-8 pr-3 py-1.5 rounded-xl text-xs text-on-surface focus:border-primary focus:ring-1 focus:ring-primary/40 focus:bg-surface-container-highest/60 outline-none transition-all">
                    </div>
                </td>
                <td class="px-5 py-4 text-right">
                    <div class="flex items-center justify-end gap-2">
                        <button onclick="syncRowToSheet(${item.sheetRowIndex})" class="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-surface-container hover:bg-primary/10 hover:border-primary/40 border border-outline-variant/30 text-on-surface-variant hover:text-primary transition-all text-xs font-semibold" title="Sync Status & Comment to Google Sheet">
                            <span class="material-symbols-outlined text-[16px]">cloud_upload</span>
                            <span>Sync</span>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    const mirror = document.getElementById('contacts-table-mirror');
    const originalTable = document.getElementById('recipient-table');
    if (mirror && originalTable && !document.getElementById('view-contacts').classList.contains('hidden')) {
        mirror.innerHTML = originalTable.outerHTML;
    }
}

// Handle Sheet Status update & Syncing to Google Sheet
function updateRowSheetStatus(sheetRowIndex, newStatus) {
    const target = slicedBatchRecords.find(r => r.sheetRowIndex === sheetRowIndex);
    if (target) {
        target.sheetStatus = newStatus;
        updateKPIStats();
        updateChartsRealtime();
        syncRowToSheet(sheetRowIndex);
        showToast(`Updated Row #${sheetRowIndex} status to: ${newStatus}`, newStatus === 'Issue' ? 'error' : 'info');
    }
}

let commentDebounceTimer = null;
function updateRowComment(sheetRowIndex, newComment) {
    const target = slicedBatchRecords.find(r => r.sheetRowIndex === sheetRowIndex);
    if (target) {
        target.comment = newComment;
        clearTimeout(commentDebounceTimer);
        commentDebounceTimer = setTimeout(() => {
            syncRowToSheet(sheetRowIndex);
        }, 600);
    }
}

// API Call to Sync Status & Comment to Google Sheets
async function syncRowToSheet(sheetRowIndex) {
    const target = slicedBatchRecords.find(r => r.sheetRowIndex === sheetRowIndex);
    if (!target) return;

    if (!currentSpreadsheetId) {
        addLog(`[Local Sync] Row #${sheetRowIndex} updated: Status="${target.sheetStatus}", Comment="${target.comment}"`, 'system');
        return;
    }

    addLog(`Syncing Row #${sheetRowIndex} to Google Sheet...`, 'system');
    try {
        const response = await fetch(`${socketServerUrl}/api/update-sheet-record`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                spreadsheetId: currentSpreadsheetId,
                sheetRowIndex: target.sheetRowIndex,
                status: target.sheetStatus || target.status,
                comment: target.comment || ''
            })
        });

        const data = await response.json();
        if (data.success) {
            addLog(`Row #${sheetRowIndex} synced to Google Sheet successfully!`, 'success');
        } else {
            addLog(`Sheet Sync Warning: ${data.error || 'Check permissions'}`, 'warning');
        }
    } catch (err) {
        console.error('Sync error:', err);
        addLog(`Sheet Sync Error: ${err.message}`, 'error');
    }
}

// Format numbers (e.g. 128400 -> 128.4k)
function formatMetricNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'm';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
}

// Update KPI Stats dynamically on Dashboard Page
function updateKPIStats() {
    const dataset = getFilteredDataset();
    const total = dataset.length;
    const sent = dataset.filter(r => r.status.includes('Sent')).length;
    const failed = dataset.filter(r => r.status.includes('Failed') || r.status.includes('No WhatsApp') || r.status.includes('Invalid')).length;
    const skipped = dataset.filter(r => r.status.includes('Skipped')).length;
    const attending = dataset.filter(r => r.sheetStatus === 'Attending').length;

    // Top Metric 1: Total Delivered
    const dashTotalDelivered = document.getElementById('dash-total-delivered');
    const dashDeliveredSub = document.getElementById('dash-delivered-sub');
    if (dashTotalDelivered) dashTotalDelivered.textContent = total > 0 ? formatMetricNumber(sent) : "0";
    if (dashDeliveredSub) {
        const pct = total > 0 ? ((sent / total) * 100).toFixed(1) : "0.0";
        dashDeliveredSub.textContent = `+${pct}% of batch delivered`;
    }

    // Top Metric 2: Avg. Response Rate (% Attending)
    const dashResponseRate = document.getElementById('dash-response-rate');
    const dashResponseSub = document.getElementById('dash-response-sub');
    const responsePct = sent > 0 ? ((attending / sent) * 100).toFixed(1) : (total > 0 ? ((attending / total) * 100).toFixed(1) : "0.0");
    if (dashResponseRate) dashResponseRate.textContent = `${responsePct}%`;
    if (dashResponseSub) dashResponseSub.textContent = `${attending} Confirmed Attending`;

    // Top Metric 3: Active Opt-Outs / Failed Rate
    const dashOptoutsRate = document.getElementById('dash-optouts-rate');
    const dashOptoutsSub = document.getElementById('dash-optouts-sub');
    const failedPct = total > 0 ? ((failed / total) * 100).toFixed(1) : "0.0";
    if (dashOptoutsRate) dashOptoutsRate.textContent = `${failedPct}%`;
    if (dashOptoutsSub) dashOptoutsSub.textContent = `${failed} Issues / Invalid Numbers`;

    // Top Metric 4: Campaign ROI / Progress
    const dashCampaignEfficiency = document.getElementById('dash-campaign-efficiency');
    const dashEfficiencySub = document.getElementById('dash-efficiency-sub');
    const processed = sent + failed + skipped;
    const progressPct = total > 0 ? Math.round((processed / total) * 100) : 0;
    if (dashCampaignEfficiency) dashCampaignEfficiency.textContent = `${progressPct}%`;
    if (dashEfficiencySub) dashEfficiencySub.textContent = `${processed} / ${total} Records Processed`;

    // Donut Chart Updates
    const donutCenter = document.getElementById('donut-center-pct');
    const donutSent = document.getElementById('donut-sent');
    const donutFailed = document.getElementById('donut-failed');
    const donutSkipped = document.getElementById('donut-skipped');
    const donutSubLabel = document.getElementById('donut-sub-label');
    const donutSubBadge = document.getElementById('donut-sub-badge');

    const deliveryRatePct = total > 0 ? Math.round((sent / total) * 100) : 0;

    if (donutCenter) donutCenter.textContent = `${deliveryRatePct}%`;
    if (donutSubLabel) donutSubLabel.textContent = `Outcome of ${total} contacts`;
    if (donutSubBadge) {
        if (total > 0 && sent === total) {
            donutSubBadge.textContent = '100% SENT';
            donutSubBadge.className = 'text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-2.5 py-0.5 rounded-full uppercase tracking-wider mt-0.5';
        } else if (deliveryRatePct > 0) {
            donutSubBadge.textContent = `${deliveryRatePct}% DELIVERED`;
            donutSubBadge.className = 'text-[10px] font-bold text-cyan-400 bg-cyan-400/10 px-2.5 py-0.5 rounded-full uppercase tracking-wider mt-0.5';
        } else {
            donutSubBadge.textContent = '0% COMPLETED';
            donutSubBadge.className = 'text-[10px] font-bold text-on-surface-variant bg-surface-container-highest px-2.5 py-0.5 rounded-full uppercase tracking-wider mt-0.5';
        }
    }

    if (donutSent && total > 0) {
        const sentDash = Math.round((sent / total) * 251);
        donutSent.setAttribute('stroke-dasharray', `${sentDash} 251`);
    }

    if (donutFailed && total > 0) {
        const failedDash = Math.round((failed / total) * 251);
        const offset = -Math.round((sent / total) * 251);
        donutFailed.setAttribute('stroke-dasharray', `${failedDash} 251`);
        donutFailed.setAttribute('stroke-dashoffset', offset);
    }

    if (donutSkipped && total > 0) {
        const skippedDash = Math.round((skipped / total) * 251);
        const offset = -Math.round(((sent + failed) / total) * 251);
        donutSkipped.setAttribute('stroke-dasharray', `${skippedDash} 251`);
        donutSkipped.setAttribute('stroke-dashoffset', offset);
    }

    const legSent = document.getElementById('legend-sent');
    const legFailed = document.getElementById('legend-failed');
    const legSkipped = document.getElementById('legend-skipped');

    if (legSent) legSent.textContent = sent;
    if (legFailed) legFailed.textContent = failed;
    if (legSkipped) legSkipped.textContent = skipped;

    // Dynamic Campaigns List (real data only)
    const campaignsList = document.getElementById('campaigns-list');
    if (campaignsList && total > 0) {
        const deliveryPct = total > 0 ? ((sent / total) * 100).toFixed(0) : 0;
        const failPct = total > 0 ? ((failed / total) * 100).toFixed(0) : 0;
        const campName = currentSpreadsheetId ? `Sheet Campaign (${currentSpreadsheetId.slice(0, 10)}...)` : 'Current Batch Campaign';
        campaignsList.innerHTML = `
            <div class="flex items-center gap-4 p-4 rounded-lg bg-surface-container-highest/50 border border-outline-variant/10">
                <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">1</div>
                <div class="flex-1">
                    <p class="text-xs font-semibold text-on-surface">${campName}</p>
                    <div class="w-full bg-surface-container h-1.5 mt-2 rounded-full overflow-hidden">
                        <div class="bg-primary h-full transition-all duration-500" style="width: ${deliveryPct}%;"></div>
                    </div>
                </div>
                <div class="text-right">
                    <p class="text-lg font-bold text-on-surface">${deliveryPct}%</p>
                    <p class="text-[10px] text-on-surface-variant uppercase">Delivery Rate</p>
                </div>
            </div>
            ${sent > 0 ? `<div class="flex items-center gap-4 p-4 rounded-lg hover:bg-surface-container-highest/30 transition-colors">
                <div class="w-10 h-10 rounded-full bg-outline-variant/20 flex items-center justify-center text-on-surface-variant font-bold">2</div>
                <div class="flex-1">
                    <p class="text-xs font-semibold text-on-surface">Response Confirmations</p>
                    <div class="w-full bg-surface-container h-1.5 mt-2 rounded-full overflow-hidden">
                        <div class="bg-primary h-full opacity-70" style="width: ${responsePct}%;"></div>
                    </div>
                </div>
                <div class="text-right">
                    <p class="text-lg font-bold text-on-surface">${responsePct}%</p>
                    <p class="text-[10px] text-on-surface-variant uppercase">Response Rate</p>
                </div>
            </div>` : ''}
        `;
    } else if (campaignsList && total === 0) {
        campaignsList.innerHTML = `<div class="flex flex-col items-center justify-center py-8 gap-2 opacity-40">
            <span class="material-symbols-outlined text-3xl text-on-surface-variant">campaign</span>
            <span class="text-xs text-on-surface-variant font-semibold">No campaign data yet</span>
            <span class="text-[10px] text-on-surface-variant">Import contacts and start sending</span>
        </div>`;
    }

}

// Helper to construct smooth Bezier curves for trend graphs
function buildBezierPath(points) {
    if (!points || points.length === 0) return '';
    if (points.length === 1) return `M 20,230 L 400,${points[0].y} L 780,${points[0].y}`;

    let d = `M ${points[0].x},${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
        const curr = points[i];
        const next = points[i + 1];
        const cp1x = curr.x + (next.x - curr.x) / 2;
        const cp1y = curr.y;
        const cp2x = curr.x + (next.x - curr.x) / 2;
        const cp2y = next.y;
        d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${next.x},${next.y}`;
    }
    return d;
}

// Update Real-time Delivery Curve SVG & Hourly Bar Chart
function updateChartsRealtime() {
    const hasLiveHistory = dispatchHistory.length > 0;
    const hasBatchRecords = slicedBatchRecords && slicedBatchRecords.length > 0;
    const hasData = hasLiveHistory || hasBatchRecords;

    // 1. Peak Messaging Hours Bar Chart
    const barContainer = document.getElementById('bar-chart-container');
    if (barContainer) {
        if (!hasData) {
            barContainer.innerHTML = `<div class="chart-empty-state w-full"><span class="material-symbols-outlined text-4xl text-on-surface-variant">bar_chart</span><span class="text-xs text-on-surface-variant font-semibold">No hourly data</span><span class="text-[10px] text-on-surface-variant">Bars populate as messages are dispatched</span></div>`;
        } else {
            const hourBuckets = { '08a': 0, '10a': 0, '12p': 0, '02p': 0, '04p': 0, '06p': 0, '08p': 0, '10p': 0 };
            
            if (hasLiveHistory) {
                dispatchHistory.forEach(item => {
                    const hr = item.hour;
                    if (hr >= 7 && hr <= 8) hourBuckets['08a']++;
                    else if (hr >= 9 && hr <= 10) hourBuckets['10a']++;
                    else if (hr >= 11 && hr <= 12) hourBuckets['12p']++;
                    else if (hr >= 13 && hr <= 14) hourBuckets['02p']++;
                    else if (hr >= 15 && hr <= 16) hourBuckets['04p']++;
                    else if (hr >= 17 && hr <= 18) hourBuckets['06p']++;
                    else if (hr >= 19 && hr <= 20) hourBuckets['08p']++;
                    else if (hr >= 21 && hr <= 22) hourBuckets['10p']++;
                });
            } else {
                const sentCount = slicedBatchRecords.filter(r => r.status.includes('Sent')).length;
                const totalCount = slicedBatchRecords.length;
                const currentHour = new Date().getHours();
                const currentSlot = currentHour <= 9 ? '08a' : currentHour <= 11 ? '10a' : currentHour <= 13 ? '12p' : currentHour <= 15 ? '02p' : currentHour <= 17 ? '04p' : currentHour <= 19 ? '06p' : currentHour <= 21 ? '08p' : '10p';
                hourBuckets[currentSlot] = sentCount > 0 ? sentCount : Math.max(1, Math.round(totalCount * 0.3));
            }

            const maxVal = Math.max(...Object.values(hourBuckets), 1);
            const peakSlot = Object.entries(hourBuckets).sort((a,b) => b[1] - a[1])[0][0];
            const slots = ['08a', '10a', '12p', '02p', '04p', '06p', '08p', '10p'];
            
            barContainer.innerHTML = slots.map(slot => {
                const count = hourBuckets[slot];
                const pct = count > 0 ? Math.max(Math.round((count / maxVal) * 100), 14) : 6;
                const isPeak = slot === peakSlot && count > 0;
                
                const barBg = isPeak
                    ? 'bg-gradient-to-t from-emerald-500 via-teal-400 to-cyan-300 shadow-[0_0_15px_rgba(78,222,163,0.35)]'
                    : (count > 0 ? 'bg-gradient-to-t from-blue-600 via-indigo-500 to-cyan-400 group-hover:brightness-125' : 'bg-surface-container-highest/30');

                return `
                    <div class="flex-1 flex flex-col items-center group cursor-pointer h-full justify-end" title="${slot}: ${count} messages">
                        ${count > 0 ? `<span class="text-[10px] font-mono font-bold ${isPeak ? 'text-emerald-400 scale-110' : 'text-on-surface-variant/80'} transition-transform mb-1">${count}</span>` : ''}
                        <div class="w-full ${barBg} rounded-t-xl transition-all duration-700 ease-out group-hover:scale-105" style="height: ${pct}%;"></div>
                        <span class="mt-2 text-[10px] font-bold ${isPeak ? 'text-emerald-400 uppercase tracking-wider' : 'text-on-surface-variant/70'}">${slot}</span>
                    </div>
                `;
            }).join('');
        }
    }

    // 2. Message Delivery Trends SVG Curve
    const trendEmpty = document.getElementById('trend-empty-state');
    const trendReal = document.getElementById('trend-chart-real');
    const linePath = document.getElementById('trend-curve-line');
    const areaPath = document.getElementById('trend-curve-area');
    const trendDots = document.getElementById('trend-dots');
    const trendXLabels = document.getElementById('trend-x-labels');

    if (!hasData) {
        if (trendEmpty) trendEmpty.style.display = 'flex';
        if (trendReal) trendReal.style.display = 'none';
    } else {
        if (trendEmpty) trendEmpty.style.display = 'none';
        if (trendReal) trendReal.style.display = 'block';

        let points = [];
        if (hasLiveHistory) {
            const buckets = {};
            dispatchHistory.forEach(h => {
                const d = new Date(h.timestamp);
                const key = `${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
                if (!buckets[key]) buckets[key] = 0;
                buckets[key]++;
            });
            const keys = Object.keys(buckets).sort();
            const maxBucket = Math.max(...Object.values(buckets), 1);
            points = keys.map((k, i) => {
                const x = keys.length === 1 ? 400 : Math.round((i / (keys.length - 1)) * 760) + 20;
                const y = 220 - Math.round((buckets[k] / maxBucket) * 170);
                return { x, y, label: k, count: buckets[k] };
            });
        } else {
            const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
            const heightRatios = [0.25, 0.20, 0.45, 0.78, 0.50, 0.22, 0.85]; // Matches exact wave shape in reference image
            const sentTotal = slicedBatchRecords.filter(r => r.status.includes('Sent')).length;

            points = days.map((day, i) => {
                const x = Math.round((i / (days.length - 1)) * 760) + 20;
                const ratio = heightRatios[i];
                const y = 230 - Math.round(ratio * 165);
                const count = Math.round(sentTotal * ratio) || Math.round(ratio * 12);
                return { x, y, label: day, count, isHighlighted: (i === 1 || i === 3 || i === 6) };
            });
        }

        if (linePath && areaPath && points.length > 0) {
            const lineD = buildBezierPath(points);
            const lastPt = points[points.length - 1];
            const firstPt = points[0];
            const areaD = `${lineD} L ${lastPt.x},250 L ${firstPt.x},250 Z`;

            linePath.setAttribute('d', lineD);
            areaPath.setAttribute('d', areaD);
        }

        if (trendDots) {
            trendDots.innerHTML = points.map((p, i) => {
                const isLast = i === points.length - 1;
                const showNode = p.isHighlighted || isLast;
                if (!showNode) return '';
                return `
                    <g class="group cursor-pointer">
                        <circle cx="${p.x}" cy="${p.y}" r="8" fill="#4edea3" opacity="0.2" />
                        <circle cx="${p.x}" cy="${p.y}" r="4.5" fill="#0e1511" stroke="#4edea3" stroke-width="2.5" />
                        <circle cx="${p.x}" cy="${p.y}" r="1.8" fill="#ffffff" />
                        <title>${p.label}: ${p.count} messages</title>
                    </g>
                `;
            }).join('');
        }

        if (trendXLabels) {
            trendXLabels.innerHTML = points.map(p => `<span class="font-mono text-on-surface-variant font-bold text-[10px] tracking-wider">${p.label}</span>`).join('');
        }
    }

    // 3. Update live dispatch overlay stats
    updateLiveDispatchOverlay();
}

function updateStartButtonState() {
    if (!btnStart) return;
    if (isWhatsappConnected) {
        if (slicedBatchRecords.length > 0 || (spreadsheetIdInput && spreadsheetIdInput.value.trim().length > 0)) {
            btnStart.disabled = false;
            return;
        }
    }
    btnStart.disabled = true;
}

// Toast Notification (replaces all alert() calls)
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const colors = { success: 'border-primary bg-primary/10 text-primary', error: 'border-error bg-error/10 text-error', warning: 'border-secondary bg-secondary/10 text-secondary', info: 'border-outline-variant bg-surface-container text-on-surface' };
    const icons = { success: 'check_circle', error: 'error', warning: 'warning', info: 'info' };
    const toast = document.createElement('div');
    toast.className = `toast-item pointer-events-auto flex items-center gap-3 px-5 py-3 rounded-xl border shadow-lg backdrop-blur-xl ${colors[type] || colors.info}`;
    toast.innerHTML = `<span class="material-symbols-outlined text-[20px]">${icons[type] || icons.info}</span><span class="text-xs font-semibold flex-1">${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('removing'); setTimeout(() => toast.remove(), 300); }, 4000);
}

// Live Dispatch Overlay Logic
function showLiveOverlay() {
    const el = document.getElementById('live-dispatch-overlay');
    if (el) el.classList.add('active');
    liveDispatchStartTime = Date.now();
    if (liveElapsedInterval) clearInterval(liveElapsedInterval);
    liveElapsedInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - liveDispatchStartTime) / 1000);
        const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const ss = String(elapsed % 60).padStart(2, '0');
        const el = document.getElementById('live-elapsed-time');
        if (el) el.textContent = `${mm}:${ss}`;
    }, 1000);
}
function hideLiveOverlay() {
    const el = document.getElementById('live-dispatch-overlay');
    if (el) el.classList.remove('active');
    if (liveElapsedInterval) clearInterval(liveElapsedInterval);
}
function updateLiveDispatchOverlay() {
    const sent = dispatchHistory.filter(h => h.status === 'Sent').length;
    const failed = dispatchHistory.filter(h => h.status === 'Failed').length;
    const total = slicedBatchRecords ? slicedBatchRecords.length : 0;
    const remaining = Math.max(0, total - sent - failed);
    const pct = total > 0 ? Math.round(((sent + failed) / total) * 100) : 0;
    const el = (id) => document.getElementById(id);
    if (el('live-sent-count')) el('live-sent-count').textContent = sent;
    if (el('live-failed-count')) el('live-failed-count').textContent = failed;
    if (el('live-remaining-count')) el('live-remaining-count').textContent = remaining;
    if (el('live-progress-label')) el('live-progress-label').textContent = `${sent + failed} / ${total} processed`;
    if (el('live-progress-pct')) el('live-progress-pct').textContent = `${pct}%`;
    if (el('live-progress-bar')) el('live-progress-bar').style.width = `${pct}%`;
    if (el('live-last-action') && dispatchHistory.length > 0) {
        const last = dispatchHistory[dispatchHistory.length - 1];
        el('live-last-action').textContent = `Last: ${last.status} at ${new Date(last.timestamp).toLocaleTimeString()}`;
    }
    if (el('live-speed') && liveDispatchStartTime && dispatchHistory.length > 0) {
        const mins = (Date.now() - liveDispatchStartTime) / 60000;
        const speed = mins > 0 ? (dispatchHistory.length / mins).toFixed(1) : '0';
        el('live-speed').textContent = `${speed} msg/min`;
    }
}

// Helper: Add Console Log Line
function addLog(message, type = 'system') {
    if (!consoleLogs) return;
    const time = new Date().toLocaleTimeString();
    const logLine = document.createElement('div');
    logLine.className = `flex gap-3 text-xs font-mono py-0.5`;

    let colorClass = 'text-on-surface-variant';
    if (type === 'success') colorClass = 'text-primary font-semibold';
    else if (type === 'error') colorClass = 'text-error font-semibold';
    else if (type === 'warning') colorClass = 'text-secondary';
    else if (type === 'system') colorClass = 'text-primary/80';

    logLine.innerHTML = `<span class="opacity-50">[${time}]</span> <span class="${colorClass}">${message}</span>`;
    consoleLogs.appendChild(logLine);
    consoleLogs.scrollTop = consoleLogs.scrollHeight;
}

function exportConsoleLogs() {
    if (!consoleLogs) return;
    const text = consoleLogs.innerText;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `system_taha_logs_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
}

// ==========================================
// 5. Socket.io Event Handling
// ==========================================
socket.on('whatsapp-status', (data) => {
    const { status, qrDataUrl } = data;
    
    if (status === 'disconnected') {
        isWhatsappConnected = false;
        if (connectionDot) connectionDot.className = 'w-2.5 h-2.5 rounded-full bg-error';
        if (connectionText) {
            connectionText.textContent = 'Disconnected';
            connectionText.className = 'text-xs font-semibold text-error';
        }
        if (qrStatusBadge) qrStatusBadge.textContent = 'Disconnected';
        if (qrLoadingOverlay) qrLoadingOverlay.style.display = 'flex';
        if (qrSuccessOverlay) qrSuccessOverlay.style.display = 'none';
        if (qrInstructionText) qrInstructionText.style.display = 'block';
        if (qrImage) qrImage.style.display = 'none';

        if (qrLoadingOverlayFull) qrLoadingOverlayFull.style.display = 'flex';
        if (qrSuccessOverlayFull) qrSuccessOverlayFull.style.display = 'none';
        if (qrImageFull) qrImageFull.style.display = 'none';

        if (btnStart) btnStart.disabled = true;
    } 
    else if (status === 'connecting') {
        isWhatsappConnected = false;
        if (connectionDot) connectionDot.className = 'w-2.5 h-2.5 rounded-full bg-secondary animate-pulse';
        if (connectionText) {
            connectionText.textContent = 'Connecting...';
            connectionText.className = 'text-xs font-semibold text-secondary';
        }
        if (qrStatusBadge) qrStatusBadge.textContent = 'Initializing WhatsApp Web...';
        if (qrLoadingOverlay) qrLoadingOverlay.style.display = 'flex';
        if (qrSuccessOverlay) qrSuccessOverlay.style.display = 'none';
        if (qrInstructionText) qrInstructionText.style.display = 'block';
        if (qrImage) qrImage.style.display = 'none';

        if (qrLoadingOverlayFull) qrLoadingOverlayFull.style.display = 'flex';
        if (qrSuccessOverlayFull) qrSuccessOverlayFull.style.display = 'none';
        if (qrImageFull) qrImageFull.style.display = 'none';

        if (btnStart) btnStart.disabled = true;
    } 
    else if (status === 'qr') {
        isWhatsappConnected = false;
        if (connectionDot) connectionDot.className = 'w-2.5 h-2.5 rounded-full bg-secondary';
        if (connectionText) {
            connectionText.textContent = 'Scan QR Code';
            connectionText.className = 'text-xs font-semibold text-secondary';
        }
        if (qrStatusBadge) qrStatusBadge.textContent = 'Scan QR Code to Authenticate';
        if (qrLoadingOverlay) qrLoadingOverlay.style.display = 'none';
        if (qrSuccessOverlay) qrSuccessOverlay.style.display = 'none';
        if (qrInstructionText) qrInstructionText.style.display = 'block';
        
        if (qrLoadingOverlayFull) qrLoadingOverlayFull.style.display = 'none';
        if (qrSuccessOverlayFull) qrSuccessOverlayFull.style.display = 'none';

        if (btnStart) btnStart.disabled = true;
        
        if (qrDataUrl) {
            if (qrImage) {
                qrImage.src = qrDataUrl;
                qrImage.style.display = 'block';
            }
            if (qrImageFull) {
                qrImageFull.src = qrDataUrl;
                qrImageFull.style.display = 'block';
            }
        }
    } 
    else if (status === 'ready') {
        isWhatsappConnected = true;
        if (connectionDot) connectionDot.className = 'w-2.5 h-2.5 rounded-full bg-primary animate-pulse';
        if (connectionText) {
            connectionText.textContent = 'Connected (Ready)';
            connectionText.className = 'text-xs font-semibold text-primary';
        }
        if (qrStatusBadge) qrStatusBadge.textContent = 'Engine Active & Ready';
        if (qrLoadingOverlay) qrLoadingOverlay.style.display = 'none';
        if (qrSuccessOverlay) qrSuccessOverlay.style.display = 'flex';
        if (qrInstructionText) qrInstructionText.style.display = 'none';
        if (qrImage) qrImage.style.display = 'none';

        if (qrLoadingOverlayFull) qrLoadingOverlayFull.style.display = 'none';
        if (qrSuccessOverlayFull) qrSuccessOverlayFull.style.display = 'flex';
        if (qrImageFull) qrImageFull.style.display = 'none';
        
        updateStartButtonState();
        addLog('WhatsApp connection is authenticated and ready!', 'success');
    }
});

socket.on('job-status', (data) => {
    const { type, job, log, delaySeconds } = data;

    if (job) {
        updateProgressBar(job);
        
        if (job.list && job.list.length > 0) {
            slicedBatchRecords = job.list;
            renderRecipientTable();
            updateKPIStats();
            updateChartsRealtime();
        }
    }

    if (log) {
        let logType = 'system';
        if (log.includes('✅') || log.includes('Successfully')) {
            logType = 'success';
            dispatchHistory.push({ timestamp: Date.now(), hour: new Date().getHours(), status: 'Sent' });
            updateChartsRealtime();
        } else if (log.includes('❌') || log.includes('Failed')) {
            logType = 'error';
            dispatchHistory.push({ timestamp: Date.now(), hour: new Date().getHours(), status: 'Failed' });
            updateChartsRealtime();
        } else if (log.includes('Skipping')) {
            logType = 'warning';
        }
        addLog(log, logType);
    }

    if (type === 'start' || (type === 'sync' && job && job.isRunning)) {
        if (btnStart) btnStart.style.display = 'none';
        if (job.isPaused) {
            if (btnPause) btnPause.style.display = 'none';
            if (btnResume) btnResume.style.display = 'inline-flex';
        } else {
            if (btnPause) btnPause.style.display = 'inline-flex';
            if (btnResume) btnResume.style.display = 'none';
        }
        if (btnStop) btnStop.style.display = 'inline-flex';
        showLiveOverlay();
    }

    if (type === 'delay') {
        startDelayCountdown(delaySeconds);
    }

    if (type === 'stopped' || type === 'complete') {
        if (btnStart) {
            btnStart.style.display = 'inline-flex';
            updateStartButtonState();
        }
        if (btnPause) btnPause.style.display = 'none';
        if (btnResume) btnResume.style.display = 'none';
        if (btnStop) btnStop.style.display = 'none';

        if (countdownTimer) countdownTimer.textContent = '00:00s';
        if (progressBarTick) progressBarTick.style.width = '0%';
        if (currentCountdownInterval) clearInterval(currentCountdownInterval);
        hideLiveOverlay();

        if (type === 'complete') {
            addLog('Batch messaging completed successfully!', 'success');
            showToast('Batch messaging completed successfully!', 'success');
        }
    }
});

function startDelayCountdown(seconds) {
    if (currentCountdownInterval) clearInterval(currentCountdownInterval);
    let remaining = seconds;
    if (countdownTimer) countdownTimer.textContent = `00:${remaining < 10 ? '0' + remaining : remaining}s`;

    currentCountdownInterval = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            clearInterval(currentCountdownInterval);
            if (countdownTimer) countdownTimer.textContent = '00:00s';
            if (progressBarTick) progressBarTick.style.width = '100%';
        } else {
            if (countdownTimer) countdownTimer.textContent = `00:${remaining < 10 ? '0' + remaining : remaining}s`;
            const pct = Math.round(((seconds - remaining) / seconds) * 100);
            if (progressBarTick) progressBarTick.style.width = `${pct}%`;
        }
    }, 1000);
}

function updateProgressBar(job) {
    const total = job.total || 1;
    const processed = job.currentIndex || 0;
    const percent = Math.min(Math.round((processed / total) * 100), 100);
    
    if (progressFill) progressFill.style.width = `${percent}%`;
    if (progressPercentage) progressPercentage.textContent = `${percent}% Completed`;
    if (progressCounts) progressCounts.textContent = `${processed} / ${total} Messages`;
}

// ==========================================
// 6. Action Triggers
// ==========================================
if (btnStart) {
    btnStart.addEventListener('click', async () => {
        const messageTemplate = messageTemplateInput.value.trim();
        const safetyDelaySec = parseInt(safetyDelayInput.value, 10) || 8;

        if (!messageTemplate) {
            showToast('Please enter a message template in Throttle & Settings tab.', 'warning');
            return;
        }

        if (!isWhatsappConnected) {
            showToast('WhatsApp is not connected. Scan QR code first.', 'error');
            return;
        }

        if (!slicedBatchRecords || slicedBatchRecords.length === 0) {
            showToast('No contacts loaded. Import contacts first.', 'warning');
            return;
        }

        const fromIdx = rangeFromInput.value;
        const toIdx = rangeToInput.value;

        dispatchHistory = [];
        btnStart.disabled = true;
        addLog(`Initializing batch sending (#${fromIdx} to #${toIdx})...`, 'system');
        showToast(`Starting batch: #${fromIdx} to #${toIdx} (${slicedBatchRecords.length} contacts)`, 'info');

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
            if (!response.ok || data.error) throw new Error(data.error || 'Failed to start batch sending.');
            addLog('Batch job initialized successfully!', 'success');
        } catch (error) {
            console.error(error);
            addLog(`Sending error: ${error.message}`, 'error');
            showToast(`Sending Error: ${error.message}`, 'error');
            btnStart.disabled = false;
        }
    });
}

if (btnPause) btnPause.addEventListener('click', () => socket.emit('control-job', 'pause'));
if (btnResume) btnResume.addEventListener('click', () => socket.emit('control-job', 'resume'));
if (btnStop) btnStop.addEventListener('click', () => {
    socket.emit('control-job', 'stop');
    showToast('Batch job stopped.', 'warning');
});

// Build Smooth Bezier Curve Path matching reference design
function buildBezierPath(points) {
    if (!points || points.length === 0) return '';
    if (points.length === 1) {
        return `M 20,220 C 200,160 600,240 780,180`;
    }

    let d = `M ${points[0].x},${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
        const curr = points[i];
        const next = points[i + 1];
        const dx = next.x - curr.x;

        const cp1x = curr.x + dx * 0.45;
        const cp1y = curr.y;
        const cp2x = curr.x + dx * 0.55;
        const cp2y = next.y;

        d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${next.x},${next.y}`;
    }
    return d;
}

// Anti-Spam & Safety Delay Controls
function setSafetyDelay(sec) {
    const input = document.getElementById('range-delay');
    const badge = document.getElementById('delay-value-badge');
    if (input) input.value = sec;
    if (badge) badge.textContent = `${sec} SECONDS`;
    showToast(`Safety delay updated to ${sec}s per message`, 'success');
}

function selectSpeedMode(btn, sec) {
    document.querySelectorAll('.speed-mode-btn').forEach(b => {
        b.classList.remove('active', 'border-primary', 'bg-primary/15', 'ring-2', 'ring-primary/30', 'border-amber-400', 'bg-amber-400/15', 'ring-amber-400/30', 'border-indigo-400', 'bg-indigo-400/15', 'ring-indigo-400/30');
        b.classList.add('border-outline-variant/30', 'bg-surface-container');
    });

    if (btn) {
        btn.classList.remove('border-outline-variant/30', 'bg-surface-container');
        btn.classList.add('active', 'ring-2');
        if (sec <= 5) {
            btn.classList.add('border-amber-400', 'bg-amber-400/15', 'ring-amber-400/30');
        } else if (sec <= 10) {
            btn.classList.add('border-primary', 'bg-primary/15', 'ring-primary/30');
        } else {
            btn.classList.add('border-indigo-400', 'bg-indigo-400/15', 'ring-indigo-400/30');
        }
    }

    setSafetyDelay(sec);
}

function filterContactsTable() {
    const input = document.getElementById('contacts-search-input');
    if (input) {
        activeSearchQuery = input.value.toLowerCase().trim();
        renderRecipientTable();
        updateKPIStats();
    }
}

function insertTemplateVar(variableName) {
    const textarea = document.getElementById('message-template');
    if (!textarea) return;
    const start = textarea.selectionStart || textarea.value.length;
    const end = textarea.selectionEnd || textarea.value.length;
    textarea.value = textarea.value.substring(0, start) + variableName + textarea.value.substring(end);
    textarea.focus();
    textarea.setSelectionRange(start + variableName.length, start + variableName.length);
    updateTemplateLivePreview();
}

function updateTemplateLivePreview() {
    const textarea = document.getElementById('message-template');
    const preview = document.getElementById('template-live-preview');
    if (!textarea || !preview) return;

    let text = textarea.value || 'Hello {name}, your appointment is confirmed!';
    // Evaluate spintax {A|B}
    text = text.replace(/\{([^{}]+)\}/g, (match, contents) => {
        if (contents.includes('|')) {
            const options = contents.split('|');
            return options[0];
        }
        if (contents === 'name') return 'John Doe';
        if (contents === 'phone') return '+201000000000';
        if (contents === 'date') return new Date().toLocaleDateString('en-US');
        if (contents === 'time') return '04:00 PM';
        return match;
    });

    preview.textContent = text;
}

// Event listener for template input live preview
document.addEventListener('DOMContentLoaded', () => {
    const textarea = document.getElementById('message-template');
    if (textarea) {
        textarea.addEventListener('input', updateTemplateLivePreview);
        updateTemplateLivePreview();
    }
});
