const api = window.chatdeskActivity;
if (!api || api.bridgeVersion !== 1) throw new Error('ChatDesk activity bridge is unavailable.');

const connection = document.getElementById('connection');
const downloads = document.getElementById('downloads');
const moreDownloads = document.getElementById('moreDownloads');
const toast = document.getElementById('toast');
let language = 'en';

const labels = {
  en: { connected: 'Connected', problem: 'Connection problem', connecting: 'Connecting', retry: 'Retry', details: 'Details', of: 'of', complete: 'Download complete', cancelled: 'Download cancelled', interrupted: 'Download interrupted', resume: 'Resume', pause: 'Pause', cancel: 'Cancel', open: 'Open', folder: 'Folder', dismiss: 'Dismiss', more: 'more — open Downloads' },
  fa: { connected: 'متصل شد', problem: 'مشکل اتصال', connecting: 'در حال اتصال', retry: 'تلاش دوباره', details: 'جزئیات', of: 'از', complete: 'دانلود کامل شد', cancelled: 'دانلود لغو شد', interrupted: 'دانلود متوقف شد', resume: 'ادامه', pause: 'توقف موقت', cancel: 'لغو', open: 'باز کردن', folder: 'پوشه', dismiss: 'بستن', more: 'مورد دیگر — باز کردن دانلودها' },
};
const l = (key) => labels[language]?.[key] || labels.en[key] || key;

function formatBytes(bytes) {
  const number = Number(bytes) || 0;
  if (number < 1024) return `${number} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = number / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[index]}`;
}

function command(type, payload = {}) { api.send('activity:command', { type, ...payload }); }
function button(label, onClick, className = '') {
  const element = document.createElement('button');
  element.type = 'button'; element.textContent = label; element.className = className; element.onclick = onClick;
  return element;
}

function renderConnection(item) {
  connection.replaceChildren();
  if (!item) { connection.classList.add('hidden'); return; }
  connection.className = `connection-card ${item.state}`;
  const icon = document.createElement('span'); icon.className = 'connection-icon';
  icon.textContent = item.state === 'connected' ? '✓' : item.state === 'offline' ? '!' : '•';
  const copy = document.createElement('div');
  const title = document.createElement('b');
  title.textContent = item.state === 'connected' ? l('connected') : item.state === 'offline' ? l('problem') : l('connecting');
  const text = document.createElement('small'); text.textContent = item.message || '';
  copy.append(title, text); connection.append(icon, copy);
  if (item.state === 'offline') {
    const actions = document.createElement('div'); actions.className = 'inline-actions';
    actions.append(button(l('retry'), () => command('retry'), 'primary-mini'), button(l('details'), () => command('diagnostics')));
    connection.append(actions);
  }
}

function renderDownloads(items = []) {
  downloads.replaceChildren();
  for (const item of items) {
    const card = document.createElement('article'); card.className = `download-card ${item.state || 'progressing'}`; card.dataset.id = item.id;
    const top = document.createElement('div'); top.className = 'download-top';
    const icon = document.createElement('span'); icon.className = 'download-icon';
    icon.textContent = item.state === 'completed' ? '✓' : item.state === 'cancelled' ? '×' : item.state === 'interrupted' ? '!' : '↓';
    const nameWrap = document.createElement('div'); nameWrap.className = 'download-copy';
    const name = document.createElement('b'); name.textContent = item.filename;
    const status = document.createElement('small');
    const amount = item.total ? `${formatBytes(item.received)} ${l('of')} ${formatBytes(item.total)}` : formatBytes(item.received);
    const speed = item.state === 'progressing' && item.speed ? ` · ${formatBytes(item.speed)}/s` : '';
    status.textContent = item.state === 'completed' ? l('complete') : item.state === 'cancelled' ? l('cancelled') : item.state === 'interrupted' ? l('interrupted') : `${amount}${speed}`;
    nameWrap.append(name, status);
    const percent = document.createElement('strong'); percent.textContent = item.state === 'completed' ? '100%' : `${item.percent || 0}%`;
    top.append(icon, nameWrap, percent);
    const progress = document.createElement('div'); progress.className = 'progress-track';
    const bar = document.createElement('i'); bar.style.width = `${item.state === 'completed' ? 100 : item.percent || 0}%`;
    if (!item.total && item.state === 'progressing') bar.classList.add('indeterminate');
    progress.append(bar);
    const actions = document.createElement('div'); actions.className = 'card-actions';
    if (item.state === 'progressing') {
      actions.append(button(item.paused ? l('resume') : l('pause'), () => command('download', { id: item.id, action: item.paused ? 'resume' : 'pause' })));
      actions.append(button(l('cancel'), () => command('download', { id: item.id, action: 'cancel' }), 'danger-mini'));
    }
    if (item.state === 'completed' && item.path) {
      actions.append(button(l('open'), () => command('download', { id: item.id, action: 'open' }), 'primary-mini'));
      actions.append(button(l('folder'), () => command('download', { id: item.id, action: 'folder' })));
    }
    if (item.state !== 'progressing') actions.append(button(l('dismiss'), () => command('dismiss-download', { id: item.id })));
    card.append(top, progress, actions); downloads.append(card);
  }
}

function renderToast(item) {
  toast.replaceChildren();
  if (!item) { toast.className = 'toast-card hidden'; return; }
  toast.className = `toast-card ${item.type || 'info'}`;
  const icon = document.createElement('span'); icon.className = 'toast-icon';
  icon.textContent = item.type === 'success' ? '✓' : item.type === 'error' ? '!' : 'i';
  const message = document.createElement('p'); message.textContent = item.message;
  toast.append(icon, message);
  if (item.actionLabel && item.action) toast.append(button(item.actionLabel, () => command('toast-action', { action: item.action }), 'primary-mini'));
  toast.append(button('×', () => command('dismiss-toast'), 'close-mini'));
}

api.on('activity:state', (state) => {
  language = state.language === 'fa' ? 'fa' : 'en';
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'fa' ? 'rtl' : 'ltr';
  document.body.classList.toggle('no-animations', state.animations === false);
  document.body.classList.toggle('light', state.dark === false);
  const colors = { blue: '#4f8cff', violet: '#8b5cf6', emerald: '#10b981', amber: '#f59e0b', rose: '#f43f5e', cyan: '#06b6d4' };
  document.documentElement.style.setProperty('--accent', colors[state.profile?.color] || '#6f92ff');
  renderConnection(state.connection);
  renderDownloads(state.downloads || []);
  renderToast(state.toast);
  moreDownloads.classList.toggle('hidden', !state.hiddenDownloadCount);
  moreDownloads.textContent = state.hiddenDownloadCount ? `+${state.hiddenDownloadCount} ${l('more')}` : '';
  moreDownloads.onclick = () => command('open-downloads');
});
