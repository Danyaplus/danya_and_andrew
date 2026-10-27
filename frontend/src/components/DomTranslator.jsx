import { useLayoutEffect } from 'react';
import { translateText } from '../lib/translations.js';

// Compatibility bridge for existing game components. Their text can be translated
// without altering the action handlers, React state or the 50 game implementations.
// Newly added games should prefer useTranslation() and explicit language keys.
const originals = new WeakMap();
const attrOriginals = new WeakMap();
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const SKIP = 'script,style,code,pre,textarea,option,[translate="no"],[data-no-translate],.chat-message__text,.chat-message-bubble p,.chat-reply-quote span[translate="no"],.chat-toast__body,.direct-chat-person h2,.friend-row__name strong,.header-profile-button,.account-profile-user-name';

function excluded(element) {
  return Boolean(element?.closest?.(SKIP) || element?.isContentEditable);
}

function translateNode(node, language) {
  if (!node?.parentElement || excluded(node.parentElement)) return;
  const value = node.nodeValue;
  if (!value || !value.trim()) return;
  const previous = originals.get(node);
  const original = previous && previous.rendered === value ? previous.original : value;
  const rendered = translateText(original, language);
  originals.set(node, { original, rendered });
  if (value !== rendered) node.nodeValue = rendered;
}

function translateAttrs(element, language) {
  if (!(element instanceof Element) || excluded(element)) return;
  let stored = attrOriginals.get(element);
  if (!stored) { stored = {}; attrOriginals.set(element, stored); }
  for (const name of ATTRS) {
    if (!element.hasAttribute(name)) continue;
    const value = element.getAttribute(name);
    const previous = stored[name];
    const original = previous && previous.rendered === value ? previous.original : value;
    const rendered = translateText(original, language);
    stored[name] = { original, rendered };
    if (value !== rendered) element.setAttribute(name, rendered);
  }
}

function translateTree(node, language) {
  if (node.nodeType === Node.TEXT_NODE) return translateNode(node, language);
  if (node.nodeType !== Node.ELEMENT_NODE || excluded(node)) return;
  translateAttrs(node, language);
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const child = walker.currentNode;
    if (child.nodeType === Node.TEXT_NODE) translateNode(child, language);
    else if (child.nodeType === Node.ELEMENT_NODE) translateAttrs(child, language);
  }
}

export function DomTranslator({ language }) {
  useLayoutEffect(() => {
    const root = document.body;
    if (!root) return undefined;
    translateTree(root, language);
    const observer = new MutationObserver((mutations) => {
      for (const change of mutations) {
        if (change.type === 'characterData') translateNode(change.target, language);
        else if (change.type === 'attributes') translateAttrs(change.target, language);
        else for (const node of change.addedNodes) translateTree(node, language);
      }
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    return () => observer.disconnect();
  }, [language]);
  return null;
}
