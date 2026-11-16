import { translateText } from './translations.js';

// Some older game modules render their hints as raw Russian JSX, and game
// servers also send Russian status strings. Localize only the game subtree
// without rewriting or remounting gameplay components / their socket state.
//
// Keep the original value of each text node/attribute so language switching
// works in both directions. React may replace a text node's value after any
// state change; the observer then records that NEW source and translates it.
const textSources = new WeakMap();
const attributeSources = new WeakMap();
const textExcluded = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'PRE', 'CODE']);
const translatedAttributes = ['title', 'aria-label', 'placeholder', 'alt'];

function isExcluded(element) {
  return element?.closest?.('[data-no-game-translation], [translate="no"], [contenteditable="true"]') != null;
}

export function observeGameTranslations(root, language) {
  if (!root || typeof MutationObserver === 'undefined') return () => {};

  const translateNode = (node) => {
    if (!node?.parentElement || textExcluded.has(node.parentElement.tagName) || isExcluded(node.parentElement)) return;
    const value = node.nodeValue || '';
    const previous = textSources.get(node);
    const source = previous && value === previous.output ? previous.source : value;
    // Ignore text-free layout whitespace and numbers. Dynamic player names are
    // never translated unless they happen to equal a known dictionary key.
    if (!/[А-Яа-яЁёІіЇїЄєҐґ]/u.test(source)) {
      if (previous && source !== previous.source) textSources.delete(node);
      return;
    }
    const output = translateText(source, language);
    textSources.set(node, { source, output });
    if (output !== value) node.nodeValue = output;
  };

  const translateAttributes = (element) => {
    if (isExcluded(element)) return;
    const sources = attributeSources.get(element) || new Map();
    for (const name of translatedAttributes) {
      if (!element.hasAttribute(name)) continue;
      const value = element.getAttribute(name) || '';
      const previous = sources.get(name);
      const source = previous && previous.output === value ? previous.source : value;
      if (!/[А-Яа-яЁёІіЇїЄєҐґ]/u.test(source)) continue;
      const output = translateText(source, language);
      sources.set(name, { source, output });
      if (output !== value) element.setAttribute(name, output);
    }
    if (sources.size) attributeSources.set(element, sources);
  };

  const visit = (start) => {
    if (start.nodeType === Node.TEXT_NODE) {
      translateNode(start);
      return;
    }
    if (start.nodeType !== Node.ELEMENT_NODE || isExcluded(start)) return;
    translateAttributes(start);
    const walker = document.createTreeWalker(start, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) translateNode(node);
      else if (node.nodeType === Node.ELEMENT_NODE) translateAttributes(node);
      node = walker.nextNode();
    }
  };

  // Initial pass handles the already-mounted game; childList records all lazy
  // screens and dynamically inserted notifications (including server results).
  visit(root);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') translateNode(mutation.target);
      if (mutation.type === 'attributes') translateAttributes(mutation.target);
      if (mutation.type === 'childList') {
        for (const added of mutation.addedNodes) visit(added);
      }
    }
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: translatedAttributes,
  });
  return () => observer.disconnect();
}
