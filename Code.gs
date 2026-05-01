/**
 * Farmasi Marketing Masterclass — Premium Backend
 * Google Apps Script Code v2.0
 *
 * Sheet structure:
 * - "Registrations": timestamp | first_name | last_name | city | phone | position | ticket_id | tier
 * - "Config": key | value
 *
 * Premium features added:
 * - Ticket ID generation (FM-2026-XXXXX format)
 * - Tier badges (Early Bird / VIP / Standard) based on registration order
 * - Registration progress data
 * - Last 5 registrations with masked phones
 * - Telegram bot notifications (optional)
 */

const SHEET_NAME = 'Registrations';
const CONFIG_SHEET_NAME = 'Config';

// 🤖 Telegram Bot (არჩევითი)
const TELEGRAM_BOT_TOKEN = '';

// 📲 SMS settings (bulksms.ge / POSTA GUVERCINI)
// PRIVATE_KEY and PUBLIC_KEY must be set in Apps Script → Project Settings → Script Properties
const SMS_API_URL = 'https://api.bulksms.ge/gateway/api/sms/v1/message/send';
const SMS_DEFAULT_SENDER = 'FARMASI'; // Sender name (must be pre-registered with bulksms.ge)
const SITE_BASE_URL = 'https://farmasi-masterclass.vercel.app'; // for ticket link in SMS

// Tier thresholds
const EARLY_BIRD_LIMIT = 10;  // First 10 = Early Bird
const VIP_LIMIT = 30;          // 11–30 = VIP
                              // 31+ = Standard

// =================== GET ===================
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const regSheet = ss.getSheetByName(SHEET_NAME);
    const configSheet = ss.getSheetByName(CONFIG_SHEET_NAME);

    if (!regSheet || !configSheet) {
      return jsonResponse({ ok: false, error: 'Sheets not found' });
    }

    // 🎫 Lookup ticket by ID (called from URL ?action=getTicket&id=FM-2026-00001)
    const action = e && e.parameter && e.parameter.action;
    if (action === 'getTicket') {
      return handleGetTicket(regSheet, configSheet, e.parameter.id);
    }

    // 🔐 Verify ticket by phone number (used by "ნახვა" button)
    if (action === 'verifyTicketByPhone') {
      return handleVerifyByPhone(regSheet, configSheet, e.parameter.phone);
    }

    // 📲 Send ticket link via SMS to user's own phone
    if (action === 'sendTicketLink') {
      return handleSendTicketLink(regSheet, e.parameter.phone, e.parameter.id);
    }

    const config = readConfig(configSheet);
    const data = regSheet.getDataRange().getValues();
    const rows = data.slice(1).filter(r => r[0]);

    const totalRegistrations = rows.length;

    // Today's registrations
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayRegistrations = rows.filter(r => {
      const ts = new Date(r[0]);
      return ts >= today;
    }).length;

    // Spots left
    const maxReg = parseInt(config.max_registrations);
    const spotsLeft = (!isNaN(maxReg) && maxReg > 0)
      ? Math.max(0, maxReg - totalRegistrations)
      : null;

    // Occupied seats — column I (index 8) is seat_number
    const occupiedSeats = rows
      .map(r => parseInt(r[8]))
      .filter(n => !isNaN(n) && n > 0);

    // Last registrations
    const lastRegistrations = rows
      .slice(-5)
      .reverse()
      .map(r => {
        const ts = new Date(r[0]);
        return {
          name: String(r[1] || '').trim() + ' ' + String(r[2] || '').trim(),
          phone: maskPhone(String(r[4] || '')),
          time: Utilities.formatDate(ts, 'Asia/Tbilisi', 'HH:mm'),
          tier: r[7] || '',
          seat: r[8] || ''
        };
      });

    const status = String(config.registration_status || 'open').toLowerCase();

    // Compute progress percentage
    let progressPercent = 0;
    if (!isNaN(maxReg) && maxReg > 0) {
      progressPercent = Math.round((totalRegistrations / maxReg) * 100);
    }

    // Determine current tier (what the next registration would receive)
    const nextTier = getNextTier(totalRegistrations);

    return jsonResponse({
      ok: true,
      status: status,
      totalRegistrations: totalRegistrations,
      todayRegistrations: todayRegistrations,
      spotsLeft: spotsLeft,
      maxRegistrations: !isNaN(maxReg) ? maxReg : null,
      progressPercent: progressPercent,
      nextTier: nextTier,
      occupiedSeats: occupiedSeats,
      config: config,
      lastRegistrations: lastRegistrations
    });

  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

// =================== POST ===================
function doPost(e) {
  try {
    const action = String((e.parameter && e.parameter.action) || '').trim();

    if (action === 'register') return handleRegister(e.parameter);
    if (action === 'cancel') return handleCancel(e.parameter);

    return jsonResponse({ ok: false, error: 'Unknown action' });

  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

// =================== REGISTER ===================
function handleRegister(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const regSheet = ss.getSheetByName(SHEET_NAME);
  const configSheet = ss.getSheetByName(CONFIG_SHEET_NAME);

  const config = readConfig(configSheet);

  if (String(config.registration_status || 'open').toLowerCase() !== 'open') {
    return jsonResponse({ ok: false, error: 'Registration is closed' });
  }

  const phone = normalizePhone(params.phone);
  const firstName = String(params.first_name || '').trim();
  const lastName = String(params.last_name || '').trim();
  const seatRaw = String(params.seat_number || '').trim();
  const seatNumber = seatRaw ? parseInt(seatRaw) : null;

  if (!phone) return jsonResponse({ ok: false, error: 'Phone required' });
  if (!firstName) return jsonResponse({ ok: false, error: 'First name required' });
  if (!lastName) return jsonResponse({ ok: false, error: 'Last name required' });
  if (!seatNumber || isNaN(seatNumber) || seatNumber < 1 || seatNumber > 54) {
    return jsonResponse({ ok: false, error: 'Invalid seat' });
  }

  const data = regSheet.getDataRange().getValues();
  const rowCount = data.slice(1).filter(r => r[0]).length;

  const maxReg = parseInt(config.max_registrations);
  if (!isNaN(maxReg) && maxReg > 0 && rowCount >= maxReg) {
    return jsonResponse({ ok: false, error: 'No spots left' });
  }

  // Duplicate phone check + seat availability check
  for (let i = 1; i < data.length; i++) {
    if (normalizePhone(data[i][4]) === phone) {
      return jsonResponse({ ok: false, error: 'Already registered' });
    }
    const existingSeat = parseInt(data[i][8]);
    if (!isNaN(existingSeat) && existingSeat === seatNumber) {
      return jsonResponse({ ok: false, error: 'Seat taken' });
    }
  }

  // Generate ticket ID and assign tier
  const ticketId = generateTicketId(rowCount + 1);
  const tier = getNextTier(rowCount);

  regSheet.appendRow([
    new Date(),
    firstName,
    lastName,
    String(params.city_area_village || '').trim(),
    phone,
    String(params.position || '').trim(),
    ticketId,
    tier,
    seatNumber
  ]);

  // Telegram notification
  notifyTelegram(config, {
    first_name: firstName,
    last_name: lastName,
    city: params.city_area_village,
    phone: phone,
    position: params.position,
    ticket_id: ticketId,
    tier: tier,
    seat: seatNumber
  });

  // 📲 SMS notification with ticket info — to the participant
  sendTicketSMS(phone, {
    first_name: firstName,
    last_name: lastName,
    ticket_id: ticketId,
    tier: tier,
    seat: seatNumber,
    event_time: config.event_time || '14:00',
    event_date: config.event_date || '',
    transport_time: config.transport_time || '',
    transport_address: config.transport_address || ''
  });

  // 📨 ADMIN NOTIFICATIONS: SMS to all admin phones
  notifyAdmins(config, {
    first_name: firstName,
    last_name: lastName,
    phone: phone,
    city: params.city_area_village,
    position: params.position,
    ticket_id: ticketId,
    tier: tier,
    seat: seatNumber,
    registration_number: rowCount + 1
  });

  return jsonResponse({
    ok: true,
    ticket_id: ticketId,
    tier: tier,
    seat_number: seatNumber,
    registration_number: rowCount + 1
  });
}

// =================== CANCEL ===================
function handleCancel(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const regSheet = ss.getSheetByName(SHEET_NAME);

  const phone = normalizePhone(params.phone);
  const ticketId = String(params.ticket_id || '').trim();

  // Either phone OR ticket_id must be provided
  if (!phone && !ticketId) {
    return jsonResponse({ ok: false, error: 'Phone or ticket_id required' });
  }

  const data = regSheet.getDataRange().getValues();

  for (let i = data.length - 1; i >= 1; i--) {
    const rowPhone = normalizePhone(data[i][4]);
    const rowTicketId = String(data[i][6] || '').trim();

    // Match by phone OR ticket_id
    const matchesPhone = phone && rowPhone === phone;
    const matchesTicketId = ticketId && rowTicketId === ticketId;

    if (matchesPhone || matchesTicketId) {
      regSheet.deleteRow(i + 1);
      return jsonResponse({
        ok: true,
        cancelled: {
          ticket_id: rowTicketId,
          seat_number: data[i][8] || null
        }
      });
    }
  }

  return jsonResponse({ ok: false, error: 'Not found' });
}

// =================== HELPERS ===================
function readConfig(sheet) {
  const config = {};
  const data = sheet.getDataRange().getValues();

  // Keys that should be formatted as time (HH:mm) when they are Date objects
  const TIME_KEYS = [
    'event_time',
    'meeting_end_time',
    'transport_time',
    'reminder_2h'
  ];

  // Keys that should be formatted as date (yyyy-MM-dd) when they are Date objects
  const DATE_KEYS = [
    'event_date',
    'reminder_day'
  ];

  for (let i = 0; i < data.length; i++) {
    const key = String(data[i][0] || '').trim();
    if (!key) continue;

    let val = data[i][1];

    // Handle Date objects intelligently based on the key
    if (val instanceof Date) {
      if (DATE_KEYS.indexOf(key) !== -1) {
        val = Utilities.formatDate(val, 'Asia/Tbilisi', 'yyyy-MM-dd');
      } else if (TIME_KEYS.indexOf(key) !== -1) {
        val = Utilities.formatDate(val, 'Asia/Tbilisi', 'HH:mm');
      } else {
        // For any other Date-typed field — try to be smart:
        // If the year is 1899 (Sheet's "time-only" sentinel year), format as time
        // Otherwise, format as datetime
        if (val.getFullYear() === 1899) {
          val = Utilities.formatDate(val, 'Asia/Tbilisi', 'HH:mm');
        } else {
          val = Utilities.formatDate(val, 'Asia/Tbilisi', 'yyyy-MM-dd HH:mm');
        }
      }
    }

    config[key] = String(val || '');
  }

  return config;
}

function normalizePhone(p) {
  return String(p || '').replace(/\D/g, '').trim();
}

function maskPhone(p) {
  const clean = normalizePhone(p);
  if (clean.length < 6) return clean;
  return clean.substring(0, 3) + '***' + clean.substring(clean.length - 3);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function generateTicketId(registrationNumber) {
  // Format: FM-2026-00047 (Farmasi Masterclass + year + zero-padded number)
  const year = new Date().getFullYear();
  const padded = String(registrationNumber).padStart(5, '0');
  return `FM-${year}-${padded}`;
}

function getNextTier(currentCount) {
  if (currentCount < EARLY_BIRD_LIMIT) return 'Early Bird';
  if (currentCount < VIP_LIMIT) return 'VIP';
  return 'Standard';
}

function notifyTelegram(config, data) {
  if (!TELEGRAM_BOT_TOKEN) return;

  const chatIds = String(config.admin_chat_ids || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (!chatIds.length) return;

  const tierEmoji = data.tier === 'Early Bird' ? '🥇' : data.tier === 'VIP' ? '✨' : '🎫';

  const text =
    '🆕 ახალი რეგისტრაცია (მასტერკლასი)\n\n' +
    tierEmoji + ' ' + data.tier + '\n' +
    '🎫 ' + data.ticket_id + '\n' +
    '🪑 ადგილი #' + (data.seat || '-') + '\n\n' +
    '👤 ' + (data.first_name || '') + ' ' + (data.last_name || '') + '\n' +
    '📍 ' + (data.city || '-') + '\n' +
    '💼 ' + (data.position || '-') + '\n' +
    '📱 ' + (data.phone || '');

  chatIds.forEach(chatId => {
    try {
      UrlFetchApp.fetch(
        'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage',
        {
          method: 'post',
          payload: { chat_id: chatId, text: text },
          muteHttpExceptions: true
        }
      );
    } catch (e) {}
  });
}

// =================== GET TICKET BY ID ===================
function handleGetTicket(regSheet, configSheet, ticketId) {
  ticketId = String(ticketId || '').trim();
  if (!ticketId) {
    return jsonResponse({ ok: false, error: 'Ticket ID required' });
  }

  const data = regSheet.getDataRange().getValues();
  const config = readConfig(configSheet);

  // Search rows for matching ticket_id (column G, index 6)
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][6]).trim() === ticketId) {
      return jsonResponse({
        ok: true,
        ticket: {
          ticket_id: ticketId,
          first_name: String(data[i][1] || '').trim(),
          last_name: String(data[i][2] || '').trim(),
          city: String(data[i][3] || '').trim(),
          // phone is sensitive — return masked
          phone: maskPhone(String(data[i][4] || '')),
          position: String(data[i][5] || '').trim(),
          tier: String(data[i][7] || 'Standard').trim(),
          seat_number: parseInt(data[i][8]) || null
        },
        config: config
      });
    }
  }

  return jsonResponse({ ok: false, error: 'Ticket not found' });
}

// =================== SMS via bulksms.ge (POSTA GUVERCINI) ===================
/**
 * Send a ticket confirmation SMS to the registered phone.
 * Uses Apps Script Properties: PRIVATE_KEY (Bearer JWT) and PUBLIC_KEY (URL param).
 */
function sendTicketSMS(phone, data) {
  try {
    const props = PropertiesService.getScriptProperties();
    const privateKey = props.getProperty('PRIVATE_KEY');
    const publicKey = props.getProperty('PUBLIC_KEY');

    if (!privateKey || !publicKey) {
      Logger.log('SMS keys missing in Script Properties — SMS skipped');
      return;
    }

    const intlPhone = toInternationalPhone(phone);
    if (!intlPhone) {
      Logger.log('Invalid phone for SMS: ' + phone);
      return;
    }

    // Compose SMS text (UNICODE for Georgian characters)
    const text = composeTicketSMS(data);

    const payload = {
      Text: text,
      Purpose: 'INF', // Information message
      Options: {
        Originator: SMS_DEFAULT_SENDER,
        Encoding: 'UNICODE', // For Georgian
        SmsType: 'SMS',
        ReportLabel: 'Farmasi Masterclass Ticket'
      },
      Receivers: [
        { Receiver: intlPhone }
      ]
    };

    const url = SMS_API_URL + '?publicKey=' + encodeURIComponent(publicKey);

    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': 'Bearer ' + privateKey
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const code = response.getResponseCode();
    const body = response.getContentText();
    Logger.log('SMS API response (' + code + '): ' + body);

    if (code !== 200) {
      Logger.log('SMS sending failed for ' + intlPhone);
    }
  } catch (err) {
    Logger.log('SMS error: ' + err);
  }
}

/**
 * Compose the SMS body. Keep it short — every ~70 UNICODE chars = 1 SMS segment.
 */
function composeTicketSMS(data) {
  const tierEmoji = data.tier === 'Early Bird' ? '🌟'
                  : data.tier === 'VIP' ? '💎'
                  : '✦';

  let text = 'Farmasi Masterclass 2026\n';
  text += tierEmoji + ' ' + (data.first_name || '') + '\n';
  text += '🎫 ' + (data.ticket_id || '') + '\n';
  text += '🪑 ადგილი #' + (data.seat || '-') + '\n';

  if (data.transport_time) {
    text += '🚌 გასვლა: ' + data.transport_time + '\n';
  }

  if (data.transport_address) {
    // Truncate long addresses
    const addr = data.transport_address.length > 50
      ? data.transport_address.substring(0, 47) + '...'
      : data.transport_address;
    text += '📍 ' + addr + '\n';
  }

  // Personalized ticket link — opens dedicated ticket page directly
  text += '\n🎫 ბილეთი: ' + SITE_BASE_URL + '/ticket.html?t=' + encodeURIComponent(data.ticket_id || '');

  return text;
}

/**
 * Normalize phone to international format for bulksms.ge.
 * Georgian numbers: 5XX XX XX XX (9 digits) → 9955XXXXXXXX (12 digits)
 * Already-international stays as-is.
 */
function toInternationalPhone(phone) {
  let clean = String(phone || '').replace(/\D/g, '');

  if (!clean) return null;

  // If starts with country code 995 — keep as is
  if (clean.startsWith('995') && clean.length === 12) {
    return clean;
  }

  // Georgian local format (9 digits, starts with 5)
  if (clean.length === 9 && clean.startsWith('5')) {
    return '995' + clean;
  }

  // If 12 digits already (international without +), keep
  if (clean.length >= 11 && clean.length <= 14) {
    return clean;
  }

  return null;
}

/**
 * MANUAL TEST FUNCTION — run this from Apps Script editor to verify SMS works.
 * 1. Open Apps Script editor
 * 2. Select function "testSMS" from the dropdown at the top
 * 3. Click ▶ Run
 * 4. Check the Logs (View → Logs) and your phone
 */
function testSMS() {
  const testPhone = '599772266'; // ⚠️ Replace with YOUR real phone number for testing!

  sendTicketSMS(testPhone, {
    first_name: 'ტესტი',
    last_name: 'ბერიძე',
    ticket_id: 'FM-2026-00001',
    tier: 'Early Bird',
    seat: 14,
    event_time: '14:00',
    event_date: '2026-06-15',
    transport_time: '12:00',
    transport_address: 'მეტრო ვაგზლის მოედანი'
  });

  Logger.log('Test SMS sent (check logs above for response)');
}


// =================== VERIFY TICKET BY PHONE ===================
/**
 * Verify a phone against registered tickets.
 * Returns full ticket info if a matching phone is found.
 * Used by "ნახვა" → phone modal → instant ticket display.
 */
function handleVerifyByPhone(regSheet, configSheet, rawPhone) {
  const inputDigits = String(rawPhone || '').replace(/\D/g, '');
  if (inputDigits.length < 9) {
    return jsonResponse({ ok: false, error: 'არასწორი ტელეფონის ფორმატი' });
  }

  const inputLast9 = inputDigits.slice(-9);
  const data = regSheet.getDataRange().getValues();
  const config = readConfig(configSheet);

  for (let i = 1; i < data.length; i++) {
    const sheetPhone = String(data[i][4] || '').replace(/\D/g, '');
    if (!sheetPhone) continue;

    if (sheetPhone.slice(-9) === inputLast9) {
      return jsonResponse({
        ok: true,
        ticket: {
          ticket_id:   String(data[i][6] || '').trim(),
          first_name:  String(data[i][1] || '').trim(),
          last_name:   String(data[i][2] || '').trim(),
          city:        String(data[i][3] || '').trim(),
          phone:       String(data[i][4] || '').trim(),
          position:    String(data[i][5] || '').trim(),
          tier:        String(data[i][7] || 'Standard').trim(),
          seat_number: parseInt(data[i][8]) || null
        },
        config: config
      });
    }
  }

  return jsonResponse({ ok: false, error: 'ამ ტელეფონით ბილეთი ვერ მოიძებნა' });
}


// =================== SEND TICKET LINK VIA SMS ===================
/**
 * Send the ticket link to the user's phone via SMS.
 * Re-verifies the phone matches the ticket (security).
 */
function handleSendTicketLink(regSheet, rawPhone, ticketId) {
  ticketId = String(ticketId || '').trim();
  const inputDigits = String(rawPhone || '').replace(/\D/g, '');

  if (!ticketId || inputDigits.length < 9) {
    return jsonResponse({ ok: false, error: 'ბილეთის ID ან ტელეფონი არ მოგვცეს' });
  }

  const inputLast9 = inputDigits.slice(-9);
  const data = regSheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const rowTicket = String(data[i][6] || '').trim();
    const rowPhoneDigits = String(data[i][4] || '').replace(/\D/g, '');

    if (rowTicket === ticketId && rowPhoneDigits.slice(-9) === inputLast9) {
      const phone = String(data[i][4] || '').trim();
      const firstName = String(data[i][1] || '').trim();

      const link = SITE_BASE_URL + '/ticket.html?t=' + encodeURIComponent(ticketId);
      const text = '🎫 ' + (firstName ? firstName + ', ' : '') +
        'შენი ბილეთი:\n' + link;

      try {
        const props = PropertiesService.getScriptProperties();
        const privateKey = props.getProperty('PRIVATE_KEY');
        const publicKey = props.getProperty('PUBLIC_KEY');
        if (!privateKey || !publicKey) {
          return jsonResponse({ ok: false, error: 'SMS კონფიგურაცია არ არის' });
        }

        const intlPhone = toInternationalPhone(phone);
        if (!intlPhone) {
          return jsonResponse({ ok: false, error: 'არასწორი ტელეფონი' });
        }

        const payload = {
          Text: text,
          Purpose: 'INF',
          Options: {
            Originator: SMS_DEFAULT_SENDER,
            Encoding: 'UNICODE',
            SmsType: 'SMS',
            ReportLabel: 'Farmasi Ticket Link'
          },
          Receivers: [{ Receiver: intlPhone }]
        };

        const url = SMS_API_URL + '?publicKey=' + encodeURIComponent(publicKey);
        const response = UrlFetchApp.fetch(url, {
          method: 'post',
          contentType: 'application/json',
          headers: { 'Authorization': 'Bearer ' + privateKey },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });

        if (response.getResponseCode() === 200) {
          return jsonResponse({ ok: true });
        }
        return jsonResponse({ ok: false, error: 'SMS API შეცდომა' });
      } catch (err) {
        return jsonResponse({ ok: false, error: 'SMS შეცდომა: ' + String(err) });
      }
    }
  }

  return jsonResponse({ ok: false, error: 'ბილეთი და ტელეფონი ვერ ემთხვევა' });
}


// =================================================================
// 📨 ADMIN NOTIFICATIONS — SMS to all admin phones on registration
// =================================================================
/**
 * Send SMS notification to ALL admin phones listed in Config sheet.
 * "admin_phones" key in Config — comma-separated list (e.g. "599123456, 555987654")
 * Each phone receives one SMS per registration.
 */
function notifyAdmins(config, data) {
  try {
    const adminPhonesStr = String(config.admin_phones || '').trim();
    if (!adminPhonesStr) {
      Logger.log('No admin_phones in Config — admin SMS skipped');
      return;
    }

    // Parse comma/semicolon separated phones, trim each
    const adminPhones = adminPhonesStr
      .split(/[,;\n]/)
      .map(p => p.trim())
      .filter(p => p.length >= 9);

    if (adminPhones.length === 0) {
      Logger.log('No valid admin phones found');
      return;
    }

    // Compose admin SMS — short and informative
    const tierEmoji = data.tier === 'Early Bird' ? '🌟'
                    : data.tier === 'VIP' ? '💎'
                    : '✦';
    const text =
      '🆕 ახალი რეგისტრაცია #' + data.registration_number + '\n' +
      tierEmoji + ' ' + data.first_name + ' ' + data.last_name + '\n' +
      '📞 ' + data.phone + '\n' +
      '🪑 ადგილი #' + data.seat + ' · ' + data.tier + '\n' +
      '🎫 ' + data.ticket_id;

    // Send to each admin
    let sentCount = 0;
    adminPhones.forEach(phone => {
      const ok = sendBulkSMS(phone, text, 'Farmasi Admin Alert');
      if (ok) sentCount++;
    });

    Logger.log('Admin SMS sent to ' + sentCount + '/' + adminPhones.length + ' admins');
  } catch (err) {
    Logger.log('notifyAdmins error: ' + err);
  }
}


// =================================================================
// 📲 GENERIC BULK SMS HELPER (used by reminders + admin notif)
// =================================================================
/**
 * Send SMS to a single phone with custom text. Returns true on success.
 */
function sendBulkSMS(phone, text, label) {
  try {
    const props = PropertiesService.getScriptProperties();
    const privateKey = props.getProperty('PRIVATE_KEY');
    const publicKey = props.getProperty('PUBLIC_KEY');

    if (!privateKey || !publicKey) {
      Logger.log('SMS keys missing — skipping');
      return false;
    }

    const intlPhone = toInternationalPhone(phone);
    if (!intlPhone) {
      Logger.log('Invalid phone: ' + phone);
      return false;
    }

    const payload = {
      Text: text,
      Purpose: 'INF',
      Options: {
        Originator: SMS_DEFAULT_SENDER,
        Encoding: 'UNICODE',
        SmsType: 'SMS',
        ReportLabel: label || 'Farmasi'
      },
      Receivers: [{ Receiver: intlPhone }]
    };

    const url = SMS_API_URL + '?publicKey=' + encodeURIComponent(publicKey);

    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + privateKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const code = response.getResponseCode();
    Logger.log('SMS to ' + intlPhone + ' (' + label + '): ' + code);
    return code === 200;
  } catch (err) {
    Logger.log('sendBulkSMS error: ' + err);
    return false;
  }
}


// =================================================================
// 🔔 REMINDER 1: One day before the event
// =================================================================
/**
 * Send reminder SMS to all registered participants ONE DAY before the event.
 *
 * SETUP: Create a time-driven trigger in Apps Script:
 *   1. Apps Script editor → Triggers (clock icon left sidebar)
 *   2. Add Trigger → Choose function: sendReminderDayBefore
 *   3. Event source: Time-driven
 *   4. Type: Day timer
 *   5. Time: 9am-10am (whatever suits)
 *   6. Save
 * The function will check daily if it's the right day and send if so.
 */
function sendReminderDayBefore() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const regSheet = ss.getSheetByName(SHEET_NAME);
    const configSheet = ss.getSheetByName(CONFIG_SHEET);

    if (!regSheet || !configSheet) {
      Logger.log('Sheets not found');
      return;
    }

    const config = readConfig(configSheet);
    const eventDateStr = String(config.event_date || '').trim();
    if (!eventDateStr) {
      Logger.log('event_date not set — reminder skipped');
      return;
    }

    // Read configurable days-before from Config sheet (default: 1 day before)
    const daysBefore = parseInt(config.reminder_days_before || '1', 10) || 1;

    // Parse event date and check if today is exactly N days before
    const eventDate = new Date(eventDateStr + 'T00:00:00');
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysBefore);
    targetDate.setHours(0, 0, 0, 0);

    if (eventDate.toDateString() !== targetDate.toDateString()) {
      Logger.log('Today is not ' + daysBefore + ' day(s) before event (' + eventDateStr + ') — skipping');
      return;
    }

    // Compose reminder text
    const eventCity = config.event_city || '';
    const eventTime = config.event_time || '14:00';
    const transportTime = config.transport_time || '';
    const transportAddress = config.transport_address || '';

    let text = '🔔 შეხსენება!\n' +
      'ხვალ Farmasi-ის მასტერკლასია 🎓\n' +
      '📅 ' + eventDateStr + ' · ' + eventTime + '\n' +
      '📍 ' + eventCity;

    if (transportTime && transportAddress) {
      text += '\n🚌 ავტობუსი: ' + transportTime + '\n📍 ' + transportAddress;
    }

    // Get all registered phones
    const data = regSheet.getDataRange().getValues();
    const phones = [];
    for (let i = 1; i < data.length; i++) {
      const phone = String(data[i][4] || '').trim();
      if (phone) phones.push(phone);
    }

    if (phones.length === 0) {
      Logger.log('No registered phones to remind');
      return;
    }

    // Send to each (with rate limit pause between batches)
    let sent = 0;
    phones.forEach((phone, idx) => {
      const ok = sendBulkSMS(phone, text, 'Farmasi Day Before Reminder');
      if (ok) sent++;
      // Pause every 10 messages to avoid SMS API rate limit
      if ((idx + 1) % 10 === 0) {
        Utilities.sleep(1000);
      }
    });

    Logger.log('Day-before reminder sent to ' + sent + '/' + phones.length + ' participants');
  } catch (err) {
    Logger.log('sendReminderDayBefore error: ' + err);
  }
}


// =================================================================
// 🚌 REMINDER 2: 3 hours before bus departure
// =================================================================
/**
 * Send reminder SMS to all registered participants 3 HOURS before bus departure.
 *
 * SETUP: Create a time-driven trigger in Apps Script:
 *   1. Apps Script editor → Triggers (clock icon)
 *   2. Add Trigger → Choose function: sendReminderBusDeparture
 *   3. Event source: Time-driven
 *   4. Type: Hour timer (every hour)
 *   5. Save
 * The function checks hourly if event day & if 3hrs before transport_time, then sends.
 */
function sendReminderBusDeparture() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const regSheet = ss.getSheetByName(SHEET_NAME);
    const configSheet = ss.getSheetByName(CONFIG_SHEET);

    if (!regSheet || !configSheet) {
      Logger.log('Sheets not found');
      return;
    }

    const config = readConfig(configSheet);
    const eventDateStr = String(config.event_date || '').trim();
    const transportTime = String(config.transport_time || '').trim();

    if (!eventDateStr || !transportTime) {
      Logger.log('event_date or transport_time missing — bus reminder skipped');
      return;
    }

    // Check if today is the event day
    const today = new Date();
    const eventDate = new Date(eventDateStr + 'T00:00:00');
    if (today.toDateString() !== eventDate.toDateString()) {
      Logger.log('Today is not event day — bus reminder skipped');
      return;
    }

    // Parse transport_time as HH:mm
    const timeParts = transportTime.match(/^(\d{1,2}):(\d{2})$/);
    if (!timeParts) {
      Logger.log('Invalid transport_time format: ' + transportTime);
      return;
    }
    const busHour = parseInt(timeParts[1], 10);
    const busMin = parseInt(timeParts[2], 10);
    const busDateTime = new Date(today);
    busDateTime.setHours(busHour, busMin, 0, 0);

    // Read configurable hours-before from Config sheet (default: 3 hours)
    const hoursBefore = parseFloat(config.reminder_hours_before || '3') || 3;

    // Calculate N hours before bus
    const reminderTime = new Date(busDateTime.getTime() - hoursBefore * 60 * 60 * 1000);

    // Check if current hour matches reminder hour (within +/- 30 min window)
    const now = new Date();
    const diffMinutes = Math.abs((now.getTime() - reminderTime.getTime()) / (60 * 1000));

    if (diffMinutes > 30) {
      Logger.log('Not within 30 min of bus reminder time (' + hoursBefore + 'h before). Now: ' + now + ', Reminder time: ' + reminderTime);
      return;
    }

    // Compose reminder text
    const transportAddress = config.transport_address || '';
    let text = '🚌 ავტობუსი 3 საათში!\n' +
      'Farmasi მასტერკლასი 🎓\n' +
      '⏰ გასვლა: ' + transportTime;

    if (transportAddress) {
      text += '\n📍 ' + transportAddress;
    }
    text += '\n\n🎫 თან წაიღე ბილეთი (QR კოდი)';

    // Get all registered phones
    const data = regSheet.getDataRange().getValues();
    const phones = [];
    for (let i = 1; i < data.length; i++) {
      const phone = String(data[i][4] || '').trim();
      if (phone) phones.push(phone);
    }

    if (phones.length === 0) {
      Logger.log('No registered phones to remind');
      return;
    }

    let sent = 0;
    phones.forEach((phone, idx) => {
      const ok = sendBulkSMS(phone, text, 'Farmasi Bus Departure Reminder');
      if (ok) sent++;
      if ((idx + 1) % 10 === 0) Utilities.sleep(1000);
    });

    Logger.log('Bus reminder sent to ' + sent + '/' + phones.length + ' participants');
  } catch (err) {
    Logger.log('sendReminderBusDeparture error: ' + err);
  }
}


// =================================================================
// 🧪 TEST FUNCTIONS — manually trigger to verify
// =================================================================
function testAdminNotification() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = readConfig(ss.getSheetByName(CONFIG_SHEET));

  notifyAdmins(config, {
    first_name: 'ტესტ',
    last_name: 'ტესტიძე',
    phone: '599123456',
    city: 'თბილისი',
    position: 'ინფლუენსერი',
    ticket_id: 'FM-2026-99999',
    tier: 'Early Bird',
    seat: 1,
    registration_number: 1
  });
  Logger.log('Test admin notification sent');
}

function testDayReminder() {
  // Force-run the day reminder regardless of date check
  // Useful for testing — comment out the date check temporarily
  Logger.log('Run sendReminderDayBefore() manually to test (only works on actual day-before date)');
}

