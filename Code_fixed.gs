/**
 * ════════════════════════════════════════════════════════════
 *   FARMASI MLM Tree — SMS Authentication + Photo API
 *   Google Apps Script (api.php-ის ჩამნაცვლებელი)
 *
 *   Actions:
 *     send_otp, verify_otp, logout, send_to_member
 *     upload_photo, get_photos, delete_photo
 *
 *   Setup (Script Properties):
 *     PUBLIC_KEY        = bulksms.ge Public Key
 *     PRIVATE_KEY       = bulksms.ge Private Key (JWT Bearer token)
 *     USERS_JSON_URL    = https://drive.google.com/uc?export=download&id=...
 *     PHOTOS_FOLDER_ID  = 1-bL-lQeptvPjVWBn8UmMD3YhljY-F3VT
 *
 *   Deploy: Deploy → New deployment → Web app
 *     Execute as:       Me
 *     Who has access:   Anyone
 * ════════════════════════════════════════════════════════════
 */

// ============ CONFIG ============
const SMS_SENDER      = 'FARMASI';
const OTP_EXPIRE      = 300;     // 5 წუთი
const SESSION_EXPIRE  = 21600;   // 6 საათი (CacheService-ის max)
const TEST_PID        = '404445249';
const TEST_MOBILES    = ['599772266', '591974413', '599742266'];
const COMPANY_ROOT_ID = '404445249';   // FARMASI ფესვი — admin can do anything
const MAX_PHOTO_SIZE  = 600 * 1024;    // 600 KB max


// ════════════════════════════════════════════════════════════
//   ENTRY POINTS
// ════════════════════════════════════════════════════════════

function doPost(e) {
  // POST — body needs text/plain (URL-encoded form params)
  // Google Apps Script e.parameter is empty for text/plain
  if (e && e.postData && e.postData.contents) {
    try {
      const bodyParams = parseUrlEncoded_(e.postData.contents);
      // e.parameter empty attempt
      e.parameter = Object.assign({}, e.parameter || {}, bodyParams);
    } catch (err) {
      // fallthrough continue
    }
  }
  return handleRequest(e);
}

// URL-encoded body parser — Apps Script limitation workaround
function parseUrlEncoded_(s) {
  const result = {};
  if (!s) return result;
  const pairs = s.split('&');
  for (let i = 0; i < pairs.length; i++) {
    const eq = pairs[i].indexOf('=');
    if (eq < 0) continue;
    const key = decodeURIComponent(pairs[i].substring(0, eq).replace(/\+/g, ' '));
    const val = decodeURIComponent(pairs[i].substring(eq + 1).replace(/\+/g, ' '));
    result[key] = val;
  }
  return result;
}

function doGet(e) {
  if (e && e.parameter && e.parameter.action) {
    return handleRequest(e);
  }
  return jsonResponse({ status: 'ok', message: 'FARMASI API ready' });
}

function handleRequest(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    const action = params.action || '';

    let result;
    switch (action) {
      case 'send_otp':       result = sendOtp(params);       break;
      case 'verify_otp':     result = verifyOtp(params);     break;
      case 'logout':         result = doLogout(params);      break;
      case 'send_to_member': result = sendToMember(params);  break;
      case 'send_bulk_invite': result = sendBulkInvite(params); break;
      case 'get_mobile':     result = getMobile(params);     break;
      case 'save_social':    result = saveSocial(params);    break;
      case 'get_social':     result = getSocial(params);     break;
      case 'delete_social':  result = deleteSocial(params);  break;
      case 'upload_photo':   result = uploadPhoto(params);   break;
      case 'get_photos':     result = getPhotos(params);     break;
      case 'delete_photo':   result = deletePhoto(params);   break;
      default:               result = { status: 'error', message: 'უცნობი მოქმედება' };
    }
    return jsonResponse(result);

  } catch (err) {
    log_('handleRequest ERROR: ' + err);
    return jsonResponse({ status: 'error', message: String(err) });
  }
}


// ════════════════════════════════════════════════════════════
//   ACTION: send_otp
// ════════════════════════════════════════════════════════════

function sendOtp(params) {
  const pid = (params.pid || '').trim();
  if (!pid) return { status: 'error', message: 'შეიყვანეთ პირადი ნომერი' };

  let mobile, name;

  if (pid === TEST_PID) {
    name = 'FARMASI (test)';
    
    // ყველა ნომერზე გავაგზავნოთ კოდი
    const sessionId = Utilities.getUuid();
    const otp       = String(Math.floor(100000 + Math.random() * 900000));
    
    const cache = CacheService.getScriptCache();
    cache.put('otp_' + sessionId, JSON.stringify({
      otp:  otp,
      pid:  pid,
      name: name,
      time: Date.now()
    }), OTP_EXPIRE);
    
    const text = 'FARMASI: kodi aris ' + otp + '. Vada 5 tsuti.';
    const results = [];
    
    for (let i = 0; i < TEST_MOBILES.length; i++) {
      const m = TEST_MOBILES[i];
      const phone = '995' + String(m).replace(/^\+?995/, '');
      const r = sendSms_(phone, text);
      results.push({mobile: m, ok: r.ok, code: r.code});
    }
    
    log_('send_otp ADMIN pid:' + pid + ' to ' + TEST_MOBILES.length + ' numbers, results:' + JSON.stringify(results));
    
    const successCount = results.filter(r => r.ok).length;
    if (successCount === 0) {
      return { status: 'error', message: 'SMS ვერ გაიგზავნა არც ერთ ნომერზე' };
    }
    
    const primary = TEST_MOBILES[0];
    const masked = String(primary).substring(0, 3) + '***' + String(primary).slice(-3);
    return {
      status:       'ok',
      masked_phone: masked,
      name:         name,
      session_id:   sessionId,
      sent_to:      successCount + '/' + TEST_MOBILES.length + ' ნომერზე'
    };
    
  } else {
    const user = getUser_(pid);
    if (!user || !user.mobile) {
      return { status: 'error', message: 'პირადი ნომერი სისტემაში ვერ მოიძებნა' };
    }
    mobile = user.mobile;
    name   = user.name || '';
  }

  const sessionId = Utilities.getUuid();
  const otp       = String(Math.floor(100000 + Math.random() * 900000));

  const cache = CacheService.getScriptCache();
  cache.put('otp_' + sessionId, JSON.stringify({
    otp:  otp,
    pid:  pid,
    name: name,
    time: Date.now()
  }), OTP_EXPIRE);

  const text   = 'FARMASI: kodi aris ' + otp + '. Vada 5 tsuti.';
  const phone  = '995' + String(mobile).replace(/^\+?995/, '');
  const result = sendSms_(phone, text);

  log_('send_otp pid:' + pid + ' mobile:' + mobile + ' result:' + JSON.stringify(result));

  if (!result.ok) {
    return { status: 'error', message: 'SMS ვერ გაიგზავნა: ' + result.body };
  }

  const masked = String(mobile).substring(0, 3) + '***' + String(mobile).slice(-3);
  return {
    status:       'ok',
    masked_phone: masked,
    name:         name,
    session_id:   sessionId
  };
}


// ════════════════════════════════════════════════════════════
//   ACTION: verify_otp
// ════════════════════════════════════════════════════════════

function verifyOtp(params) {
  const otp       = (params.otp || '').trim();
  const sessionId = (params.session_id || '').trim();

  if (!otp)       return { status: 'error', message: 'შეიყვანეთ კოდი' };
  if (!sessionId) return { status: 'error', message: 'სესია ვერ მოიძებნა' };

  const cache = CacheService.getScriptCache();
  const data  = cache.get('otp_' + sessionId);

  if (!data) return { status: 'error', message: 'კოდის ვადა ამოიწურა.' };

  const obj = JSON.parse(data);
  if (otp !== obj.otp) return { status: 'error', message: 'არასწორი კოდი.' };

  cache.remove('otp_' + sessionId);
  cache.put('auth_' + sessionId, JSON.stringify({
    pid:  obj.pid,
    name: obj.name
  }), SESSION_EXPIRE);

  return {
    status:     'ok',
    pid:        obj.pid,
    name:       obj.name,
    session_id: sessionId
  };
}


// ════════════════════════════════════════════════════════════
//   ACTION: logout
// ════════════════════════════════════════════════════════════

function doLogout(params) {
  const sessionId = (params.session_id || '').trim();
  if (sessionId) {
    CacheService.getScriptCache().remove('auth_' + sessionId);
  }
  return { status: 'ok' };
}


// ════════════════════════════════════════════════════════════
//   ACTION: send_to_member  (auth required)
// ════════════════════════════════════════════════════════════

function sendToMember(params) {
  const sessionId = (params.session_id || '').trim();
  const targetPid = (params.target_pid || '').trim();
  const message   = (params.message    || '').trim();

  const authStr = CacheService.getScriptCache().get('auth_' + sessionId);
  if (!authStr) return { status: 'error', message: 'სესია ამოიწურა, გთხოვთ ხელახლა შეხვიდეთ' };
  
  const auth = JSON.parse(authStr);
  
  // მხოლოდ admin-ს შეუძლია bulksms.ge-ით გაგზავნა
  if (auth.pid !== COMPANY_ROOT_ID) {
    return { status: 'error', message: 'SMS გაგზავნა მხოლოდ მობილური ტელეფონიდან შესაძლებელია' };
  }

  if (!targetPid) return { status: 'error', message: 'მიმღების PID ცარიელია' };
  if (!message)   return { status: 'error', message: 'შეტყობინება ცარიელია' };
  if (message.length > 480) {
    return { status: 'error', message: 'შეტყობინება ძალიან გრძელია (max 480 სიმბოლო)' };
  }

  const user = getUser_(targetPid);
  if (!user || !user.mobile) {
    return { status: 'error', message: 'მიმღები ვერ მოიძებნა' };
  }

  const phone  = '995' + String(user.mobile).replace(/^\+?995/, '');
  const result = sendSms_(phone, message);

  log_('send_to_member from:' + JSON.parse(auth).pid +
       ' to:' + targetPid + ' result:' + JSON.stringify(result));

  if (!result.ok) {
    return { status: 'error', message: 'SMS ვერ გაიგზავნა: ' + result.body };
  }

  const masked = String(user.mobile).substring(0, 3) + '***' + String(user.mobile).slice(-3);
  return { status: 'ok', to_phone: masked };
}


// ════════════════════════════════════════════════════════════
//   ACTION: send_bulk_invite  (auth required)
//   ერთ batch-ში ბევრი მიმღები — ჯგუფური მოწვევისთვის
//   admin → ულიმიტო, რეგ. წარმომადგენელი → 30/დღეში, max 15 ერთ batch-ში
// ════════════════════════════════════════════════════════════

const BULK_LIMIT_REP_DAILY  = 30;   // არა-admin-ისთვის დღიური ლიმიტი
const BULK_LIMIT_REP_BATCH  = 15;   // არა-admin-ისთვის batch მაქსიმუმი
const BULK_LIMIT_ADMIN_BATCH = 50;  // admin-ისთვის batch მაქსიმუმი

function sendBulkInvite(params) {
  const sessionId  = (params.session_id  || '').trim();
  const targetsRaw = (params.target_pids || '').trim();
  const message    = (params.message     || '').trim();

  // ────── Auth ──────
  const authStr = CacheService.getScriptCache().get('auth_' + sessionId);
  if (!authStr) return { status: 'error', message: 'სესია ამოიწურა' };
  const auth = JSON.parse(authStr);
  const isAdmin = auth.pid === COMPANY_ROOT_ID;

  // ────── Validation ──────
  if (!targetsRaw) return { status: 'error', message: 'მიმღებები ცარიელია' };
  if (!message)    return { status: 'error', message: 'შეტყობინება ცარიელია' };
  if (message.length > 480) {
    return { status: 'error', message: 'შეტყობინება ძალიან გრძელია (max 480 სიმბოლო)' };
  }

  // PIDs მასივად
  const targetPids = targetsRaw.split(',')
    .map(function(s){ return s.trim(); })
    .filter(function(s){ return s.length > 0; });

  if (targetPids.length === 0) {
    return { status: 'error', message: 'მიმღები არ არის მითითებული' };
  }

  // batch ლიმიტი
  const batchLimit = isAdmin ? BULK_LIMIT_ADMIN_BATCH : BULK_LIMIT_REP_BATCH;
  if (targetPids.length > batchLimit) {
    return {
      status:  'error',
      message: 'ერთ ჯერზე მაქსიმუმ ' + batchLimit + ' წევრი (ცდილობთ ' + targetPids.length + ')'
    };
  }

  // დღიური ლიმიტი (არა-admin-ისთვის)
  if (!isAdmin) {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const cacheKey = 'sms_quota_' + auth.pid + '_' + today;
    const usedStr = CacheService.getScriptCache().get(cacheKey);
    const used = usedStr ? parseInt(usedStr, 10) : 0;
    if (used + targetPids.length > BULK_LIMIT_REP_DAILY) {
      const remaining = Math.max(0, BULK_LIMIT_REP_DAILY - used);
      return {
        status:  'error',
        message: 'დღიური SMS ლიმიტი ' + BULK_LIMIT_REP_DAILY + '. დარჩენილია: ' + remaining
      };
    }
  }

  // ────── ნომრების შეგროვება + downline-ის შემოწმება ──────
  const receivers = [];
  const okPids = [];
  const skipped = [];

  for (var i = 0; i < targetPids.length; i++) {
    const pid = targetPids[i];
    // permission check (admin გამორიცხული)
    if (!isAdmin && !isInDownline_(auth.pid, pid)) {
      skipped.push({ pid: pid, reason: 'არ არის თქვენს გუნდში' });
      continue;
    }
    const user = getUser_(pid);
    if (!user || !user.mobile) {
      skipped.push({ pid: pid, reason: 'ნომერი არ არის' });
      continue;
    }
    const phone = '995' + String(user.mobile).replace(/^\+?995/, '');
    receivers.push({ Receiver: phone });
    okPids.push(pid);
  }

  if (receivers.length === 0) {
    return {
      status:  'error',
      message: 'ვერ მოიძებნა ვერც ერთი ვალიდური ნომერი',
      skipped: skipped
    };
  }

  // ────── SMS გაგზავნა (ერთი HTTP request, ბევრი მიმღები) ──────
  const props      = PropertiesService.getScriptProperties();
  const publicKey  = props.getProperty('PUBLIC_KEY');
  const privateKey = props.getProperty('PRIVATE_KEY');
  if (!publicKey || !privateKey) {
    return { status: 'error', message: 'API keys not configured' };
  }

  const url = 'https://api.bulksms.ge/gateway/api/sms/v1/message/send'
            + '?publicKey=' + encodeURIComponent(publicKey);

  const payload = {
    Text:    message,
    Purpose: 'INF',
    Options: {
      Originator: SMS_SENDER,
      Encoding:   'UNICODE'
    },
    Receivers: receivers
  };

  const options = {
    method:             'post',
    contentType:        'application/json',
    headers:            { 'Authorization': 'Bearer ' + privateKey },
    payload:            JSON.stringify(payload),
    muteHttpExceptions: true
  };

  let respCode = 0, respBody = '';
  try {
    const resp = UrlFetchApp.fetch(url, options);
    respCode = resp.getResponseCode();
    respBody = resp.getContentText();
  } catch (err) {
    log_('bulk_invite ERROR: ' + err);
    return { status: 'error', message: 'SMS ვერ გაიგზავნა: ' + err };
  }

  let parsed = null;
  try { parsed = JSON.parse(respBody); } catch (e) {}
  const hasError = parsed && ['400','401','403','500'].indexOf(String(parsed.Status || '')) !== -1;
  const ok = respCode === 200 && !hasError;

  // ────── Quota update + logging ──────
  if (!isAdmin && ok) {
    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = 'sms_quota_' + auth.pid + '_' + today;
    const usedStr = CacheService.getScriptCache().get(cacheKey);
    const used = usedStr ? parseInt(usedStr, 10) : 0;
    // 24 საათით cache-ვრცელდება
    CacheService.getScriptCache().put(cacheKey, String(used + receivers.length), 86400);
  }

  log_('bulk_invite from:' + auth.pid + ' count:' + receivers.length +
       ' ok:' + ok + ' skipped:' + skipped.length +
       ' resp:' + respBody.substring(0, 200));

  if (!ok) {
    return { status: 'error', message: 'SMS გაგზავნა ვერ მოხერხდა', resp: respBody };
  }

  return {
    status:  'ok',
    sent:    receivers.length,
    skipped: skipped,
    pids:    okPids
  };
}


// ════════════════════════════════════════════════════════════
//   ACTION: get_mobile  (auth required)
//   Frontend-ისთვის SMS composition — ვისი ნომერი გჭირდება
// ════════════════════════════════════════════════════════════

function getMobile(params) {
  const sessionId = (params.session_id || '').trim();
  const targetPid = (params.target_pid || '').trim();

  const authStr = CacheService.getScriptCache().get('auth_' + sessionId);
  if (!authStr) return { status: 'error', message: 'სესია ამოიწურა' };
  const auth = JSON.parse(authStr);

  if (!targetPid) return { status: 'error', message: 'PID ცარიელია' };

  // Permission check - user can only get mobile numbers for their downline
  if (!isInDownline_(auth.pid, targetPid)) {
    return { status: 'error', message: 'ნომრის ნახვა მხოლოდ თქვენი გუნდის წევრებისთვის' };
  }

  const user = getUser_(targetPid);
  if (!user || !user.mobile) {
    return { status: 'error', message: 'მობილური ნომერი ვერ მოიძებნა' };
  }

  return { 
    status: 'ok', 
    mobile: user.mobile,
    name: user.name || ''
  };
}


// ════════════════════════════════════════════════════════════
//   ACTION: save_social  (auth required)
//   User-ის Facebook + TikTok profiles შენახვა
// ════════════════════════════════════════════════════════════

function saveSocial(params) {
  const sessionId = (params.session_id || '').trim();
  const targetPid = (params.target_pid || '').trim();
  const facebook  = (params.facebook || '').trim();
  const tiktok    = (params.tiktok || '').trim();

  const authStr = CacheService.getScriptCache().get('auth_' + sessionId);
  if (!authStr) return { status: 'error', message: 'სესია ამოიწურა' };
  const auth = JSON.parse(authStr);

  if (!targetPid) return { status: 'error', message: 'PID ცარიელია' };

  // Permission check - user can only edit themselves and their downline
  if (!isInDownline_(auth.pid, targetPid)) {
    return { status: 'error', message: 'სოციალური მედიის რედაქტირება მხოლოდ თქვენი გუნდისთვის' };
  }

  // Validate URLs/usernames
  if (facebook && !isValidFacebookUrl_(facebook)) {
    return { status: 'error', message: 'Facebook ლინკი არასწორია' };
  }

  if (tiktok && !isValidTikTokUsername_(tiktok)) {
    return { status: 'error', message: 'TikTok username არასწორია' };
  }

  try {
    // Get current social data
    const socialData = getSocialData_();
    
    // Update user's social media
    socialData[targetPid] = {
      facebook: facebook || '',
      tiktok: tiktok || '',
      updated: new Date().toISOString()
    };

    // Save back to storage
    saveSocialData_(socialData);
    
    // Invalidate cache
    CacheService.getScriptCache().remove('social_data_cache');

    log_('save_social user:' + auth.pid + ' target:' + targetPid + ' fb:' + (facebook ? 'yes' : 'no') + ' tt:' + (tiktok ? 'yes' : 'no'));

    return { status: 'ok', target_pid: targetPid };

  } catch (error) {
    log_('save_social ERROR: ' + error);
    return { status: 'error', message: 'შენახვა ვერ მოხერხდა: ' + error };
  }
}


// ════════════════════════════════════════════════════════════
//   ACTION: get_social  (no auth - public read)
//   ყველას Social Media ინფოს მიღება
// ════════════════════════════════════════════════════════════

function getSocial(params) {
  try {
    const socialData = getSocialData_();
    return { status: 'ok', social_data: socialData };
  } catch (error) {
    log_('get_social ERROR: ' + error);
    return { status: 'error', message: 'მონაცემების ჩატვირთვა ვერ მოხერხდა' };
  }
}


// ════════════════════════════════════════════════════════════
//   ACTION: delete_social  (auth required)
//   User-ის Social Media პროფილის წაშლა
// ════════════════════════════════════════════════════════════

function deleteSocial(params) {
  const sessionId = (params.session_id || '').trim();
  const targetPid = (params.target_pid || '').trim();

  const authStr = CacheService.getScriptCache().get('auth_' + sessionId);
  if (!authStr) return { status: 'error', message: 'სესია ამოიწურა' };
  const auth = JSON.parse(authStr);

  if (!targetPid) return { status: 'error', message: 'PID ცარიელია' };

  // Permission check
  if (!isInDownline_(auth.pid, targetPid)) {
    return { status: 'error', message: 'სოციალური მედიის წაშლა მხოლოდ თქვენი გუნდისთვის' };
  }

  try {
    const socialData = getSocialData_();
    delete socialData[targetPid];
    saveSocialData_(socialData);
    
    // Invalidate cache
    CacheService.getScriptCache().remove('social_data_cache');

    log_('delete_social user:' + auth.pid + ' target:' + targetPid);

    return { status: 'ok', target_pid: targetPid };

  } catch (error) {
    log_('delete_social ERROR: ' + error);
    return { status: 'error', message: 'წაშლა ვერ მოხერხდა: ' + error };
  }
}


// ════════════════════════════════════════════════════════════
//   ACTION: upload_photo  (auth required)
//
//   Params:
//     session_id  — auth session
//     target_pid  — ვისი ფოტოს ვტვირთავთ
//     photo       — base64 string (data URL "data:image/jpeg;base64,...")
//
//   უსაფრთხოება:
//     - admin (FARMASI) → ყველას ფოტოს დატვირთვა
//     - სხვა user → მხოლოდ თავის PID + მისი ხის წევრები
//                   (frontend-ი ამოწმებს — backend-ში simplified check)
// ════════════════════════════════════════════════════════════

function uploadPhoto(params) {
  const sessionId = (params.session_id || '').trim();
  const targetPid = (params.target_pid || '').trim();
  const photoData = params.photo || '';

  // Auth შემოწმება
  const authStr = CacheService.getScriptCache().get('auth_' + sessionId);
  if (!authStr) return { status: 'error', message: 'სესია ამოიწურა' };
  const auth = JSON.parse(authStr);

  if (!targetPid)  return { status: 'error', message: 'PID ცარიელია' };
  if (!photoData)  return { status: 'error', message: 'ფოტო ცარიელია' };

  // Permission check - user can only upload photos for themselves and their downline
  if (!isInDownline_(auth.pid, targetPid)) {
    return { status: 'error', message: 'ფოტოს ატვირთვა მხოლოდ თქვენი გუნდის წევრებისთვის' };
  }

  // Base64 შემოწმება
  // Format: "data:image/jpeg;base64,/9j/4AAQ..."
  const match = photoData.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/);
  if (!match) return { status: 'error', message: 'ფოტოს ფორმატი არასწორია' };

  const mimeSubtype = match[1] === 'jpg' ? 'jpeg' : match[1];
  const base64      = match[2];

  // Size check
  const sizeBytes = Math.floor(base64.length * 3 / 4);
  if (sizeBytes > MAX_PHOTO_SIZE) {
    return { status: 'error', message: 'ფოტო ძალიან დიდია (max ' + (MAX_PHOTO_SIZE/1024) + ' KB)' };
  }

  // Save to Drive folder
  try {
    const folderId = PropertiesService.getScriptProperties().getProperty('PHOTOS_FOLDER_ID');
    if (!folderId) throw new Error('PHOTOS_FOLDER_ID not set');
    const folder = DriveApp.getFolderById(folderId);

    const filename = targetPid + '.' + (mimeSubtype === 'jpeg' ? 'jpg' : mimeSubtype);
    const blob = Utilities.newBlob(
      Utilities.base64Decode(base64),
      'image/' + mimeSubtype,
      filename
    );

    // Delete existing file (overwrite)
    const existing = folder.getFilesByName(filename);
    while (existing.hasNext()) {
      existing.next().setTrashed(true);
    }

    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const fileId = file.getId();
    const photoUrl = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w400';

    log_('upload_photo from:' + auth.pid + ' to:' + targetPid + ' size:' + sizeBytes);

    return {
      status:    'ok',
      target_pid: targetPid,
      url:       photoUrl,
      file_id:   fileId
    };
  } catch (err) {
    log_('upload_photo ERROR: ' + err);
    return { status: 'error', message: 'Upload failed: ' + err };
  }
}


// ════════════════════════════════════════════════════════════
//   ACTION: get_photos  (no auth — public read)
//
//   Returns: { pid: url, ... }
//   Read from Drive folder
// ════════════════════════════════════════════════════════════

function getPhotos(params) {
  const cache    = CacheService.getScriptCache();
  const cacheKey = 'photos_index';

  const cached = cache.get(cacheKey);
  if (cached) {
    try { return { status: 'ok', photos: JSON.parse(cached) }; } catch (e) {}
  }

  const folderId = PropertiesService.getScriptProperties().getProperty('PHOTOS_FOLDER_ID');
  if (!folderId) return { status: 'error', message: 'PHOTOS_FOLDER_ID not set' };

  const folder = DriveApp.getFolderById(folderId);
  const files  = folder.getFiles();
  const photos = {};

  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName();              // e.g., "21001030294.jpg"
    const pid  = name.replace(/\.[^.]+$/, ''); // strip extension
    photos[pid] = 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w400';
  }

  // Cache 1 hour (photos don't change often)
  try {
    cache.put(cacheKey, JSON.stringify(photos), 3600);
  } catch (e) {
    // 100 KB limit — too many photos, skip cache
  }

  return { status: 'ok', photos: photos };
}


// ════════════════════════════════════════════════════════════
//   ACTION: delete_photo  (auth required)
// ════════════════════════════════════════════════════════════

function deletePhoto(params) {
  const sessionId = (params.session_id || '').trim();
  const targetPid = (params.target_pid || '').trim();

  const authStr = CacheService.getScriptCache().get('auth_' + sessionId);
  if (!authStr) return { status: 'error', message: 'სესია ამოიწურა' };
  const auth = JSON.parse(authStr);

  if (!targetPid) return { status: 'error', message: 'PID ცარიელია' };

  // Permission check - user can only delete photos for themselves and their downline
  if (!isInDownline_(auth.pid, targetPid)) {
    return { status: 'error', message: 'ფოტოს წაშლა მხოლოდ თქვენი გუნდის წევრებისთვის' };
  }

  try {
    const folderId = PropertiesService.getScriptProperties().getProperty('PHOTOS_FOLDER_ID');
    const folder = DriveApp.getFolderById(folderId);

    let deleted = 0;
    ['jpg', 'jpeg', 'png', 'webp'].forEach(function(ext) {
      const files = folder.getFilesByName(targetPid + '.' + ext);
      while (files.hasNext()) {
        files.next().setTrashed(true);
        deleted++;
      }
    });

    // Invalidate cache
    CacheService.getScriptCache().remove('photos_index');

    return { status: 'ok', deleted: deleted };
  } catch (err) {
    return { status: 'error', message: String(err) };
  }
}


// ════════════════════════════════════════════════════════════
//   PERMISSIONS HELPER - downline checking
// ════════════════════════════════════════════════════════════

function isInDownline_(userPid, targetPid) {
  // Admin can access everyone
  if (userPid === COMPANY_ROOT_ID) return true;
  
  // User can access themselves
  if (userPid === targetPid) return true;
  
  // TODO: Implement actual downline checking
  // Option A: Load farmasi_data.json and traverse upwards from targetPid
  // Option B: Load parent_map.json for faster lookup  
  // Option C: Add 's' field to users_mobile.json
  
  // For now - simplified check (replace with actual implementation)
  try {
    const users = fetchUsersJson_();
    const targetUser = users[targetPid];
    if (!targetUser) return false;
    
    // Quick parent check (1 level up only - replace with full upline traverse)
    return targetUser.sponsor === userPid || targetUser.parent_pid === userPid;
  } catch (e) {
    log_('downline check error: ' + e);
    return false;
  }
}


//   SOCIAL MEDIA DATA HELPERS
// ════════════════════════════════════════════════════════════

function getSocialData_() {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'social_data_cache';

  // Try cache first
  const cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }

  // Load from storage
  try {
    // Option A: Separate JSON file on Drive
    const folderId = PropertiesService.getScriptProperties().getProperty('SOCIAL_DATA_FILE_ID');
    if (folderId) {
      const file = DriveApp.getFileById(folderId);
      const content = file.getBlob().getDataAsString('UTF-8');
      const data = JSON.parse(content);
      
      // Cache for 1 hour
      cache.put(cacheKey, JSON.stringify(data), 3600);
      return data;
    }
    
    // Option B: If no separate file, return empty
    return {};
    
  } catch (e) {
    log_('getSocialData_ ERROR: ' + e);
    return {};
  }
}

function saveSocialData_(data) {
  try {
    const folderId = PropertiesService.getScriptProperties().getProperty('SOCIAL_DATA_FILE_ID');
    if (!folderId) {
      // Create new file if doesn't exist
      const file = DriveApp.createFile('social_media_data.json', JSON.stringify(data, null, 2));
      PropertiesService.getScriptProperties().setProperty('SOCIAL_DATA_FILE_ID', file.getId());
      log_('Created new social_media_data.json file: ' + file.getId());
    } else {
      // Update existing file
      const file = DriveApp.getFileById(folderId);
      file.setContent(JSON.stringify(data, null, 2));
    }
  } catch (e) {
    log_('saveSocialData_ ERROR: ' + e);
    throw new Error('Social data save failed');
  }
}

function isValidFacebookUrl_(url) {
  if (!url) return true; // Empty is OK
  
  // Accept both full URLs and just usernames
  const fbRegex = /^(https?:\/\/)?(www\.)?(facebook\.com\/)?[\w\.-]+\/?$/i;
  return fbRegex.test(url);
}

function isValidTikTokUsername_(username) {
  if (!username) return true; // Empty is OK
  
  // TikTok usernames: @username or just username
  const cleanUsername = username.replace(/^@/, '');
  const ttRegex = /^[a-zA-Z0-9._]{1,24}$/;
  return ttRegex.test(cleanUsername);
}


// ════════════════════════════════════════════════════════════
//   USER LOOKUP
// ════════════════════════════════════════════════════════════

function getUser_(pid) {
  const cache    = CacheService.getScriptCache();
  const cacheKey = 'user_' + pid;

  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const users = fetchUsersJson_();
  const user  = users[pid];

  if (user) {
    try {
      cache.put(cacheKey, JSON.stringify(user), SESSION_EXPIRE);
    } catch (e) {}
  }
  return user;
}

function fetchUsersJson_() {
  const cache    = CacheService.getScriptCache();
  const cacheKey = 'users_json_full';

  const cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }

  const url = PropertiesService.getScriptProperties().getProperty('USERS_JSON_URL');
  if (!url) throw new Error('USERS_JSON_URL not set in Script Properties');

  let users = null;

  const match = url.match(/[-\w]{25,}/);
  if (match) {
    try {
      const file    = DriveApp.getFileById(match[0]);
      const content = file.getBlob().getDataAsString('UTF-8');
      users = JSON.parse(content);
    } catch (e) {
      log_('DriveApp failed: ' + e + ' → fallback to UrlFetch');
    }
  }

  if (!users) {
    const response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      headers: { 'Cache-Control': 'no-cache' }
    });

    if (response.getResponseCode() !== 200) {
      throw new Error('users_mobile.json fetch failed: HTTP ' + response.getResponseCode());
    }
    users = JSON.parse(response.getContentText());
  }

  try {
    cache.put(cacheKey, JSON.stringify(users), SESSION_EXPIRE);
  } catch (e) {}

  return users;
}


// ════════════════════════════════════════════════════════════
//   bulksms.ge REST API
// ════════════════════════════════════════════════════════════

function sendSms_(phone, text) {
  const props      = PropertiesService.getScriptProperties();
  const publicKey  = props.getProperty('PUBLIC_KEY');
  const privateKey = props.getProperty('PRIVATE_KEY');

  if (!publicKey || !privateKey) {
    return { ok: false, code: 0, body: 'API keys not configured' };
  }

  const url = 'https://api.bulksms.ge/gateway/api/sms/v1/message/send'
            + '?publicKey=' + encodeURIComponent(publicKey);

  const payload = {
    Text:    text,
    Purpose: 'INF',
    Options: {
      Originator: SMS_SENDER,
      Encoding:   'UNICODE'
    },
    Receivers: [
      { Receiver: phone }
    ]
  };

  const options = {
    method:             'post',
    contentType:        'application/json',
    headers:            { 'Authorization': 'Bearer ' + privateKey },
    payload:            JSON.stringify(payload),
    muteHttpExceptions: true
  };

  let resp, code, body;
  try {
    resp = UrlFetchApp.fetch(url, options);
    code = resp.getResponseCode();
    body = resp.getContentText();
  } catch (err) {
    return { ok: false, code: 0, body: String(err) };
  }

  let parsed = null;
  try { parsed = JSON.parse(body); } catch (e) {}

  const hasError = parsed && ['400','401','403','500'].indexOf(String(parsed.Status || '')) !== -1;

  return {
    ok:   code === 200 && !hasError,
    code: code,
    body: body
  };
}


// ════════════════════════════════════════════════════════════
//   HELPERS
// ════════════════════════════════════════════════════════════

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function log_(msg) {
  try {
    console.log(new Date().toISOString() + '  ' + msg);
  } catch (e) {}
}


// ════════════════════════════════════════════════════════════
//   TESTS
// ════════════════════════════════════════════════════════════

function test_config() {
  const props = PropertiesService.getScriptProperties().getProperties();
  console.log('PUBLIC_KEY set:        ' + (!!props.PUBLIC_KEY));
  console.log('PRIVATE_KEY set:       ' + (!!props.PRIVATE_KEY));
  console.log('USERS_JSON_URL:        ' + (props.USERS_JSON_URL || '(not set)'));
  console.log('PHOTOS_FOLDER_ID:      ' + (props.PHOTOS_FOLDER_ID || '(not set)'));
}

function test_photos_folder() {
  try {
    const folderId = PropertiesService.getScriptProperties().getProperty('PHOTOS_FOLDER_ID');
    if (!folderId) {
      console.log('❌ PHOTOS_FOLDER_ID not set in Script Properties');
      return;
    }
    const folder = DriveApp.getFolderById(folderId);
    console.log('✅ ფოლდერი ნაპოვნია:');
    console.log('   სახელი: ' + folder.getName());
    console.log('   URL:    ' + folder.getUrl());

    let cnt = 0;
    const files = folder.getFiles();
    while (files.hasNext()) {
      files.next();
      cnt++;
    }
    console.log('   ფოტოები: ' + cnt);
  } catch (e) {
    console.log('❌ Error: ' + e);
  }
}

function test_get_photos() {
  const result = getPhotos({});
  console.log(JSON.stringify(result, null, 2));
}