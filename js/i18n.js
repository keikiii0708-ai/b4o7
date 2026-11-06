import { en } from "./locales/en.js";
import { zh } from "./locales/zh.js";

/**
 * Device language preference.
 * Stored only in localStorage under b4o7-lang ("en" or "zh").
 * It is not part of the IndexedDB record, backup, or export.
 * Missing, empty, or unknown values stay English.
 * The phone locale is never read.
 */
export const LOCALE_STORAGE_KEY = "b4o7-lang";

const CATALOGS = { en, zh };
const listeners = new Set();
let sessionLocale = null;

export function messageKeys(locale = "en") {
  const keys = [];
  walk(CATALOGS[locale] || CATALOGS.en, "", keys);
  return keys;
}

function walk(node, prefix, keys) {
  if (typeof node === "string" || isPlural(node)) {
    keys.push(prefix);
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    walk(value, prefix ? `${prefix}.${key}` : key, keys);
  }
}

function isPlural(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => key === "one" || key === "other");
}

function dig(root, key) {
  let node = root;
  for (const part of String(key).split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = node[part];
  }
  return node;
}

function fill(template, params) {
  return template.replace(/\{(\w+)\}/g, (match, name) => (
    params[name] == null ? match : String(params[name])
  ));
}

function render(template, params, locale) {
  if (typeof template === "string") return fill(template, params);
  if (!isPlural(template)) return null;
  const count = Number(params.count);
  const form = locale === "zh" ? "other" : (count === 1 ? "one" : "other");
  const chosen = template[form] || template.other || template.one;
  return typeof chosen === "string" ? fill(chosen, params) : null;
}

function storage() {
  try {
    const store = globalThis.localStorage;
    if (!store || typeof store.getItem !== "function") return null;
    return store;
  } catch {
    return null;
  }
}

export function getLocale() {
  const store = storage();
  if (store) {
    try {
      const saved = store.getItem(LOCALE_STORAGE_KEY);
      if (saved === "en" || saved === "zh") return saved;
      return "en";
    } catch {
      return sessionLocale === "zh" ? "zh" : "en";
    }
  }
  return sessionLocale === "zh" ? "zh" : "en";
}

export function setLocale(locale) {
  const next = locale === "zh" ? "zh" : "en";
  const prev = getLocale();
  sessionLocale = next;
  const store = storage();
  if (store) {
    try {
      store.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      /* Private mode can block storage. The choice still applies for this visit. */
    }
  }
  applyDocumentLocale();
  if (prev !== next) {
    for (const listener of listeners) listener(next);
  }
  return next;
}

export function onLocaleChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function intlLocale() {
  return getLocale() === "zh" ? "zh-CN" : "en-GB";
}

export function applyDocumentLocale() {
  const lang = getLocale() === "zh" ? "zh-CN" : "en";
  if (typeof document === "undefined") return lang;
  document.documentElement.lang = lang;
  const description = document.querySelector('meta[name="description"]');
  if (description) description.setAttribute("content", t("meta.description"));
  return lang;
}

export function t(key, params = {}, locale = getLocale()) {
  const requested = locale === "zh" ? "zh" : "en";
  const direct = render(dig(CATALOGS[requested], key), params, requested);
  if (direct != null) return direct;
  if (requested !== "en") {
    const fallback = render(dig(CATALOGS.en, key), params, "en");
    if (fallback != null) return fallback;
  }
  return key;
}

const DAY_STATES = new Set(["win", "loss", "pending", "neutral", "upcoming", "incomplete", "none", "empty"]);

export function stateLabel(state) {
  if (!DAY_STATES.has(state)) return state ? String(state) : t("state.none");
  return t(`state.${state}`);
}

export function goalStatusLabel(status) {
  if (status === "active" || status === "paused" || status === "archived") return t(`goalStatus.${status}`);
  return status ? String(status) : "";
}

export function rewardStatusLabel(status) {
  if (status === "locked" || status === "unlocked" || status === "claimed") return t(`rewardStatus.${status}`);
  return status ? String(status) : "";
}

const MOOD_IDS = ["Productive", "Focused", "Tired", "Unmotivated", "Great", "Neutral"];

export function moodLabel(mood) {
  if (!mood) return "";
  if (!MOOD_IDS.includes(mood)) return String(mood);
  return t(`mood.${mood}`);
}

export function displayDuration(label) {
  if (!label) return "";
  const match = /^(\d+)h (\d+)m$/.exec(String(label));
  if (!match) return String(label);
  return t("duration.hm", { hours: Number(match[1]), minutes: Number(match[2]) });
}

export function historySummary({ streak, days, wins, losses }) {
  return t("history.summary", {
    streak,
    days: t("history.successfulDays", { count: days }),
    wins: t("history.winCount", { count: wins }),
    losses: t("history.lossCount", { count: losses }),
  });
}

export function weekLabel(number) {
  return t("week.label", {
    number,
    padded: String(number).padStart(2, "0"),
  });
}
