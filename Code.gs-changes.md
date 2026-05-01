# Code.gs - ცვლილებები Google Apps Script-ში

ფრონტი მზადაა, ეხლა ბექს უნდა დაემატოს **ორი ახალი action**:

1. `verifyTicketByPhone` — ტელეფონის შემოწმება და ბილეთის დაბრუნება
2. `sendTicketLink` — SMS-ით ლინკის გაგზავნა

---

## ნაბიჯი 1: გახსენი Apps Script

1. გახსენი შენი Google Sheet
2. **Extensions** → **Apps Script**
3. იპოვე `Code.gs` ფაილი

---

## ნაბიჯი 2: დაამატე action-ები `doGet`-ში

`doGet` ფუნქციაში — `if (action === 'getTicket')` სტრიქონის შემდეგ — **დაამატე ორი ხაზი**:

```javascript
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const regSheet = ss.getSheetByName(SHEET_NAME);
    const configSheet = ss.getSheetByName(CONFIG_SHEET_NAME);

    if (!regSheet || !configSheet) {
      return jsonResponse({ ok: false, error: 'Sheets not found' });
    }

    const action = e && e.parameter && e.parameter.action;
    if (action === 'getTicket') {
      return handleGetTicket(regSheet, configSheet, e.parameter.id);
    }

    // 👇 ეს ორი ხაზი დაამატე:
    if (action === 'verifyTicketByPhone') {
      return handleVerifyByPhone(regSheet, configSheet, e.parameter.phone);
    }
    if (action === 'sendTicketLink') {
      return handleSendTicketLink(regSheet, e.parameter.phone, e.parameter.id);
    }

    // ... დანარჩენი doGet-ის კოდი უცვლელად რჩება
```

---

## ნაბიჯი 3: დაამატე ორი ახალი ფუნქცია

ფაილის **ბოლოში** ჩასვი ეს ორი ფუნქცია:

```javascript
/**
 * 1️⃣ Verify a phone against registered tickets.
 * Returns full ticket info if a matching phone is found.
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


/**
 * 2️⃣ Send the ticket link to the user's phone via SMS.
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

        const code = response.getResponseCode();
        if (code === 200) {
          return jsonResponse({ ok: true });
        } else {
          return jsonResponse({ ok: false, error: 'SMS API შეცდომა (' + code + ')' });
        }
      } catch (err) {
        return jsonResponse({ ok: false, error: 'SMS შეცდომა: ' + String(err) });
      }
    }
  }

  return jsonResponse({ ok: false, error: 'ბილეთი და ტელეფონი ვერ ემთხვევა' });
}
```

---

## ნაბიჯი 4: Save + Deploy

1. **Save** (Ctrl+S)
2. **Deploy** → **Manage deployments**
3. ფანქარი (Edit) → **Version** → **New version** → **Deploy**

URL უცვლელი რჩება.

---

## ტესტი

```
https://script.google.com/macros/s/AKfycbz40UE4b9og1Yjs0rPPfDe1H-yRi90hKbK2WOXej4CAWPCnncDFcetadMEdQSYJO7nf/exec?action=verifyTicketByPhone&phone=599123456
```

(599123456 ჩაანაცვლე შენი რეგისტრირებული ნომრით)

თუ JSON-ი ბილეთის მონაცემებით გაიხსნა — verify მუშაობს.
SMS ღილაკი ცოცხალ საიტზე ტესტდება.
