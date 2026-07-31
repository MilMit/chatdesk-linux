'use strict';
const api = window.chatdeskFind;
const query = document.getElementById('query');
const count = document.getElementById('count');
const matchCase = document.getElementById('matchCase');
let debounce = null;

function run(forward = true, findNext = false) {
  clearTimeout(debounce);
  debounce = setTimeout(() => api.query({ query: query.value, forward, findNext, matchCase: matchCase.checked }), findNext ? 0 : 90);
}
query.addEventListener('input', () => run(true, false));
query.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { event.preventDefault(); run(!event.shiftKey, true); }
  if (event.key === 'Escape') api.close();
});
matchCase.addEventListener('change', () => run(true, false));
document.getElementById('previous').onclick = () => run(false, true);
document.getElementById('next').onclick = () => run(true, true);
document.getElementById('close').onclick = () => api.close();
api.onOpen(({ query: value }) => { query.value = value || ''; query.focus(); query.select(); if (query.value) run(true, false); });
api.onResult((result) => { count.textContent = `${result.activeMatchOrdinal || 0} / ${result.matches || 0}`; });
