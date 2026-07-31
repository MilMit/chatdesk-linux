import { clipboard, Menu, shell } from 'electron';
import { classifyUrl } from './navigation-policy.js';

import { cleanContextText as cleanText, quoteText, codeBlockText, markdownText, cleanTrackingUrl } from './context-menu-utils.js';

export { quoteText, codeBlockText, markdownText, cleanTrackingUrl };

function separator(template) {
  if (template.length && template.at(-1)?.type !== 'separator') template.push({ type: 'separator' });
}

function enabledEditFlag(params, name, fallback = true) {
  return params.editFlags && Object.hasOwn(params.editFlags, name) ? params.editFlags[name] === true : fallback;
}

function safeWrite(text, onToast) {
  const value = cleanText(text);
  if (!value) return false;
  clipboard.writeText(value);
  onToast?.('Copied to clipboard.', 'success');
  return true;
}

function buildPromptSubmenu(prompts, selectedText, onApplyPrompt) {
  return (Array.isArray(prompts) ? prompts : []).slice(0, 30).map((prompt) => ({
    label: prompt.favorite ? `★ ${prompt.title}` : prompt.title,
    click: () => onApplyPrompt?.(prompt.id, selectedText),
  }));
}

export function installNativeContextMenu(contents, options = {}) {
  if (!contents || contents.isDestroyed()) return () => {};

  const handler = (_event, params) => {
    if (options.isEnabled?.() === false) return;
    const template = [];
    const selectedText = cleanText(params.selectionText);
    const editable = params.isEditable === true;
    const prompts = options.getPrompts?.() ?? [];
    const profiles = options.getProfiles?.() ?? [];

    if (params.misspelledWord) {
      for (const suggestion of (params.dictionarySuggestions || []).slice(0, 5)) {
        template.push({ label: suggestion, click: () => contents.replaceMisspelling(suggestion) });
      }
      if ((params.dictionarySuggestions || []).length) separator(template);
      template.push({
        label: `Add “${params.misspelledWord}” to dictionary`,
        click: () => contents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      });
      separator(template);
    }

    if (editable) {
      template.push(
        { role: 'undo', enabled: enabledEditFlag(params, 'canUndo') },
        { role: 'redo', enabled: enabledEditFlag(params, 'canRedo') },
        { type: 'separator' },
        { role: 'cut', enabled: enabledEditFlag(params, 'canCut') },
        { role: 'copy', enabled: enabledEditFlag(params, 'canCopy', Boolean(selectedText)) },
        { role: 'paste', enabled: enabledEditFlag(params, 'canPaste') },
        { label: 'Paste as plain text', enabled: enabledEditFlag(params, 'canPaste'), click: () => contents.pasteAndMatchStyle() },
        { label: 'Paste as quote', enabled: enabledEditFlag(params, 'canPaste'), click: () => void contents.insertText(quoteText(clipboard.readText())) },
        { label: 'Paste as code block', enabled: enabledEditFlag(params, 'canPaste'), click: () => void contents.insertText(codeBlockText(clipboard.readText())) },
        { role: 'delete', enabled: enabledEditFlag(params, 'canDelete') },
        { type: 'separator' },
        { role: 'selectAll', enabled: enabledEditFlag(params, 'canSelectAll') },
      );
    } else if (selectedText) {
      template.push(
        { role: 'copy' },
        { label: 'Copy as plain text', click: () => safeWrite(selectedText, options.onToast) },
        { label: 'Copy as Markdown', click: () => safeWrite(markdownText(selectedText, params), options.onToast) },
        { label: 'Copy as quote', click: () => safeWrite(quoteText(selectedText), options.onToast) },
        { label: 'Copy as code block', click: () => safeWrite(codeBlockText(selectedText), options.onToast) },
      );
      separator(template);
      template.push(
        { label: 'Open in Quick Capture', click: () => options.onQuickCapture?.(selectedText) },
        {
          label: 'Use with a Prompt…',
          enabled: prompts.length > 0,
          submenu: buildPromptSubmenu(prompts, selectedText, options.onApplyPrompt),
        },
        { label: 'Add to private capture history', click: () => options.onAddCapture?.(selectedText) },
        {
          label: 'Search selected text',
          click: () => void shell.openExternal(`https://www.google.com/search?q=${encodeURIComponent(selectedText.slice(0, 500))}`),
        },
      );
    }

    if (params.linkURL) {
      separator(template);
      const classification = classifyUrl(params.linkURL);
      template.push(
        {
          label: 'Open link',
          enabled: classification !== 'blocked',
          click: () => options.onOpenLink?.(params.linkURL, { disposition: 'current' }),
        },
        {
          label: 'Open in system browser',
          enabled: classification === 'external' || classification === 'app' || classification === 'auth',
          click: () => void shell.openExternal(params.linkURL),
        },
        {
          label: 'Open in profile window',
          enabled: profiles.length > 0,
          submenu: profiles.map((profile) => ({
            label: profile.name,
            click: () => options.onOpenProfileWindow?.(profile.id, params.linkURL),
          })),
        },
        { label: 'Copy link address', click: () => safeWrite(params.linkURL, options.onToast) },
        { label: 'Copy clean link', click: () => safeWrite(cleanTrackingUrl(params.linkURL), options.onToast) },
        { label: 'Copy link text', enabled: Boolean(params.linkText), click: () => safeWrite(params.linkText, options.onToast) },
      );
    }

    if (params.mediaType === 'image' && params.srcURL) {
      separator(template);
      template.push(
        { label: 'Copy image', click: () => contents.copyImageAt(params.x, params.y) },
        { label: 'Copy image address', click: () => safeWrite(params.srcURL, options.onToast) },
        { label: 'Save image as…', click: () => contents.downloadURL(params.srcURL) },
        { label: 'Open image in browser', click: () => void shell.openExternal(params.srcURL) },
      );
    }

    separator(template);
    template.push({
      label: 'ChatDesk',
      submenu: [
        { label: 'Quick Capture', click: () => options.onQuickCapture?.(selectedText) },
        {
          label: 'Apply Prompt',
          enabled: prompts.length > 0 && Boolean(selectedText),
          submenu: buildPromptSubmenu(prompts, selectedText, options.onApplyPrompt),
        },
        { label: 'Add to capture history', enabled: Boolean(selectedText), click: () => options.onAddCapture?.(selectedText) },
        { label: 'Open Command Palette', click: () => options.onCommandPalette?.() },
        { label: 'Report a Problem', click: () => options.onReportProblem?.() },
      ],
    });

    const normalized = template.filter((item, index, list) => !(
      item.type === 'separator' && (index === 0 || index === list.length - 1 || list[index - 1]?.type === 'separator')
    ));
    if (!normalized.length) return;
    Menu.buildFromTemplate(normalized).popup({ window: options.getWindow?.() || undefined, frame: params.frame });
  };

  contents.on('context-menu', handler);
  return () => contents.removeListener('context-menu', handler);
}
