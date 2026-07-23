/**
 * System Taha - WhatsApp Bulk Sender
 * Google Apps Script Integration Backend
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('💬 System Taha WhatsApp')
    .addItem('🚀 Launch Control Center', 'showSidebar')
    .addToUi();
}

/**
 * Open Sidebar UI
 */
function showSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('System Taha - WhatsApp Sender Pro')
    .setWidth(480);
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Fetch and Filter Contacts with Range & Name+Phone Deduplication
 * @param {number} fromIndex - 1-based start row index
 * @param {number} toIndex - 1-based end row index
 */
function getContactsData(fromIndex, toIndex) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) {
    return { 
      success: false, 
      message: 'No data found in sheet. Please add Name in Col A and Phone in Col B starting from Row 2.' 
    };
  }
  
  const contacts = [];
  const phoneSet = new Set();
  const nameSet = new Set();
  
  let duplicatePhoneCount = 0;
  let duplicateNameCount = 0;
  let sentCount = 0;
  
  const startRow = Math.max(1, (fromIndex || 1));
  const endRow = Math.min(data.length - 1, (toIndex || data.length - 1));

  for (let i = startRow; i <= endRow; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const rawName = row[0] ? String(row[0]).trim() : 'Customer';
    let rawPhone = row[1] ? String(row[1]).trim() : '';
    const status = row[2] ? String(row[2]).trim() : '';
    
    if (!rawPhone && !rawName) continue;
    
    // Normalize Phone Number
    let cleanPhone = rawPhone.replace(/\D/g, '');
    if (cleanPhone.startsWith('01') && cleanPhone.length === 11) {
      cleanPhone = '20' + cleanPhone.slice(1);
    } else if (cleanPhone.startsWith('1') && cleanPhone.length === 10) {
      cleanPhone = '20' + cleanPhone;
    }
    
    let contactStatus = 'Pending Batch';
    const normName = rawName.toLowerCase();

    if (status.toLowerCase().includes('sent') || status.toLowerCase().includes('تم')) {
      contactStatus = 'Skipped (Already Sent)';
      sentCount++;
    } else if (cleanPhone.length < 8) {
      contactStatus = 'Invalid Phone Number';
    } else if (phoneSet.has(cleanPhone)) {
      contactStatus = 'Skipped (Duplicate Phone)';
      duplicatePhoneCount++;
    } else if (nameSet.has(normName) && normName !== 'customer' && normName !== 'عميلنا العزيز') {
      contactStatus = 'Skipped (Duplicate Name)';
      duplicateNameCount++;
    } else {
      phoneSet.add(cleanPhone);
      if (normName) nameSet.add(normName);
    }
    
    contacts.push({
      rowIndex: i + 1,
      name: rawName,
      phone: rawPhone,
      cleanPhone: cleanPhone,
      status: contactStatus
    });
  }
  
  return {
    success: true,
    totalRecords: data.length - 1,
    slicedCount: contacts.length,
    sentCount: sentCount,
    duplicatePhoneCount: duplicatePhoneCount,
    duplicateNameCount: duplicateNameCount,
    contacts: contacts
  };
}

/**
 * Update Cell Status in Sheet
 */
function updateRowStatus(rowIndex, statusText) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  sheet.getRange(rowIndex, 3).setValue(statusText);
}
