// ═══════════════════════════════════════════════════════════════════
//   FARMASI Tree - Social Media Integration (Production Version)
//   Permanent integration into all user profiles
// ═══════════════════════════════════════════════════════════════════

// Google Apps Script Web App URL
const SOCIAL_API_URL = API_URL;

// Global social media data cache
let socialDataCache = {};

// ═══════════════════════════════════════════════════════════════════
//   CORE SOCIAL MEDIA FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Professional Social Media Edit Modal
 */
function openSocialEditModal(targetPid, userName) {
  // Remove existing modal if any
  const existingModal = document.getElementById('socialEditModal');
  if (existingModal) existingModal.remove();
  
  const currentData = socialDataCache[targetPid] || {};
  
  const modalHTML = `
    <div id="socialEditModal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:2147483648; display:flex; align-items:center; justify-content:center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial;">
      <div style="background:white; padding:40px; border-radius:20px; width:500px; max-width:90%; box-shadow: 0 20px 60px rgba(0,0,0,0.3); position:relative;">
        
        <!-- Header -->
        <div style="text-align:center; margin-bottom:30px;">
          <div style="background:#f0f2f5; width:60px; height:60px; border-radius:50%; margin:0 auto 15px; display:flex; align-items:center; justify-content:center;">
            <span style="font-size:24px;">🔗</span>
          </div>
          <h2 style="margin:0; font-size:24px; font-weight:600; color:#1c1e21;">სოციალური მედია - ${userName}</h2>
          <p style="margin:8px 0 0 0; color:#65676b; font-size:15px;">დაუკავშირდით მენს სოციალურ პროგრამებზე</p>
        </div>

        <!-- Close button -->
        <button onclick="document.getElementById('socialEditModal').remove()" style="position:absolute; top:15px; right:15px; background:none; border:none; font-size:24px; color:#8a8d91; cursor:pointer; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center;">×</button>

        <!-- Facebook -->
        <div style="margin:25px 0; display:flex; align-items:center;">
          <div style="width:48px; height:48px; background:#1877F2; border-radius:12px; display:flex; align-items:center; justify-content:center; margin-right:16px; padding:12px;">
            <img src="https://cdn.simpleicons.org/facebook/FFFFFF" style="width:24px; height:24px;">
          </div>
          <div style="flex:1;">
            <div style="font-weight:600; margin-bottom:4px; color:#1c1e21;">Facebook</div>
            <input type="text" id="facebookInput" placeholder="https://facebook.com/your.name" value="${currentData.facebook || ''}" style="width:100%; padding:12px; border:1px solid #dddfe2; border-radius:8px; font-size:14px; outline:none;">
            <div style="font-size:12px; color:#65676b; margin-top:4px;">მაგ: https://facebook.com/your.name</div>
          </div>
        </div>

        <!-- Instagram -->
        <div style="margin:25px 0; display:flex; align-items:center;">
          <div style="width:48px; height:48px; background:linear-gradient(45deg, #f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%); border-radius:12px; display:flex; align-items:center; justify-content:center; margin-right:16px; padding:12px;">
            <img src="https://cdn.simpleicons.org/instagram/FFFFFF" style="width:24px; height:24px;">
          </div>
          <div style="flex:1;">
            <div style="font-weight:600; margin-bottom:4px; color:#1c1e21;">Instagram</div>
            <input type="text" id="instagramInput" placeholder="@your_username" value="${currentData.instagram || ''}" style="width:100%; padding:12px; border:1px solid #dddfe2; border-radius:8px; font-size:14px; outline:none;">
            <div style="font-size:12px; color:#65676b; margin-top:4px;">მაგ: @your_username</div>
          </div>
        </div>

        <!-- TikTok -->
        <div style="margin:25px 0; display:flex; align-items:center;">
          <div style="width:48px; height:48px; background:#000; border-radius:12px; display:flex; align-items:center; justify-content:center; margin-right:16px; padding:12px;">
            <img src="https://cdn.simpleicons.org/tiktok/FFFFFF" style="width:24px; height:24px;">
          </div>
          <div style="flex:1;">
            <div style="font-weight:600; margin-bottom:4px; color:#1c1e21;">TikTok</div>
            <input type="text" id="tiktokInput" placeholder="@your_username" value="${currentData.tiktok || ''}" style="width:100%; padding:12px; border:1px solid #dddfe2; border-radius:8px; font-size:14px; outline:none;">
            <div style="font-size:12px; color:#65676b; margin-top:4px;">მაგ: @your_username</div>
          </div>
        </div>

        <!-- Buttons -->
        <div style="margin-top:32px; display:flex; gap:12px;">
          <button onclick="saveSocialFromModal('${targetPid}')" style="flex:1; background:#1877F2; color:white; border:none; padding:12px 24px; border-radius:8px; font-size:15px; font-weight:600; cursor:pointer;">📁 შენახვა</button>
          <button onclick="document.getElementById('socialEditModal').remove()" style="background:#e4e6ea; color:#1c1e21; border:none; padding:12px 24px; border-radius:8px; font-size:15px; font-weight:600; cursor:pointer;">❌ დახურვა</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // Focus first input
  setTimeout(() => {
    document.getElementById('facebookInput')?.focus();
  }, 100);
}

/**
 * Save social media from modal
 */
async function saveSocialFromModal(targetPid) {
  const facebook = document.getElementById('facebookInput')?.value.trim() || '';
  const instagram = document.getElementById('instagramInput')?.value.trim() || '';
  const tiktok = document.getElementById('tiktokInput')?.value.trim() || '';
  
  // Normalize inputs: convert full URLs to usernames for backend compatibility
  const fbNormalized = normalizeForBackend('facebook', facebook);
  const igNormalized = normalizeForBackend('instagram', instagram);
  const ttNormalized = normalizeForBackend('tiktok', tiktok);
  
  // Debug: show what's being sent
  console.log('🔍 Social Media Debug:');
  console.log('Original inputs:', { facebook, instagram, tiktok });
  console.log('Normalized for backend:', { fbNormalized, igNormalized, ttNormalized });
  
  try {
    showLoading('სოციალური მედიის შენახვა...');
    
    const data = await callApi({
      action: 'save_social',
      target_pid: targetPid,
      facebook: fbNormalized,
      instagram: igNormalized,
      tiktok: ttNormalized,
      session_id: getSessionId()
    });
    
    hideLoading();

    if (data.status === 'ok') {
      // Update local cache
      socialDataCache[targetPid] = {
        facebook: facebook,
        instagram: instagram,
        tiktok: tiktok,
        updated: new Date().toISOString()
      };
      
      showSuccess('სოციალური მედია შენახულია');
      document.getElementById('socialEditModal')?.remove();
      
      // Refresh any displayed social icons
      refreshSocialIcons(targetPid);
    } else {
      showError(data.message || 'შენახვა ვერ მოხერხდა');
    }
  } catch (error) {
    hideLoading();
    console.error('Social Media Save Error:', error);
    showError('შენახვა ვერ მოხერხდა');
  }
}

/**
 * Load all social media data from backend
 */
async function loadSocialMediaData() {
  try {
    const data = await callApi({
      action: 'get_social'
    });
    
    if (data.status === 'ok') {
      socialDataCache = data.social_data || {};
      console.log('✅ Social media data loaded:', Object.keys(socialDataCache).length, 'users');
      return socialDataCache;
    } else {
      console.error('Social data load failed:', data.message);
      return {};
    }
  } catch (error) {
    console.error('Social Media Load Error:', error);
    return {};
  }
}

/**
 * Get session ID — გამოიყენება index.html-ის ორიგინალური getSessionId().
 *
 * NOTE: ადრე აქ იყო კიდევ ერთი getSessionId() რომელიც ეძებდა `farmasi_auth`-ში,
 * მაგრამ index.html ინახავს session-ს `fm_session_id` key-ში. ეს ფუნქცია
 * overwrite-ს უკეთებდა ორიგინალს და ცარიელ session_id-ს უბრუნებდა →
 * verify_otp დაუბრუნდა "სესია ვერ მოიძებნა". მოშორებულია.
 */

/**
 * Show/hide loading states
 *
 * NOTE: ეს ფუნქციები უკვე გლობალურად განსაზღვრულია farmasi_mobile_sms.js-ში
 * (რომელიც ამ ფაილზე ადრე იტვირთება). აქ მათ ხელახლა არ ვწერთ — ადრე ეს იწვევდა
 * ინფინიტ რეკურსიას: `window.showLoading` თვითონ იყო ეს ფუნქცია, ამიტომ
 * `window.showLoading(message)` თავისთავად იძახებდა → "Maximum call stack size exceeded".
 * social_media.js-ის კოდი იძახებს უბრალოდ showLoading()/showSuccess()/showError()-ს,
 * რომლებიც გადადიან farmasi_mobile_sms.js-ის ორიგინალურ ვერსიებზე.
 */

/**
 * Normalize a social handle/URL into a full URL
 */
function normalizeSocialUrl(network, value) {
  if (!value) return '';
  const v = value.trim();
  if (!v) return '';
  // Already a full URL
  if (/^https?:\/\//i.test(v)) return v;
  // Strip leading @ if any
  const handle = v.replace(/^@+/, '').replace(/^\/+/, '');
  if (!handle) return '';
  if (network === 'facebook')  return 'https://facebook.com/' + handle;
  if (network === 'instagram') return 'https://instagram.com/' + handle;
  if (network === 'tiktok')    return 'https://tiktok.com/@' + handle;
  return '';
}

/**
 * Convert URLs back to usernames for backend API compatibility
 * Backend expects: @username or username format, not full URLs
 * Exception: Facebook expects full URLs with www.
 */
function normalizeForBackend(network, value) {
  if (!value) return '';
  const v = value.trim();
  if (!v) return '';
  
  if (network === 'facebook') {
    // Facebook backend expects full URL with www.
    if (v.startsWith('http')) {
      // Already a URL - ensure it has www. and trailing slash
      let url = v;
      if (v.startsWith('https://facebook.com/')) {
        url = v.replace('https://facebook.com/', 'https://www.facebook.com/');
      }
      if (!url.endsWith('/')) url += '/';
      return url;
    } else {
      // Convert username to full URL
      const username = v.replace(/^@+/, '');
      return `https://www.facebook.com/${username}/`;
    }
  }
  
  // Instagram and TikTok: convert URLs to usernames
  if (!v.startsWith('http')) return v;
  
  // Extract username from full URL for non-Facebook networks
  let username = '';
  try {
    const url = new URL(v);
    const path = url.pathname;
    
    if (network === 'instagram') {
      // https://instagram.com/username → @username
      const match = path.match(/^\/([^\/\?]+)/);
      username = match ? '@' + match[1] : '';
    } else if (network === 'tiktok') {
      // https://tiktok.com/@username → @username
      const match = path.match(/^\/@?([^\/\?]+)/);
      username = match ? '@' + match[1] : '';
    }
  } catch (e) {
    // Invalid URL, return as is
    return v;
  }
  
  return username || v;
}

/**
 * Apply privacy controls to modal - hide bonus/sponsor for unauthorized users
 */
function applyPrivacyControls(modal, userPid) {
  const currentUser = window.LOGGED_PID;
  const isAdmin = (currentUser === '404445249');
  const isOwner = (String(currentUser) === String(userPid));
  
  // Can view sensitive data: Admin or Profile Owner
  const canViewSensitive = isAdmin || isOwner;
  
  console.log(`Privacy check: currentUser=${currentUser}, userPid=${userPid}, canView=${canViewSensitive}`);
  
  if (!canViewSensitive) {
    // Hide bonus amount
    const bonusAmount = modal.querySelector('#fm-bonus-amount');
    if (bonusAmount) {
      bonusAmount.textContent = '***';
      bonusAmount.style.color = '#666';
    }
    
    // Hide bonus row entirely
    const bonusRow = modal.querySelector('#fm-bonus-row');
    if (bonusRow) {
      bonusRow.style.display = 'none';
    }
    
    // Hide sponsor
    const sponsorRow = modal.querySelector('#fm-sponsor-row');
    if (sponsorRow) {
      sponsorRow.style.display = 'none';
    }
  }
}

/**
 * Add Facebook / Instagram / TikTok / Edit row to user profile modal
 */
function addSocialMediaButtonToProfile(modal, userPid, userName) {
  // Avoid duplicate insertions
  if (modal.querySelector('.fm-social-row')) return;

  // Apply privacy controls first
  applyPrivacyControls(modal, userPid);

  // Authorization: only logged-in user can edit their own profile
  const canEdit = (window.LOGGED_PID && String(window.LOGGED_PID) === String(userPid));

  const data = socialDataCache[userPid] || {};
  const fbUrl = normalizeSocialUrl('facebook',  data.facebook);
  const igUrl = normalizeSocialUrl('instagram', data.instagram);
  const ttUrl = normalizeSocialUrl('tiktok',    data.tiktok);

  // Build the row — same grid layout as #fm-contact (4 columns or 3 if no edit)
  const row = document.createElement('div');
  row.className = 'fm-social-row';
  const cols = canEdit ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)';
  row.style.cssText = `display:grid; grid-template-columns:${cols}; gap:6px; margin-bottom:10px;`;

  const baseBtn = 'padding:12px 4px; border-radius:10px; text-align:center; font-weight:700; font-size:11.5px; text-decoration:none; display:flex; align-items:center; justify-content:center; min-height:46px; transition:transform 0.1s; line-height:1.2; color:#fff; cursor:pointer; border:none;';

  // Facebook
  const fb = document.createElement('a');
  fb.textContent = '📘 Facebook';
  fb.style.cssText = baseBtn + (fbUrl
    ? 'background:linear-gradient(135deg, #1877F2 0%, #0c5dc7 100%);'
    : 'background:#333; color:#777; opacity:0.45;');
  if (fbUrl) {
    fb.href = fbUrl;
    fb.target = '_blank';
    fb.rel = 'noopener';
  } else if (canEdit) {
    fb.href = '#';
    fb.onclick = (e) => { 
      e.preventDefault(); 
      e.stopPropagation();
      console.log('Opening Facebook edit modal for', userName);
      openSocialEditModal(userPid, userName); 
    };
  } else {
    fb.style.cursor = 'default';
    fb.onclick = (e) => e.preventDefault();
  }

  // Instagram
  const ig = document.createElement('a');
  ig.textContent = '📷 Instagram';
  ig.style.cssText = baseBtn + (igUrl
    ? 'background:linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%);'
    : 'background:#333; color:#777; opacity:0.45;');
  if (igUrl) {
    ig.href = igUrl;
    ig.target = '_blank';
    ig.rel = 'noopener';
  } else if (canEdit) {
    ig.href = '#';
    ig.onclick = (e) => { 
      e.preventDefault(); 
      e.stopPropagation();
      console.log('Opening Instagram edit modal for', userName);
      openSocialEditModal(userPid, userName); 
    };
  } else {
    ig.style.cursor = 'default';
    ig.onclick = (e) => e.preventDefault();
  }

  // TikTok
  const tt = document.createElement('a');
  tt.textContent = '🎵 TikTok';
  tt.style.cssText = baseBtn + (ttUrl
    ? 'background:linear-gradient(135deg, #000 0%, #25F4EE 50%, #FE2C55 100%);'
    : 'background:#333; color:#777; opacity:0.45;');
  if (ttUrl) {
    tt.href = ttUrl;
    tt.target = '_blank';
    tt.rel = 'noopener';
  } else if (canEdit) {
    tt.href = '#';
    tt.onclick = (e) => { 
      e.preventDefault(); 
      e.stopPropagation();
      console.log('Opening TikTok edit modal for', userName);
      openSocialEditModal(userPid, userName); 
    };
  } else {
    tt.style.cursor = 'default';
    tt.onclick = (e) => e.preventDefault();
  }

  row.appendChild(fb);
  row.appendChild(ig);
  row.appendChild(tt);

  // Edit button (only for profile owner)
  if (canEdit) {
    const edit = document.createElement('a');
    edit.textContent = '✏️ რედაქტი';
    edit.href = '#';
    edit.style.cssText = baseBtn + 'background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);';
    edit.onclick = (e) => { 
      e.preventDefault(); 
      e.stopPropagation();
      console.log('Opening social edit modal for', userName);
      openSocialEditModal(userPid, userName); 
    };
    row.appendChild(edit);
  }

  // Insert right after #fm-contact (the call/SMS/WhatsApp/Telegram row)
  const contact = modal.querySelector('#fm-contact');
  if (contact && contact.parentNode) {
    contact.parentNode.insertBefore(row, contact.nextSibling);
  } else {
    // Fallback: append at the end
    modal.appendChild(row);
  }

  console.log(`✅ Social row added for ${userName} (${userPid}), canEdit: ${canEdit}`);
}

/**
 * Refresh the social row of the currently open modal (after save)
 */
function refreshSocialIcons(pid) {
  const overlay = document.getElementById('fm-overlay');
  if (!overlay || !overlay.classList.contains('fm-open')) return;
  const modal = document.getElementById('fm-modal');
  if (!modal) return;
  const idEl = modal.querySelector('#fm-id');
  const currentPid = idEl ? (idEl.textContent.match(/\d+/) || [])[0] : null;
  if (currentPid !== String(pid)) return;
  // Remove old row and re-add with fresh data
  const oldRow = modal.querySelector('.fm-social-row');
  if (oldRow) oldRow.remove();
  const nameEl = modal.querySelector('#fm-name');
  const userName = nameEl ? nameEl.textContent.trim() : 'User';
  addSocialMediaButtonToProfile(modal, String(pid), userName);
}

/**
 * Extract user info from the FARMASI profile modal (#fm-modal)
 */
function extractUserInfoFromModal(modal) {
  try {
    const idEl = modal.querySelector('#fm-id');
    const nameEl = modal.querySelector('#fm-name');
    const userPid = idEl ? (idEl.textContent.match(/\d+/) || [])[0] : null;
    const userName = nameEl ? nameEl.textContent.trim() : 'User';
    return { userPid, userName };
  } catch (error) {
    console.error('Error extracting user info:', error);
    return { userPid: null, userName: 'User' };
  }
}

/**
 * Watch the existing #fm-overlay for class changes — when it gets `fm-open`,
 * the profile modal has just been displayed for some user, so we add our
 * social media row.
 */
function initializeProfileMonitoring() {
  function attachToOverlay(overlay) {
    const modal = document.getElementById('fm-modal');
    if (!modal) return;

    const tryAddRow = () => {
      if (!overlay.classList.contains('fm-open')) return;
      const { userPid, userName } = extractUserInfoFromModal(modal);
      if (!userPid) return;
      // Remove any existing social row from a previous user
      const oldRow = modal.querySelector('.fm-social-row');
      if (oldRow) oldRow.remove();
      addSocialMediaButtonToProfile(modal, userPid, userName);
    };

    // Watch fm-open class toggle
    const observer = new MutationObserver(() => {
      // small delay so #fm-id / #fm-name are populated by openModal()
      setTimeout(tryAddRow, 50);
    });
    observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });

    // If modal is already open at script init, add the row now
    if (overlay.classList.contains('fm-open')) setTimeout(tryAddRow, 50);

    console.log('✅ Social Media: #fm-overlay monitoring active');
  }

  const overlay = document.getElementById('fm-overlay');
  if (overlay) {
    attachToOverlay(overlay);
    return;
  }

  // Overlay isn't in the DOM yet — wait for it to be inserted
  const bodyObserver = new MutationObserver(() => {
    const ov = document.getElementById('fm-overlay');
    if (ov) {
      bodyObserver.disconnect();
      attachToOverlay(ov);
    }
  });
  bodyObserver.observe(document.body, { childList: true, subtree: true });
}

// ═══════════════════════════════════════════════════════════════════
//   INITIALIZATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Initialize the complete social media system
 */
async function initializeFarmasiSocialMedia() {
  console.log('🔗 ინიციალიზაცია: FARMASI Social Media Integration...');
  
  try {
    // Load social media data from backend
    await loadSocialMediaData();
    
    // Start monitoring for user profile modals
    initializeProfileMonitoring();
    
    console.log('✅ FARMASI Social Media Integration მზადაა!');
    
  } catch (error) {
    console.error('❌ Social Media Initialization Error:', error);
  }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeFarmasiSocialMedia);
} else {
  initializeFarmasiSocialMedia();
}

// Also reinitialize when tree is reloaded (if such event exists)
document.addEventListener('treeLoaded', initializeFarmasiSocialMedia);

console.log('📱 FARMASI Social Media Integration script ჩატვირთულია');
