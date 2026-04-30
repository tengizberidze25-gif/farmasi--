FARMASI Auth + Admin — სტრუქტურა და სახელმძღვანელო
═══════════════════════════════════════════════════════

🎯 რა არის ეს?
─────────────
FARMASI-ს შიდა პორტალი:
  • OTP ავთენტიფიკაცია SMS-ით
  • ადმინის dashboard (შეკვეთების მონიტორი, წარმომადგენლები)
  • Fina-სთან ინტეგრაცია (ჯერ mock, შემდეგ ლაივი)


📁 ფაილების სტრუქტურა
─────────────────────
farmasi_v2/                      ← ახალი სუფთა ფოლდერი
├── index.html                   ← შესასვლელი გვერდი (PID + OTP)
├── admin.php                    ← ადმინის dashboard (PID 404445249)
├── rep.php                      ← წარმომადგენლის გვერდი (placeholder)
├── api.php                      ← Backend (OTP + admin endpoints)
├── fina_client.php              ← Fina API wrapper (mock რეჟიმი)
├── users_mobile.json            ← ⚠️ ძველი პროექტიდან გადმოიტანე
└── README.txt                   ← ეს ფაილი

ავტომატურად შეიქმნება სერვერზე გაშვებისას:
├── sms.log                      ← bulksms.ge-ის ლოგი (debugging-ისთვის)
├── mock_orders.json             ← სატესტო შეკვეთები (32 ცალი)
└── fina_token.cache             ← Fina-ს token cache (ლაივ რეჟიმში)


🚀 ლოკალური ტესტირება (XAMPP)
─────────────────────────────
1. გადაწერე ეს ფაილები: C:\xampp\htdocs\farmasi_v2\
2. დააკოპირე ძველი users_mobile.json იმავე ფოლდერში
3. გაუშვი XAMPP → Apache (Start)
4. ბრაუზერში გახსენი: http://localhost/farmasi_v2/

   ⚠️ თუ პორტ 80 არ არის თავისუფალი:
   • XAMPP → Apache → Config → httpd.conf → Listen 80 (ან სხვა პორტი)
   • ან გაუშვი http://localhost:8080/farmasi_v2/

5. შეიყვანე PID: 404445249
6. SMS კოდით → უნდა გადასცეს admin.php-ზე


🌐 Production-ზე გაშვება (cPanel ან მსგავსი ჰოსტინგი)
────────────────────────────────────────────────────
1. FTP-ით ატვირთე ყველა ფაილი თხელ ფოლდერში (მაგ. public_html/farmasi_v2/)
2. დარწმუნდი ფოლდერი წერადია (chmod 755 ან 775):
   chmod 755 farmasi_v2/
3. პირველი გაშვებისას ავტომატურად შეიქმნება mock_orders.json
4. ⚠️ Vercel არ უშვებს PHP-ს — სხვა ჰოსტინგი დაგჭირდება (cPanel, DigitalOcean)


🔌 Fina API-ს ჩართვა (mock → live)
───────────────────────────────────
როცა Fina-ს credentials მოგვცემენ, გახსენი fina_client.php და შეცვალე:

   const USE_MOCK      = false;                    // ← false
   const FINA_BASE_URL = 'http://X.X.X.X:PORT';    // ← Fina-ს URL
   const FINA_LOGIN    = 'შენი_ლოგინი';
   const FINA_PASSWORD = 'შენი_პაროლი';

დანარჩენი არცერთი ფაილი არ იცვლება. Token automatic-ად refresh-დება.


📱 SMS-ის გაგზავნა
──────────────────
PID 404445249-ზე SMS იგზავნება სამივე ნომერზე ერთდროულად:
  • 599772266
  • 591974413
  • 599742266

bulksms.ge API იღებს ერთ მოთხოვნას მრავალი მიმღებით (Receivers მასივი).
დანარჩენი PID-ები იღებენ users_mobile.json-დან.


🔐 Sessions
───────────
• OTP კოდი: 5 წუთი მოქმედი
• დადასტურების შემდეგ: $_SESSION['auth_pid'] + $_SESSION['auth_name']
• Admin PID = 404445249 (კონსტანტა api.php-ში)
• Logout: api.php?action=logout


🐛 Debugging
────────────
• sms.log — ყველა SMS ცდის ისტორია (RESP ველში ბოლო JSON-ი)
• Browser DevTools → Network ჩანართი → ნახე api.php-ის request/response
• PHP შეცდომები → XAMPP\apache\logs\error.log


❓ ხშირი პრობლემები
───────────────────
1. „SMS მხოლოდ ერთ ნომერზე მოდის"
   → შეამოწმე api.php-ში არის თუ არა sendSmsBulk() ფუნქცია
   → sms.log-ში RESP უნდა იყოს {"Receivers Accepted":[...3 ნომერი...]}

2. „admin.php — Access Denied / 403"
   → სესია ამოიწურა, ან PID არ არის 404445249
   → სცადე ხელახლა შესვლა

3. „mock_orders.json არ შეიქმნა"
   → ფოლდერი არ არის წერადი
   → chmod 775 ან Windows-ზე: Properties → Security → Write

4. „Vercel-ზე PHP არ მუშაობს"
   → Vercel მხოლოდ Node.js/Static-ს უშვებს
   → გადაიტანე სხვა ჰოსტინგზე (cPanel, DigitalOcean, Hetzner)


📞 სატესტო კრედენციალები
─────────────────────────
Admin:
  PID:     404445249
  Mobile:  599772266, 591974413, 599742266 (სამივე იღებს კოდს)
  Name:    FARMASI (test)
