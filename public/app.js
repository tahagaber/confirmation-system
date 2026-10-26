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
    confirmation: "Hello {name}, we are pleased to confirm your appointment! 🎉 Please make sure to arrive 10 minutes early.",
    reminder: "Reminder: Hi {name}, this is a reminder for your upcoming appointment tomorrow. Reply to reschedule or cancel.",
    offer: "Dear {name} 🌟 Special limited-time offer! Enjoy 20% off when booking today.",
    spintax: "{Hello|Hi|Dear} {name}, {we are glad to confirm your booking|this is your reminder|hope you are doing well} 🎉"
};

// Cyclic Rotating Templates & Advanced Delay State
let currentTemplateMode = typeof localStorage !== 'undefined' ? (localStorage.getItem('system_taha_template_mode') || 'rotating') : 'rotating';
let currentDelayMode = typeof localStorage !== 'undefined' ? (localStorage.getItem('system_taha_delay_mode') || 'random') : 'random';
let rotatingTemplates = [];

try {
    const savedRot = localStorage.getItem('system_taha_rotating_templates');
    if (savedRot) {
        rotatingTemplates = JSON.parse(savedRot);
    }
} catch (e) {
    console.warn('Failed to parse saved rotating templates:', e);
}

if (!Array.isArray(rotatingTemplates) || rotatingTemplates.length === 0) {
    rotatingTemplates = [
        "Hello {name}, we are pleased to confirm your appointment! 🎉 Please make sure to arrive 10 minutes early.",
        "Hi {name}, we would like to confirm your reservation with us 🌟 Let us know if you need to reschedule.",
        "Dear {name}, your appointment details have been successfully registered ✅ Looking forward to seeing you!"
    ];
}

let isBatchRestEnabled = localStorage.getItem('system_taha_batch_rest_enabled') === 'true';

function saveSettingsToLocalStorage() {
    try {
        localStorage.setItem('system_taha_template_mode', currentTemplateMode);
        localStorage.setItem('system_taha_delay_mode', currentDelayMode);
        localStorage.setItem('system_taha_rotating_templates', JSON.stringify(rotatingTemplates));
        localStorage.setItem('system_taha_batch_rest_enabled', isBatchRestEnabled ? 'true' : 'false');
        
        const minVal = document.getElementById('delay-min')?.value;
        const maxVal = document.getElementById('delay-max')?.value;
        const fixVal = document.getElementById('range-delay')?.value;
        const restDur = document.getElementById('rest-duration')?.value;
        const restFreq = document.getElementById('rest-frequency')?.value;
        if (minVal) localStorage.setItem('system_taha_delay_min', minVal);
        if (maxVal) localStorage.setItem('system_taha_delay_max', maxVal);
        if (fixVal) localStorage.setItem('system_taha_range_delay', fixVal);
        if (restDur) localStorage.setItem('system_taha_rest_duration', restDur);
        if (restFreq) localStorage.setItem('system_taha_rest_frequency', restFreq);
    } catch (e) {}
}

function switchTemplateMode(mode) {
    currentTemplateMode = mode;
    const btnRot = document.getElementById('btn-mode-rotating');
    const btnSin = document.getElementById('btn-mode-single');
    const contRot = document.getElementById('container-rotating-templates');
    const contSin = document.getElementById('container-single-template');

    if (mode === 'rotating') {
        if (btnRot) {
            btnRot.className = 'template-mode-btn active px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all bg-primary-container text-on-primary-container shadow-sm';
        }
        if (btnSin) {
            btnSin.className = 'template-mode-btn px-3.5 py-1.5 rounded-lg text-xs font-medium text-on-surface-variant hover:text-on-surface flex items-center gap-1.5 transition-all';
        }
        if (contRot) contRot.classList.remove('hidden');
        if (contSin) contSin.classList.add('hidden');
        renderRotatingTemplateCards();
    } else {
        if (btnSin) {
            btnSin.className = 'template-mode-btn active px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all bg-primary-container text-on-primary-container shadow-sm';
        }
        if (btnRot) {
            btnRot.className = 'template-mode-btn px-3.5 py-1.5 rounded-lg text-xs font-medium text-on-surface-variant hover:text-on-surface flex items-center gap-1.5 transition-all';
        }
        if (contRot) contRot.classList.add('hidden');
        if (contSin) contSin.classList.remove('hidden');
    }

    saveSettingsToLocalStorage();
    renderRecipientTable();
    updateDelayPatternBadge();
    updateRotationSummary();
}

function renderRotatingTemplateCards() {
    const container = document.getElementById('rotating-cards-container');
    if (!container) return;

    const count = rotatingTemplates.length;
    const colorStyles = [
        { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
        { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30' },
        { bg: 'bg-indigo-500/20', text: 'text-indigo-400', border: 'border-indigo-500/30' },
        { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
        { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' }
    ];

    container.innerHTML = rotatingTemplates.map((tmpl, idx) => {
        const num = idx + 1;
        const style = colorStyles[idx % colorStyles.length];
        const canDelete = count > 2;

        return `
            <div class="bg-surface-container/60 border border-outline-variant/30 rounded-2xl p-4 space-y-3 transition-all hover:border-outline-variant/60" id="rotating-card-${idx}">
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/20 pb-2.5">
                    <div class="flex items-center gap-2.5">
                        <span class="w-7 h-7 rounded-lg ${style.bg} ${style.text} flex items-center justify-center font-mono font-extrabold text-xs border ${style.border}">
                            #${num}
                        </span>
                        <div>
                            <span class="text-xs font-bold text-on-surface flex items-center gap-2">
                                Message #${num}
                                <span class="text-[10px] font-mono text-on-surface-variant font-semibold bg-surface-container-highest px-2 py-0.5 rounded">
                                    Assigned to Contacts: #${num}, #${num + count}, #${num + 2 * count}, #${num + 3 * count}...
                                </span>
                            </span>
                        </div>
                    </div>

                    <div class="flex items-center gap-2">
                        <button type="button" onclick="insertSpintaxRotating(${idx})" class="text-[11px] text-primary hover:underline font-bold flex items-center gap-1 px-2 py-1 rounded bg-primary/10">
                            <span class="material-symbols-outlined text-[14px]">shuffle</span> Spintax
                        </button>
                        ${canDelete ? `
                            <button type="button" onclick="removeRotatingTemplateCard(${idx})" class="text-xs text-error/80 hover:text-error p-1.5 rounded-lg hover:bg-error-container/20 transition-all" title="Remove this message from rotation">
                                <span class="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                        ` : ''}
                    </div>
                </div>

                <!-- Variable Chips for Card -->
                <div class="flex flex-wrap items-center gap-1.5">
                    <span class="text-[9px] font-bold text-on-surface-variant uppercase mr-1">Variables:</span>
                    <button type="button" onclick="insertTemplateVarRotating(${idx}, '{name}')" class="text-[11px] bg-surface-container hover:bg-primary/20 hover:text-primary px-2 py-0.5 rounded-md text-on-surface font-mono border border-outline-variant/30 transition-all">{name}</button>
                    <button type="button" onclick="insertTemplateVarRotating(${idx}, '{phone}')" class="text-[11px] bg-surface-container hover:bg-primary/20 hover:text-primary px-2 py-0.5 rounded-md text-on-surface font-mono border border-outline-variant/30 transition-all">{phone}</button>
                    <button type="button" onclick="insertTemplateVarRotating(${idx}, '{date}')" class="text-[11px] bg-surface-container hover:bg-primary/20 hover:text-primary px-2 py-0.5 rounded-md text-on-surface font-mono border border-outline-variant/30 transition-all">{date}</button>
                    <button type="button" onclick="insertTemplateVarRotating(${idx}, '{time}')" class="text-[11px] bg-surface-container hover:bg-primary/20 hover:text-primary px-2 py-0.5 rounded-md text-on-surface font-mono border border-outline-variant/30 transition-all">{time}</button>
                </div>

                <!-- Textarea -->
                <textarea id="rot-template-${idx}" rows="3" oninput="updateRotatingTemplate(${idx}, this.value)" class="w-full bg-surface-container border border-outline-variant/40 p-3 rounded-xl text-xs text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-none font-sans leading-relaxed" placeholder="Type template message #${num}...">${escapeHtml(tmpl)}</textarea>

                <div class="flex items-center justify-between text-[11px] text-on-surface-variant font-mono">
                    <span id="rot-char-count-${idx}">${tmpl.length} chars</span>
                    <span class="text-[10px] text-primary/70 cursor-pointer hover:underline" onclick="previewRotatingCard(${idx})">Preview Personalization</span>
                </div>
            </div>
        `;
    }).join('');

    const countLabel = document.getElementById('rotating-count-label');
    if (countLabel) countLabel.textContent = `${count} Templates Active in Rotation`;

    updateRotationSummary();
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function updateRotatingTemplate(idx, val) {
    if (idx >= 0 && idx < rotatingTemplates.length) {
        rotatingTemplates[idx] = val;
        const charCount = document.getElementById(`rot-char-count-${idx}`);
        if (charCount) charCount.textContent = `${val.length} chars`;
        saveSettingsToLocalStorage();
    }
}

function addRotatingTemplateCard() {
    const num = rotatingTemplates.length + 1;
    rotatingTemplates.push(`Hello {name}, we would like to provide an update regarding your appointment. Best regards.`);
    saveSettingsToLocalStorage();
    renderRotatingTemplateCards();
    renderRecipientTable();
    updateDelayPatternBadge();
    showToast(`Message #${num} added to rotation pool successfully!`, 'success');
}

function removeRotatingTemplateCard(idx) {
    if (rotatingTemplates.length <= 2) {
        showToast('You must keep at least 2 templates for cyclic rotation.', 'warning');
        return;
    }
    rotatingTemplates.splice(idx, 1);
    saveSettingsToLocalStorage();
    renderRotatingTemplateCards();
    renderRecipientTable();
    updateDelayPatternBadge();
    showToast('Template removed and rotation cycle updated.', 'info');
}

function insertTemplateVarRotating(idx, varName) {
    const textarea = document.getElementById(`rot-template-${idx}`);
    if (!textarea) return;
    const start = textarea.selectionStart || textarea.value.length;
    const end = textarea.selectionEnd || textarea.value.length;
    textarea.value = textarea.value.substring(0, start) + varName + textarea.value.substring(end);
    textarea.focus();
    textarea.setSelectionRange(start + varName.length, start + varName.length);
    updateRotatingTemplate(idx, textarea.value);
}

function insertSpintaxRotating(idx) {
    const textarea = document.getElementById(`rot-template-${idx}`);
    if (!textarea) return;
    const sample = " {Hello|Hi|Dear} ";
    const start = textarea.selectionStart || textarea.value.length;
    textarea.value = textarea.value.substring(0, start) + sample + textarea.value.substring(start);
    textarea.focus();
    updateRotatingTemplate(idx, textarea.value);
}

function previewRotatingCard(idx) {
    if (rotatingTemplates[idx]) {
        let msg = rotatingTemplates[idx];
        msg = msg.replace(/{name}/gi, 'John Doe');
        msg = msg.replace(/{phone}/gi, '+1234567890');
        msg = msg.replace(/{date}/gi, new Date().toLocaleDateString('en-US'));
        msg = msg.replace(/{time}/gi, '05:00 PM');
        alert(`Message #${idx + 1} Preview:\n\n${msg}`);
    }
}

function updateRotationSummary() {
    const summaryChips = document.getElementById('rotation-summary-chips');
    if (!summaryChips) return;

    if (!slicedBatchRecords || slicedBatchRecords.length === 0) {
        summaryChips.innerHTML = `<span class="text-on-surface-variant font-mono text-[11px]">Load contacts to view rotation distribution</span>`;
        return;
    }

    const tCount = (currentTemplateMode === 'rotating' && rotatingTemplates.length > 0) ? rotatingTemplates.length : 1;
    const counts = new Array(tCount).fill(0);
    const colors = ['emerald', 'cyan', 'indigo', 'amber', 'purple'];

    let activeIdx = 0;
    slicedBatchRecords.forEach(rec => {
        if (!rec.status || (!rec.status.startsWith('Skipped') && !rec.status.startsWith('Failed'))) {
            counts[activeIdx % tCount]++;
            rec.templateNum = (activeIdx % tCount) + 1;
            activeIdx++;
        }
    });

    if (currentTemplateMode === 'rotating') {
        summaryChips.innerHTML = counts.map((c, i) => {
            const color = colors[i % colors.length];
            return `<span class="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-${color}-500/15 text-${color}-400 border border-${color}-500/30 font-mono">
                Message #${i + 1}: ${c} contacts
            </span>`;
        }).join('') + `<span class="text-on-surface-variant font-mono text-[10px]">(Total: ${activeIdx} contacts)</span>`;
    } else {
        summaryChips.innerHTML = `<span class="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-primary/15 text-primary border border-primary/30 font-mono">Single template for all contacts (${activeIdx} contacts)</span>`;
    }
}

function switchDelayMode(mode) {
    currentDelayMode = mode;
    const btnRand = document.getElementById('btn-delay-mode-random');
    const btnFix = document.getElementById('btn-delay-mode-fixed');
    const contRand = document.getElementById('delay-random-container');
    const contFix = document.getElementById('delay-fixed-container');

    if (mode === 'random') {
        if (btnRand) {
            btnRand.className = 'delay-mode-tab active py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all bg-primary-container text-on-primary-container shadow-sm';
        }
        if (btnFix) {
            btnFix.className = 'delay-mode-tab py-2 px-3 rounded-lg text-xs font-semibold text-on-surface-variant hover:text-on-surface flex items-center justify-center gap-1.5 transition-all';
        }
        if (contRand) contRand.classList.remove('hidden');
        if (contFix) contFix.classList.add('hidden');
    } else {
        if (btnFix) {
            btnFix.className = 'delay-mode-tab active py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all bg-primary-container text-on-primary-container shadow-sm';
        }
        if (btnRand) {
            btnRand.className = 'delay-mode-tab py-2 px-3 rounded-lg text-xs font-semibold text-on-surface-variant hover:text-on-surface flex items-center justify-center gap-1.5 transition-all';
        }
        if (contRand) contRand.classList.add('hidden');
        if (contFix) contFix.classList.remove('hidden');
    }

    onDelayConfigChange();
    saveSettingsToLocalStorage();
}

function applyDelayPreset(min, max, btnElem) {
    switchDelayMode('random');
    const minInput = document.getElementById('delay-min');
    const maxInput = document.getElementById('delay-max');
    const rangeInput = document.getElementById('range-delay');

    if (minInput) minInput.value = min;
    if (maxInput) maxInput.value = max;
    if (rangeInput) rangeInput.value = min;

    document.querySelectorAll('.speed-mode-btn').forEach(b => {
        b.classList.remove('active', 'border-primary', 'bg-primary/15', 'ring-2', 'ring-primary/30');
    });

    if (btnElem) {
        btnElem.classList.add('active', 'border-primary', 'bg-primary/15', 'ring-2', 'ring-primary/30');
    }

    onDelayConfigChange();
    showToast(`Applied safety preset: ${min} to ${max}s random`, 'success');
}

function onDelayConfigChange() {
    const badge = document.getElementById('delay-value-badge');
    const minInput = document.getElementById('delay-min');
    const maxInput = document.getElementById('delay-max');
    const rangeInput = document.getElementById('range-delay');

    if (currentDelayMode === 'random') {
        const minVal = minInput ? minInput.value : 8;
        const maxVal = maxInput ? maxInput.value : 16;
        if (badge) badge.textContent = `${minVal} - ${maxVal}s Random`;
    } else {
        const fixVal = rangeInput ? rangeInput.value : 8;
        if (badge) badge.textContent = `${fixVal} SECONDS`;
    }

    updateDelayPatternBadge();
    saveSettingsToLocalStorage();
}

function toggleBatchRestUI() {
    const chk = document.getElementById('toggle-batch-rest');
    const box = document.getElementById('batch-rest-inputs');
    if (!chk) return;
    isBatchRestEnabled = chk.checked;
    if (box) {
        if (isBatchRestEnabled) box.classList.remove('hidden');
        else box.classList.add('hidden');
    }
    saveSettingsToLocalStorage();
    updateDelayPatternBadge();
}

function updateDelayPatternBadge() {
    const delayPatternText = document.getElementById('delay-pattern-text');
    if (!delayPatternText) return;

    let text = '';
    if (currentDelayMode === 'random') {
        const minVal = document.getElementById('delay-min')?.value || 8;
        const maxVal = document.getElementById('delay-max')?.value || 16;
        text = `Random (${minVal}s - ${maxVal}s)`;
    } else {
        const fixVal = document.getElementById('range-delay')?.value || 8;
        const jitt = document.getElementById('toggle-jitter')?.checked;
        text = `${fixVal}s ${jitt ? '+ Jitter' : 'Fixed'}`;
    }

    if (currentTemplateMode === 'rotating') {
        text += ` • Rotate ${rotatingTemplates.length} templates`;
    } else {
        text += ` • Single Template`;
    }

    if (isBatchRestEnabled) {
        const freq = document.getElementById('rest-frequency')?.value || 20;
        const dur = document.getElementById('rest-duration')?.value || 60;
        text += ` [Break ${dur}s every ${freq}]`;
    }

    delayPatternText.textContent = text;
}
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

    if (tabId === 'attendance-mentions') {
        initAbsentTab();
        if (typeof renderOnlineSheetList === 'function') renderOnlineSheetList();
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
    messageTemplateInput.value = cur + " {Hello|Hi|Greetings}";
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

function setAutoBatchMode(isAuto) {
    const btnAuto = document.getElementById('btn-range-auto');
    const btnManual = document.getElementById('btn-range-manual');
    if (isAuto) {
        if (btnAuto) {
            btnAuto.className = 'range-mode-tab active py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all bg-primary-container text-on-primary-container shadow-sm';
        }
        if (btnManual) {
            btnManual.className = 'range-mode-tab py-1.5 px-3 rounded-lg text-xs font-semibold text-on-surface-variant hover:text-on-surface flex items-center justify-center gap-1.5 transition-all';
        }
        if (rangeFromInput) rangeFromInput.value = 1;
        if (rangeToInput) rangeToInput.value = 100;
        applyRangeFilter();
        addLog('Set batch range to: 1 - 100 (Default Full Batch)', 'system');
    } else {
        if (btnManual) {
            btnManual.className = 'range-mode-tab active py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all bg-primary-container text-on-primary-container shadow-sm';
        }
        if (btnAuto) {
            btnAuto.className = 'range-mode-tab py-1.5 px-3 rounded-lg text-xs font-semibold text-on-surface-variant hover:text-on-surface flex items-center justify-center gap-1.5 transition-all';
        }
    }
}
window.setAutoBatchMode = setAutoBatchMode;

// Dynamic Group Management
function getActiveGroupName() {
    const saved = localStorage.getItem('activeCampaignGroupName');
    if (saved && saved.trim()) return saved.trim();
    const inputVal = document.getElementById('dash-group-name-input')?.value?.trim();
    if (inputVal) return inputVal;
    const modalVal = document.getElementById('import-group-name')?.value?.trim();
    if (modalVal) return modalVal;
    return 'Group-01';
}

function setActiveGroupName(name, updateInputs = true, showNotification = false) {
    const cleanName = (name && name.trim()) ? name.trim() : 'Group-01';
    localStorage.setItem('activeCampaignGroupName', cleanName);

    const dashInput = document.getElementById('dash-group-name-input');
    const dashBadge = document.getElementById('dash-group-name-badge');
    const auditBadge = document.getElementById('dash-audit-group-badge');
    const confBadge = document.getElementById('conf-group-badge');
    const importInput = document.getElementById('import-group-name');

    if (dashInput && updateInputs && dashInput.value !== cleanName) dashInput.value = cleanName;
    if (dashBadge) dashBadge.textContent = cleanName;
    if (auditBadge) auditBadge.textContent = cleanName;
    if (confBadge) confBadge.textContent = cleanName;
    if (importInput && updateInputs && importInput.value !== cleanName) importInput.value = cleanName;

    if (allLoadedRecords && allLoadedRecords.length > 0) {
        allLoadedRecords.forEach(r => {
            if (!r.customGroup) r.groupName = cleanName;
        });
    }
    if (slicedBatchRecords && slicedBatchRecords.length > 0) {
        slicedBatchRecords.forEach(r => {
            if (!r.customGroup) r.groupName = cleanName;
        });
    }

    renderAuditDiagnosticsTable();
    showActiveGroupPulse();

    if (showNotification) {
        showToast(`Group name activated: ${cleanName}`, 'success');
        addLog(`Active group name set to: ${cleanName}`, 'system');
    }
}

function activateCurrentGroupName() {
    const input = document.getElementById('dash-group-name-input');
    const val = input ? input.value.trim() : '';
    setActiveGroupName(val || 'Group-01', true, true);
}
window.activateCurrentGroupName = activateCurrentGroupName;
window.setActiveGroupName = setActiveGroupName;
window.getActiveGroupName = getActiveGroupName;

function showActiveGroupPulse() {
    const ind = document.getElementById('dash-group-active-indicator');
    if (ind) {
        ind.classList.remove('active-glow-pulse');
        void ind.offsetWidth;
        ind.classList.add('active-glow-pulse');
    }
}

// Micro Pulse Animation for Metric Numbers
function setStatWithPulse(element, value) {
    if (!element) return;
    const strVal = String(value);
    if (element.textContent !== strVal) {
        element.textContent = strVal;
        element.classList.remove('number-pulse');
        void element.offsetWidth;
        element.classList.add('number-pulse');
    }
}

// Live update for Dashboard Column Stats
function updateDashboardMiniStats() {
    const list = (slicedBatchRecords && slicedBatchRecords.length > 0) ? slicedBatchRecords : (allLoadedRecords || []);
    const sent = list.filter(r => r.status && r.status.includes('Sent')).length;
    const failed = list.filter(r => r.status && (r.status.includes('Failed') || r.status.includes('No WhatsApp') || r.status.includes('Invalid'))).length;
    const skipped = list.filter(r => r.status && r.status.includes('Skipped')).length;
    const pending = list.filter(r => !r.status || r.status.includes('Pending')).length;

    const statDelivered = document.getElementById('dash-stat-delivered');
    const statIssues = document.getElementById('dash-stat-issues');
    const statSkipped = document.getElementById('dash-stat-skipped');
    const statPending = document.getElementById('dash-stat-pending');

    setStatWithPulse(statDelivered, sent);
    setStatWithPulse(statIssues, failed);
    setStatWithPulse(statSkipped, skipped);
    setStatWithPulse(statPending, pending);

    const progCounts = document.getElementById('dash-progress-counts');
    const progPct = document.getElementById('dash-progress-pct');
    const progFill = document.getElementById('dash-progress-fill');
    
    if (!window.isDispatchJobRunning) {
        const total = list.length;
        const processed = sent + failed + skipped;
        const pct = total > 0 ? Math.round((processed / total) * 100) : 0;

        if (progCounts) progCounts.textContent = `${processed} / ${total} Contacts Dispatched`;
        if (progPct) progPct.textContent = `${pct}%`;
        if (progFill) progFill.style.width = `${pct}%`;
    }
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
    let validAssignIdx = 0;
    const tCount = (currentTemplateMode === 'rotating' && rotatingTemplates.length > 0) ? rotatingTemplates.length : 1;

    slicedBatchRecords.forEach((rec) => {
        const isGroup = Boolean(rec.isGroup || (rec.phone && (rec.phone.includes('chat.whatsapp.com') || rec.phone.endsWith('@g.us'))));
        rec.isGroup = isGroup;
        const normPhone = isGroup ? rec.phone : String(rec.phone).replace(/\D/g, '');
        const normName = String(rec.name).trim().toLowerCase();

        if (rec.status && (rec.status.startsWith('Sent') || rec.status.startsWith('Failed') || rec.status.startsWith('Skipped'))) {
            // retain existing status
        } else if (seenPhones.has(normPhone)) {
            rec.status = isGroup ? 'Skipped (Duplicate Group)' : 'Skipped (Duplicate Phone)';
        } else if (seenNames.has(normName) && normName !== 'customer' && normName !== 'dear customer' && normName !== 'whatsapp group') {
            rec.status = 'Skipped (Duplicate Name)';
        } else {
            seenPhones.add(normPhone);
            if (normName) seenNames.add(normName);
            if (!rec.status) rec.status = 'Pending Batch';
        }

        if (!rec.status || (!rec.status.startsWith('Skipped') && !rec.status.startsWith('Failed'))) {
            rec.templateNum = (validAssignIdx % tCount) + 1;
            validAssignIdx++;
        }
    });

    renderRecipientTable();
    updateKPIStats();
    updateChartsRealtime();
    updateStartButtonState();
    updateRotationSummary();
    updateDelayPatternBadge();
    renderAuditDiagnosticsTable();
    updateDashboardMiniStats();
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

            let currentGrp = getActiveGroupName();
            const cleanFileName = file.name.replace(/\.[^/.]+$/, '').trim();
            if ((!currentGrp || currentGrp === 'Group-01' || currentGrp === 'Q8-B7-UIUX-21-G1') && cleanFileName) {
                currentGrp = cleanFileName;
                setActiveGroupName(cleanFileName, true, false);
            }

            for (let i = startIdx; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length === 0) continue;

                let name = row[0] ? String(row[0]).trim() : 'Customer';
                let phone = row[1] ? String(row[1]).trim() : '';

                const isCol0LinkOrPhone = String(row[0]).includes('chat.whatsapp.com') || String(row[0]).replace(/\D/g, '').length >= 8;
                if (isCol0LinkOrPhone && String(row[1]).replace(/\D/g, '').length < 8 && !String(row[1]).includes('chat.whatsapp.com')) {
                    phone = String(row[0]).trim();
                    name = row[1] ? String(row[1]).trim() : 'Group / Contact';
                }

                if (phone) {
                    const isGroup = phone.includes('chat.whatsapp.com') || phone.endsWith('@g.us');
                    allLoadedRecords.push({
                        sheetRowIndex: i + 1,
                        name: name,
                        phone: phone,
                        groupName: currentGrp,
                        isGroup: isGroup,
                        status: 'Pending Batch',
                        sheetStatus: 'Pending',
                        comment: ''
                    });
                }
            }

            rangeFromInput.value = 1;
            rangeToInput.value = 100;
            applyRangeFilter();
            updateDashboardMiniStats();
            addLog(`Loaded ${allLoadedRecords.length} contacts from ${file.name}. (Active Range: 1 - 100)`, 'success');
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

    const currentGrp = getActiveGroupName();
    setActiveGroupName(currentGrp, true, false);

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
            const isGroup = phone.includes('chat.whatsapp.com') || phone.endsWith('@g.us');
            allLoadedRecords.push({
                sheetRowIndex: idx + 1,
                name: name,
                phone: phone,
                groupName: currentGrp,
                isGroup: isGroup,
                status: 'Pending Batch',
                sheetStatus: 'Pending',
                comment: ''
            });
        }
    });

    rangeFromInput.value = 1;
    rangeToInput.value = 100;
    applyRangeFilter();
    updateDashboardMiniStats();
    addLog(`Parsed ${allLoadedRecords.length} contacts from text. (Active Range: 1 - 100)`, 'success');
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

        const currentGrp = getActiveGroupName();
        setActiveGroupName(currentGrp, true, false);

        allLoadedRecords = (data.records || []).map(r => ({
            ...r,
            groupName: currentGrp,
            sheetStatus: r.sheetStatus || (r.status && r.status.includes('Sent') ? 'Attending' : 'Pending'),
            comment: r.comment || ''
        }));

        detectGroupLinkFromRecords(allLoadedRecords);
        updateAttendanceUIStats();

        rangeFromInput.value = 1;
        rangeToInput.value = 100;
        applyRangeFilter();
        updateDashboardMiniStats();
        addLog(`Fetched ${allLoadedRecords.length} records from Google Sheet. (Active Range: 1 - 100)`, 'success');
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
let isHidePresentOnly = false;

function toggleHidePresent(checked) {
    isHidePresentOnly = Boolean(checked);
    renderRecipientTable();
    updateKPIStats();
}
window.toggleHidePresent = toggleHidePresent;

function switchTableTab(tabName, btnElem) {
    activeTableTab = tabName;
    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('border-primary', 'text-primary', 'bg-primary/10', 'active');
        b.classList.add('border-outline-variant/20', 'text-on-surface-variant');
    });
    if (btnElem) {
        btnElem.classList.add('border-primary', 'text-primary', 'bg-primary/10', 'active');
        btnElem.classList.remove('border-outline-variant/20', 'text-on-surface-variant');
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
        // Attendance Hide Present Mode: If user checked "Hide Present", hide anyone who is Attending/Present so only Absent remain
        if (isHidePresentOnly && (rec.sheetStatus === 'Attending' || rec.sheetStatus === 'Present')) {
            return false;
        }

        // Tab filter
        if (activeTableTab === 'absent') {
            if (rec.sheetStatus !== 'Absent') return false;
        } else if (activeTableTab === 'present') {
            if (rec.sheetStatus !== 'Attending' && rec.sheetStatus !== 'Present') return false;
        } else if (activeTableTab === 'issues') {
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
                <td colspan="7" class="px-6 py-12 text-center text-on-surface-variant font-medium">
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
                <td colspan="7" class="px-6 py-8 text-center text-on-surface-variant font-medium">
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
        const isGroupItem = Boolean(item.isGroup || (item.phone && (item.phone.includes('chat.whatsapp.com') || item.phone.endsWith('@g.us'))));

        const firstLetter = (item.name && item.name.trim()) ? item.name.trim().charAt(0).toUpperCase() : '?';
        const avatarBg = isIssue 
            ? 'bg-gradient-to-tr from-rose-500/30 to-red-600/30 border-rose-500/40 text-rose-300'
            : (isGroupItem 
                ? 'bg-gradient-to-tr from-cyan-500/30 to-blue-600/30 border-cyan-500/40 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.15)]'
                : 'bg-gradient-to-tr from-emerald-500/20 to-teal-500/30 border-emerald-500/30 text-emerald-400');

        const avatarIcon = isGroupItem 
            ? `<span class="material-symbols-outlined text-[18px]">groups</span>` 
            : firstLetter;

        const typeBadge = isGroupItem 
            ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 uppercase tracking-wider">
                <span class="material-symbols-outlined text-[12px]">groups</span> Group
               </span>` 
            : '';

        const phoneIcon = isGroupItem ? 'groups' : 'call';
        const phoneIconColor = isGroupItem ? 'text-cyan-400 opacity-90' : 'opacity-60';

        let selectColor = 'bg-surface-container/70 border-outline-variant/30 text-on-surface';
        if (item.sheetStatus === 'Attending' || item.sheetStatus === 'Present') selectColor = 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 font-bold';
        else if (item.sheetStatus === 'Absent') selectColor = 'bg-rose-500/20 border-rose-500/50 text-rose-300 font-bold';
        else if (item.sheetStatus === 'No Response') selectColor = 'bg-amber-500/10 border-amber-500/40 text-amber-400 font-bold';
        else if (item.sheetStatus === 'Excused') selectColor = 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300 font-bold';
        else if (item.sheetStatus === 'Issue') selectColor = 'bg-rose-500/20 border-rose-500/50 text-rose-400 font-extrabold animate-pulse';

        const isCommentGroupLink = Boolean(item.comment && (item.comment.includes('chat.whatsapp.com') || item.comment.endsWith('@g.us')));

        // Message Pattern Badge for Cyclic Rotation
        let patternBadge = '';
        if (currentTemplateMode === 'rotating' && rotatingTemplates && rotatingTemplates.length > 0) {
            const tNum = item.templateNum || 1;
            const colors = [
                'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
                'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
                'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
                'bg-amber-500/15 text-amber-400 border-amber-500/30',
                'bg-purple-500/15 text-purple-400 border-purple-500/30'
            ];
            const colorClass = colors[(tNum - 1) % colors.length];
            if (item.status && item.status.includes('Sent')) {
                patternBadge = `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold ${colorClass} font-mono shadow-sm" title="Template dispatched"><span class="material-symbols-outlined text-[12px]">done_all</span>Message #${tNum}</span>`;
            } else {
                patternBadge = `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold ${colorClass} font-mono"><span class="w-1.5 h-1.5 rounded-full bg-current"></span>Message #${tNum}</span>`;
            }
        } else {
            patternBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-surface-container text-on-surface-variant border border-outline-variant/30 font-mono">Single Template</span>`;
        }

        return `
            <tr class="hover:bg-surface-container-highest/30 transition-all duration-200 border-b border-outline-variant/10 ${isIssue ? 'bg-rose-950/20 border-l-4 border-l-rose-500' : (isGroupItem ? 'bg-cyan-950/10 border-l-2 border-l-cyan-500/40' : '')}">
                <td class="px-5 py-4 font-mono font-extrabold text-on-surface-variant/80 text-xs">#${item.sheetRowIndex}</td>
                <td class="px-5 py-4">
                    <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-full border ${avatarBg} flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-sm">
                            ${avatarIcon}
                        </div>
                        <div class="flex flex-col">
                            <span class="font-bold text-on-surface text-sm tracking-tight flex items-center gap-2">
                                ${item.name}
                                ${typeBadge}
                            </span>
                            <span class="font-mono text-[11px] text-on-surface-variant/80 flex items-center gap-1 mt-0.5 truncate max-w-[220px]" title="${item.phone}">
                                <span class="material-symbols-outlined text-[13px] ${phoneIconColor}">${phoneIcon}</span> ${item.phone}
                            </span>
                        </div>
                    </div>
                </td>
                <td class="px-5 py-4 text-center">
                    ${patternBadge}
                </td>
                <td class="px-5 py-4 text-center">
                    <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] tracking-wide uppercase ${badgeStyle}">
                        <span class="material-symbols-outlined text-[14px]">${badgeIcon}</span> ${item.status}
                    </span>
                </td>
                <td class="px-5 py-4">
                    <div class="flex flex-col gap-1.5 min-w-[170px]">
                        <!-- Quick Attendance Buttons: Present vs Absent -->
                        <div class="flex items-center gap-1.5">
                            <button type="button" onclick="markAttendance(${item.sheetRowIndex}, 'Present')" 
                                class="flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded-lg text-[11px] font-bold transition-all ${(item.sheetStatus === 'Attending' || item.sheetStatus === 'Present') ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'}" 
                                title="Mark as Present (Attending)">
                                <span class="material-symbols-outlined text-[13px]">check_circle</span>
                                <span>Present</span>
                            </button>
                            <button type="button" onclick="markAttendance(${item.sheetRowIndex}, 'Absent')" 
                                class="flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded-lg text-[11px] font-bold transition-all ${item.sheetStatus === 'Absent' ? 'bg-rose-500 text-white shadow-sm shadow-rose-500/30' : 'bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20'}" 
                                title="Mark as Absent">
                                <span class="material-symbols-outlined text-[13px]">cancel</span>
                                <span>Absent</span>
                            </button>
                        </div>
                        
                        <!-- Dropdown Status selector for additional states -->
                        <select onchange="updateRowSheetStatus(${item.sheetRowIndex}, this.value)" class="${selectColor} text-[11px] py-1 px-2 rounded-lg border outline-none cursor-pointer transition-all hover:brightness-110">
                            <option value="Attending" ${(item.sheetStatus === 'Attending' || item.sheetStatus === 'Present') ? 'selected' : ''}>✓ Attending</option>
                            <option value="Absent" ${item.sheetStatus === 'Absent' ? 'selected' : ''}>❌ Absent</option>
                            <option value="No Response" ${item.sheetStatus === 'No Response' ? 'selected' : ''}>⏳ No Response</option>
                            <option value="Excused" ${item.sheetStatus === 'Excused' ? 'selected' : ''}>✉ Excused</option>
                            <option value="Issue" ${item.sheetStatus === 'Issue' ? 'selected' : ''}>⚠ Issue / Invalid</option>
                        </select>
                    </div>
                </td>
                <td class="px-5 py-4">
                    <div class="flex flex-col gap-1 min-w-[210px]">
                        <div class="relative flex items-center">
                            <span class="material-symbols-outlined absolute left-2.5 text-on-surface-variant/60 text-[16px] pointer-events-none">${isCommentGroupLink ? 'groups' : 'edit_note'}</span>
                            <input type="text" value="${item.comment || ''}" placeholder="Add note or WhatsApp Group Link..." onchange="updateRowComment(${item.sheetRowIndex}, this.value)" class="w-full bg-surface-container/60 border ${isCommentGroupLink ? 'border-cyan-500/40 text-cyan-300' : 'border-outline-variant/30 text-on-surface'} pl-8 pr-3 py-1.5 rounded-xl text-xs focus:border-primary focus:ring-1 focus:ring-primary/40 focus:bg-surface-container-highest/60 outline-none transition-all">
                        </div>
                        ${isCommentGroupLink ? `
                            <div class="flex items-center gap-1 text-[10px] text-cyan-400 font-mono">
                                <span class="material-symbols-outlined text-[12px]">link</span>
                                <span class="truncate">WhatsApp Group Link Active</span>
                            </div>
                        ` : ''}
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

    updateAttendanceUIStats();
}

// Quick Attendance Marker: Present (Attending) vs Absent
function markAttendance(sheetRowIndex, status) {
    const target = slicedBatchRecords.find(r => r.sheetRowIndex === sheetRowIndex);
    if (!target) return;

    const newStatus = (status === 'Present' || status === 'Attending') ? 'Attending' : 'Absent';
    target.sheetStatus = newStatus;

    if (allLoadedRecords) {
        const mainTarget = allLoadedRecords.find(r => r.sheetRowIndex === sheetRowIndex);
        if (mainTarget) mainTarget.sheetStatus = newStatus;
    }

    // Sync status to Google Sheet (Col C in English)
    syncRowToSheet(sheetRowIndex);

    updateAttendanceUIStats();
    updateKPIStats();
    updateChartsRealtime();

    if (isHidePresentOnly && newStatus === 'Attending') {
        showToast(`Row #${sheetRowIndex} marked Present & removed from view (Attending)`, 'info');
    } else {
        showToast(`Row #${sheetRowIndex} marked as: ${newStatus}`, newStatus === 'Absent' ? 'error' : 'success');
    }

    renderRecipientTable();
}
window.markAttendance = markAttendance;

// Handle Sheet Status update & Syncing to Google Sheet
function updateRowSheetStatus(sheetRowIndex, newStatus) {
    const target = slicedBatchRecords.find(r => r.sheetRowIndex === sheetRowIndex);
    if (target) {
        target.sheetStatus = newStatus;
        if (allLoadedRecords) {
            const mainTarget = allLoadedRecords.find(r => r.sheetRowIndex === sheetRowIndex);
            if (mainTarget) mainTarget.sheetStatus = newStatus;
        }
        updateAttendanceUIStats();
        updateKPIStats();
        updateChartsRealtime();
        syncRowToSheet(sheetRowIndex);
        showToast(`Updated Row #${sheetRowIndex} status to: ${newStatus}`, newStatus === 'Issue' ? 'error' : 'info');
        renderRecipientTable();
    }
}

let commentDebounceTimer = null;
function updateRowComment(sheetRowIndex, newComment) {
    const target = slicedBatchRecords.find(r => r.sheetRowIndex === sheetRowIndex);
    if (target) {
        target.comment = newComment;
        if (allLoadedRecords) {
            const mainTarget = allLoadedRecords.find(r => r.sheetRowIndex === sheetRowIndex);
            if (mainTarget) mainTarget.comment = newComment;
        }

        // If the comment contains a WhatsApp group link, auto-activate it
        const trimmed = String(newComment || '').trim();
        if (trimmed.includes('chat.whatsapp.com') || trimmed.endsWith('@g.us')) {
            activeWhatsAppGroupLink = trimmed;
            const input = document.getElementById('attendance-group-link');
            if (input) input.value = trimmed;
            const badge = document.getElementById('group-link-detect-badge');
            if (badge) badge.classList.remove('hidden');
        }

        clearTimeout(commentDebounceTimer);
        commentDebounceTimer = setTimeout(() => {
            syncRowToSheet(sheetRowIndex);
        }, 600);
    }
}

// Attendance Summary Counts
function updateAttendanceUIStats() {
    const records = (slicedBatchRecords && slicedBatchRecords.length > 0) ? slicedBatchRecords : (allLoadedRecords || []);
    const total = records.length;
    const present = records.filter(r => r.sheetStatus === 'Attending' || r.sheetStatus === 'Present').length;
    const absent = records.filter(r => r.sheetStatus === 'Absent').length;

    const totalEl = document.getElementById('att-summary-total');
    const presentEl = document.getElementById('att-summary-present');
    const absentEl = document.getElementById('att-summary-absent');
    const absentHeaderEl = document.getElementById('absent-header-count');
    const absentBadgeEl = document.getElementById('absent-badge');
    const presentBadgeEl = document.getElementById('present-badge');

    if (totalEl) totalEl.textContent = total;
    if (presentEl) presentEl.textContent = present;
    if (absentEl) absentEl.textContent = absent;
    if (absentHeaderEl) absentHeaderEl.textContent = absent;
    if (absentBadgeEl) absentBadgeEl.textContent = absent;
    if (presentBadgeEl) presentBadgeEl.textContent = present;
}
window.updateAttendanceUIStats = updateAttendanceUIStats;

// WhatsApp Group Link Management
let activeWhatsAppGroupLink = '';

function onGroupLinkChange(val) {
    activeWhatsAppGroupLink = String(val || '').trim();
    const badge = document.getElementById('group-link-detect-badge');
    if (badge) {
        if (activeWhatsAppGroupLink.includes('chat.whatsapp.com') || activeWhatsAppGroupLink.endsWith('@g.us')) {
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
}
window.onGroupLinkChange = onGroupLinkChange;

function detectGroupLinkFromRecords(records) {
    if (!records || records.length === 0) return;
    for (const r of records) {
        const comm = String(r.comment || '').trim();
        if (comm.includes('chat.whatsapp.com') || comm.endsWith('@g.us')) {
            activeWhatsAppGroupLink = comm;
            const input = document.getElementById('attendance-group-link');
            if (input) input.value = comm;
            const badge = document.getElementById('group-link-detect-badge');
            if (badge) badge.classList.remove('hidden');
            break;
        }
    }
}

// ==========================================
// Absent Members Group Mention Workflow
// ==========================================
function openAbsentMentionModal() {
    const records = (slicedBatchRecords && slicedBatchRecords.length > 0) ? slicedBatchRecords : (allLoadedRecords || []);
    const absentMembers = records.filter(r => r.sheetStatus === 'Absent');

    const modal = document.getElementById('absent-mention-modal');
    if (!modal) return;

    const targetInput = document.getElementById('mention-group-target');
    if (targetInput) {
        if (!activeWhatsAppGroupLink) detectGroupLinkFromRecords(records);
        targetInput.value = activeWhatsAppGroupLink || '';
    }

    const countEl = document.getElementById('modal-absent-count');
    if (countEl) countEl.textContent = absentMembers.length;

    const pillsEl = document.getElementById('modal-absent-pills');
    if (pillsEl) {
        if (absentMembers.length === 0) {
            pillsEl.innerHTML = `<span class="text-xs text-on-surface-variant/80 italic p-1">No members are currently marked "Absent". Click "Absent" button on any contact in the table to add them here.</span>`;
        } else {
            pillsEl.innerHTML = absentMembers.map(m => `
                <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold">
                    <span class="material-symbols-outlined text-[13px]">person</span>
                    <span>${m.name}</span>
                </span>
            `).join('');
        }
    }

    regenerateMentionMessage('ar');
    modal.classList.remove('hidden');
}
window.openAbsentMentionModal = openAbsentMentionModal;

function closeAbsentMentionModal() {
    const modal = document.getElementById('absent-mention-modal');
    if (modal) modal.classList.add('hidden');
}
window.closeAbsentMentionModal = closeAbsentMentionModal;

function regenerateMentionMessage(lang) {
    const records = (slicedBatchRecords && slicedBatchRecords.length > 0) ? slicedBatchRecords : (allLoadedRecords || []);
    const absentMembers = records.filter(r => r.sheetStatus === 'Absent');
    const groupName = getActiveGroupName();
    const textarea = document.getElementById('modal-mention-textarea');
    if (!textarea) return;

    const mentionsList = absentMembers.length > 0 
        ? absentMembers.map(m => `@${m.name}`).join('  ')
        : '@Member1 @Member2';

    let msg = '';
    if (lang === 'ar') {
        msg = [
            `📋 *تقرير الحضور والغياب — ${groupName}*`,
            ``,
            `❌ *الأعضاء الغائبين (Absent Members):*`,
            mentionsList,
            ``,
            `📌 *برجاء توضيح سبب عدم الحضور اليوم.*`,
            ``,
            `_تم الإرسال عبر نظام System Taha_`
        ].join('\n');
    } else {
        msg = [
            `📋 *Attendance Report — ${groupName}*`,
            ``,
            `❌ *Absent Members:*`,
            mentionsList,
            ``,
            `📌 *Please let us know why you could not attend today's session.*`,
            ``,
            `_Sent via System Taha Dispatch System_`
        ].join('\n');
    }

    textarea.value = msg;
}
window.regenerateMentionMessage = regenerateMentionMessage;

async function sendAbsentMentionViaWebClient() {
    const targetInput = document.getElementById('mention-group-target');
    const textarea = document.getElementById('modal-mention-textarea');
    const groupTarget = targetInput ? targetInput.value.trim() : '';
    const message = textarea ? textarea.value.trim() : '';

    if (!groupTarget) {
        showToast('Please enter or paste the WhatsApp Group Link (e.g. https://chat.whatsapp.com/...)', 'error');
        if (targetInput) targetInput.focus();
        return;
    }
    if (!message) {
        showToast('Please enter a message to send.', 'error');
        return;
    }

    const records = (slicedBatchRecords && slicedBatchRecords.length > 0) ? slicedBatchRecords : (allLoadedRecords || []);
    const absentList = records.filter(r => r.sheetStatus === 'Absent');

    const btn = document.getElementById('btn-send-group-mention');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span> Sending...`;
    }

    addLog(`Sending attendance mention report to WhatsApp group: ${groupTarget}...`, 'system');

    try {
        let response = await fetch(`${socketServerUrl}/api/send-group-mention`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                groupTarget,
                message,
                absentList
            })
        });

        // Fallback to /api/send-single-message if server was not restarted yet
        if (response.status === 404) {
            response = await fetch(`${socketServerUrl}/api/send-single-message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: groupTarget,
                    name: 'Attendance Notice',
                    message
                })
            });
        }

        const data = await response.json();
        if (!response.ok || data.error) {
            throw new Error(data.error || 'Failed to dispatch group mention.');
        }

        addLog(`✅ Successfully sent attendance mention report to WhatsApp group!`, 'success');
        showToast('Attendance mention report sent to WhatsApp group successfully!', 'success');
        closeAbsentMentionModal();
    } catch (err) {
        console.error(err);
        addLog(`❌ Group mention error: ${err.message}`, 'error');
        showToast(`Group mention error: ${err.message}`, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<span class="material-symbols-outlined text-[16px]">send</span><span>Send to Group Now</span>`;
        }
    }
}
window.sendAbsentMentionViaWebClient = sendAbsentMentionViaWebClient;

function openAbsentMentionInWhatsApp() {
    const targetInput = document.getElementById('mention-group-target');
    const textarea = document.getElementById('modal-mention-textarea');
    const groupTarget = targetInput ? targetInput.value.trim() : '';
    const message = textarea ? textarea.value.trim() : '';

    if (groupTarget.includes('chat.whatsapp.com')) {
        copyAbsentMentionMessage();
        window.open(groupTarget, '_blank');
        showToast('Opened WhatsApp group link! Message copied to clipboard.', 'success');
    } else {
        const encoded = encodeURIComponent(message);
        window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
    }
}
window.openAbsentMentionInWhatsApp = openAbsentMentionInWhatsApp;

function copyAbsentMentionMessage() {
    const textarea = document.getElementById('modal-mention-textarea');
    if (!textarea) return;
    navigator.clipboard.writeText(textarea.value).then(() => {
        showToast('Mention message copied to clipboard!', 'success');
    }).catch(() => {
        textarea.select();
        document.execCommand('copy');
        showToast('Mention message copied to clipboard!', 'success');
    });
}
window.copyAbsentMentionMessage = copyAbsentMentionMessage;

// ==========================================
// Google Contacts vCard (.vcf) Export
// Format: Full Name (GroupName)
// ==========================================
function exportGoogleContactsVCF(filterType = 'all') {
    const records = (slicedBatchRecords && slicedBatchRecords.length > 0) ? slicedBatchRecords : (allLoadedRecords || []);
    if (!records || records.length === 0) {
        showToast('No contacts loaded to export to Google Contacts.', 'warning');
        return;
    }

    const groupName = getActiveGroupName();
    let targets = records;
    if (filterType === 'absent') {
        targets = records.filter(r => r.sheetStatus === 'Absent');
    }

    if (targets.length === 0) {
        showToast('No contacts match the export filter.', 'warning');
        return;
    }

    // Build RFC 2426 vCard 3.0 content
    let vcfContent = '';
    targets.forEach(c => {
        const rawName = (c.name || 'Customer').trim();
        // Exact format requested: "Full Name (GroupName)"
        const formattedName = `${rawName} (${groupName})`;
        let phone = String(c.phone || '').replace(/\D/g, '');
        if (!phone) return;

        // Normalize to international format (+20 for Egypt)
        let intlPhone = phone;
        if (phone.startsWith('01') && phone.length === 11) {
            intlPhone = '20' + phone.slice(1);
        } else if (phone.startsWith('1') && phone.length === 10) {
            intlPhone = '20' + phone;
        }

        vcfContent += `BEGIN:VCARD\r\n`;
        vcfContent += `VERSION:3.0\r\n`;
        vcfContent += `FN:${formattedName}\r\n`;
        vcfContent += `N:${rawName};;;;\r\n`;
        vcfContent += `TEL;TYPE=CELL,VOICE:+${intlPhone}\r\n`;
        vcfContent += `CATEGORIES:${groupName}\r\n`;
        vcfContent += `NOTE:System Taha | Group: ${groupName} | Status: ${c.sheetStatus || 'Active'}\r\n`;
        vcfContent += `END:VCARD\r\n`;
    });

    const blob = new Blob([vcfContent], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeGroupName = groupName.replace(/[^a-zA-Z0-9_-]/g, '_');
    a.download = `${safeGroupName}_Google_Contacts.vcf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    addLog(`✅ Exported ${targets.length} contacts formatted as "Name (${groupName})" for Google Contacts (.vcf)`, 'success');
    showToast(`Saved ${targets.length} contacts as "Name (${groupName})"! Click the downloaded .vcf file to import into Google Contacts.`, 'success');
}
window.exportGoogleContactsVCF = exportGoogleContactsVCF;

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

// Prompt user to edit group/campaign name on the dashboard badge
function promptEditGroupName() {
    const input = document.getElementById('dash-group-name-input');
    if (input) {
        input.focus();
        input.select();
        showToast('Type the group name in the input and press Enter or the check button to activate.', 'info');
        return;
    }
    const current = getActiveGroupName();
    const newName = prompt('Enter Group / Campaign Name for this batch:', current);
    if (newName && newName.trim()) {
        setActiveGroupName(newName.trim(), true, true);
    }
}

// ==========================================
// Group Delivery Audit & Diagnostics
// ==========================================
let currentAuditFilter = 'all'; // 'all' | 'issues' | 'delivered'

function filterAuditIssues(filterType, btn) {
    currentAuditFilter = filterType;
    document.querySelectorAll('.audit-tab-btn').forEach(b => {
        b.classList.remove('active', 'bg-primary', 'text-on-primary');
        if (b.classList.contains('text-rose-300')) {
            b.className = 'audit-tab-btn px-3.5 py-1.5 rounded-xl text-xs font-semibold text-rose-300 hover:bg-rose-500/10 border border-rose-500/30 transition-all flex items-center gap-1.5';
        } else if (b.classList.contains('text-emerald-300')) {
            b.className = 'audit-tab-btn px-3.5 py-1.5 rounded-xl text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10 border border-emerald-500/30 transition-all';
        } else {
            b.className = 'audit-tab-btn px-3.5 py-1.5 rounded-xl text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border border-outline-variant/30 transition-all';
        }
    });

    if (btn) {
        btn.classList.add('active', 'bg-primary', 'text-on-primary');
        btn.classList.remove('text-rose-300', 'text-emerald-300', 'text-on-surface-variant');
    }

    renderAuditDiagnosticsTable();
}

function renderAuditDiagnosticsTable() {
    const tbody = document.getElementById('dash-audit-table-body');
    if (!tbody) return;

    const records = (slicedBatchRecords && slicedBatchRecords.length > 0) ? slicedBatchRecords : allLoadedRecords;
    const fallbackGroup = getActiveGroupName();

    const auditBadge = document.getElementById('dash-audit-group-badge');
    const activeGroup = (records && records[0] && records[0].groupName) ? records[0].groupName : fallbackGroup;
    if (auditBadge) auditBadge.textContent = activeGroup;

    const isIssue = (r) => {
        const s = r.status || '';
        return s.includes('Failed') || s.includes('Invalid') || s.includes('Skipped') || s.includes('No WhatsApp') || r.sheetStatus === 'Issue';
    };

    const isDelivered = (r) => {
        const s = r.status || '';
        return s === 'Sent' || s === 'Delivered';
    };

    const issuesCountEl = document.getElementById('dash-audit-issues-count');
    const totalIssues = (records || []).filter(isIssue).length;
    if (issuesCountEl) issuesCountEl.textContent = totalIssues;

    if (!records || records.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-10 text-center text-on-surface-variant font-medium">
                    <div class="flex flex-col items-center justify-center gap-2">
                        <span class="material-symbols-outlined text-3xl opacity-40">inventory_2</span>
                        <span>No contacts loaded yet. Import contacts to start tracking group delivery and diagnosis.</span>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    let filteredRecords = records;
    if (currentAuditFilter === 'issues') {
        filteredRecords = records.filter(isIssue);
    } else if (currentAuditFilter === 'delivered') {
        filteredRecords = records.filter(isDelivered);
    }

    if (filteredRecords.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-10 text-center text-on-surface-variant font-medium">
                    <div class="flex flex-col items-center justify-center gap-2">
                        <span class="material-symbols-outlined text-3xl text-emerald-400 opacity-80">check_circle</span>
                        <span>No records match filter: <strong class="text-on-surface capitalize">${currentAuditFilter}</strong></span>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    const templateColors = [
        { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
        { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/30' },
        { bg: 'bg-indigo-500/15', text: 'text-indigo-400', border: 'border-indigo-500/30' },
        { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
        { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30' }
    ];

    tbody.innerHTML = filteredRecords.map((r, idx) => {
        const rowNum = r.sheetRowIndex || (idx + 1);
        const name = r.name || 'Customer';
        const phone = r.phone || '-';
        const cleanPhone = String(phone).replace(/\D/g, '');
        const grp = r.groupName || activeGroup;

        const tmplNum = r.templateNum || 1;
        const colorStyle = templateColors[(tmplNum - 1) % templateColors.length];

        let outcomeHtml = '';
        const st = r.status || 'Pending Batch';

        if (st === 'Sent' || st === 'Delivered') {
            outcomeHtml = `
                <div class="space-y-0.5">
                    <div class="flex items-center gap-1.5 font-bold text-emerald-400">
                        <span class="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(78,222,163,0.8)]"></span>
                        <span>Delivered Successfully</span>
                    </div>
                    <div class="text-[10px] text-on-surface-variant font-mono">Dispatched & verified via WhatsApp</div>
                </div>
            `;
        } else if (st.includes('No WhatsApp')) {
            outcomeHtml = `
                <div class="space-y-0.5">
                    <div class="flex items-center gap-1.5 font-bold text-rose-400">
                        <span class="w-2 h-2 rounded-full bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.8)]"></span>
                        <span>No WhatsApp Account</span>
                    </div>
                    <div class="text-[10px] text-rose-300/80 font-mono">Number not registered on WhatsApp servers</div>
                </div>
            `;
        } else if (st.includes('Invalid Phone')) {
            outcomeHtml = `
                <div class="space-y-0.5">
                    <div class="flex items-center gap-1.5 font-bold text-amber-400">
                        <span class="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]"></span>
                        <span>Invalid Phone Format</span>
                    </div>
                    <div class="text-[10px] text-amber-300/80 font-mono">Missing valid country prefix (+20) or bad digits</div>
                </div>
            `;
        } else if (st.includes('Duplicate')) {
            outcomeHtml = `
                <div class="space-y-0.5">
                    <div class="flex items-center gap-1.5 font-bold text-purple-400">
                        <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                        <span>Duplicate Skipped</span>
                    </div>
                    <div class="text-[10px] text-purple-300/80 font-mono">Anti-spam guard skipped duplicate entry</div>
                </div>
            `;
        } else if (st.includes('Failed')) {
            outcomeHtml = `
                <div class="space-y-0.5">
                    <div class="flex items-center gap-1.5 font-bold text-rose-400">
                        <span class="w-2 h-2 rounded-full bg-rose-400"></span>
                        <span>${st}</span>
                    </div>
                    <div class="text-[10px] text-on-surface-variant font-mono">${r.comment || 'Delivery unsuccessful'}</div>
                </div>
            `;
        } else {
            outcomeHtml = `
                <div class="space-y-0.5">
                    <div class="flex items-center gap-1.5 font-medium text-cyan-400">
                        <span class="w-2 h-2 rounded-full bg-cyan-400"></span>
                        <span>In Queue (Pending)</span>
                    </div>
                    <div class="text-[10px] text-on-surface-variant font-mono">Awaiting automated batch dispatch</div>
                </div>
            `;
        }

        return `
            <tr class="hover:bg-surface-container-high/40 transition-colors">
                <td class="px-5 py-3 font-mono font-bold text-on-surface-variant">${rowNum}</td>
                <td class="px-5 py-3 font-bold text-on-surface">
                    <div class="flex items-center gap-2">
                        <span class="w-6 h-6 rounded-full bg-surface-container-highest flex items-center justify-center text-[10px] font-bold text-primary">
                            ${name.charAt(0).toUpperCase()}
                        </span>
                        <span>${name}</span>
                    </div>
                </td>
                <td class="px-5 py-3 font-mono text-on-surface text-xs font-semibold">${phone}</td>
                <td class="px-5 py-3">
                    <span class="font-mono text-[10px] font-black text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-md">
                        ${grp}
                    </span>
                </td>
                <td class="px-5 py-3 text-center">
                    <span class="inline-flex items-center gap-1 font-mono text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${colorStyle.bg} ${colorStyle.text} ${colorStyle.border}">
                        Message #${tmplNum}
                    </span>
                </td>
                <td class="px-5 py-3">${outcomeHtml}</td>
                <td class="px-5 py-3 text-right">
                    ${cleanPhone ? `
                        <a href="https://wa.me/${cleanPhone}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container-highest hover:bg-primary/20 hover:text-primary text-on-surface-variant font-semibold text-[11px] transition-all" title="Open in WhatsApp">
                            <span class="material-symbols-outlined text-[14px]">open_in_new</span>
                            <span>Chat</span>
                        </a>
                    ` : '<span class="text-on-surface-variant opacity-40">-</span>'}
                </td>
            </tr>
        `;
    }).join('');
}

function exportIssuesToExcel() {
    const records = (slicedBatchRecords && slicedBatchRecords.length > 0) ? slicedBatchRecords : allLoadedRecords;
    const isIssue = (r) => {
        const s = r.status || '';
        return s.includes('Failed') || s.includes('Invalid') || s.includes('Skipped') || s.includes('No WhatsApp') || r.sheetStatus === 'Issue';
    };

    const issues = (records || []).filter(isIssue);
    if (issues.length === 0) {
        showToast('No delivery issues found in the current batch to export.', 'info');
        return;
    }

    const groupInput = document.getElementById('import-group-name');
    const groupName = (issues[0]?.groupName) || (groupInput?.value.trim()) || 'BatchGroup';

    const rows = issues.map((r, i) => ({
        'Index': r.sheetRowIndex || (i + 1),
        'Recipient Name': r.name || 'Unknown',
        'Phone Number': r.phone || '',
        'Group Name': r.groupName || groupName,
        'Template Pattern': `Message #${r.templateNum || 1}`,
        'Delivery Status': r.status || 'Failed',
        'Diagnostic Reason': r.status.includes('No WhatsApp') ? 'Number not registered on WhatsApp' : (r.status.includes('Invalid') ? 'Invalid phone format' : (r.comment || 'Delivery error')),
        'Timestamp': new Date().toLocaleString()
    }));

    if (typeof XLSX === 'undefined') {
        showToast('Excel library (XLSX) is not loaded.', 'error');
        return;
    }

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Issues Audit');

    const cleanGroupName = groupName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Issues_Audit_${cleanGroupName}_${Date.now()}.xlsx`;
    XLSX.writeFile(workbook, filename);
    showToast(`Exported ${issues.length} issue contacts to ${filename}`, 'success');
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
            renderAuditDiagnosticsTable();
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
        startDelayCountdown(delaySeconds, data.isBreak, data.breakText);
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

function startDelayCountdown(seconds, isBreak = false, breakText = '') {
    if (currentCountdownInterval) clearInterval(currentCountdownInterval);
    let remaining = seconds;
    const delayPatternText = document.getElementById('delay-pattern-text');
    
    if (isBreak && delayPatternText) {
        delayPatternText.textContent = breakText || `☕ Safety Rest Pause (${seconds}s)...`;
    } else {
        updateDelayPatternBadge();
    }

    if (countdownTimer) countdownTimer.textContent = `00:${remaining < 10 ? '0' + remaining : remaining}s`;

    currentCountdownInterval = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            clearInterval(currentCountdownInterval);
            if (countdownTimer) countdownTimer.textContent = '00:00s';
            if (progressBarTick) progressBarTick.style.width = '100%';
            updateDelayPatternBadge();
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
    const sent = job.sent || 0;
    const failed = job.failed || 0;
    const skipped = job.skipped || 0;
    const pending = Math.max(0, total - processed);

    // Confirmation page progress bar
    if (progressFill) progressFill.style.width = `${percent}%`;
    if (progressPercentage) progressPercentage.textContent = `${percent}% Completed`;
    if (progressCounts) progressCounts.textContent = `${processed} / ${total} Messages`;

    // Dashboard progress bar (Live Campaign Progress section)
    const dashFill = document.getElementById('dash-progress-fill');
    const dashPct = document.getElementById('dash-progress-pct');
    const dashCounts = document.getElementById('dash-progress-counts');
    const dashLiveBadge = document.getElementById('dash-live-dispatch-badge');
    const dashTemplateTag = document.getElementById('dash-current-template-tag');

    if (dashFill) dashFill.style.width = `${percent}%`;
    if (dashPct) dashPct.textContent = `${percent}%`;
    if (dashCounts) dashCounts.textContent = `${processed} / ${total} Contacts Dispatched`;

    if (dashLiveBadge) {
        if (job.isRunning && !job.isPaused) {
            dashLiveBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-primary animate-pulse"></span><span>Sending Live...</span>`;
            dashLiveBadge.className = 'px-3.5 py-1.5 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/25 flex items-center gap-2';
        } else if (job.isPaused) {
            dashLiveBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-secondary"></span><span>Paused</span>`;
            dashLiveBadge.className = 'px-3.5 py-1.5 rounded-full text-xs font-bold bg-secondary/10 text-secondary border border-secondary/25 flex items-center gap-2';
        } else {
            dashLiveBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-primary"></span><span>Engine Ready</span>`;
            dashLiveBadge.className = 'px-3.5 py-1.5 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/25 flex items-center gap-2';
        }
    }

    window.isDispatchJobRunning = Boolean(job.isRunning);

    // Update group name badge and input if job has groupName
    if (job.groupName) {
        const badge = document.getElementById('dash-group-name-badge');
        if (badge) badge.textContent = job.groupName;
        const input = document.getElementById('dash-group-name-input');
        if (input && document.activeElement !== input) input.value = job.groupName;
        const auditBadge = document.getElementById('dash-audit-group-badge');
        if (auditBadge) auditBadge.textContent = job.groupName;
    }

    // Current template tag
    if (dashTemplateTag && job.rotationMode && job.messageTemplates && job.messageTemplates.length > 0) {
        const activeTemplateNum = ((job.currentIndex || 0) % job.messageTemplates.length) + 1;
        dashTemplateTag.textContent = `Message #${activeTemplateNum}`;
    }

    // Dashboard column stats with pulse animation
    const statDelivered = document.getElementById('dash-stat-delivered');
    const statIssues = document.getElementById('dash-stat-issues');
    const statSkipped = document.getElementById('dash-stat-skipped');
    const statPending = document.getElementById('dash-stat-pending');
    setStatWithPulse(statDelivered, sent);
    setStatWithPulse(statIssues, failed);
    setStatWithPulse(statSkipped, skipped);
    setStatWithPulse(statPending, pending);
}

// ==========================================
// 6. Action Triggers
// ==========================================
if (btnStart) {
    btnStart.addEventListener('click', async () => {
        let messageTemplate = '';
        let activeTemplates = [];

        if (currentTemplateMode === 'rotating') {
            activeTemplates = rotatingTemplates.map(t => t.trim()).filter(t => t.length > 0);
            if (activeTemplates.length === 0) {
                showToast('Please enter at least one message template in cyclic rotation.', 'warning');
                return;
            }
            messageTemplate = activeTemplates[0];
        } else {
            messageTemplate = messageTemplateInput ? messageTemplateInput.value.trim() : '';
            if (!messageTemplate) {
                showToast('Please enter message text in the settings tab.', 'warning');
                return;
            }
            activeTemplates = [messageTemplate];
        }

        if (!isWhatsappConnected) {
            showToast('WhatsApp is not connected. Scan QR code first.', 'error');
            return;
        }

        if (!slicedBatchRecords || slicedBatchRecords.length === 0) {
            showToast('No contacts loaded. Import contacts first.', 'warning');
            return;
        }

        const fromIdx = rangeFromInput ? rangeFromInput.value : 1;
        const toIdx = rangeToInput ? rangeToInput.value : slicedBatchRecords.length;

        const delayMinVal = parseInt(document.getElementById('delay-min')?.value, 10) || 8;
        const delayMaxVal = parseInt(document.getElementById('delay-max')?.value, 10) || 16;
        const safetyDelaySec = parseInt(safetyDelayInput ? safetyDelayInput.value : 8, 10) || 8;
        const restDuration = isBatchRestEnabled ? (parseInt(document.getElementById('rest-duration')?.value, 10) || 60) : 0;
        const restFrequency = isBatchRestEnabled ? (parseInt(document.getElementById('rest-frequency')?.value, 10) || 20) : 0;
        const useJitter = document.getElementById('toggle-jitter')?.checked ?? true;

        dispatchHistory = [];
        btnStart.disabled = true;
        addLog(`Initializing batch sending (#${fromIdx} to #${toIdx})...`, 'system');
        showToast(`Starting batch: #${fromIdx} to #${toIdx} (${slicedBatchRecords.length} contacts)`, 'info');

        // Read group/campaign name from import modal input
        const groupNameInput = document.getElementById('import-group-name');
        const groupName = groupNameInput ? groupNameInput.value.trim() : 'Default Group';

        // Update dashboard group name badge immediately
        const groupBadge = document.getElementById('dash-group-name-badge');
        if (groupBadge && groupName) groupBadge.textContent = groupName;

        try {
            const response = await fetch(`${socketServerUrl}/api/send-custom-list`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    records: slicedBatchRecords,
                    messageTemplate,
                    messageTemplates: activeTemplates,
                    rotationMode: currentTemplateMode === 'rotating',
                    safetyDelaySec,
                    minDelaySec: delayMinVal,
                    maxDelaySec: delayMaxVal,
                    delayMode: currentDelayMode,
                    pauseAfterCount: restFrequency,
                    pauseDurationSec: restDuration,
                    useJitter,
                    groupName
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

function initSettingsUI() {
    const savedMin = localStorage.getItem('system_taha_delay_min');
    const savedMax = localStorage.getItem('system_taha_delay_max');
    const savedFix = localStorage.getItem('system_taha_range_delay');
    const savedRestDur = localStorage.getItem('system_taha_rest_duration');
    const savedRestFreq = localStorage.getItem('system_taha_rest_frequency');

    if (savedMin && document.getElementById('delay-min')) document.getElementById('delay-min').value = savedMin;
    if (savedMax && document.getElementById('delay-max')) document.getElementById('delay-max').value = savedMax;
    if (savedFix && document.getElementById('range-delay')) document.getElementById('range-delay').value = savedFix;
    if (savedRestDur && document.getElementById('rest-duration')) document.getElementById('rest-duration').value = savedRestDur;
    if (savedRestFreq && document.getElementById('rest-frequency')) document.getElementById('rest-frequency').value = savedRestFreq;

    const restChk = document.getElementById('toggle-batch-rest');
    if (restChk) {
        restChk.checked = isBatchRestEnabled;
        toggleBatchRestUI();
    }

    switchDelayMode(currentDelayMode);
    switchTemplateMode(currentTemplateMode);
    renderRotatingTemplateCards();
    updateDelayPatternBadge();
    updateRotationSummary();
    renderAuditDiagnosticsTable();

    // Initialize active group name from localStorage or inputs
    const initialGroup = getActiveGroupName();
    setActiveGroupName(initialGroup, true, false);

    const dashGroupInput = document.getElementById('dash-group-name-input');
    if (dashGroupInput) {
        dashGroupInput.addEventListener('input', (e) => {
            setActiveGroupName(e.target.value, false, false);
        });
        dashGroupInput.addEventListener('change', (e) => {
            setActiveGroupName(e.target.value, true, true);
        });
        dashGroupInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                activateCurrentGroupName();
                dashGroupInput.blur();
            }
        });
    }

    const modalGroupNameInput = document.getElementById('import-group-name');
    if (modalGroupNameInput) {
        modalGroupNameInput.addEventListener('input', (e) => {
            setActiveGroupName(e.target.value, true, false);
        });
    }

    // End Row default to 100 always
    if (rangeToInput) {
        rangeToInput.value = 100;
    }
    if (rangeFromInput && !rangeFromInput.value) {
        rangeFromInput.value = 1;
    }

    updateDashboardMiniStats();
}

// Event listener for template input live preview & app initialization
document.addEventListener('DOMContentLoaded', () => {
    const textarea = document.getElementById('message-template');
    if (textarea) {
        textarea.addEventListener('input', updateTemplateLivePreview);
        updateTemplateLivePreview();
    }
    initSettingsUI();
});

// Also run immediately if DOM is already ready
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initSettingsUI();
}

// ============================================================================
// ABSENT & WHATSAPP GROUP MENTION CONTROLLER (Dedicated Tab)
// ============================================================================
let absentTabAllRecords = [];
let absentTabAttendingSet = new Set();
let absentTabInitialized = false;
let currentMentionFormatStyle = 'tag'; // 'tag' (@Phone (Name)) | 'name' (Name (@Phone))

// Normalize phone number to international Egyptian format (20xxxxxxxxxx)
function normalizeToIntlPhone(phone) {
    const raw = String(phone || '').replace(/\D/g, '');
    if (!raw) return '';
    if (raw.startsWith('01') && raw.length === 11) {
        return '20' + raw.slice(1);
    }
    if (raw.startsWith('1') && raw.length === 10) {
        return '20' + raw;
    }
    if (raw.startsWith('20') && raw.length === 12) {
        return raw;
    }
    return raw;
}

// Arabic text normalizer for accurate and tolerant name matching
function normalizeArabicText(str) {
    if (!str) return '';
    return String(str)
        .replace(/[\u064B-\u0652]/g, '') // remove tashkeel
        .replace(/[أإآ]/g, 'ا')          // normalize Alef
        .replace(/ى/g, 'ي')              // normalize Ya
        .replace(/ة/g, 'ه')              // normalize Ta Marbuta
        .replace(/[ؤئ]/g, 'ء')           // normalize Hamza
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

// Retrieve loaded records with fallback to avoid blank state
function getAvailableSheetRecords() {
    if (slicedBatchRecords && slicedBatchRecords.length > 0) {
        return slicedBatchRecords;
    }
    if (allLoadedRecords && allLoadedRecords.length > 0) {
        return allLoadedRecords;
    }
    return [
        { name: 'Dr. Ahmed', phone: '01025485279', sheetRowIndex: 2, sheetStatus: 'Absent', comment: '' },
        { name: 'Tasnim', phone: '01009202137', sheetRowIndex: 3, sheetStatus: 'Absent', comment: '' },
        { name: 'Taha', phone: '01276800187', sheetRowIndex: 4, sheetStatus: 'Absent', comment: '' }
    ];
}

// Helper to get stable identifier for a record
function getRecordKey(r) {
    if (!r) return Math.random().toString();
    if (r.sheetRowIndex !== undefined && r.sheetRowIndex !== null) {
        return `row_${r.sheetRowIndex}`;
    }
    const cleanPhone = String(r.phone || '').replace(/\D/g, '');
    if (cleanPhone) return `phone_${cleanPhone}`;
    return `name_${r.name}`;
}

// Initialize Absent Tab
function initAbsentTab(forceReload = false) {
    const linkInput = document.getElementById('absent-tab-group-link');
    const savedLink = localStorage.getItem('absent_tab_group_link') || '';
    
    // Auto-detect link from Sheet Col D (comment) if localStorage is empty
    let groupLink = savedLink;
    if (!groupLink) {
        const pool = getAvailableSheetRecords();
        const found = pool.find(r => r.comment && (r.comment.includes('chat.whatsapp.com') || r.comment.endsWith('@g.us')));
        if (found) {
            const match = found.comment.match(/https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]+/);
            groupLink = match ? match[0] : found.comment.trim();
        }
    }

    if (linkInput && (!linkInput.value || forceReload)) {
        linkInput.value = groupLink;
    }
    updateAbsentGroupLinkStatusBadge(linkInput ? linkInput.value : groupLink);

    if (!absentTabInitialized || forceReload || absentTabAllRecords.length === 0) {
        absentTabAllRecords = getAvailableSheetRecords().map(r => ({
            ...r,
            sheetStatus: 'Absent' // Everyone defaults to Absent
        }));
        absentTabAttendingSet.clear();
        absentTabInitialized = true;
    }

    renderAbsentTabList();
    updateAbsentTabMentionPreview();
}
window.initAbsentTab = initAbsentTab;

// Update Link Status Badge
function updateAbsentGroupLinkStatusBadge(link) {
    const badge = document.getElementById('absent-group-link-status');
    if (!badge) return;
    const clean = (link || '').trim();
    if (clean.includes('chat.whatsapp.com') || clean.endsWith('@g.us')) {
        badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span><span>Ready / Linked</span>`;
        badge.className = 'text-[10px] font-mono font-bold text-cyan-300 bg-cyan-500/15 border border-cyan-500/30 px-2.5 py-0.5 rounded-full flex items-center gap-1';
    } else if (clean) {
        badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span><span>Custom Target</span>`;
        badge.className = 'text-[10px] font-mono font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 rounded-full flex items-center gap-1';
    } else {
        badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span><span>No Link Set</span>`;
        badge.className = 'text-[10px] font-mono font-bold text-rose-300 bg-rose-500/15 border border-rose-500/30 px-2.5 py-0.5 rounded-full flex items-center gap-1';
    }
}

// Group link change listener in UI
function onAbsentTabGroupLinkChange(val) {
    const clean = (val || '').trim();
    localStorage.setItem('absent_tab_group_link', clean);
    updateAbsentGroupLinkStatusBadge(clean);
}
window.onAbsentTabGroupLinkChange = onAbsentTabGroupLinkChange;

// Test open group link
function testOpenGroupLink() {
    const linkInput = document.getElementById('absent-tab-group-link');
    const link = linkInput ? linkInput.value.trim() : '';
    if (!link) {
        showToast('Please enter or paste the WhatsApp Group link first.', 'warning');
        if (linkInput) linkInput.focus();
        return;
    }
    if (link.startsWith('http://') || link.startsWith('https://')) {
        window.open(link, '_blank');
    } else {
        showToast('Invalid URL. Link should start with https://chat.whatsapp.com/', 'warning');
    }
}
window.testOpenGroupLink = testOpenGroupLink;

// Toggle Mention Format Style
function setMentionFormatStyle(style) {
    currentMentionFormatStyle = style;
    const btnTag = document.getElementById('btn-mention-style-tag');
    const btnName = document.getElementById('btn-mention-style-name');

    if (style === 'tag') {
        if (btnTag) {
            btnTag.className = 'px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all bg-primary text-on-primary shadow-sm';
        }
        if (btnName) {
            btnName.className = 'px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all bg-surface-container text-on-surface hover:bg-surface-container-highest';
        }
    } else {
        if (btnName) {
            btnName.className = 'px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all bg-primary text-on-primary shadow-sm';
        }
        if (btnTag) {
            btnTag.className = 'px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all bg-surface-container text-on-surface hover:bg-surface-container-highest';
        }
    }

    updateAbsentTabMentionPreview();
}
window.setMentionFormatStyle = setMentionFormatStyle;

// Render Absent List & Present List (Clean English UI)
function renderAbsentTabList() {
    const absentContainer = document.getElementById('absent-members-container');
    const presentContainer = document.getElementById('present-members-container');

    const absentList = absentTabAllRecords.filter(r => !absentTabAttendingSet.has(getRecordKey(r)));
    const presentList = absentTabAllRecords.filter(r => absentTabAttendingSet.has(getRecordKey(r)));

    // Update Counts
    const absentCountEl = document.getElementById('absent-tab-count');
    const activeAbsentListCountEl = document.getElementById('active-absent-list-count');
    const presentCountEl = document.getElementById('present-tab-count');
    const accordionPresentCountEl = document.getElementById('accordion-present-count');

    if (absentCountEl) absentCountEl.textContent = absentList.length;
    if (activeAbsentListCountEl) activeAbsentListCountEl.textContent = absentList.length;
    if (presentCountEl) presentCountEl.textContent = presentList.length;
    if (accordionPresentCountEl) accordionPresentCountEl.textContent = presentList.length;

    // Render Active Absent Container
    if (absentContainer) {
        if (absentList.length === 0) {
            absentContainer.innerHTML = `
                <div class="p-10 text-center space-y-2">
                    <div class="w-12 h-12 mx-auto rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                        <span class="material-symbols-outlined text-[28px]">task_alt</span>
                    </div>
                    <div class="font-bold text-sm text-on-surface">All members marked Present! 🎉</div>
                    <p class="text-xs text-on-surface-variant">There are no remaining absent contacts to mention in the group.</p>
                </div>
            `;
        } else {
            absentContainer.innerHTML = absentList.map((person, idx) => {
                const key = getRecordKey(person);
                const safeName = (person.name || 'Member').trim();
                const intlPhone = normalizeToIntlPhone(person.phone);
                const rowLabel = person.sheetRowIndex ? `Row #${person.sheetRowIndex}` : 'Manual';

                return `
                    <div class="p-3.5 px-4 flex items-center justify-between gap-3 hover:bg-surface-container/40 transition-colors group">
                        <div class="flex items-center gap-3 min-w-0">
                            <span class="w-6 h-6 rounded-full bg-surface-container-highest flex items-center justify-center text-[11px] font-mono font-bold text-on-surface-variant flex-shrink-0">
                                ${idx + 1}
                            </span>
                            <div class="w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 flex items-center justify-center font-bold text-xs flex-shrink-0">
                                ${safeName.charAt(0).toUpperCase() || '?'}
                            </div>
                            <div class="min-w-0">
                                <div class="font-bold text-xs text-on-surface truncate flex items-center gap-2">
                                    <span>${safeName}</span>
                                    <span class="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30">ABSENT</span>
                                </div>
                                <div class="text-[10px] text-on-surface-variant font-mono truncate flex items-center gap-2 mt-0.5">
                                    <span>+${intlPhone || person.phone || 'No Phone'}</span>
                                    <span class="text-outline-variant">•</span>
                                    <span>${rowLabel}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Mark Present Button (Immediately vanishes person from active view) -->
                        <button type="button" 
                            onclick="markPersonPresentInTab('${key}')" 
                            class="flex-shrink-0 px-3.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500 text-emerald-300 hover:text-white border border-emerald-500/30 hover:border-emerald-500 font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all hover:scale-105 active:scale-95 cursor-pointer"
                            title="Mark present (removes immediately from absent list)">
                            <span class="material-symbols-outlined text-[15px]">check</span>
                            <span>Present</span>
                        </button>
                    </div>
                `;
            }).join('');
        }
    }

    // Render Present Container
    if (presentContainer) {
        if (presentList.length === 0) {
            presentContainer.innerHTML = `
                <div class="p-4 text-center text-xs text-on-surface-variant font-medium">
                    No members marked present yet. Everyone is absent by default.
                </div>
            `;
        } else {
            presentContainer.innerHTML = presentList.map((person, idx) => {
                const key = getRecordKey(person);
                const safeName = (person.name || 'Member').trim();
                const intlPhone = normalizeToIntlPhone(person.phone);

                return `
                    <div class="p-2.5 px-3 rounded-xl bg-surface-container/60 border border-emerald-500/20 flex items-center justify-between gap-3 text-xs">
                        <div class="flex items-center gap-2.5 min-w-0">
                            <span class="material-symbols-outlined text-emerald-400 text-[18px]">check_circle</span>
                            <div class="min-w-0">
                                <span class="font-bold text-on-surface truncate">${safeName}</span>
                                <span class="text-[10px] text-on-surface-variant font-mono mr-2">(+${intlPhone})</span>
                            </div>
                        </div>

                        <!-- Undo / Return to Absent Button -->
                        <button type="button" 
                            onclick="returnPersonToAbsentTab('${key}')" 
                            class="px-2.5 py-1 rounded-lg bg-surface-container hover:bg-rose-500/20 text-on-surface-variant hover:text-rose-300 border border-outline-variant/30 text-[10px] font-bold flex items-center gap-1 transition-all"
                            title="Undo attendance and return to absent list">
                            <span class="material-symbols-outlined text-[13px]">undo</span>
                            <span>Undo</span>
                        </button>
                    </div>
                `;
            }).join('');
        }
    }

    updateAbsentTabMentionPreview();
}
window.renderAbsentTabList = renderAbsentTabList;

// Mark Person as Present -> Immediately vanishes from active view
function markPersonPresentInTab(key) {
    if (!key) return;
    absentTabAttendingSet.add(key);

    const person = absentTabAllRecords.find(r => getRecordKey(r) === key);
    if (person) {
        person.sheetStatus = 'Attending';
        if (slicedBatchRecords && slicedBatchRecords.length > 0) {
            const batchMatch = slicedBatchRecords.find(r => getRecordKey(r) === key);
            if (batchMatch) {
                batchMatch.sheetStatus = 'Attending';
                if (batchMatch.sheetRowIndex) {
                    syncRowToSheet(batchMatch.sheetRowIndex);
                }
            }
        }
        showToast(`Marked "${person.name}" as Present. Removed from absent list.`, 'success');
    }

    renderAbsentTabList();
}
window.markPersonPresentInTab = markPersonPresentInTab;

// Return Person back to Absent list
function returnPersonToAbsentTab(key) {
    if (!key) return;
    absentTabAttendingSet.delete(key);

    const person = absentTabAllRecords.find(r => getRecordKey(r) === key);
    if (person) {
        person.sheetStatus = 'Absent';
        if (slicedBatchRecords && slicedBatchRecords.length > 0) {
            const batchMatch = slicedBatchRecords.find(r => getRecordKey(r) === key);
            if (batchMatch) {
                batchMatch.sheetStatus = 'Absent';
                if (batchMatch.sheetRowIndex) {
                    syncRowToSheet(batchMatch.sheetRowIndex);
                }
            }
        }
        showToast(`Returned "${person.name}" to Absent list.`, 'info');
    }

    renderAbsentTabList();
}
window.returnPersonToAbsentTab = returnPersonToAbsentTab;

// Mark All in Tab
function markAllAbsentTab(allPresent) {
    if (allPresent) {
        absentTabAllRecords.forEach(r => {
            absentTabAttendingSet.add(getRecordKey(r));
            r.sheetStatus = 'Attending';
        });
        showToast('Marked all members as Present.', 'success');
    } else {
        absentTabAttendingSet.clear();
        absentTabAllRecords.forEach(r => {
            r.sheetStatus = 'Absent';
        });
        showToast('Reset all members back to Absent.', 'info');
    }
    renderAbsentTabList();
}
window.markAllAbsentTab = markAllAbsentTab;

// Toggle Present Accordion
function togglePresentAccordion() {
    const container = document.getElementById('present-members-container');
    const chevron = document.getElementById('accordion-present-chevron');
    if (!container) return;
    const isHidden = container.classList.contains('hidden');
    if (isHidden) {
        container.classList.remove('hidden');
        if (chevron) chevron.style.transform = 'rotate(180deg)';
    } else {
        container.classList.add('hidden');
        if (chevron) chevron.style.transform = 'rotate(0deg)';
    }
}
window.togglePresentAccordion = togglePresentAccordion;

// Match and Filter Absent Names from Textarea
function matchAndFilterAbsentNames() {
    const textarea = document.getElementById('manual-absent-names-textarea');
    const rawInput = textarea ? textarea.value.trim() : '';
    const pool = getAvailableSheetRecords();

    if (!rawInput) {
        absentTabAllRecords = pool.map(r => ({ ...r, sheetStatus: 'Absent' }));
        absentTabAttendingSet.clear();
        renderAbsentTabList();
        showToast('Reloaded all sheet contacts into absent list.', 'info');
        return;
    }

    const rawNames = rawInput
        .split(/[\n,;]+/)
        .map(s => s.trim())
        .filter(s => s.length > 0);

    if (rawNames.length === 0) {
        showToast('Please type at least one name to filter.', 'warning');
        return;
    }

    const matchedRecords = [];
    let matchCount = 0;

    rawNames.forEach(rawName => {
        const normInput = normalizeArabicText(rawName);
        const rawDigits = rawName.replace(/\D/g, '');

        // Search in loaded sheet records
        const found = pool.find(rec => {
            const normRec = normalizeArabicText(rec.name || '');
            const recPhone = String(rec.phone || '').replace(/\D/g, '');
            if (rawDigits && (recPhone.includes(rawDigits) || rawDigits.includes(recPhone))) return true;
            if (!normRec || !normInput) return false;
            return normRec.includes(normInput) || normInput.includes(normRec);
        });

        if (found) {
            matchCount++;
            matchedRecords.push({
                ...found,
                sheetStatus: 'Absent'
            });
        } else {
            matchedRecords.push({
                name: rawName,
                phone: rawDigits || 'Manual',
                sheetRowIndex: null,
                sheetStatus: 'Absent',
                comment: ''
            });
        }
    });

    absentTabAllRecords = matchedRecords;
    absentTabAttendingSet.clear();
    renderAbsentTabList();

    addLog(`Matched ${matchCount} of ${rawNames.length} names from Google Sheet for Absent List`, 'system');
    showToast(`Matched ${matchCount} of ${rawNames.length} names from sheet!`, 'success');
}
window.matchAndFilterAbsentNames = matchAndFilterAbsentNames;

// Build the final WhatsApp mention message text
function getAbsentTabMessageText() {
    const absentList = absentTabAllRecords.filter(r => !absentTabAttendingSet.has(getRecordKey(r)));
    const footerInput = document.getElementById('absent-message-footer-input');
    const footerNote = footerInput ? footerInput.value.trim() : 'فينكم يا شباب مستنيكم تدخلو عشان الغياب';

    if (absentList.length === 0) {
        return `🎉 All members are present today!\n\n_Generated via System Taha_`;
    }

    // Format lines:
    // When using WhatsApp Web API with mentions, WhatsApp requires the phone number prefixed with '@':
    // Example: 1 - @201025485279 (Dr. Ahmed)
    const lines = absentList.map((person, idx) => {
        const cleanName = (person.name || 'Member').trim();
        const intlPhone = normalizeToIntlPhone(person.phone);

        if (currentMentionFormatStyle === 'name') {
            return intlPhone 
                ? `${idx + 1} - ${cleanName} (@${intlPhone})`
                : `${idx + 1} - @${cleanName}`;
        } else {
            // Default 'tag' style: @Phone (Name)
            return intlPhone 
                ? `${idx + 1} - @${intlPhone} (${cleanName})`
                : `${idx + 1} - @${cleanName}`;
        }
    });

    if (footerNote) {
        lines.push('');
        lines.push(footerNote);
    }

    return lines.join('\n');
}

// Update the live preview box in the UI
function updateAbsentTabMentionPreview() {
    const previewBox = document.getElementById('absent-message-preview-box');
    if (!previewBox) return;
    previewBox.textContent = getAbsentTabMessageText();
}
window.updateAbsentTabMentionPreview = updateAbsentTabMentionPreview;

// Copy Mention Message to Clipboard
function copyAbsentTabMessageText() {
    const text = getAbsentTabMessageText();
    navigator.clipboard.writeText(text).then(() => {
        showToast('Mention message copied to clipboard!', 'success');
    }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('Mention message copied to clipboard!', 'success');
    });
}
window.copyAbsentTabMessageText = copyAbsentTabMessageText;

// Open WhatsApp Group directly
function openAbsentTabWhatsAppWeb() {
    const linkInput = document.getElementById('absent-tab-group-link');
    const link = linkInput ? linkInput.value.trim() : '';
    if (!link) {
        showToast('Please enter WhatsApp group link first.', 'warning');
        if (linkInput) linkInput.focus();
        return;
    }

    copyAbsentTabMessageText();
    if (link.startsWith('http://') || link.startsWith('https://')) {
        window.open(link, '_blank');
        showToast('Opened group link! Message copied to clipboard.', 'success');
    } else {
        showToast('Invalid WhatsApp group link.', 'error');
    }
}
window.openAbsentTabWhatsAppWeb = openAbsentTabWhatsAppWeb;

// Direct Send Mention to WhatsApp Group
async function sendAbsentTabMentionDirect() {
    const linkInput = document.getElementById('absent-tab-group-link');
    const groupTarget = linkInput ? linkInput.value.trim() : '';
    const absentList = absentTabAllRecords.filter(r => !absentTabAttendingSet.has(getRecordKey(r)));
    const message = getAbsentTabMessageText();

    if (!groupTarget) {
        showToast('Please enter or paste the WhatsApp Group link in the field above.', 'error');
        if (linkInput) linkInput.focus();
        return;
    }

    if (absentList.length === 0) {
        showToast('No absent members to mention. All members are marked Present!', 'info');
        return;
    }

    const btn = document.getElementById('btn-send-absent-tab-group');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span> Dispatching to Group...`;
    }

    addLog(`Dispatching absent mention report to group: ${groupTarget}...`, 'system');

    try {
        const response = await fetch(`${socketServerUrl}/api/send-group-mention`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                groupTarget,
                message,
                absentList
            })
        });

        const data = await response.json();
        if (!response.ok || data.error) {
            throw new Error(data.error || 'Failed to dispatch group mention.');
        }

        addLog(`✅ Successfully dispatched attendance mention to WhatsApp group! (${data.count || absentList.length} tags resolved)`, 'success');
        showToast(`Sent mention message to WhatsApp group successfully! (${absentList.length} absent tagged)`, 'success');

        // Batch update Google Sheet status to Absent for remaining and Attending for present
        if (currentSpreadsheetId) {
            const updates = [];
            absentTabAllRecords.forEach(r => {
                if (r.sheetRowIndex) {
                    const isAttending = absentTabAttendingSet.has(getRecordKey(r));
                    updates.push({
                        sheetRowIndex: r.sheetRowIndex,
                        status: isAttending ? 'Attending' : 'Absent'
                    });
                }
            });

            if (updates.length > 0) {
                fetch(`${socketServerUrl}/api/batch-update-attendance`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        spreadsheetId: currentSpreadsheetId,
                        updates
                    })
                }).then(res => res.json()).then(resData => {
                    if (resData.success) {
                        addLog(`Synced ${updates.length} attendance statuses to Google Sheet (Col C).`, 'success');
                    }
                }).catch(e => console.warn('Background sheet sync warning:', e.message));
            }
        }
    } catch (err) {
        console.error('Group mention error:', err);
        addLog(`❌ Group mention error: ${err.message}`, 'error');
        showToast(`Group mention error: ${err.message}`, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<span class="material-symbols-outlined text-[18px]">send</span><span>Send Group Mention Now</span>`;
        }
    }
}
window.sendAbsentTabMentionDirect = sendAbsentTabMentionDirect;

// Refresh Data from Sheet
function refreshAbsentTabData() {
    absentTabInitialized = false;
    const textarea = document.getElementById('manual-absent-names-textarea');
    if (textarea) textarea.value = '';
    initAbsentTab(true);
    showToast('Attendance data refreshed from Sheet.', 'success');
}
window.refreshAbsentTabData = refreshAbsentTabData;


// ==========================================
// Online Sheet — Group Schedule Feature
// Backed by Google Sheets API
// ==========================================

const ONLINE_SHEET_DEFAULT_URL = 'https://docs.google.com/spreadsheets/d/1Vo0FNrZCBDFsjpqaP5Sao2zCEQ2BIaQhyWsboR9PuSs/edit?usp=sharing';

// Arabic day names — matching what's written in column D
const DAY_NAMES    = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAY_NAMES_AR = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

// State
let _onlineSheetGroups = [];
let _onlineSheetActiveId = null;
let _onlineSheetCurrentFilter = 'today'; // 'today' | 'all' | 'custom'
let _onlineSheetDayFilter = '';
let _onlineSheetSearchQuery = '';

// Helper: Normalize Arabic text for resilient matching
function normalizeArabicDay(str) {
    if (!str) return '';
    return String(str)
        .trim()
        .replace(/[إأآا]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .toLowerCase();
}

function getTodayArabicName() {
    const dayIdx = new Date().getDay();
    return DAY_NAMES_AR[dayIdx];
}

// ── Get current configured Sheet URL or ID ──
function getOnlineSheetUrl() {
    const input = document.getElementById('online-sheet-url-input');
    if (input && input.value.trim()) {
        return input.value.trim();
    }
    return localStorage.getItem('online_sheet_url') || ONLINE_SHEET_DEFAULT_URL;
}

// ── On URL input change ──
function onOnlineSheetUrlChange() {
    const input = document.getElementById('online-sheet-url-input');
    if (!input) return;
    const url = input.value.trim() || ONLINE_SHEET_DEFAULT_URL;
    localStorage.setItem('online_sheet_url', url);

    const openLink = document.getElementById('online-sheet-open-link');
    if (openLink) openLink.href = url;

    fetchOnlineSheetGroups();
}
window.onOnlineSheetUrlChange = onOnlineSheetUrlChange;

// ── Fetch all groups from the backend (reads Google Sheet dynamically) ──
async function fetchOnlineSheetGroups() {
    const container = document.getElementById('online-sheet-list');
    const fetchBtn = document.getElementById('btn-fetch-online-sheet');
    const url = getOnlineSheetUrl();

    // Update input and link if needed
    const input = document.getElementById('online-sheet-url-input');
    if (input && input.value !== url) input.value = url;
    const openLink = document.getElementById('online-sheet-open-link');
    if (openLink) openLink.href = url;

    // Loading UI
    if (container) {
        container.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center gap-2 py-10 text-xs text-on-surface-variant opacity-70">
                <span class="material-symbols-outlined text-[24px] text-violet-400 animate-spin">progress_activity</span>
                <span>Loading group schedules from Google Sheet...</span>
            </div>`;
    }
    if (fetchBtn) {
        fetchBtn.disabled = true;
        fetchBtn.classList.add('opacity-75');
    }

    try {
        const res = await fetch(`${socketServerUrl}/api/online-sheet/groups?sheetId=${encodeURIComponent(url)}`);
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Failed to fetch');

        _onlineSheetGroups = data.groups || [];

        // Update counts
        updateOnlineSheetCounts();

        // Apply active filter and render
        applyOnlineSheetFilters();

        if (_onlineSheetGroups.length > 0) {
            addLog(`Online Sheet: Loaded ${_onlineSheetGroups.length} group(s) from Google Sheet.`, 'system');
            showToast(`✅ Loaded ${_onlineSheetGroups.length} group(s) from Sheet!`, 'success');
        } else {
            showToast('Sheet connected, but no groups recorded.', 'info');
        }
    } catch (err) {
        console.error('Online sheet fetch error:', err);
        if (container) {
            container.innerHTML = `
                <div class="col-span-full text-center text-xs text-rose-400 py-6 space-y-2 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
                    <span class="material-symbols-outlined text-[24px] block mx-auto text-rose-400">error</span>
                    <div class="font-bold">Failed to load groups from Google Sheet</div>
                    <div class="text-[11px] text-on-surface-variant font-mono">${err.message}</div>
                    <button type="button" onclick="fetchOnlineSheetGroups()" class="mt-2 px-3 py-1 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-[11px] font-bold inline-flex items-center gap-1 transition-all">
                        <span class="material-symbols-outlined text-[13px]">sync</span> Retry
                    </button>
                </div>`;
        }
        showToast('Failed to load Sheet: ' + err.message, 'error');
    } finally {
        if (fetchBtn) {
            fetchBtn.disabled = false;
            fetchBtn.classList.remove('opacity-75');
        }
    }
}
window.fetchOnlineSheetGroups = fetchOnlineSheetGroups;

// ── Update counters & badges in the UI ──
function updateOnlineSheetCounts() {
    const todayAr = getTodayArabicName();
    const todayNorm = normalizeArabicDay(todayAr);

    const todayCount = _onlineSheetGroups.filter(g => {
        const dNorm = normalizeArabicDay(g.date);
        return dNorm === todayNorm || dNorm.includes(todayNorm);
    }).length;

    const totalCount = _onlineSheetGroups.length;

    const countBadge = document.getElementById('online-sheet-count-badge');
    if (countBadge) countBadge.textContent = `${totalCount} Groups`;

    const allCountBadge = document.getElementById('online-sheet-all-count');
    if (allCountBadge) allCountBadge.textContent = String(totalCount);

    const todayCountBadge = document.getElementById('online-sheet-today-count');
    if (todayCountBadge) todayCountBadge.textContent = String(todayCount);

    const todayLabel = document.getElementById('online-sheet-today-label');
    if (todayLabel) todayLabel.textContent = todayAr;
}

// ── Switch filter (today vs all) ──
function filterOnlineSheet(mode) {
    _onlineSheetCurrentFilter = mode;
    _onlineSheetDayFilter = '';

    const daySelect = document.getElementById('online-sheet-day-filter');
    if (daySelect) daySelect.value = '';

    // Update button states
    const btnToday = document.getElementById('btn-filter-today');
    const btnAll = document.getElementById('btn-filter-all');

    if (mode === 'today') {
        if (btnToday) {
            btnToday.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 text-xs font-bold transition-all shadow-sm ring-1 ring-emerald-500/30';
        }
        if (btnAll) {
            btnAll.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-highest text-on-surface-variant border border-outline-variant/30 text-xs font-semibold transition-all';
        }
    } else {
        if (btnAll) {
            btnAll.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/25 text-violet-300 border border-violet-500/50 text-xs font-bold transition-all shadow-sm ring-1 ring-violet-500/30';
        }
        if (btnToday) {
            btnToday.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-highest text-on-surface-variant border border-outline-variant/30 text-xs font-semibold transition-all';
        }
    }

    applyOnlineSheetFilters();
}
window.filterOnlineSheet = filterOnlineSheet;

// ── Filter by specific day ──
function filterOnlineSheetByDay(day) {
    _onlineSheetDayFilter = (day || '').trim();
    if (_onlineSheetDayFilter) {
        _onlineSheetCurrentFilter = 'custom';
        const btnToday = document.getElementById('btn-filter-today');
        const btnAll = document.getElementById('btn-filter-all');
        if (btnToday) btnToday.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-highest text-on-surface-variant border border-outline-variant/30 text-xs font-semibold transition-all';
        if (btnAll) btnAll.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-highest text-on-surface-variant border border-outline-variant/30 text-xs font-semibold transition-all';
    } else {
        filterOnlineSheet('all');
        return;
    }
    applyOnlineSheetFilters();
}
window.filterOnlineSheetByDay = filterOnlineSheetByDay;

// ── Live Search ──
function onOnlineSheetSearch(query) {
    _onlineSheetSearchQuery = (query || '').trim().toLowerCase();
    applyOnlineSheetFilters();
}
window.onOnlineSheetSearch = onOnlineSheetSearch;

// ── Apply all active filters ──
function applyOnlineSheetFilters() {
    const todayAr = getTodayArabicName();
    const todayNorm = normalizeArabicDay(todayAr);

    let filtered = [..._onlineSheetGroups];

    // Filter by mode / day
    if (_onlineSheetCurrentFilter === 'today') {
        filtered = filtered.filter(g => {
            const dNorm = normalizeArabicDay(g.date);
            return dNorm === todayNorm || dNorm.includes(todayNorm);
        });
    } else if (_onlineSheetCurrentFilter === 'custom' && _onlineSheetDayFilter) {
        const targetNorm = normalizeArabicDay(_onlineSheetDayFilter);
        filtered = filtered.filter(g => {
            const dNorm = normalizeArabicDay(g.date);
            return dNorm === targetNorm || dNorm.includes(targetNorm);
        });
    }

    // Filter by search query
    if (_onlineSheetSearchQuery) {
        filtered = filtered.filter(g => {
            const name = (g.name || '').toLowerCase();
            const date = (g.date || '').toLowerCase();
            const time = (g.time || '').toLowerCase();
            return name.includes(_onlineSheetSearchQuery) || date.includes(_onlineSheetSearchQuery) || time.includes(_onlineSheetSearchQuery);
        });
    }

    renderOnlineSheetList(filtered, _onlineSheetActiveId);
}

// ── Activate a group → load its link into the WA target input ──
function activateOnlineSheetGroup(id) {
    const group = _onlineSheetGroups.find(g => g.id === id);
    if (!group) return;

    _onlineSheetActiveId = id;

    // 1. Update the Target WhatsApp Group Link input
    const linkInput = document.getElementById('absent-tab-group-link');
    if (linkInput) {
        linkInput.value = group.link;
        if (typeof onAbsentTabGroupLinkChange === 'function') {
            onAbsentTabGroupLinkChange(group.link);
        }
    }

    // 2. Update globals and localStorage
    if (typeof activeWhatsAppGroupLink !== 'undefined') {
        activeWhatsAppGroupLink = group.link;
    }
    localStorage.setItem('absent_tab_group_link', group.link);

    if (typeof updateAbsentGroupLinkStatusBadge === 'function') {
        updateAbsentGroupLinkStatusBadge(group.link);
    }

    // 3. Update the active banner
    const banner = document.getElementById('online-sheet-active-banner');
    const bannerName = document.getElementById('online-sheet-active-name');
    if (banner && bannerName) {
        banner.classList.remove('hidden');
        bannerName.textContent = `${group.name}  •  ${group.date || ''}  ${group.time || ''}`;
    }

    showToast(`🎯 Target set to "${group.name}"!`, 'success');
    addLog(`Online Sheet: Activated "${group.name}" → ${group.link}`, 'system');

    // Re-render list to reflect active state
    applyOnlineSheetFilters();
}
window.activateOnlineSheetGroup = activateOnlineSheetGroup;

// ── Copy group invite link ──
function copyOnlineGroupLink(event, link) {
    if (event) event.stopPropagation();
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => {
        showToast('Group link copied ✅', 'success');
    }).catch(() => {
        showToast('Failed to copy', 'warning');
    });
}
window.copyOnlineGroupLink = copyOnlineGroupLink;

// ── Render the groups list in the UI ──
function renderOnlineSheetList(list, activeId) {
    const container = document.getElementById('online-sheet-list');
    if (!container) return;

    const todayAr = getTodayArabicName();
    const todayNorm = normalizeArabicDay(todayAr);

    if (!list || list.length === 0) {
        const isFilterActive = _onlineSheetCurrentFilter === 'today' || _onlineSheetDayFilter || _onlineSheetSearchQuery;
        container.innerHTML = `
            <div class="col-span-full text-center text-xs text-on-surface-variant py-8 opacity-75 space-y-2 bg-surface-container/20 border border-outline-variant/20 rounded-xl p-5">
                <span class="material-symbols-outlined text-[28px] block mx-auto text-violet-400/60">inbox</span>
                <div class="font-bold text-on-surface">
                    ${_onlineSheetCurrentFilter === 'today' ? `No groups scheduled for ${todayAr}` : 'No groups matching your search'}
                </div>
                <div class="text-[11px] text-on-surface-variant">
                    ${isFilterActive ? 'Try selecting "All" or verify the data in your Google Sheet.' : 'Make sure data exists in columns A, B, C, and D.'}
                </div>
                ${isFilterActive ? `
                    <button type="button" onclick="filterOnlineSheet('all')" class="mt-2 px-3 py-1.5 rounded-lg bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 border border-violet-500/30 text-xs font-bold transition-all">
                        Show All Groups (${_onlineSheetGroups.length})
                    </button>
                ` : ''}
            </div>`;
        return;
    }

    container.innerHTML = list.map(g => {
        const dNorm = normalizeArabicDay(g.date);
        const isToday  = dNorm === todayNorm || dNorm.includes(todayNorm);
        const isActive = g.id === (_onlineSheetActiveId);
        const timeDisplay = g.time || '--:--';
        const dayDisplay = g.date || '—';
        const safeId = String(g.id).replace(/'/g, '');
        const safeLink = (g.link || '');
        const shortLink = safeLink.replace('https://chat.whatsapp.com/', '');
        const trimmedShortLink = shortLink.length > 18 ? shortLink.substring(0, 18) + '…' : shortLink;

        return `
            <div class="group relative flex flex-col justify-between p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer select-none
                ${isActive
                    ? 'bg-gradient-to-br from-violet-950/60 to-violet-900/30 border-violet-400 ring-2 ring-violet-500/50 shadow-lg shadow-violet-950/40'
                    : isToday
                        ? 'bg-gradient-to-br from-emerald-950/30 via-surface-container/60 to-surface-container/40 border-emerald-500/40 hover:border-emerald-400/70 hover:shadow-md'
                        : 'bg-surface-container/40 border-outline-variant/30 hover:bg-surface-container/70 hover:border-violet-500/40 hover:shadow-sm'}"
                onclick="activateOnlineSheetGroup('${safeId}')">

                <!-- Top Row: Name & Badges -->
                <div class="flex items-start justify-between gap-2">
                    <div class="flex items-center gap-2 min-w-0 flex-1">
                        <span class="p-1.5 rounded-xl flex-shrink-0
                            ${isActive ? 'bg-violet-500/30 text-violet-200' : isToday ? 'bg-emerald-500/20 text-emerald-300' : 'bg-surface-container-highest text-on-surface-variant'}">
                            <span class="material-symbols-outlined text-[16px] block">group</span>
                        </span>
                        <div class="min-w-0">
                            <div class="font-bold text-xs text-on-surface truncate flex items-center gap-1.5" title="${g.name}">
                                <span>${g.name}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Badges -->
                    <div class="flex items-center gap-1 flex-shrink-0">
                        ${isToday ? `
                            <span class="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-0.5 shadow-sm">
                                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                TODAY
                            </span>
                        ` : ''}
                        ${isActive ? `
                            <span class="text-[9px] font-bold px-2 py-0.5 rounded-full bg-violet-500/30 text-violet-200 border border-violet-400/60 flex items-center gap-0.5">
                                <span class="material-symbols-outlined text-[11px]">check_circle</span>
                                Target
                            </span>
                        ` : ''}
                    </div>
                </div>

                <!-- Middle Row: Day, Time & Link Preview -->
                <div class="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2 border-t border-outline-variant/15 text-[11px]">
                    <!-- Day Pill (Kept in Arabic as requested) -->
                    <span class="px-2 py-0.5 rounded-lg font-medium flex items-center gap-1
                        ${isToday ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-surface-container-highest/80 text-on-surface-variant border border-outline-variant/20'}">
                        <span class="material-symbols-outlined text-[12px]">calendar_today</span>
                        <span>${dayDisplay}</span>
                    </span>

                    <!-- Time Pill -->
                    <span class="px-2 py-0.5 rounded-lg font-mono font-medium flex items-center gap-1 bg-surface-container-highest/80 text-on-surface-variant border border-outline-variant/20">
                        <span class="material-symbols-outlined text-[12px]">schedule</span>
                        <span>${timeDisplay}</span>
                    </span>

                    <!-- Short Link Pill -->
                    <span class="ml-auto text-[10px] font-mono text-on-surface-variant/70 truncate max-w-[120px]" title="${safeLink}">
                        ${trimmedShortLink}
                    </span>
                </div>

                <!-- Bottom Row: Action Buttons -->
                <div class="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-outline-variant/15">
                    <button type="button"
                        class="px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all
                            ${isActive
                                ? 'bg-violet-500 text-white shadow-sm'
                                : 'bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 border border-violet-500/30'}">
                        <span class="material-symbols-outlined text-[13px]">${isActive ? 'check' : 'touch_app'}</span>
                        <span>${isActive ? 'Selected' : 'Set as Target'}</span>
                    </button>

                    <div class="flex items-center gap-1" onclick="event.stopPropagation()">
                        <!-- Copy Link -->
                        <button type="button"
                            onclick="copyOnlineGroupLink(event, '${safeLink}')"
                            class="p-1 rounded-lg bg-surface-container hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface border border-outline-variant/20 transition-all"
                            title="Copy invite link">
                            <span class="material-symbols-outlined text-[13px]">content_copy</span>
                        </button>

                        <!-- Open in WhatsApp -->
                        <button type="button"
                            onclick="event.stopPropagation(); window.open('${safeLink}', '_blank')"
                            class="p-1 rounded-lg bg-surface-container hover:bg-surface-container-highest text-cyan-400 hover:text-cyan-300 border border-outline-variant/20 transition-all"
                            title="Open group in WhatsApp">
                            <span class="material-symbols-outlined text-[13px]">open_in_new</span>
                        </button>
                    </div>
                </div>
            </div>`;
    }).join('');
}
window.renderOnlineSheetList = renderOnlineSheetList;

// ── Initialize on tab open or DOM ready ──
function initOnlineSheet() {
    const savedUrl = localStorage.getItem('online_sheet_url') || ONLINE_SHEET_DEFAULT_URL;
    const input = document.getElementById('online-sheet-url-input');
    if (input) input.value = savedUrl;

    const openLink = document.getElementById('online-sheet-open-link');
    if (openLink) openLink.href = savedUrl;

    const todayAr = getTodayArabicName();
    const todayLabel = document.getElementById('online-sheet-today-label');
    if (todayLabel) todayLabel.textContent = todayAr;

    fetchOnlineSheetGroups();
}
window.initOnlineSheet = initOnlineSheet;

// Init immediately or on DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOnlineSheet);
} else {
    initOnlineSheet();
}
