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

  // 📲 SMS notification with ticket info
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
  if (!phone) return jsonResponse({ ok: false, error: 'Phone required' });

  const data = regSheet.getDataRange().getValues();

  for (let i = data.length - 1; i >= 1; i--) {
    if (normalizePhone(data[i][4]) === phone) {
      regSheet.deleteRow(i + 1);
      return jsonResponse({ ok: true });
    }
  }

  return jsonResponse({ ok: false, error: 'Not found' });
}

// =================== HELPERS ===================
function readConfig(sheet) {
  const config = {};
  const data = sheet.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    const key = String(data[i][0] || '').trim();
    if (key) {
      let val = data[i][1];
      if (val instanceof Date) {
        if (key === 'event_date') {
          val = Utilities.formatDate(val, 'Asia/Tbilisi', 'yyyy-MM-dd');
        } else if (key === 'event_time') {
          val = Utilities.formatDate(val, 'Asia/Tbilisi', 'HH:mm');
        }
      }
      config[key] = String(val || '');
    }
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

  text += '\n🔗 ' + SITE_BASE_URL;

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

