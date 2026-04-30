/// ═══════════════════════════════════════════════════════════════
//   FARMASI Tree - PostMessage CORS Workaround
// ═══════════════════════════════════════════════════════════════

// PostMessage listener for Apps Script responses
window.addEventListener('message', function(event) {
  if (event.origin !== 'https://script.google.com') return;
  
  if (event.data.farmasi_response) {
    const response = event.data.farmasi_response;
    window.farmasiApiCallback && window.farmasiApiCallback(response);
  }
});

// Updated API call function
async function callFarmasiAPI(action, params = {}) {
  return new Promise((resolve) => {
    window.farmasiApiCallback = resolve;
    
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = `${API_URL}?action=${action}&${new URLSearchParams(params)}`;
    document.body.appendChild(iframe);
    
    setTimeout(() => iframe.remove(), 10000);
  });
}

// ═══════════════════════════════════════════════════════════════
//   Original farmasi_mobile_sms.js code continues...
// ═══════════════════════════════════════════════════════════════
// Google Apps Script Web App URL

const API_URL = 'https://script.google.com/macros/s/AKfycbxdwljTK3hN_e5wC_XL4XsEahqbVGAknG6MvjP_8PiNO96Y-GIKNpMtsd4vYjhLoDA/exec';

/**
 * Device detection
 */
function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}

/**
 * Send SMS via native mobile app
 * @param {string} targetPid - Target person's PID
 * @param {string} message - SMS message text
 * @param {string} sessionId - User's auth session
 */
async function sendSMSToMember(targetPid, message, sessionId) {
  try {
    // Check if user is on mobile device
    if (!isMobileDevice()) {
      showError('SMS გაგზავნა მხოლოდ მობილური ტელეფონიდან შესაძლებელია');
      return;
    }

    // Validate message
    if (!message || message.trim().length === 0) {
      showError('შეიყვანეთ შეტყობინება');
      return;
    }

    if (message.length > 160) {
      const confirm = window.confirm('შეტყობინება 160 სიმბოლოზე გრძელია და შეიძლება რამდენიმე SMS-ად გაიგზავნოს. გავაგრძელოთ?');
      if (!confirm) return;
    }

    // Get target user's mobile number
    showLoading('ნომერის მოძიება...');
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        action: 'get_mobile',
        target_pid: targetPid,
        session_id: sessionId
      })
    });

    const data = await response.json();
    hideLoading();

    if (data.status !== 'ok') {
      showError(data.message || 'ნომერის მოძიება ვერ მოხერხდა');
      return;
    }

    const mobile = data.mobile;
    const name = data.name || targetPid;

    // Format phone number (ensure it starts with +995)
    const formattedPhone = formatGeorgianPhone(mobile);

    // Add sender info to message
    const userName = getCurrentUserName(); // Get current user's name
    const fullMessage = `${message}\n\n— ${userName} (FARMASI)`;

    // Create SMS URL
    const smsUrl = createSMSUrl(formattedPhone, fullMessage);

    // Show confirmation
    const confirmMessage = `SMS გაიგზავნება:\n\nმიმღები: ${name} (${maskPhone(mobile)})\n\nშეტყობინება: ${fullMessage}\n\nგაგრძელება?`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    // Try to open SMS app
    if (openSMSApp(smsUrl)) {
      showSuccess(`SMS აპი გაიხსნა ${name}-სთვის`);
      
      // Log successful SMS initiation
      logSMSActivity(targetPid, name, message.length);
    } else {
      // Fallback for older devices
      fallbackSMSMethod(formattedPhone, fullMessage, name);
    }

  } catch (error) {
    hideLoading();
    console.error('SMS Error:', error);
    showError('SMS-ის მომზადება ვერ მოხერხდა: ' + error.message);
  }
}

/**
 * Format Georgian phone number
 */
function formatGeorgianPhone(mobile) {
  // Remove any existing + or 995 prefix
  const cleaned = mobile.replace(/^\+?995/, '');
  
  // Ensure it starts with +995
  return '+995' + cleaned;
}

/**
 * Create SMS URL for different platforms
 */
function createSMSUrl(phone, message) {
  const encodedMessage = encodeURIComponent(message);
  
  if (isIOS()) {
    // iOS SMS format
    return `sms:${phone}&body=${encodedMessage}`;
  } else {
    // Android SMS format
    return `sms:${phone}?body=${encodedMessage}`;
  }
}

/**
 * Open SMS app
 */
function openSMSApp(smsUrl) {
  try {
    // Method 1: Direct navigation
    window.location.href = smsUrl;
    return true;
  } catch (error) {
    console.error('SMS URL open failed:', error);
    return false;
  }
}

/**
 * Fallback method for older devices
 */
function fallbackSMSMethod(phone, message, recipientName) {
  try {
    // Try opening in new window
    const smsWindow = window.open(createSMSUrl(phone, message), '_blank');
    
    if (smsWindow) {
      smsWindow.close(); // Close immediately after triggering
      showSuccess(`SMS აპი გაიხსნა ${recipientName}-სთვის`);
    } else {
      // Last resort - show manual instructions
      showManualSMSInstructions(phone, message, recipientName);
    }
  } catch (error) {
    showManualSMSInstructions(phone, message, recipientName);
  }
}

/**
 * Show manual SMS instructions
 */
function showManualSMSInstructions(phone, message, recipientName) {
  const instructions = `
    თქვენს ტელეფონზე SMS აპი ვერ გაიხსნა ავტომატურად.
    
    გთხოვთ ხელით გააკეთოთ:
    
    1. გახსენით SMS აპი
    2. შეიყვანეთ ნომერი: ${phone}
    3. დაწერეთ შეტყობინება:
    
    ${message}
    
    4. გააგზავნეთ SMS
  `;
  
  alert(instructions);
  
  // Try to copy message to clipboard
  if (navigator.clipboard) {
    navigator.clipboard.writeText(message).then(() => {
      showInfo('შეტყობინება დაკოპირდა clipboard-ში');
    }).catch(() => {
      console.log('Clipboard copy failed');
    });
  }
}

/**
 * Mask phone number for display
 */
function maskPhone(phone) {
  if (phone.length < 6) return phone;
  return phone.substring(0, 3) + '***' + phone.slice(-3);
}

/**
 * Get current user's name (implement based on your auth system)
 */
function getCurrentUserName() {
  const userData = JSON.parse(localStorage.getItem('farmasi_auth') || '{}');
  return userData.name || 'FARMASI წარმომადგენელი';
}

/**
 * Log SMS activity for analytics
 */
function logSMSActivity(targetPid, targetName, messageLength) {
  const activity = {
    timestamp: new Date().toISOString(),
    target_pid: targetPid,
    target_name: targetName,
    message_length: messageLength,
    device: navigator.userAgent
  };
  
  // Store locally for analytics
  const activities = JSON.parse(localStorage.getItem('farmasi_sms_log') || '[]');
  activities.push(activity);
  
  // Keep only last 50 activities
  if (activities.length > 50) {
    activities.splice(0, activities.length - 50);
  }
  
  localStorage.setItem('farmasi_sms_log', JSON.stringify(activities));
  
  console.log('SMS activity logged:', activity);
}

/**
 * Admin-only: Send via bulksms.ge (fallback for desktop)
 */
async function sendSMSViaBackend(targetPid, message, sessionId) {
  try {
    showLoading('SMS გაგზავნება...');
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        action: 'send_to_member',
        target_pid: targetPid,
        message: message,
        session_id: sessionId
      })
    });

    const data = await response.json();
    hideLoading();

    if (data.status === 'ok') {
      showSuccess(`SMS გაიგზავნა: ${data.to_phone}`);
    } else {
      showError(data.message || 'SMS გაგზავნა ვერ მოხერხდა');
    }

  } catch (error) {
    hideLoading();
    console.error('Backend SMS Error:', error);
    showError('SMS გაგზავნა ვერ მოხერხდა: ' + error.message);
  }
}

/**
 * Main SMS function - route based on user type and device
 */
async function initiateSMS(targetPid, message, sessionId) {
  const isAdmin = getCurrentUserPid() === '404445249';
  const isMobile = isMobileDevice();
  
  if (isMobile) {
    // Mobile device - always use native SMS
    await sendSMSToMember(targetPid, message, sessionId);
  } else if (isAdmin) {
    // Desktop + Admin - offer choice
    const choice = window.confirm('SMS გაგზავნა:\n\nOK = FARMASI-დან (bulksms.ge)\nCancel = მობილურზე გახსნა');
    
    if (choice) {
      await sendSMSViaBackend(targetPid, message, sessionId);
    } else {
      showError('მობილურზე გადასვლა საჭიროა');
    }
  } else {
    // Desktop + Regular user
    showError('SMS გაგზავნა მხოლოდ მობილური ტელეფონიდან შესაძლებელია');
  }
}

/**
 * Get current user PID (implement based on your auth system)
 */
function getCurrentUserPid() {
  const userData = JSON.parse(localStorage.getItem('farmasi_auth') || '{}');
  return userData.pid || '';
}

/**
 * UI Helper functions (implement these based on your existing UI)
 */
function showLoading(message) {
  console.log('Loading:', message);
}

function hideLoading() {
  console.log('Loading hidden');
}

function showSuccess(message) {
  alert('✅ ' + message);
}

function showError(message) {
  alert('❌ ' + message);
}

function showInfo(message) {
  console.log('Info:', message);
}

// ═══════════════════════════════════════════════════════════════════
//   INTEGRATION EXAMPLE
// ═══════════════════════════════════════════════════════════════════

/**
 * Example usage in your existing tree UI
 */
function setupSMSButton(targetPid) {
  const button = document.getElementById('sms-button-' + targetPid);
  if (!button) return;
  
  button.addEventListener('click', async () => {
    const message = prompt('შეიყვანეთ შეტყობინება:');
    if (!message) return;
    
    const sessionId = getSessionId(); // Your existing auth function
    await initiateSMS(targetPid, message, sessionId);
  });
}

// Auto-setup for mobile devices
document.addEventListener('DOMContentLoaded', () => {
  if (isMobileDevice()) {
    // Add mobile-specific styling
    document.body.classList.add('mobile-device');
    
    // Update SMS button text for mobile
    const smsButtons = document.querySelectorAll('.sms-button');
    smsButtons.forEach(btn => {
      btn.textContent = '📱 SMS (მობილური)';
      btn.style.backgroundColor = '#25D366'; // WhatsApp green
    });
  }
});