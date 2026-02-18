// Log Window Renderer
// Handles the separate log viewer window

const { ipcRenderer } = require('electron');

// DOM Elements
const logLevelFilter = document.getElementById('logLevelFilter');
const logSearch = document.getElementById('logSearch');
const logEntries = document.getElementById('logEntries');
const logStats = document.getElementById('logStats');
const exportBtn = document.getElementById('exportBtn');
const clearBtn = document.getElementById('clearBtn');
const statusText = document.getElementById('statusText');
const autoScrollCheckbox = document.getElementById('autoScroll');

// State
let logs = [];
let maxLogEntries = 1000;

// Initialize
console.log('Log window initialized');

// Request initial logs from main process
ipcRenderer.send('log-window-ready');

// Listen for log updates from main
ipcRenderer.on('log-update', (event, logEntry) => {
  addLogEntry(logEntry);
});

ipcRenderer.on('log-batch', (event, batchLogs) => {
  logs = batchLogs;
  renderLogs();
});

ipcRenderer.on('log-cleared', () => {
  logs = [];
  renderLogs();
  showStatus('Logs cleared');
});

// Event Listeners
logLevelFilter.addEventListener('change', renderLogs);
logSearch.addEventListener('input', debounce(renderLogs, 200));

exportBtn.addEventListener('click', exportLogs);

clearBtn.addEventListener('click', () => {
  if (confirm('Are you sure you want to clear all logs?')) {
    ipcRenderer.send('clear-logs');
  }
});

// Handle window controls
ipcRenderer.on('window-focus', () => {
  document.body.classList.add('focused');
});

ipcRenderer.on('window-blur', () => {
  document.body.classList.remove('focused');
});

// Functions
function addLogEntry(entry) {
  logs.push(entry);
  
  // Limit max entries
  if (logs.length > maxLogEntries) {
    logs.shift();
  }
  
  // Only render if passes filter
  if (shouldShowEntry(entry)) {
    appendLogEntry(entry);
    updateStats();
    
    if (autoScrollCheckbox.checked) {
      scrollToBottom();
    }
  } else {
    updateStats();
  }
}

function shouldShowEntry(entry) {
  const levelFilter = logLevelFilter.value;
  const searchTerm = logSearch.value.toLowerCase();
  
  if (levelFilter && entry.level !== levelFilter) {
    return false;
  }
  
  if (searchTerm) {
    const messageMatch = entry.message.toLowerCase().includes(searchTerm);
    const detailsMatch = entry.details && JSON.stringify(entry.details).toLowerCase().includes(searchTerm);
    if (!messageMatch && !detailsMatch) {
      return false;
    }
  }
  
  return true;
}

function renderLogs() {
  const filteredLogs = getFilteredLogs();
  
  if (filteredLogs.length === 0) {
    logEntries.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <p>No logs match your filter.</p>
      </div>
    `;
  } else {
    logEntries.innerHTML = filteredLogs.map(entry => createLogEntryHTML(entry)).join('');
  }
  
  updateStats();
  
  if (autoScrollCheckbox.checked) {
    scrollToBottom();
  }
}

function appendLogEntry(entry) {
  const emptyState = logEntries.querySelector('.empty-state');
  if (emptyState) {
    logEntries.innerHTML = '';
  }
  
  const html = createLogEntryHTML(entry);
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  const newEntry = tempDiv.firstElementChild;
  
  logEntries.appendChild(newEntry);
  
  // Remove old entries if too many
  while (logEntries.children.length > 100) {
    logEntries.removeChild(logEntries.firstChild);
  }
}

function createLogEntryHTML(entry) {
  const levelColor = entry.levelColor || '#7d8590';
  let detailsHtml = '';
  let stackHtml = '';
  
  if (entry.details && Object.keys(entry.details).length > 0) {
    detailsHtml = `
      <div class="log-details">
        <pre>${escapeHtml(JSON.stringify(entry.details, null, 2))}</pre>
      </div>
    `;
  }
  
  if (entry.stackTrace) {
    stackHtml = `
      <div class="log-stack">
        <pre>${escapeHtml(entry.stackTrace)}</pre>
      </div>
    `;
  }
  
  const timestamp = entry.timestampLocal || new Date(entry.timestamp).toLocaleString();
  
  return `
    <div class="log-entry" data-id="${entry.id}" data-level="${entry.level}">
      <div class="log-timestamp">${timestamp}</div>
      <div class="log-entry-content">
        <span class="log-level" style="background: ${levelColor}20; color: ${levelColor}; border: 1px solid ${levelColor}40;">
          ${entry.level}
        </span>
        <span class="log-message">${escapeHtml(entry.message)}</span>
        ${detailsHtml}
        ${stackHtml}
      </div>
    </div>
  `;
}

function getFilteredLogs() {
  const levelFilter = logLevelFilter.value;
  const searchTerm = logSearch.value.toLowerCase();
  
  return logs.filter(log => {
    if (levelFilter && log.level !== levelFilter) {
      return false;
    }
    
    if (searchTerm) {
      const messageMatch = log.message.toLowerCase().includes(searchTerm);
      const detailsMatch = log.details && JSON.stringify(log.details).toLowerCase().includes(searchTerm);
      if (!messageMatch && !detailsMatch) {
        return false;
      }
    }
    
    return true;
  });
}

function updateStats() {
  const filtered = getFilteredLogs();
  const total = logs.length;
  const showing = filtered.length;
  
  if (showing === total) {
    logStats.textContent = `${total} entries`;
  } else {
    logStats.textContent = `${showing} of ${total} entries`;
  }
  
  // Update status bar with last log time
  if (logs.length > 0) {
    const lastLog = logs[logs.length - 1];
    const time = new Date(lastLog.timestamp).toLocaleTimeString();
    showStatus(`Last log: ${time}`);
  }
}

function scrollToBottom() {
  logEntries.scrollTop = logEntries.scrollHeight;
}

function showStatus(message) {
  statusText.textContent = message;
}

function exportLogs() {
  const format = 'text'; // Could offer JSON option in future
  
  let content;
  let extension;
  let mimeType;
  
  if (format === 'json') {
    content = JSON.stringify(logs, null, 2);
    extension = 'json';
    mimeType = 'application/json';
  } else {
    content = logs.map(log => {
      let text = `[${log.timestamp}] [${log.level}] ${log.message}`;
      if (log.details && Object.keys(log.details).length > 0) {
        text += `\n  Details: ${JSON.stringify(log.details, null, 2)}`;
      }
      if (log.error) {
        text += `\n  Error: ${log.error.message}`;
        if (log.stackTrace) {
          text += `\n  Stack: ${log.stackTrace}`;
        }
      }
      return text;
    }).join('\n\n');
    extension = 'txt';
    mimeType = 'text/plain';
  }
  
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lirum-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showStatus('Logs exported');
  
  // Notify main process
  ipcRenderer.send('logs-exported');
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Escape to close window
  if (e.key === 'Escape') {
    ipcRenderer.send('close-log-window');
  }
  
  // Ctrl/Cmd + F to focus search
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault();
    logSearch.focus();
  }
  
  // Ctrl/Cmd + S to export
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    exportLogs();
  }
});

// Handle window resize for scroll position
let scrollTimeout;
window.addEventListener('resize', () => {
  clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    if (autoScrollCheckbox.checked) {
      scrollToBottom();
    }
  }, 100);
});

console.log('Log window renderer loaded');
