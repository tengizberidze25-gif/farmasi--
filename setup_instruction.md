# 🚀 მეორე საიტის Backend-ის მომზადება

ეს ინსტრუქცია გასწავლის როგორ შექმნა **ახალი Google Sheet** და **Google Apps Script** მეორე საიტისთვის (კონფერენცია/სემინარი).

---

## 📋 ნაბიჯი 1: შექმენი ახალი Google Sheet

1. გადადი → https://sheets.google.com
2. დააჭირე **"Blank spreadsheet"** (ცარიელი ცხრილი)
3. დაარქვი სახელი: `Farmasi Conference 2026` (ან როგორც გინდა)
4. **პირველ ფურცელს (Sheet1)** დაარქვი → `Registrations`
5. პირველ რიგში (A1, B1, C1...) ჩაწერე სვეტების სახელები:

   | A | B | C | D | E | F | G |
   |---|---|---|---|---|---|---|
   | timestamp | first_name | last_name | city | phone | badge_name | extra |

   *(badge_name და სხვა დამატებითი ველები დამოკიდებული იქნება იმაზე, რასაც აირჩევ)*

6. შექმენი **მეორე ფურცელი** → დააჭირე ქვემოთ "+" და დაარქვი → `Config`
7. Config ფურცელში ჩაწერე:

   | A (key) | B (value) |
   |---------|-----------|
   | max_registrations | 60 |
   | registration_status | open |
   | event_city | თბილისი |
   | event_date | 2026-06-15 |
   | event_time | 14:00 |
   | event_location | სასტუმრო "ბილტმორი" |
   | hotel_location | https://maps.app.goo.gl/... |
   | farewell | მოგესალმებით კონფერენციაზე |
   | admin_phones | 599123456 |
   | admin_chat_ids | (ცარიელი, თუ არ იყენებ Telegram-ს) |
   | schedule | 14:00 - გახსნა\n15:00 - სიტყვით გამოსვლა\n16:00 - კოფი ბრეიკი |

---

## 📋 ნაბიჯი 2: შექმენი Apps Script

1. იმავე Google Sheet-ში → ზემოდან **Extensions → Apps Script**
2. გაიხსნება ცარიელი editor → წაშალე ყველაფერი
3. ჩასვი ქვემოთ მოცემული კოდი (`Code.gs` ფაილი, რომელსაც ცალკე გადავცემ)
4. ზემოდან მარჯვნივ დააჭირე **💾 Save** (ან Ctrl+S)
5. პროექტს დაარქვი სახელი: `Farmasi Conference Backend`

---

## 📋 ნაბიჯი 3: გამოაქვეყნე როგორც Web App

1. ზემოდან მარჯვნივ → **Deploy → New deployment**
2. გადახვალთ ფანჯარაში:
   - **Select type** → დააჭირე ⚙️ (gear) → აირჩიე **Web app**
3. ფანჯარაში ჩაწერე:
   - **Description**: `Farmasi Conference v1`
   - **Execute as**: `Me (your email)`
   - **Who has access**: `Anyone` ⚠️ ეს ძალიან მნიშვნელოვანია!
4. დააჭირე **Deploy**
5. პირველად მოგთხოვს ნებართვას → **Authorize access** → შეიყვანე შენი Google ანგარიში → **Allow**
6. გამოჩნდება URL — **დააკოპირე**! ეს არის შენი ახალი `API_URL`
   - მაგ: `https://script.google.com/macros/s/AKfycby.../exec`

---

## 📋 ნაბიჯი 4: ჩასვი URL HTML-ში

ახალ `index.html`-ში მოძებნე ეს ხაზი:

```javascript
const API_URL = "https://script.google.com/macros/s/...";
```

და ჩაანაცვლე **შენი ახალი URL-ით** რომელიც ახლახან მიიღე.

---

## 📋 ნაბიჯი 5: ატვირთე GitHub-ზე

1. გადადი → https://github.com/new
2. შექმენი ახალი რეპოზიტორია: `farmasi-conference-2026`
3. ატვირთე ფაილები:
   - `index.html` (ახალი)
   - `farmasi.png`
   - `music.mp3`
   - `boom.mp3`
   - `gel100.png`, `gel200.png`, `usd100.png`
4. **Settings → Pages → Source: main branch** → Save
5. რამდენიმე წუთში მიიღებ ლინკს: `https://USERNAME.github.io/farmasi-conference-2026/`

---

## ⚠️ მნიშვნელოვანი:

- თუ Google Apps Script-ის კოდს შეცვლი, აუცილებლად **ხელახლა Deploy → Manage deployments → ✏️ → New version → Deploy**
- წინააღმდეგ შემთხვევაში ცვლილებები არ ამოქმედდება

---

## 🤖 Telegram Bot (არჩევითი)

თუ გინდა, რომ რეგისტრაციაზე შეტყობინება მოგივიდეს Telegram-ში:

1. Telegram-ში მოძებნე `@BotFather`
2. `/newbot` → მიყევი ინსტრუქციას
3. მიიღებ **Bot Token** (მაგ: `7891234567:ABCdef...`)
4. შენს ბოტს დაუწერე "Hi"
5. გადადი ბრაუზერში: `https://api.telegram.org/botYOUR_TOKEN/getUpdates`
6. იპოვი `"chat":{"id": 123456789}` → ეს არის შენი **chat_id**
7. Apps Script-ში ჩაწერე ეს Token და chat_id (კოდში მონიშნულია სად)
8. Config ფურცელში → `admin_chat_ids` → ჩაწერე chat_id

---

✅ **მზადაა!** ახლა Backend მუშაობს და HTML მასთან კომუნიკაციას შეძლებს.
