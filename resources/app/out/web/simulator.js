// Macle MiniProgram Web Simulator Controller
(function() {
  'use strict';

  const DEVICES = [
    { name: 'iPhone 6/7/8', width: 375, height: 667, dpr: 2, notch: false },
    { name: 'iPhone 6/7/8 Plus', width: 414, height: 736, dpr: 3, notch: false },
    { name: 'iPhone 5', width: 320, height: 568, dpr: 2, notch: false },
    { name: 'iPhone X', width: 375, height: 812, dpr: 3, notch: true },
    { name: 'iPhone XR', width: 414, height: 896, dpr: 2, notch: true },
    { name: 'iPhone XS Max', width: 414, height: 896, dpr: 3, notch: true },
    { name: 'iPhone 14/15 Pro Max', width: 430, height: 932, dpr: 3, notch: true },
    { name: 'Nexus 5', width: 360, height: 640, dpr: 3, notch: false },
    { name: 'Nexus 6', width: 412, height: 732, dpr: 3.5, notch: false },
    { name: 'iPad', width: 768, height: 1024, dpr: 2, notch: false }
  ];

  let currentDevice = DEVICES[0];
  let currentScale = 1.0;
  let isLandscape = false;
  let touchEnabled = false;
  let autoReloadEnabled = true;
  let projectInfo = null;
  const logs = [];

  // DOM Elements
  const deviceSelect = document.getElementById('device-select');
  const scaleSelect = document.getElementById('scale-select');
  const rotateBtn = document.getElementById('rotate-btn');
  const refreshBtn = document.getElementById('refresh-btn');
  const touchBtn = document.getElementById('touch-btn');
  const networkSelect = document.getElementById('network-select');
  const qrBtn = document.getElementById('qr-btn');
  const devtoolsBtn = document.getElementById('devtools-btn');
  const devtoolsDrawer = document.getElementById('devtools-drawer');
  const closeDevtoolsBtn = document.getElementById('close-devtools');
  const clearLogsBtn = document.getElementById('clear-logs');
  const filterInput = document.getElementById('filter-logs');
  const logsContainer = document.getElementById('logs-container');
  const evalInput = document.getElementById('eval-input');
  const evalForm = document.getElementById('eval-form');
  const deviceWrapper = document.getElementById('device-wrapper');
  const deviceFrame = document.getElementById('device-frame');
  const deviceNotch = document.getElementById('device-notch');
  const simulatorIframe = document.getElementById('simulator-iframe');
  const touchCursor = document.getElementById('touch-cursor');
  const pagePathEl = document.getElementById('page-path');
  const copyPathBtn = document.getElementById('copy-path-btn');
  const qrModal = document.getElementById('qr-modal');
  const closeQrModalBtn = document.getElementById('close-qr-modal');
  const qrcodeContainer = document.getElementById('qrcode-container');
  const qrUrlEl = document.getElementById('qr-url');
  const copyQrUrlBtn = document.getElementById('copy-qr-url-btn');

  // Populate Device Select
  DEVICES.forEach((d, idx) => {
    const opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = `${d.name} (${d.width}×${d.height})`;
    deviceSelect.appendChild(opt);
  });

  // Apply device size
  function updateDeviceDimensions() {
    let w = currentDevice.width;
    let h = currentDevice.height;
    if (isLandscape) {
      const tmp = w; w = h; h = tmp;
    }
    deviceFrame.style.width = `${w + 24}px`;
    deviceFrame.style.height = `${h + 24}px`;

    if (currentDevice.notch && !isLandscape) {
      deviceNotch.style.display = 'flex';
    } else {
      deviceNotch.style.display = 'none';
    }
    applyScale();
  }

  // Apply zoom scale
  function applyScale() {
    if (scaleSelect.value === 'fit') {
      const canvas = document.querySelector('.canvas');
      const pad = 60;
      const availW = canvas.clientWidth - pad;
      const availH = canvas.clientHeight - pad;
      let w = isLandscape ? currentDevice.height : currentDevice.width;
      let h = isLandscape ? currentDevice.width : currentDevice.height;
      const scaleW = availW / (w + 24);
      const scaleH = availH / (h + 24);
      currentScale = Math.min(1.0, scaleW, scaleH);
    } else {
      currentScale = parseFloat(scaleSelect.value);
    }
    deviceWrapper.style.transform = `scale(${currentScale})`;
  }

  // Event Listeners for Controls
  deviceSelect.addEventListener('change', (e) => {
    currentDevice = DEVICES[parseInt(e.target.value, 10)];
    updateDeviceDimensions();
    // Notify miniprogram of window size change if needed
    sendToSimulator({
      command: 'SYSTEM_INFO_CHANGE',
      inputParams: {
        screenWidth: currentDevice.width,
        screenHeight: currentDevice.height,
        pixelRatio: currentDevice.dpr
      }
    });
  });

  scaleSelect.addEventListener('change', applyScale);
  window.addEventListener('resize', () => {
    if (scaleSelect.value === 'fit') applyScale();
  });

  rotateBtn.addEventListener('click', () => {
    isLandscape = !isLandscape;
    rotateBtn.classList.toggle('active', isLandscape);
    updateDeviceDimensions();
  });

  refreshBtn.addEventListener('click', () => {
    refreshBtn.classList.add('active');
    simulatorIframe.src = simulatorIframe.src;
    setTimeout(() => refreshBtn.classList.remove('active'), 500);
  });

  // Touch Simulation
  touchBtn.addEventListener('click', () => {
    touchEnabled = !touchEnabled;
    touchBtn.classList.toggle('active', touchEnabled);
    touchCursor.style.display = touchEnabled ? 'block' : 'none';
  });

  window.addEventListener('mousemove', (e) => {
    if (!touchEnabled) return;
    touchCursor.style.left = `${e.clientX}px`;
    touchCursor.style.top = `${e.clientY}px`;
  });

  window.addEventListener('mousedown', (e) => {
    if (!touchEnabled) return;
    const ripple = document.createElement('div');
    ripple.className = 'touch-ripple';
    ripple.style.left = `${e.clientX}px`;
    ripple.style.top = `${e.clientY}px`;
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 400);
  });

  // Network Selection
  networkSelect.addEventListener('change', (e) => {
    const net = e.target.value;
    sendToSimulator({
      callbackId: 1,
      command: 'NETWORK_STATUS_CHANGE',
      inputParams: { type: net }
    });
    addLog('info', `Network status changed to: ${net}`);
  });

  // DevTools Toggle
  devtoolsBtn.addEventListener('click', () => {
    devtoolsDrawer.classList.toggle('open');
    devtoolsBtn.classList.toggle('active', devtoolsDrawer.classList.contains('open'));
  });

  closeDevtoolsBtn.addEventListener('click', () => {
    devtoolsDrawer.classList.remove('open');
    devtoolsBtn.classList.remove('active');
  });

  clearLogsBtn.addEventListener('click', () => {
    logs.length = 0;
    renderLogs();
  });

  filterInput.addEventListener('input', renderLogs);

  // DevTools JS Evaluator
  evalForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = evalInput.value.trim();
    if (!code) return;
    addLog('info', `> ${code}`);
    evalInput.value = '';
    try {
      const res = simulatorIframe.contentWindow.eval(code);
      addLog('log', `< ${typeof res === 'object' ? JSON.stringify(res) : String(res)}`);
    } catch (err) {
      addLog('error', `< ${err.message}`);
    }
  });

  // Logs management
  function addLog(level, msg) {
    const time = new Date().toLocaleTimeString();
    logs.push({ level, msg, time });
    if (logs.length > 500) logs.shift();
    renderLogs();
  }

  function renderLogs() {
    const filter = filterInput.value.toLowerCase();
    logsContainer.innerHTML = '';
    const filtered = logs.filter(l => !filter || l.msg.toLowerCase().includes(filter));
    filtered.forEach(l => {
      const entry = document.createElement('div');
      entry.className = 'log-entry';
      entry.innerHTML = `
        <span class="log-time">${l.time}</span>
        <span class="log-level ${l.level}">${l.level}</span>
        <span class="log-msg">${escapeHtml(l.msg)}</span>
      `;
      logsContainer.appendChild(entry);
    });
    logsContainer.scrollTop = logsContainer.scrollHeight;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Communication with simulator iframe
  function sendToSimulator(msg) {
    try {
      simulatorIframe.contentWindow.postMessage(msg, '*');
    } catch (e) {
      console.warn('Failed to send message to simulator:', e);
    }
  }

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data) return;

    // Handle cur-page-res
    if (data.channel === 'cur-page-res' && data.args && data.args[0]) {
      const path = data.args[0];
      pagePathEl.textContent = path;
      pagePathEl.title = path;
    }

    // Handle miniprogram console logs
    if (data.type === 'macle-console') {
      const msg = data.args.join(' ');
      addLog(data.level, msg);
    }
  });

  // Copy Path
  copyPathBtn.addEventListener('click', () => {
    const text = pagePathEl.textContent;
    if (text && text !== '-') {
      navigator.clipboard.writeText(text).then(() => {
        copyPathBtn.title = 'Copied!';
        setTimeout(() => copyPathBtn.title = 'Copy Path', 1500);
      });
    }
  });

  // QR Code Modal
  qrBtn.addEventListener('click', () => {
    qrModal.classList.add('open');
    if (!qrcodeContainer.hasChildNodes() && window.QRCode) {
      new QRCode(qrcodeContainer, {
        text: qrUrlEl.textContent,
        width: 180,
        height: 180,
        colorDark: '#0f172a',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    }
  });

  closeQrModalBtn.addEventListener('click', () => {
    qrModal.classList.remove('open');
  });

  copyQrUrlBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(qrUrlEl.textContent).then(() => {
      copyQrUrlBtn.textContent = 'Copied!';
      setTimeout(() => copyQrUrlBtn.textContent = 'Copy URL', 1500);
    });
  });

  // Setup Live Reload EventSource
  function setupLiveReload() {
    if (!window.EventSource) return;
    try {
      const es = new EventSource('/api/live-reload');
      es.onmessage = (e) => {
        if (e.data === 'reload' && autoReloadEnabled) {
          addLog('info', 'File change detected, auto-reloading simulator...');
          simulatorIframe.src = simulatorIframe.src;
        }
      };
      es.onerror = () => {
        setTimeout(setupLiveReload, 5000);
      };
    } catch (e) {
      console.warn('Live reload unavailable:', e);
    }
  }

  // Initialize
  function init() {
    updateDeviceDimensions();
    setupLiveReload();

    // Fetch project info
    fetch('/api/project-info')
      .then(res => res.json())
      .then(info => {
        projectInfo = info;
        simulatorIframe.src = info.simulatorUrl;
        const fullUrl = new URL(info.simulatorUrl, window.location.href).href;
        qrUrlEl.textContent = fullUrl;
        addLog('info', `Connected to Macle project: ${info.projectName}`);
        addLog('info', `Simulator runtime: ${info.simulatorUrl}`);
      })
      .catch(err => {
        // Fallback: parse query parameters
        const params = new URLSearchParams(window.location.search);
        const proj = params.get('project') || 'dist';
        const simUrl = `/${proj}/root/debug/simulator/`;
        simulatorIframe.src = simUrl;
        qrUrlEl.textContent = new URL(simUrl, window.location.href).href;
        addLog('info', `Loaded simulator at: ${simUrl}`);
      });
  }

  window.addEventListener('DOMContentLoaded', init);
})();
