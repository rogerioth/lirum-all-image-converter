const { ipcRenderer } = require('electron');

const infoContent = document.getElementById('infoContent');
const infoStatus = document.getElementById('infoStatus');
const infoTimestamp = document.getElementById('infoTimestamp');
const infoFileName = document.getElementById('infoFileName');
const infoSearch = document.getElementById('infoSearch');

let currentPayload = null;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildRow(label, value, rawValue = null) {
  const rawHtml = rawValue ? `<div class="info-raw">Raw: ${escapeHtml(rawValue)}</div>` : '';
  return `
    <div class="info-row">
      <div class="info-label">${escapeHtml(label)}</div>
      <div class="info-value">
        <div>${escapeHtml(value)}</div>
        ${rawHtml}
      </div>
    </div>
  `;
}

function renderSection(title, items) {
  if (!items || items.length === 0) return '';
  const rows = items.map((item) => buildRow(item.label, item.value, item.raw)).join('');
  return `
    <section class="info-section">
      <div class="section-header">
        <h2>${escapeHtml(title)}</h2>
        <span class="section-count">${items.length} fields</span>
      </div>
      <div class="info-table">
        ${rows}
      </div>
    </section>
  `;
}

function emptyState(message) {
  return `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="16" x2="12" y2="12"/>
        <line x1="12" y1="8" x2="12.01" y2="8"/>
      </svg>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function filterItems(items, term) {
  if (!term) return items;
  const lower = term.toLowerCase();
  return items.filter((item) => {
    return (
      item.label.toLowerCase().includes(lower) ||
      item.value.toLowerCase().includes(lower) ||
      (item.raw && item.raw.toLowerCase().includes(lower))
    );
  });
}

function formatFileSection(file) {
  if (!file) return [];
  const items = [];
  const sizeLine = file.sizeLabel && file.sizeBytes !== null && file.sizeBytes !== undefined
    ? `${file.sizeLabel} (${file.sizeBytes} bytes)`
    : file.sizeLabel || 'Unknown';

  items.push({ label: 'Name', value: file.name || 'Unknown' });
  items.push({ label: 'Path', value: file.path || 'Not available' });
  items.push({ label: 'Directory', value: file.directory || 'Not available' });
  items.push({ label: 'Extension', value: file.extension || 'Unknown' });
  items.push({ label: 'Size', value: sizeLine });
  items.push({ label: 'MIME Type', value: file.mimeType || 'Unknown' });
  if (file.lastModified) {
    items.push({ label: 'Last Modified (File)', value: file.lastModified });
  }
  if (file.createdAt) {
    items.push({ label: 'Created', value: file.createdAt });
  }
  if (file.modifiedAt) {
    items.push({ label: 'Modified', value: file.modifiedAt });
  }
  if (file.accessedAt) {
    items.push({ label: 'Accessed', value: file.accessedAt });
  }
  if (file.permissions) {
    items.push({ label: 'Permissions', value: file.permissions });
  }

  return items;
}

function formatImageSection(image) {
  if (!image) return [];
  const items = [];
  if (image.width && image.height) {
    items.push({ label: 'Dimensions', value: `${image.width} x ${image.height} px` });
  }
  if (image.megapixels) {
    items.push({ label: 'Megapixels', value: `${image.megapixels} MP` });
  }
  if (image.aspectRatio) {
    items.push({ label: 'Aspect Ratio', value: image.aspectRatio });
  }
  return items;
}

function formatMetadataSections(entries) {
  const grouped = new Map();
  entries.forEach((entry) => {
    const section = entry.section || 'General';
    if (!grouped.has(section)) {
      grouped.set(section, []);
    }
    grouped.get(section).push(entry);
  });

  const sortedSections = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b));
  return sortedSections.map((section) => {
    const items = grouped.get(section).map((entry) => ({
      label: entry.name,
      value: entry.value || '',
      raw: entry.raw || null
    }));
    return { title: section, items };
  });
}

function render(payload) {
  if (!payload) {
    infoContent.innerHTML = emptyState('No metadata loaded yet.');
    infoStatus.textContent = 'Waiting for metadata...';
    infoTimestamp.textContent = '';
    infoFileName.textContent = 'No image loaded';
    return;
  }

  const searchTerm = infoSearch.value.trim();
  infoFileName.textContent = payload.file?.name || 'Image Info';
  infoTimestamp.textContent = payload.generatedAt ? new Date(payload.generatedAt).toLocaleString() : '';

  const fileItems = filterItems(formatFileSection(payload.file), searchTerm);
  const imageItems = filterItems(formatImageSection(payload.image), searchTerm);

  let metadataItems = payload.metadata?.entries || [];
  if (searchTerm) {
    const lower = searchTerm.toLowerCase();
    metadataItems = metadataItems.filter((entry) => {
      return (
        entry.name.toLowerCase().includes(lower) ||
        (entry.value || '').toLowerCase().includes(lower) ||
        (entry.raw || '').toLowerCase().includes(lower) ||
        (entry.section || '').toLowerCase().includes(lower)
      );
    });
  }

  const metadataSections = formatMetadataSections(metadataItems);

  const sections = [];
  const fileSection = renderSection('File', fileItems);
  if (fileSection) sections.push(fileSection);
  const imageSection = renderSection('Image', imageItems);
  if (imageSection) sections.push(imageSection);

  if (payload.metadataError) {
    sections.push(renderSection('Metadata', [
      { label: 'Status', value: payload.metadataError }
    ]));
  } else if (metadataSections.length === 0) {
    sections.push(renderSection('Metadata', [
      { label: 'Status', value: 'No metadata tags were found.' }
    ]));
  } else {
    metadataSections.forEach((section) => {
      const sectionHtml = renderSection(section.title, section.items);
      if (sectionHtml) sections.push(sectionHtml);
    });
  }

  infoContent.innerHTML = sections.join('') || emptyState('No metadata matched your filter.');

  const totalTags = payload.metadata?.total || 0;
  const filteredTags = metadataItems.length;
  infoStatus.textContent = payload.metadataError
    ? 'Metadata unavailable'
    : `Metadata tags: ${filteredTags}${searchTerm ? ` / ${totalTags}` : ''}`;
}

infoSearch.addEventListener('input', () => {
  render(currentPayload);
});

ipcRenderer.on('info-window-data', (event, payload) => {
  currentPayload = payload;
  render(currentPayload);
});

document.addEventListener('DOMContentLoaded', () => {
  ipcRenderer.send('info-window-ready');
});
