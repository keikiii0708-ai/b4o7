import { daysBetween } from "./dates.js";
import { t } from "./i18n.js";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TITLE = 180;
const MAX_BODY = 20000;
const MAX_ITEM = 300;
const MAX_ITEMS = 80;

export function countdownFor(date, today) {
  if (!ISO_DAY.test(date || "") || !ISO_DAY.test(today || "")) return null;
  let delta;
  try {
    delta = daysBetween(today, date);
  } catch {
    return null;
  }
  if (!Number.isFinite(delta)) return null;
  if (delta > 0) return { days: delta, phase: "upcoming" };
  if (delta === 0) return { days: 0, phase: "today" };
  return { days: -delta, phase: "past" };
}

export function countdownPhrase(count) {
  if (!count) return "";
  if (count.phase === "today") return t("notes.today");
  if (count.phase === "past") return t("notes.daysAgo", { count: count.days });
  return t("notes.daysLeft", { count: count.days });
}

export function checklistSummary(items) {
  const list = Array.isArray(items) ? items.filter((item) => item && String(item.text || "").trim()) : [];
  const done = list.filter((item) => item.checked).length;
  return { total: list.length, done, open: list.length - done };
}

export function checklistLabel(items) {
  const summary = checklistSummary(items);
  if (!summary.total) return "";
  if (!summary.open) return t("notes.allDone");
  return t("notes.itemsOpen", { count: summary.open });
}

export function notePreview(note) {
  const body = String(note?.body || "").trim();
  if (body) return body;
  const items = Array.isArray(note?.items) ? note.items : [];
  const open = items.find((item) => String(item?.text || "").trim() && !item.checked);
  if (open) return String(open.text).trim();
  const any = items.find((item) => String(item?.text || "").trim());
  return any ? String(any.text).trim() : "";
}

export function nearestUpcoming(notes, today) {
  const ranked = [];
  for (const note of notes || []) {
    const count = countdownFor(note?.countdownDate, today);
    if (!count || count.phase === "past") continue;
    ranked.push({ note, count });
  }
  ranked.sort(compareUpcoming);
  return ranked[0] || null;
}

export function groupNotes(notes, today) {
  const upcoming = [];
  const past = [];
  const plain = [];
  for (const note of notes || []) {
    const count = countdownFor(note?.countdownDate, today);
    if (!count) plain.push(note);
    else if (count.phase === "past") past.push({ note, count });
    else upcoming.push({ note, count });
  }
  upcoming.sort(compareUpcoming);
  past.sort((a, b) => String(b.note.countdownDate).localeCompare(String(a.note.countdownDate))
    || String(b.note.updatedAt || "").localeCompare(String(a.note.updatedAt || "")));
  const days = [];
  const byDate = new Map();
  for (const note of plain) {
    const date = noteDay(note);
    if (!byDate.has(date)) {
      const group = { date, notes: [] };
      byDate.set(date, group);
      days.push(group);
    }
    byDate.get(date).notes.push(note);
  }
  days.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  for (const group of days) {
    group.notes.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  }
  return { upcoming, past, days };
}

function compareUpcoming(a, b) {
  return String(a.note.countdownDate).localeCompare(String(b.note.countdownDate))
    || String(b.note.updatedAt || "").localeCompare(String(a.note.updatedAt || ""));
}

function noteDay(note) {
  if (ISO_DAY.test(note?.createdOn || "")) return note.createdOn;
  const stamp = String(note?.createdAt || "");
  return ISO_DAY.test(stamp.slice(0, 10)) ? stamp.slice(0, 10) : "";
}

export function prepareNote(draft, existing, { now, today, newId }) {
  const title = String(draft?.title || "").trim().slice(0, MAX_TITLE);
  const body = String(draft?.body || "").trim().slice(0, MAX_BODY);
  const items = [];
  const seen = new Set();
  for (const raw of draft?.items || []) {
    const text = String(raw?.text || "").trim().slice(0, MAX_ITEM);
    if (!text || items.length >= MAX_ITEMS) continue;
    let id = typeof raw?.id === "string" ? raw.id.trim() : "";
    if (!id || seen.has(id)) id = newId();
    seen.add(id);
    items.push({ id, text, checked: Boolean(raw?.checked) });
  }
  if (!title && !body && !items.length) return { ok: false, reason: "empty" };
  let countdownDate = null;
  if (draft?.countdownOn) {
    const date = String(draft.countdownDate || "");
    if (!ISO_DAY.test(date)) return { ok: false, reason: "date" };
    countdownDate = date;
  }
  return {
    ok: true,
    note: {
      id: existing?.id || draft?.id || "",
      title,
      body,
      items,
      countdownDate,
      createdAt: existing?.createdAt || now,
      createdOn: existing?.createdOn || today,
      updatedAt: now,
    },
  };
}

export function normalizeNote(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) return null;
  const items = [];
  const seen = new Set();
  if (Array.isArray(raw.items)) {
    for (const item of raw.items) {
      if (!item || typeof item !== "object") continue;
      const itemId = typeof item.id === "string" ? item.id.trim() : "";
      const text = typeof item.text === "string" ? item.text.trim() : "";
      if (!itemId || !text || seen.has(itemId)) continue;
      seen.add(itemId);
      items.push({ id: itemId, text, checked: Boolean(item.checked) });
    }
  }
  const createdAt = typeof raw.createdAt === "string" && raw.createdAt ? raw.createdAt : new Date().toISOString();
  const createdOn = ISO_DAY.test(raw.createdOn || "") ? raw.createdOn : (ISO_DAY.test(createdAt.slice(0, 10)) ? createdAt.slice(0, 10) : "");
  return {
    id,
    title: typeof raw.title === "string" ? raw.title : "",
    body: typeof raw.body === "string" ? raw.body : "",
    items,
    countdownDate: ISO_DAY.test(raw.countdownDate || "") ? raw.countdownDate : null,
    createdAt,
    createdOn,
    updatedAt: typeof raw.updatedAt === "string" && raw.updatedAt ? raw.updatedAt : createdAt,
  };
}
