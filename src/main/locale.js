export const SUPPORTED_LANGUAGES = Object.freeze(['en', 'fa']);

export function resolveLanguage(preference = 'system', systemLocale = 'en') {
  if (SUPPORTED_LANGUAGES.includes(preference)) return preference;
  return String(systemLocale || 'en').toLowerCase().startsWith('fa') ? 'fa' : 'en';
}

const EN = Object.freeze({
  file: 'File', view: 'View', tools: 'Tools', help: 'Help',
  newChat: 'New Chat', reload: 'Reload ChatGPT', downloads: 'Downloads', back: 'Back to ChatGPT',
  zoomIn: 'Zoom In', zoomOut: 'Zoom Out', resetZoom: 'Reset Zoom', activity: 'Show Activity Center',
  fullscreen: 'Toggle Full Screen', alwaysOnTop: 'Always on Top', quickChat: 'Quick Chat',
  commandPalette: 'Command Palette', settings: 'Settings', profiles: 'Profiles', diagnostics: 'Diagnostics',
  manageProfiles: 'Manage Profiles…', restartNormal: 'Restart Normally', restartSafe: 'Restart in Safe Mode',
  checkUpdates: 'Check for Updates', about: 'About ChatDesk Linux', github: 'GitHub', issue: 'Report an Issue',
  openChatDesk: 'Open ChatDesk', quit: 'Quit', clipboardFailed: 'Could not copy to the clipboard.',
  promptCopied: 'Prompt copied. Paste it into ChatGPT with Ctrl+V.', diagnosticsCopied: 'Diagnostics copied.',
  switchedProfile: 'Switched to {name}.', updateAvailable: 'ChatDesk {version} is available.',
  ready: 'ChatGPT is ready.', connecting: 'Connecting to ChatGPT…', loading: 'Loading ChatGPT…',
});

const FA = Object.freeze({
  file: 'فایل', view: 'نمایش', tools: 'ابزارها', help: 'راهنما',
  newChat: 'گفت‌وگوی جدید', reload: 'بارگذاری دوباره ChatGPT', downloads: 'دانلودها', back: 'بازگشت به ChatGPT',
  zoomIn: 'بزرگ‌نمایی', zoomOut: 'کوچک‌نمایی', resetZoom: 'بازنشانی بزرگ‌نمایی', activity: 'نمایش مرکز فعالیت',
  fullscreen: 'تمام‌صفحه', alwaysOnTop: 'همیشه روی پنجره‌ها', quickChat: 'گفت‌وگوی سریع',
  commandPalette: 'فهرست فرمان‌ها', settings: 'تنظیمات', profiles: 'پروفایل‌ها', diagnostics: 'عیب‌یابی',
  manageProfiles: 'مدیریت پروفایل‌ها…', restartNormal: 'راه‌اندازی عادی', restartSafe: 'راه‌اندازی در حالت امن',
  checkUpdates: 'بررسی به‌روزرسانی', about: 'درباره ChatDesk Linux', github: 'گیت‌هاب', issue: 'گزارش مشکل',
  openChatDesk: 'بازکردن ChatDesk', quit: 'خروج', clipboardFailed: 'کپی در کلیپ‌بورد انجام نشد.',
  promptCopied: 'متن کپی شد. با Ctrl+V آن را داخل ChatGPT بچسبانید.', diagnosticsCopied: 'اطلاعات عیب‌یابی کپی شد.',
  switchedProfile: 'پروفایل به {name} تغییر کرد.', updateAvailable: 'نسخه {version} چت‌دسک آماده است.',
  ready: 'ChatGPT آماده است.', connecting: 'در حال اتصال به ChatGPT…', loading: 'در حال بارگذاری ChatGPT…',
});

export function stringsFor(language = 'en') {
  const dictionary = language === 'fa' ? FA : EN;
  return (key, variables = {}) => {
    let value = dictionary[key] ?? EN[key] ?? key;
    for (const [name, replacement] of Object.entries(variables)) {
      value = value.replaceAll(`{${name}}`, String(replacement));
    }
    return value;
  };
}
