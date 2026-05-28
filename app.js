// Badminton Court Fee Calculator - Application Logic
// Author: Antigravity Pair Programmer
// Date: May 28, 2026

// ==========================================
// STATE MANAGEMENT & DEFAULTS
// ==========================================
const state = {
  // Settings (Persisted in LocalStorage)
  courtRate: 180,
  ballRate: 450,
  payeePhone: "ยังไม่ระบุข้อมูล",

  // Daily Inputs (Session-based)
  totalPlayers: 8,
  players3Hr: 4,
  
  courts2Hr: 2,
  tubes2Hr: 1,
  balls2Hr: 0,
  
  hour3Enabled: true,
  courts3Hr: 1,
  tubes3Hr: 0,
  balls3Hr: 4,

  // Calculation Results
  rate2Hr: 0.00,
  rate3Hr: 0.00,
  cost2HrTotal: 0.00,
  cost3HrTotal: 0.00,
  players2Hr: 4,
  
  // Rendered slip image data
  slipDataUrl: null
};

// ==========================================
// THAI DATE FORMATTER
// ==========================================
function updateLiveDate() {
  const days = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  const months = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];
  
  const now = new Date();
  const dayName = days[now.getDay()];
  const date = now.getDate();
  const monthName = months[now.getMonth()];
  const thaiYear = now.getFullYear() + 543;
  
  const formattedDate = `วัน${dayName}ที่ ${date} ${monthName} พ.ศ. ${thaiYear}`;
  
  const dateEl = document.getElementById('live-date');
  if (dateEl) dateEl.innerText = formattedDate;
  
  return now;
}

// Format date time for slip timestamp
function getSlipTimestamp() {
  const now = new Date();
  const pad = (num) => String(num).padStart(2, '0');
  const date = pad(now.getDate());
  const month = pad(now.getMonth() + 1);
  const year = now.getFullYear() + 543; // Thai Buddhist Era
  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());
  
  return `${date}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

// ==========================================
// LOCAL STORAGE ACTIONS
// ==========================================
function loadSettings() {
  if (localStorage.getItem('badminton_court_rate')) {
    state.courtRate = parseFloat(localStorage.getItem('badminton_court_rate'));
  }
  if (localStorage.getItem('badminton_ball_rate')) {
    state.ballRate = parseFloat(localStorage.getItem('badminton_ball_rate'));
  }
  if (localStorage.getItem('badminton_payee_phone')) {
    state.payeePhone = localStorage.getItem('badminton_payee_phone');
  }

  // Set values to DOM Inputs
  document.getElementById('input-court-rate').value = state.courtRate;
  document.getElementById('input-ball-rate').value = state.ballRate;
  document.getElementById('input-payee-phone').value = state.payeePhone;

  updateCardDetails();
}

function saveSettings() {
  localStorage.setItem('badminton_court_rate', state.courtRate);
  localStorage.setItem('badminton_ball_rate', state.ballRate);
  localStorage.setItem('badminton_payee_phone', state.payeePhone);
  
  updateCardDetails();
}

function updateCardDetails() {
  const displayPhone = (!state.payeePhone || state.payeePhone.trim() === "" || state.payeePhone === "ยังไม่ระบุข้อมูล") 
    ? "ยังไม่ระบุข้อมูล" 
    : state.payeePhone;

  // Update PromptPay card visual elements
  document.getElementById('card-promptpay-num').innerText = displayPhone;
  
  // Render mini static QR code on PromptPay card mockup (40x40px)
  const qrPayload = generatePromptPayPayload(displayPhone, null);
  drawQRCode('mini-qrcode', qrPayload, 40, 40);
}

// ==========================================
// QR CODE GENERATOR ENGINE (PROMPTPAY EMVCo)
// ==========================================

// CRC16-CCITT implementation for EMVCo
function calculateCRC16(str) {
  let crc = 0xFFFF;
  for (let c = 0; c < str.length; c++) {
    let code = str.charCodeAt(c);
    crc ^= (code << 8);
    for (let i = 0; i < 8; i++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function generatePromptPayPayload(target, amount) {
  // Guardrail: check if target is empty, unspecified, or blank
  if (!target || target === "ยังไม่ระบุข้อมูล" || target.trim() === "") {
    return "https://promptpay.io/not-specified";
  }

  // Clean special characters
  let cleanTarget = target.replace(/[- ]/g, '');
  
  // Validate target contains only numerical digits and is of standard PromptPay length (10, 13, or 15 digits)
  const hasDigits = /^\d+$/.test(cleanTarget);
  if (!hasDigits || (cleanTarget.length !== 10 && cleanTarget.length !== 13 && cleanTarget.length !== 15)) {
    return "https://promptpay.io/not-specified";
  }

  let targetType = cleanTarget.length === 13 ? '02' : '01'; // 01 Mobile, 02 National ID/Tax ID
  let formattedTarget = '';

  if (targetType === '01') {
    // Convert leading 0 to country code 66
    let mobile = cleanTarget;
    if (mobile.startsWith('0')) {
      mobile = '66' + mobile.substring(1);
    }
    // Pad left to 13 digits
    formattedTarget = mobile.padStart(13, '0');
  } else {
    formattedTarget = cleanTarget;
  }

  // 1. Payload format indicator (Tag 00)
  let payload = '000201';
  
  const hasAmount = amount && parseFloat(amount) > 0;
  
  // 2. Point of initiation method (Tag 01: 11 for static, 12 for dynamic)
  payload += hasAmount ? '010212' : '010211';

  // 3. Merchant Account Information (Tag 29: PromptPay AID + payee details)
  let aid = '0016A000000677010111';
  let payeeSubTag = targetType + '13' + formattedTarget;
  let merchantInfo = aid + payeeSubTag;
  payload += '29' + merchantInfo.length.toString().padStart(2, '0') + merchantInfo;

  // STRICT EMVCo TAG ORDERING (Ascending Tag IDs: 53 -> 54 -> 58 -> 63)
  
  if (hasAmount) {
    // 4. Transaction Currency (Tag 53: 764 = THB)
    payload += '5303764';
    
    // 5. Transaction Amount (Tag 54)
    let amtStr = parseFloat(amount).toFixed(2);
    payload += '54' + amtStr.length.toString().padStart(2, '0') + amtStr;
  }

  // 6. Country Code (Tag 58: TH)
  payload += '5802TH';

  // 7. CRC tag & length (Tag 63: 6304)
  payload += '6304';

  // 8. Compute CRC16 and append
  let crc = calculateCRC16(payload);
  payload += crc;

  return payload;
}

// Renders QR code inside designated container
function drawQRCode(elementId, text, width = 128, height = 128) {
  const container = document.getElementById(elementId);
  if (!container) return;
  
  container.innerHTML = ""; // Clear existing elements
  
  try {
    new QRCode(container, {
      text: text,
      width: width,
      height: height,
      colorDark: "#0f172a", // Slate-900 for premium neutral branding
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });
  } catch (err) {
    console.error("Failed to generate QR Code using qrcode.js:", err);
    container.innerHTML = `<span class="text-[8px] text-red-500">QR Error</span>`;
  }
}

// ==========================================
// CALCULATOR CORE ENGINE
// ==========================================
function calculateFees() {
  const totalPlayersInput = parseInt(document.getElementById('input-total-players').value) || 0;
  const players3HrInput = parseInt(document.getElementById('input-players-3hr').value) || 0;
  
  const alertEl = document.getElementById('validation-alert');
  const alertTextEl = document.getElementById('validation-alert-text');
  
  // Guardrail 1: Inputs Validation
  if (totalPlayersInput <= 0) {
    showAlert("จำนวนคนมาวันนี้ทั้งหมด ต้องมีอย่างน้อย 1 คนขึ้นไป");
    resetOutputsToZero();
    return;
  }
  
  if (players3HrInput < 0) {
    showAlert("จำนวนคนเล่นต่อชั่วโมงที่ 3 ไม่สามารถติดลบได้");
    resetOutputsToZero();
    return;
  }
  
  if (players3HrInput > totalPlayersInput) {
    showAlert(`จำนวนคนเล่นชั่วโมงที่ 3 (${players3HrInput} คน) ไม่สามารถมากกว่าจำนวนคนทั้งหมดในก๊วน (${totalPlayersInput} คน) ได้`);
    resetOutputsToZero();
    return;
  }
  
  // Clear alerts if valid
  alertEl.classList.add('hidden');
  
  // Save daily variables to state
  state.totalPlayers = totalPlayersInput;
  state.players3Hr = players3HrInput;
  state.players2Hr = state.totalPlayers - state.players3Hr;
  
  state.courts2Hr = parseFloat(document.getElementById('input-courts-2hr').value) || 0;
  state.hour3Enabled = document.getElementById('check-hour-3').checked;
  
  if (state.hour3Enabled) {
    state.courts3Hr = parseFloat(document.getElementById('input-courts-3hr').value) || 0;
  } else {
    state.courts3Hr = 0;
    state.tubes3Hr = 0;
    state.balls3Hr = 0;
    // Sync UI display
    document.getElementById('label-tubes-3hr').innerText = "0";
    document.getElementById('label-balls-3hr').innerText = "0";
  }

  // Update background indicator texts
  document.getElementById('calculated-split-info').innerText = `เล่น 2 ชม.: ${state.players2Hr} คน | เล่น 3 ชม.: ${state.players3Hr} คน`;
  document.getElementById('auto-players-2hr-hint').innerText = `* ระบบคำนวณอัตโนมัติ: เล่น 2 ชม. = ${state.players2Hr} คน`;

  // CALCULATE COSTS
  
  // Court costs
  const courtCost2Hr = state.courtRate * state.courts2Hr * 2;
  const courtCost3rdHr = state.hour3Enabled ? (state.courtRate * state.courts3Hr * 1) : 0;
  
  // Shuttlecock costs (1 tube/box = 12 balls)
  const singleBallRate = state.ballRate / 12;
  
  const ballCost2Hr = (state.tubes2Hr * 12 + state.balls2Hr) * singleBallRate;
  const ballCost3rdHr = state.hour3Enabled ? ((state.tubes3Hr * 12 + state.balls3Hr) * singleBallRate) : 0;

  // Split Logic (Guardrails against Division by Zero)
  
  // Block 1 (2 Hours first slot - Shared by all N_total)
  state.cost2HrTotal = courtCost2Hr + ballCost2Hr;
  const cost2HrPerPerson = state.totalPlayers > 0 ? (state.cost2HrTotal / state.totalPlayers) : 0;
  
  // Block 2 (3rd Hour slot - Shared ONLY by N_3hr)
  state.cost3HrTotal = courtCost3rdHr + ballCost3rdHr;
  const cost3rdHrPerPerson = (state.hour3Enabled && state.players3Hr > 0) ? (state.cost3HrTotal / state.players3Hr) : 0;

  // Final amounts (Guardrail 2: Format to 2 decimal places .toFixed(2))
  state.rate2Hr = cost2HrPerPerson;
  state.rate3Hr = cost2HrPerPerson + cost3rdHrPerPerson;

  // UPDATE MAIN UI OUTPUT CARDS
  
  // Rate numbers
  document.getElementById('rate-2hr-amount').innerText = state.rate2Hr.toFixed(2);
  document.getElementById('rate-3hr-amount').innerText = state.rate3Hr.toFixed(2);
  
  // Quantities
  document.getElementById('card-count-2hr').innerText = `${state.players2Hr} คน`;
  document.getElementById('card-count-3hr').innerText = `${state.players3Hr} คน`;
  
  // 2-Hour detailed breakdown
  const courtShare2Hr = state.totalPlayers > 0 ? (courtCost2Hr / state.totalPlayers) : 0;
  const ballShare2Hr = state.totalPlayers > 0 ? (ballCost2Hr / state.totalPlayers) : 0;
  document.getElementById('breakdown-court-2hr').innerText = `${courtShare2Hr.toFixed(2)} ฿`;
  document.getElementById('breakdown-ball-2hr').innerText = `${ballShare2Hr.toFixed(2)} ฿`;
  
  // 3-Hour detailed breakdown
  document.getElementById('breakdown-base-3hr').innerText = `${state.rate2Hr.toFixed(2)} ฿`;
  document.getElementById('breakdown-extra-3hr').innerText = `+${cost3rdHrPerPerson.toFixed(2)} ฿`;
  
  const courtShare3rdOnly = state.players3Hr > 0 ? (courtCost3rdHr / state.players3Hr) : 0;
  const ballShare3rdOnly = state.players3Hr > 0 ? (ballCost3rdHr / state.players3Hr) : 0;
  document.getElementById('breakdown-court-3hr-only').innerText = `${courtShare3rdOnly.toFixed(2)} ฿`;
  document.getElementById('breakdown-ball-3hr-only').innerText = `${ballShare3rdOnly.toFixed(2)} ฿`;

  // Update cumulative labels (Total and details)
  const totalCourtSum = courtCost2Hr + courtCost3rdHr;
  const totalBallSum = ballCost2Hr + ballCost3rdHr;
  
  document.getElementById('total-court-cost').innerText = `${totalCourtSum.toFixed(2)} บาท`;
  document.getElementById('total-ball-cost').innerText = `${totalBallSum.toFixed(2)} บาท`;
  
  document.getElementById('total-court-desc').innerText = `ช่วงแรก ${courtCost2Hr.toFixed(0)} ฿ (${state.courts2Hr} คอร์ท) | ชม.3 ${courtCost3rdHr.toFixed(0)} ฿ (${state.courts3Hr} คอร์ท)`;
  
  const ballText2Hr = `${state.tubes2Hr} หลอด` + (state.balls2Hr > 0 ? ` ${state.balls2Hr} ลูก` : '');
  const ballText3rd = state.hour3Enabled ? (`${state.tubes3Hr} หลอด` + (state.balls3Hr > 0 ? ` ${state.balls3Hr} ลูก` : '')) : '0 หลอด';
  document.getElementById('total-ball-desc').innerText = `ช่วงแรก ${ballCost2Hr.toFixed(0)} ฿ (${ballText2Hr}) | ชม.3 ${ballCost3rdHr.toFixed(0)} ฿ (${ballText3rd})`;
}

// Helpers
function showAlert(message) {
  const alertEl = document.getElementById('validation-alert');
  const alertTextEl = document.getElementById('validation-alert-text');
  alertTextEl.innerText = message;
  alertEl.classList.remove('hidden');
}

function resetOutputsToZero() {
  document.getElementById('rate-2hr-amount').innerText = "0.00";
  document.getElementById('rate-3hr-amount').innerText = "0.00";
  document.getElementById('breakdown-court-2hr').innerText = "0.00 ฿";
  document.getElementById('breakdown-ball-2hr').innerText = "0.00 ฿";
  document.getElementById('breakdown-base-3hr').innerText = "0.00 ฿";
  document.getElementById('breakdown-extra-3hr').innerText = "+0.00 ฿";
  document.getElementById('breakdown-court-3hr-only').innerText = "0.00 ฿";
  document.getElementById('breakdown-ball-3hr-only').innerText = "0.00 ฿";
  document.getElementById('total-court-cost').innerText = "0.00 บาท";
  document.getElementById('total-ball-cost').innerText = "0.00 บาท";
}

// Stepper adjustments for boxes & individual balls
function adjustCount(stateKey, change) {
  if (stateKey === 'tubes-2hr') {
    state.tubes2Hr = Math.max(0, state.tubes2Hr + change);
    document.getElementById('label-tubes-2hr').innerText = state.tubes2Hr;
  } else if (stateKey === 'balls-2hr') {
    state.balls2Hr = Math.max(0, state.balls2Hr + change);
    // Wrap around logic: if individual balls reach 12, convert to a tube!
    if (state.balls2Hr >= 12) {
      state.tubes2Hr += 1;
      state.balls2Hr -= 12;
      document.getElementById('label-tubes-2hr').innerText = state.tubes2Hr;
    }
    document.getElementById('label-balls-2hr').innerText = state.balls2Hr;
  } else if (stateKey === 'tubes-3hr') {
    if (!state.hour3Enabled) return;
    state.tubes3Hr = Math.max(0, state.tubes3Hr + change);
    document.getElementById('label-tubes-3hr').innerText = state.tubes3Hr;
  } else if (stateKey === 'balls-3hr') {
    if (!state.hour3Enabled) return;
    state.balls3Hr = Math.max(0, state.balls3Hr + change);
    // Wrap around logic: if individual balls reach 12, convert to a tube!
    if (state.balls3Hr >= 12) {
      state.tubes3Hr += 1;
      state.balls3Hr -= 12;
      document.getElementById('label-tubes-3hr').innerText = state.tubes3Hr;
    }
    document.getElementById('label-balls-3hr').innerText = state.balls3Hr;
  }
  
  calculateFees();
}

// ==========================================
// MODAL ACTIONS & SLIP CAPTURING
// ==========================================

// Display Dynamic QR Modal for screen scanning
function showDynamicQRModal(rateType) {
  const modal = document.getElementById('modal-qr');
  const badge = document.getElementById('modal-qr-badge');
  const amountEl = document.getElementById('modal-qr-amount');
  
  let transferAmount = 0.00;
  if (rateType === '2hr') {
    badge.innerText = "กลุ่มเล่น 2 ชั่วโมง";
    badge.className = "text-[10px] bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider mb-1 inline-block";
    transferAmount = state.rate2Hr;
  } else {
    badge.innerText = "กลุ่มเล่น 3 ชั่วโมง";
    badge.className = "text-[10px] bg-bbl-sky text-bbl-royal px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider mb-1 inline-block";
    transferAmount = state.rate3Hr;
  }

  // Ensure amount is valid
  if (transferAmount <= 0) {
    alert("ไม่สามารถสร้าง QR Code สำหรับยอดโอน 0 บาทได้ กรุณาตรวจสอบข้อมูลการคำนวณ");
    return;
  }

  const displayPhone = (!state.payeePhone || state.payeePhone.trim() === "" || state.payeePhone === "ยังไม่ระบุข้อมูล") 
    ? "ยังไม่ระบุข้อมูล" 
    : state.payeePhone;

  amountEl.innerText = transferAmount.toFixed(2);
  document.getElementById('modal-qr-payee').innerText = "โอนเข้า PromptPay: " + displayPhone;
  
  // Format Dynamic QR Code Payload (Includes Payee Phone and exact Transfer Amount)
  const qrPayload = generatePromptPayPayload(displayPhone, transferAmount);
  
  // Draw inside modal canvas container (192x192px)
  drawQRCode('modal-qrcode-canvas', qrPayload, 192, 192);

  // Show Modal with smooth animation
  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.remove('opacity-0');
    modal.querySelector('.transform').classList.remove('scale-95');
  }, 50);
}

function closeQRModal() {
  const modal = document.getElementById('modal-qr');
  modal.classList.add('opacity-0');
  modal.querySelector('.transform').classList.add('scale-95');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 300);
}

// POPULATE RECEIPT TEMPLATE & RENDER IMAGE (DYNAMIC QR FOR THE SELECTED SLOT)
function generateAndShowDynamicSlip(rateType) {
  const is2Hr = rateType === '2hr';
  
  // Guardrail check
  const targetRate = is2Hr ? state.rate2Hr : state.rate3Hr;
  if (targetRate <= 0) {
    alert("ยอดเงินสรุปยังเป็น 0.00 บาท ไม่สามารถสร้างสลิปแชร์ได้");
    return;
  }

  // Guardrail: If 3hr slip requested but players playing 3hr is 0, warn user
  if (!is2Hr && (!state.hour3Enabled || state.players3Hr <= 0)) {
    alert("ไม่มีคนเล่นต่อชั่วโมงที่ 3 หรือไม่ได้เปิดชั่วโมงที่ 3 ไม่สามารถสร้างสลิปได้");
    return;
  }

  const displayPhone = (!state.payeePhone || state.payeePhone.trim() === "" || state.payeePhone === "ยังไม่ระบุข้อมูล") 
    ? "ยังไม่ระบุข้อมูล" 
    : state.payeePhone;

  const loaderContainer = document.getElementById('slip-preview-container');
  const slipModal = document.getElementById('modal-slip');
  const mainModalTitle = document.getElementById('modal-slip-main-title');

  // Open modal and show loader
  mainModalTitle.innerText = is2Hr ? "แชร์ภาพสรุปกลุ่ม 2 ชั่วโมง" : "แชร์ภาพสรุปกลุ่ม 3 ชั่วโมง";
  slipModal.classList.remove('hidden');
  setTimeout(() => {
    slipModal.classList.remove('opacity-0');
    slipModal.querySelector('.transform').classList.remove('scale-95');
  }, 50);

  // Show loader message
  loaderContainer.innerHTML = `
    <div class="p-8 text-center text-xs text-slate-400" id="slip-rendering-loader">
      <div class="w-8 h-8 border-4 border-bbl-royal border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
      กำลังจำลองภาพสลิปความละเอียดสูง...
    </div>`;

  // 1. Populate standard off-screen details
  document.getElementById('slip-timestamp').innerText = getSlipTimestamp();
  document.getElementById('slip-payee-phone').innerText = "โอนเข้า PromptPay: " + displayPhone;

  // 2. Set dynamic header and subtitle
  const mainTitleEl = document.getElementById('slip-main-title');
  const subtitleEl = document.getElementById('slip-subtitle');
  
  mainTitleEl.innerText = is2Hr ? "สรุปค่าใช้จ่ายก๊วนแบดมินตัน - กลุ่ม 2 ชั่วโมง" : "สรุปค่าใช้จ่ายก๊วนแบดมินตัน - กลุ่ม 3 ชั่วโมง";
  subtitleEl.innerText = is2Hr 
    ? `จำนวนคนร่วมหารช่วงแรก: ${state.totalPlayers} คน (เล่น 2 ชม. = ${state.players2Hr} คน | เล่น 3 ชม. = ${state.players3Hr} คน)` 
    : `จำนวนคนเล่นต่อชั่วโมงที่ 3: ${state.players3Hr} คน (จากคนเล่นทั้งหมด ${state.totalPlayers} คน)`;

  // 3. Build and inject detailed dynamic content table & rate card
  const dynamicContentEl = document.getElementById('slip-dynamic-content');
  let dynamicHtml = '';

  if (is2Hr) {
    const courtCost2 = state.courtRate * state.courts2Hr * 2;
    const ballCost2 = (state.tubes2Hr * 12 + state.balls2Hr) * (state.ballRate / 12);
    const ballText2 = `${state.tubes2Hr} กล่อง` + (state.balls2Hr > 0 ? ` ${state.balls2Hr} ลูก` : '');

    dynamicHtml = `
      <!-- Calculation Table -->
      <div class="border border-slate-100 rounded-2xl overflow-hidden mb-6 text-xs bg-white">
        <div class="bg-slate-50/80 p-3 grid grid-cols-12 font-bold text-slate-500 border-b border-slate-150">
          <div class="col-span-6">รายการค่าใช้จ่าย 2 ชม.แรก</div>
          <div class="col-span-3 text-right">ยอดรวม (฿)</div>
          <div class="col-span-3 text-right">หาร (คน)</div>
        </div>
        <!-- Court Row -->
        <div class="p-3 grid grid-cols-12 border-b border-slate-100 text-slate-600">
          <div class="col-span-6">
            <span class="font-bold text-slate-700">ค่าคอร์ทแรก 2 ชั่วโมง</span>
            <span class="block text-[10px] text-slate-400">🏟️ ${state.courts2Hr} คอร์ท x 2 ชม. x ${state.courtRate} ฿</span>
          </div>
          <div class="col-span-3 text-right font-semibold">${courtCost2.toFixed(2)}</div>
          <div class="col-span-3 text-right font-bold">${state.totalPlayers} คน</div>
        </div>
        <!-- Ball Row -->
        <div class="p-3 grid grid-cols-12 border-b border-slate-100 text-slate-600">
          <div class="col-span-6">
            <span class="font-bold text-slate-700">ค่าลูกแบดมินตัน</span>
            <span class="block text-[10px] text-slate-400">🏸 ${ballText2}</span>
          </div>
          <div class="col-span-3 text-right font-semibold">${ballCost2.toFixed(2)}</div>
          <div class="col-span-3 text-right font-bold">${state.totalPlayers} คน</div>
        </div>
      </div>

      <!-- Large Rate Highlight -->
      <div class="bg-gradient-to-br from-white to-bbl-sky/20 border border-bbl-sky rounded-2xl p-5 text-center mb-6 shadow-sm">
        <span class="text-[10px] font-bold text-bbl-royal uppercase tracking-wider block">ยอดโอนเงินสุทธิ (Net Amount)</span>
        <span class="text-xl font-black text-bbl-deep mt-1 block">ยอดโอนคนละ: <span class="text-3xl text-bbl-deep font-extrabold">${state.rate2Hr.toFixed(2)}</span> บาท</span>
        <span class="text-[9px] text-slate-400 block mt-1">(แชร์ร่วมกันเฉพาะค่าเล่นช่วง 2 ชั่วโมงแรก)</span>
      </div>`;
  } else {
    const courtCost3 = state.courtRate * state.courts3Hr * 1;
    const ballCost3 = (state.tubes3Hr * 12 + state.balls3Hr) * (state.ballRate / 12);
    const ballText3 = `${state.tubes3Hr} กล่อง` + (state.balls3Hr > 0 ? ` ${state.balls3Hr} ลูก` : '');

    dynamicHtml = `
      <!-- Calculation Table -->
      <div class="border border-slate-100 rounded-2xl overflow-hidden mb-6 text-xs bg-white">
        <div class="bg-slate-50/80 p-3 grid grid-cols-12 font-bold text-slate-500 border-b border-slate-150">
          <div class="col-span-6">รายการค่าใช้จ่าย 3 ชม.</div>
          <div class="col-span-3 text-right">ยอดรวม (฿)</div>
          <div class="col-span-3 text-right">หาร (คน)</div>
        </div>
        <!-- Base Share Row -->
        <div class="p-3 grid grid-cols-12 border-b border-slate-100 text-slate-600 bg-slate-50/20">
          <div class="col-span-6">
            <span class="font-bold text-slate-700">ค่าเล่น 2 ชั่วโมงแรก (เบสแชร์)</span>
            <span class="block text-[10px] text-slate-400">แชร์จากค่าใช้จ่ายช่วงแรกเท่าทุกคน</span>
          </div>
          <div class="col-span-3 text-right font-semibold">${state.rate2Hr.toFixed(2)}</div>
          <div class="col-span-3 text-right font-bold">1 คน</div>
        </div>
        <!-- Extra Court Row -->
        <div class="p-3 grid grid-cols-12 border-b border-slate-100 text-slate-600">
          <div class="col-span-6">
            <span class="font-bold text-slate-700">ค่าคอร์ทพิเศษ ชั่วโมงที่ 3</span>
            <span class="block text-[10px] text-slate-400">🏟️ ${state.courts3Hr} คอร์ท x 1 ชม. x ${state.courtRate} ฿</span>
          </div>
          <div class="col-span-3 text-right font-semibold">${courtCost3.toFixed(2)}</div>
          <div class="col-span-3 text-right font-bold">${state.players3Hr} คน</div>
        </div>
        <!-- Extra Ball Row -->
        <div class="p-3 grid grid-cols-12 border-b border-slate-100 text-slate-600">
          <div class="col-span-6">
            <span class="font-bold text-slate-700">ค่าลูกแบดมินตันเพิ่ม ชม.ที่ 3</span>
            <span class="block text-[10px] text-slate-400">🏸 ${ballText3}</span>
          </div>
          <div class="col-span-3 text-right font-semibold">${ballCost3.toFixed(2)}</div>
          <div class="col-span-3 text-right font-bold">${state.players3Hr} คน</div>
        </div>
      </div>

      <!-- Large Rate Highlight -->
      <div class="bg-gradient-to-br from-white to-cyan-50 border border-cyan-300 rounded-2xl p-5 text-center mb-6 shadow-sm">
        <span class="text-[10px] font-bold text-cyan-600 uppercase tracking-wider block">ยอดโอนเงินสุทธิ (Net Amount)</span>
        <span class="text-xl font-black text-slate-800 mt-1 block">ยอดโอนคนละ: <span class="text-3xl text-bbl-deep font-extrabold">${state.rate3Hr.toFixed(2)}</span> บาท</span>
        <span class="text-[9px] text-slate-400 block mt-1">(รวมค่าก๊วนเบสแชร์ 2 ชม.แรก + ค่าหารเพิ่มเติมชม.ที่ 3)</span>
      </div>`;
  }

  dynamicContentEl.innerHTML = dynamicHtml;

  // 4. Render DYNAMIC QR Code embedded directly inside the slip
  const dynamicPayload = generatePromptPayPayload(displayPhone, targetRate);
  drawQRCode('slip-qrcode-canvas', dynamicPayload, 160, 160);

  // 5. Update QR instructions in slip footer
  document.getElementById('slip-qr-instruction').innerText = `สแกนเพื่อโอนเงินกลุ่ม ${is2Hr ? '2 ชม.' : '3 ชม.'} อัตโนมัติ`;
  document.getElementById('slip-qr-sub-instruction').innerText = `ยอดโอนระบุอัตโนมัติ: ${targetRate.toFixed(2)} บาท`;

  // 6. Capture as ultra-premium crispy PNG image at double resolution (scale: 2)
  setTimeout(() => {
    const templateElement = document.getElementById('receipt-template');
    
    html2canvas(templateElement, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false
    }).then(canvas => {
      // Get image source URL
      state.slipDataUrl = canvas.toDataURL("image/png");
      
      // Inject preview image into modal
      loaderContainer.innerHTML = `<img src="${state.slipDataUrl}" class="w-full h-auto" alt="Badminton Slip Summary">`;
    }).catch(err => {
      console.error("html2canvas generation failed:", err);
      loaderContainer.innerHTML = `
        <div class="p-8 text-center text-xs text-red-500">
          ⚠️ เกิดข้อผิดพลาดในการสร้างสลิป: ${err.message}<br>
          กรุณากดแคปหน้าจอภายนอกแทน
        </div>`;
    });
  }, 200);
}

function closeSlipModal() {
  const modal = document.getElementById('modal-slip');
  modal.classList.add('opacity-0');
  modal.querySelector('.transform').classList.add('scale-95');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 300);
}

// Download Trigger
function downloadSlipImage() {
  if (!state.slipDataUrl) {
    alert("รูปภาพยังสร้างไม่เสร็จสมบูรณ์ กรุณารอสักครู่");
    return;
  }
  
  const link = document.createElement('a');
  // Dynamic filename with current Thai Date
  const now = new Date();
  const dateStr = `${now.getFullYear() + 543}_${now.getMonth() + 1}_${now.getDate()}`;
  link.download = `badminton_slip_${dateStr}.png`;
  link.href = state.slipDataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Native Web Share API
async function shareSlipImage() {
  if (!state.slipDataUrl) {
    alert("รูปภาพยังสร้างไม่เสร็จสมบูรณ์ กรุณารอสักครู่");
    return;
  }

  try {
    // Check support for files sharing
    const blob = await (await fetch(state.slipDataUrl)).blob();
    const file = new File([blob], 'badminton_slip_summary.png', { type: 'image/png' });
    
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: 'สรุปยอดโอนค่าก๊วนแบดมินตัน',
        text: 'รายละเอียดการโอนเงินแยกเรทก๊วนแบดมินตันวันนี้'
      });
    } else {
      // Fallback if sharing is not supported
      alert("ระบบบราวเซอร์ของคุณไม่รองรับการกดแชร์ภาพโดยตรง กรุณากดปุ่มเซฟลงแกลเลอรี่ (Download) เพื่อนำไปส่งในแชทแทน");
    }
  } catch (error) {
    console.error('Error sharing:', error);
    // If user cancelled, don't alert error
    if (error.name !== 'AbortError') {
      alert("ไม่สามารถแชร์ภาพได้โดยตรง กรุณาใช้ปุ่มดาวน์โหลดลงแกลเลอรี่และแชร์รูปภาพเอง");
    }
  }
}

// ==========================================
// INITIALIZATION & LISTENERS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Thai dynamic date
  updateLiveDate();
  setInterval(updateLiveDate, 60000); // refresh date minute interval

  // Load configuration from local storage
  loadSettings();

  // COLLAPSIBLE SETUP (BLOCK 1)
  const btnToggleSetup = document.getElementById('btn-toggle-setup');
  const setupContent = document.getElementById('setup-content');
  const toggleChevron = document.getElementById('toggle-chevron');
  
  // Start collapsed as requested: "ซ่อนหรือย่อไว้ได้"
  setupContent.classList.add('hidden');
  toggleChevron.classList.remove('rotate-180');

  btnToggleSetup.addEventListener('click', () => {
    setupContent.classList.toggle('hidden');
    toggleChevron.classList.toggle('rotate-180');
  });

  // REACTIVE STATE ATTACHMENTS FOR CONSTANTS
  const inputCourtRate = document.getElementById('input-court-rate');
  const inputBallRate = document.getElementById('input-ball-rate');
  const inputPayeePhone = document.getElementById('input-payee-phone');

  const constantInputs = [inputCourtRate, inputBallRate, inputPayeePhone];
  constantInputs.forEach(input => {
    input.addEventListener('input', () => {
      state.courtRate = parseFloat(inputCourtRate.value) || 0;
      state.ballRate = parseFloat(inputBallRate.value) || 0;
      state.payeePhone = inputPayeePhone.value;
      
      // Auto-save immediately to LocalStorage on edit
      saveSettings();
      calculateFees();
    });
  });

  // REACTIVE INPUTS FOR DAILY FIELDS
  const dailyInputs = [
    document.getElementById('input-total-players'),
    document.getElementById('input-players-3hr'),
    document.getElementById('input-courts-2hr'),
    document.getElementById('input-courts-3hr'),
    document.getElementById('check-hour-3')
  ];

  // Hourly 3 checkbox toggle visual transition
  const checkHour3 = document.getElementById('check-hour-3');
  const hour3InputsDiv = document.getElementById('hour-3-inputs');
  
  checkHour3.addEventListener('change', () => {
    if (checkHour3.checked) {
      hour3InputsDiv.classList.remove('opacity-50', 'pointer-events-none');
    } else {
      hour3InputsDiv.classList.add('opacity-50', 'pointer-events-none');
    }
    calculateFees();
  });

  dailyInputs.forEach(input => {
    input.addEventListener('input', calculateFees);
  });

  // BUTTON INTERACTIVES
  
  // Dynamic QR Modals Triggers
  document.getElementById('btn-show-qr-2hr').addEventListener('click', () => showDynamicQRModal('2hr'));
  document.getElementById('btn-show-qr-3hr').addEventListener('click', () => showDynamicQRModal('3hr'));
  document.getElementById('btn-close-modal-qr').addEventListener('click', closeQRModal);
  
  // Close QR modal on clicking backdrop
  document.getElementById('modal-qr').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-qr')) closeQRModal();
  });

  // Slip Share Modal Triggers
  document.getElementById('btn-share-slip-2hr').addEventListener('click', () => generateAndShowDynamicSlip('2hr'));
  document.getElementById('btn-share-slip-3hr').addEventListener('click', () => generateAndShowDynamicSlip('3hr'));
  document.getElementById('btn-close-modal-slip').addEventListener('click', closeSlipModal);
  
  // Close slip modal on clicking backdrop
  document.getElementById('modal-slip').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-slip')) closeSlipModal();
  });

  // Action download & native share triggers
  document.getElementById('btn-download-slip').addEventListener('click', downloadSlipImage);
  document.getElementById('btn-native-share').addEventListener('click', shareSlipImage);

  // Initialize first calculation
  calculateFees();
});
