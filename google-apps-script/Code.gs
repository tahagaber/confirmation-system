/**
 * System Taha - WhatsApp Bulk Sender
 * Google Apps Script Integration Backend
 * Includes: Google Contacts Integration via People API
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

    if (status.toLowerCase().includes('sent')) {
      contactStatus = 'Skipped (Already Sent)';
      sentCount++;
    } else if (cleanPhone.length < 8) {
      contactStatus = 'Invalid Phone Number';
    } else if (phoneSet.has(cleanPhone)) {
      contactStatus = 'Skipped (Duplicate Phone)';
      duplicatePhoneCount++;
    } else if (nameSet.has(normName) && normName !== 'customer' && normName !== 'dear customer') {
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

/**
 * Save contacts from sheet to Google Contacts (People API)
 * @param {number} fromIndex - 1-based start row
 * @param {number} toIndex   - 1-based end row
 * @param {string} labelName - Contact label/group name (default: 'Sheet Contacts')
 */
function saveToGoogleContacts(fromIndex, toIndex, labelName) {
  const result = getContactsData(fromIndex, toIndex);
  if (!result.success) return result;

  const groupLabel = labelName || 'Sheet Contacts';
  let saved = 0, skipped = 0, failed = 0;
  const details = [];

  // Get or create a contact group (label)
  let groupResourceName = null;
  try {
    const groups = People.ContactGroups.list();
    if (groups.contactGroups) {
      const found = groups.contactGroups.find(
        g => g.name === groupLabel && g.groupType === 'USER_CONTACT_GROUP'
      );
      if (found) {
        groupResourceName = found.resourceName;
      }
    }
    if (!groupResourceName) {
      const newGroup = People.ContactGroups.create({ contactGroup: { name: groupLabel } });
      groupResourceName = newGroup.resourceName;
    }
  } catch (e) {
    Logger.log('Could not create/find group: ' + e);
  }

  // Fetch existing phone numbers to avoid duplicates
  const existingPhones = new Set();
  try {
    let pageToken = null;
    do {
      const params = {
        resourceName: 'people/me',
        pageSize: 1000,
        personFields: 'phoneNumbers'
      };
      if (pageToken) params.pageToken = pageToken;
      const connections = People.People.Connections.list('people/me', params);
      if (connections.connections) {
        connections.connections.forEach(person => {
          if (person.phoneNumbers) {
            person.phoneNumbers.forEach(p => {
              existingPhones.add(p.value.replace(/\D/g, ''));
            });
          }
        });
      }
      pageToken = connections.nextPageToken;
    } while (pageToken);
  } catch (e) {
    Logger.log('Could not fetch existing contacts: ' + e);
  }

  // Loop through sheet contacts and create each one
  const pendingContacts = result.contacts.filter(c => c.status === 'Pending Batch' && c.cleanPhone);

  pendingContacts.forEach(contact => {
    const cleanPhone = contact.cleanPhone;

    if (existingPhones.has(cleanPhone)) {
      skipped++;
      details.push({ name: contact.name, phone: contact.phone, status: 'Already Exists' });
      return;
    }

    try {
      const personBody = {
        names: [{ givenName: contact.name }],
        phoneNumbers: [{ value: '+' + cleanPhone, type: 'mobile' }]
      };

      const created = People.People.createContact(personBody);

      // Add to group if available
      if (groupResourceName && created.resourceName) {
        try {
          People.ContactGroups.Members.modify(
            { resourceNamesToAdd: [created.resourceName] },
            groupResourceName
          );
        } catch (ge) {
          Logger.log('Could not add to group: ' + ge);
        }
      }

      existingPhones.add(cleanPhone);
      saved++;
      details.push({ name: contact.name, phone: contact.phone, status: 'Saved ✅' });

      // Small delay to respect API rate limits
      Utilities.sleep(300);

    } catch (e) {
      failed++;
      details.push({ name: contact.name, phone: contact.phone, status: 'Failed ❌: ' + e.message });
    }
  });

  return {
    success: true,
    saved: saved,
    skipped: skipped,
    failed: failed,
    total: pendingContacts.length,
    details: details,
    label: groupLabel
  };
}

/**
 * Save ALL sheet contacts (no range filter) to Google Contacts
 */
function saveAllContactsToGoogle() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();
  return saveToGoogleContacts(1, lastRow - 1, 'Sheet Contacts');
}

// ─────────────────────────────────────────────────────────────
// ATTENDANCE & GROUP SYNC
// Col A = Name | Col B = Phone | Col C = Status | Col D = Group Link
// ─────────────────────────────────────────────────────────────

/**
 * Fetch contacts for attendance tracking (includes group link from Col D)
 * @param {number} fromIndex - 1-based start row
 * @param {number} toIndex   - 1-based end row
 */
function getAttendanceData(fromIndex, toIndex) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    return { success: false, message: 'No data found in sheet.' };
  }

  const startRow = Math.max(1, (fromIndex || 1));
  const endRow   = Math.min(data.length - 1, (toIndex || data.length - 1));

  const contacts = [];
  let groupLink = '';

  for (let i = startRow; i <= endRow; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const name   = row[0] ? String(row[0]).trim() : '';
    const phone  = row[1] ? String(row[1]).trim() : '';
    const status = row[2] ? String(row[2]).trim() : '';
    const colD   = row[3] ? String(row[3]).trim() : '';

    // Col D: first non-empty value that looks like a URL = group link
    if (!groupLink && colD && (colD.startsWith('http') || colD.startsWith('https'))) {
      groupLink = colD;
    }

    if (!name && !phone) continue;

    // Normalize phone
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.startsWith('01') && cleanPhone.length === 11) cleanPhone = '20' + cleanPhone.slice(1);
    else if (cleanPhone.startsWith('1') && cleanPhone.length === 10) cleanPhone = '20' + cleanPhone;

    contacts.push({
      rowIndex: i + 1,
      name: name,
      phone: phone,
      cleanPhone: cleanPhone,
      status: status
    });
  }

  return {
    success: true,
    contacts: contacts,
    groupLink: groupLink
  };
}

/**
 * Mark a row as Present or Absent in Col C
 * @param {number} rowIndex  - sheet row (1-based)
 * @param {string} statusVal - 'Present' or 'Absent'
 */
function setAttendanceStatus(rowIndex, statusVal) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const cell  = sheet.getRange(rowIndex, 3);
  if (statusVal === 'Present') {
    cell.setValue('Present ✅');
    cell.setBackground('#d1fae5');
    cell.setFontColor('#065f46');
  } else {
    cell.setValue('Absent ❌');
    cell.setBackground('#fee2e2');
    cell.setFontColor('#991b1b');
  }
}

/**
 * Batch-update attendance for multiple rows at once
 * @param {Array} updates - [{rowIndex, status}]
 */
function batchSetAttendance(updates) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  updates.forEach(function(u) {
    const cell = sheet.getRange(u.rowIndex, 3);
    if (u.status === 'Present') {
      cell.setValue('Present ✅');
      cell.setBackground('#d1fae5');
      cell.setFontColor('#065f46');
    } else {
      cell.setValue('Absent ❌');
      cell.setBackground('#fee2e2');
      cell.setFontColor('#991b1b');
    }
  });
  return { success: true };
}

/**
 * Build a WhatsApp-ready group mention message for absent members
 * @param {Array}  absentNames - array of name strings
 * @param {string} groupLabel  - name of the group/session
 * @param {string} reason      - optional custom reason text
 */
function buildGroupMentionMessage(absentNames, groupLabel, reason) {
  const label   = groupLabel || 'the session';
  const why     = reason     || 'they did not confirm their attendance';
  const nameList = absentNames.map(n => '@' + n).join(', ');
  const msg = [
    '📋 *Attendance Report — ' + label + '*',
    '',
    '❌ *Absent Members:*',
    nameList,
    '',
    '📌 Reason: ' + why,
    '',
    '_Please confirm your attendance for the next session._'
  ].join('\n');
  return { success: true, message: msg };
}

/**
 * Save selected contacts (absent list) to Google Contacts
 * Name format:  Full Name (GroupLabel)
 * @param {Array}  contactsList - [{name, cleanPhone}]
 * @param {string} labelName    - Google Contacts group label
 */
function saveAbsentToGoogleContacts(contactsList, labelName) {
  const groupLabel = labelName || 'Sheet Contacts';
  let saved = 0, skipped = 0, failed = 0;
  const details = [];

  // Get or create contact group
  let groupResourceName = null;
  try {
    const groups = People.ContactGroups.list();
    if (groups.contactGroups) {
      const found = groups.contactGroups.find(
        g => g.name === groupLabel && g.groupType === 'USER_CONTACT_GROUP'
      );
      if (found) groupResourceName = found.resourceName;
    }
    if (!groupResourceName) {
      const newGroup = People.ContactGroups.create({ contactGroup: { name: groupLabel } });
      groupResourceName = newGroup.resourceName;
    }
  } catch (e) {
    Logger.log('Group error: ' + e);
  }

  // Fetch existing phones
  const existingPhones = new Set();
  try {
    let pageToken = null;
    do {
      const params = { resourceName: 'people/me', pageSize: 1000, personFields: 'phoneNumbers' };
      if (pageToken) params.pageToken = pageToken;
      const conns = People.People.Connections.list('people/me', params);
      if (conns.connections) {
        conns.connections.forEach(p => {
          (p.phoneNumbers || []).forEach(ph => existingPhones.add(ph.value.replace(/\D/g, '')));
        });
      }
      pageToken = conns.nextPageToken;
    } while (pageToken);
  } catch (e) {
    Logger.log('Fetch contacts error: ' + e);
  }

  contactsList.forEach(function(contact) {
    const cleanPhone = contact.cleanPhone;
    // Format: "Ahmed Mohamed (Sales Team)"
    const displayName = contact.name + ' (' + groupLabel + ')';

    if (existingPhones.has(cleanPhone)) {
      skipped++;
      details.push({ name: displayName, phone: contact.phone || '', status: 'Already Exists' });
      return;
    }

    try {
      const personBody = {
        names: [{ displayName: displayName, givenName: contact.name }],
        phoneNumbers: [{ value: '+' + cleanPhone, type: 'mobile' }]
      };
      const created = People.People.createContact(personBody);

      if (groupResourceName && created.resourceName) {
        try {
          People.ContactGroups.Members.modify(
            { resourceNamesToAdd: [created.resourceName] },
            groupResourceName
          );
        } catch (ge) { Logger.log('Group add error: ' + ge); }
      }

      existingPhones.add(cleanPhone);
      saved++;
      details.push({ name: displayName, phone: contact.phone || '', status: 'Saved ✅' });
      Utilities.sleep(300);
    } catch (e) {
      failed++;
      details.push({ name: displayName, phone: contact.phone || '', status: 'Failed ❌: ' + e.message });
    }
  });

  return { success: true, saved, skipped, failed, total: contactsList.length, details, label: groupLabel };
}
