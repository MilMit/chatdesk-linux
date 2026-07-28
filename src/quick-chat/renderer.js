const $ = (id) => document.getElementById(id);
let bootstrap = null;
let language = 'en';

const copy = {
  en: {
    title: 'Quick Capture', subtitle: 'Prepare text locally, then paste it into ChatGPT.', selection: 'Use Selection', clipboard: 'Use Clipboard',
    none: 'No prompt template', profile: 'Profile', destination: 'Destination', newChat: 'New chat', current: 'Current chat', window: 'New profile window',
    submit: 'Copy & Open', help: 'The prompt is copied locally. Press Ctrl+V in ChatGPT to paste it.', empty: 'Enter or capture some text first.', failed: 'Could not prepare the capture.',
  },
  fa: {
    title: 'ثبت سریع', subtitle: 'متن را محلی آماده کنید و سپس در ChatGPT بچسبانید.', selection: 'استفاده از متن انتخاب‌شده', clipboard: 'استفاده از کلیپ‌بورد',
    none: 'بدون قالب آماده', profile: 'پروفایل', destination: 'مقصد', newChat: 'گفت‌وگوی جدید', current: 'گفت‌وگوی فعلی', window: 'پنجره جدا برای پروفایل',
    submit: 'کپی و باز کردن', help: 'متن فقط روی دستگاه کپی می‌شود؛ در ChatGPT کلید Ctrl+V را بزنید.', empty: 'اول متنی وارد یا دریافت کنید.', failed: 'آماده‌سازی متن انجام نشد.',
  },
};
function tx(key) { return copy[language]?.[key] || copy.en[key] || key; }
function showError(message) { $('errorText').textContent = message; $('errorText').classList.remove('hidden'); }
function clearError() { $('errorText').classList.add('hidden'); }

function applyLanguage(next) {
  language = next === 'fa' ? 'fa' : 'en';
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'fa' ? 'rtl' : 'ltr';
  $('title').textContent = tx('title'); $('subtitle').textContent = tx('subtitle');
  $('selectionButton').textContent = tx('selection'); $('clipboardButton').textContent = tx('clipboard');
  $('profileLabel').textContent = tx('profile'); $('modeLabel').textContent = tx('destination');
  $('submitButton').textContent = tx('submit'); $('helpText').textContent = tx('help');
  $('destinationSelect').options[0].textContent = tx('newChat');
  $('destinationSelect').options[1].textContent = tx('current');
  $('destinationSelect').options[2].textContent = tx('window');
  $('promptSelect').options[0].textContent = tx('none');
}

function renderBootstrap(data) {
  bootstrap = data;
  applyLanguage(data.language);
  $('profileSelect').replaceChildren();
  for (const profile of data.profiles.profiles) {
    const option = document.createElement('option'); option.value = profile.id; option.textContent = `${profile.glyph || '●'} ${profile.name}`;
    option.selected = profile.id === (data.requestedProfileId || data.profiles.activeId); $('profileSelect').append(option);
  }
  $('promptSelect').replaceChildren(new Option(tx('none'), ''));
  for (const item of data.prompts) $('promptSelect').append(new Option(`${item.favorite ? '★ ' : ''}${item.title}`, item.id));
  if (data.selection) $('prompt').value = data.selection;
  else if (data.clipboard) $('prompt').value = data.clipboard;
  $('prompt').focus(); $('prompt').select();
}

async function capture(source) {
  clearError();
  try {
    const result = await window.quickChat.capture(source);
    if (result?.text) { $('prompt').value = result.text; $('prompt').focus(); }
    else showError(tx('empty'));
  } catch (error) { showError(error?.message || tx('failed')); }
}

$('selectionButton').onclick = () => capture('selection');
$('clipboardButton').onclick = () => capture('clipboard');
$('closeButton').onclick = () => window.quickChat.close();
$('promptSelect').onchange = () => {
  const prompt = bootstrap?.prompts.find((item) => item.id === $('promptSelect').value);
  if (!prompt) return;
  $('prompt').value = prompt.preview || prompt.template;
  $('prompt').focus();
};
$('submitButton').onclick = async () => {
  clearError(); $('submitButton').disabled = true;
  try {
    const result = await window.quickChat.submit({
      text: $('prompt').value,
      promptId: $('promptSelect').value,
      profileId: $('profileSelect').value,
      destination: $('destinationSelect').value,
    });
    if (!result?.ok) showError(result?.message || tx('empty'));
    else $('prompt').value = '';
  } catch (error) { showError(error?.message || tx('failed')); }
  finally { $('submitButton').disabled = false; }
};

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.quickChat.close();
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') $('submitButton').click();
});

window.quickChat.bootstrap().then(renderBootstrap).catch((error) => showError(error?.message || tx('failed')));
