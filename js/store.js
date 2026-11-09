import { buildBackup, backupToRows, buildCsv, downloadFile, validateBackup } from "./backup.js";
import { t } from "./i18n.js";
import { addDays, captureStamp, currentTimeZone, offsetString, todayISO, weekMeta, zonedDateTimeToUtc } from "./dates.js";
import * as db from "./db.js";
import { buildDemo } from "./demo.js";
import { attributeWakeDate, defaultSleepTargets, submissionCheck } from "./sleep.js";
import { buildGoalWeek, listWeeks } from "./selectors.js";
import { prepareNote } from "./notes.js";
import { makeWeekSnapshot, milestoneProgress, remapSnapshots, snapshotsEqual, timerStatus, validateGoalConfig } from "./scoring.js";

let state = null;
const listeners = new Set();

export function getState() {
  return state;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function today() {
  return todayISO(currentTimeZone());
}

export function zone() {
  return currentTimeZone();
}

export function defaultSettings() {
  return {
    id: "app",
    weekStartsOn: "monday",
    sleepTargets: defaultSleepTargets(),
    lastBackupAt: null,
    backupSnoozeUntil: null,
    createdAt: new Date().toISOString(),
  };
}

export function blankGoal() {
  const now = new Date().toISOString();
  return {
    id: uid(),
    name: "",
    description: "",
    icon: "🎯",
    imageId: null,
    weeklyTarget: 4,
    completionMethod: "manual",
    timerDurationMinutes: 25,
    thresholdLabel: "pages",
    thresholdTarget: 20,
    restDays: [],
    reminder: { enabled: false, time: "21:00" },
    notes: "",
    weeklyReward: { name: "", description: "", priceLabel: "", imageId: null },
    status: "active",
    skipIntervals: [],
    demo: false,
    createdAt: now,
    createdOn: today(),
    updatedAt: now,
  };
}

export async function init() {
  state = await db.loadState();
  if (!state.settings) {
    state.settings = defaultSettings();
    await db.put("settings", state.settings);
  }
  await refresh();
}

function emit() {
  for (const listener of listeners) listener(state);
}

async function refresh() {
  state = await db.loadState();
  if (!state.settings) state.settings = defaultSettings();
  await ensureSnapshots();
  state = await db.loadState();
  await ensureUnlocks();
  await settleFinishedTimers();
  state = await db.loadState();
  emit();
}

async function ensureSnapshots() {
  const todayStr = today();
  const weekStartsOn = state.settings.weekStartsOn || "monday";
  const writes = [];
  for (const goal of state.goals) {
    const created = String(goal.createdAt || todayStr).slice(0, 10);
    let cursor = weekMeta(created, weekStartsOn).start;
    const current = weekMeta(todayStr, weekStartsOn).start;
    while (cursor <= current) {
      const existing = state.weekSnapshots.find((snapshot) => snapshot.id === `${goal.id}:${cursor}`);
      const past = todayStr > addDays(cursor, 6);
      const fresh = makeWeekSnapshot(goal, cursor, weekStartsOn, existing?.capturedAt || new Date().toISOString());
      if (!existing || (!past && !snapshotsEqual(existing, fresh))) writes.push(fresh);
      cursor = addDays(cursor, 7);
    }
  }
  if (writes.length) await db.bulkPut("weekSnapshots", writes);
}

async function ensureUnlocks() {
  const todayStr = today();
  const now = new Date().toISOString();
  for (const goal of state.goals) {
    const weeks = listWeeks(goal, state, todayStr);
    for (const week of weeks) {
      if (!week.snapshot.reward) continue;
      const existing = state.rewardClaims.find((claim) => claim.id === `${goal.id}:${week.weekStart}`);
      if (week.result.status === "won") {
        if (!existing) {
          await db.put("rewardClaims", {
            id: `${goal.id}:${week.weekStart}`,
            goalId: goal.id,
            weekStart: week.weekStart,
            unlockedAt: now,
            claimedAt: null,
            reward: week.snapshot.reward,
          });
        }
      } else if (existing && !existing.claimedAt) {
        await db.del("rewardClaims", existing.id);
      }
    }
    const inputs = weeks.map((week) => ({ status: week.result.status, wins: week.result.wins }));
    for (const milestone of state.milestones.filter((item) => item.goalId === goal.id)) {
      if (milestone.unlockedAt) continue;
      if (milestoneProgress(inputs, milestone).reached) {
        await db.put("milestones", { ...milestone, unlockedAt: now });
      }
    }
  }
}

async function settleFinishedTimers() {
  const nowMs = Date.now();
  for (const record of state.dailyRecords) {
    if (!record.timerStartedAt || record.explicit === "win" || record.timerEndedAt) continue;
    const goal = state.goals.find((item) => item.id === record.goalId);
    if (!goal || goal.completionMethod !== "timer") continue;
    const duration = goal.timerDurationMinutes;
    const status = timerStatus(record.timerStartedAt, duration, nowMs);
    if (!status.done) continue;
    await db.put("dailyRecords", {
      ...record,
      explicit: "win",
      timerEndedAt: new Date(Date.parse(record.timerStartedAt) + duration * 60000).toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
}

export async function saveGoal(draft, milestones) {
  const config = validateGoalConfig({ weeklyTarget: Number(draft.weeklyTarget), restDays: draft.restDays });
  if (!config.ok) return { ok: false, reason: config.reason };
  if (!String(draft.name || "").trim()) return { ok: false, reason: t("error.goalName") };
  if (draft.completionMethod === "timer") {
    const minutes = Number(draft.timerDurationMinutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) {
      return { ok: false, reason: t("error.timerRange") };
    }
  }
  if (draft.completionMethod === "threshold") {
    if (!String(draft.thresholdLabel || "").trim()) return { ok: false, reason: t("error.countName") };
    if (!(Number(draft.thresholdTarget) > 0)) return { ok: false, reason: t("error.countTarget") };
  }
  const existing = state.goals.find((goal) => goal.id === draft.id);
  const now = new Date().toISOString();
  const reward = draft.weeklyReward || {};
  const goal = {
    ...(existing || blankGoal()),
    ...draft,
    name: String(draft.name).trim(),
    description: String(draft.description || "").trim(),
    notes: String(draft.notes || ""),
    weeklyTarget: Number(draft.weeklyTarget),
    restDays: config.restDays,
    timerDurationMinutes: Number(draft.timerDurationMinutes) || 25,
    thresholdTarget: Number(draft.thresholdTarget) || null,
    thresholdLabel: String(draft.thresholdLabel || "").trim(),
    weeklyReward: {
      name: String(reward.name || "").trim(),
      description: String(reward.description || "").trim(),
      priceLabel: String(reward.priceLabel || "").trim(),
      imageId: reward.imageId || null,
    },
    reminder: {
      enabled: Boolean(draft.reminder?.enabled),
      time: draft.reminder?.time || "21:00",
    },
    status: existing?.status || "active",
    skipIntervals: existing?.skipIntervals || [],
    demo: existing?.demo || false,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  await db.put("goals", goal);
  const incoming = milestones || [];
  const keep = new Set(incoming.map((milestone) => milestone.id));
  for (const milestone of state.milestones.filter((item) => item.goalId === goal.id)) {
    if (!keep.has(milestone.id)) await db.del("milestones", milestone.id);
  }
  if (incoming.length) {
    await db.bulkPut("milestones", incoming.map((milestone) => ({
      ...milestone,
      goalId: goal.id,
      required: Math.max(1, Number(milestone.required) || 1),
      rewardDescription: String(milestone.rewardDescription || "").trim(),
    })));
  }
  await sweepImages();
  await refresh();
  return { ok: true, id: goal.id };
}

export async function setGoalMode(id, mode) {
  const goal = state.goals.find((item) => item.id === id);
  if (!goal) return;
  const todayStr = today();
  const intervals = (goal.skipIntervals || []).map((interval) => ({ ...interval }));
  if (mode === "pause" || mode === "archive") {
    if (!intervals.some((interval) => interval.end == null)) intervals.push({ start: todayStr, end: null });
    await db.put("goals", {
      ...goal,
      status: mode === "pause" ? "paused" : "archived",
      skipIntervals: intervals,
      updatedAt: new Date().toISOString(),
    });
  } else {
    const open = intervals.find((interval) => interval.end == null);
    if (open) {
      const end = addDays(todayStr, -1);
      if (end < open.start) intervals.splice(intervals.indexOf(open), 1);
      else open.end = end;
    }
    await db.put("goals", {
      ...goal,
      status: "active",
      skipIntervals: intervals,
      updatedAt: new Date().toISOString(),
    });
  }
  await refresh();
}

export async function deleteGoal(id) {
  for (const record of state.dailyRecords.filter((item) => item.goalId === id)) await db.del("dailyRecords", record.id);
  for (const milestone of state.milestones.filter((item) => item.goalId === id)) await db.del("milestones", milestone.id);
  for (const snapshot of state.weekSnapshots.filter((item) => item.goalId === id)) await db.del("weekSnapshots", snapshot.id);
  for (const claim of state.rewardClaims.filter((item) => item.goalId === id)) await db.del("rewardClaims", claim.id);
  await db.del("goals", id);
  await sweepImages();
  await refresh();
}

export async function setDayExplicit(goalId, date, explicit) {
  const id = `${goalId}:${date}`;
  const existing = state.dailyRecords.find((record) => record.id === id) || null;
  if (explicit == null && existing && !existing.timerStartedAt && existing.thresholdValue == null) {
    await db.del("dailyRecords", id);
    await refresh();
    return;
  }
  const now = new Date().toISOString();
  await db.put("dailyRecords", {
    id,
    goalId,
    date,
    explicit,
    timerStartedAt: existing?.timerStartedAt ?? null,
    timerEndedAt: existing?.timerEndedAt ?? null,
    thresholdValue: existing?.thresholdValue ?? null,
    corrected: Boolean(existing && existing.explicit !== explicit),
    originalExplicit: existing?.originalExplicit ?? existing?.explicit ?? null,
    note: existing?.note || "",
    demo: existing?.demo || false,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });
  await refresh();
}

export async function startTimer(goalId, date) {
  const id = `${goalId}:${date}`;
  const existing = state.dailyRecords.find((record) => record.id === id);
  if (existing?.timerStartedAt && !existing.timerEndedAt) return;
  const now = new Date().toISOString();
  await db.put("dailyRecords", {
    id,
    goalId,
    date,
    explicit: null,
    timerStartedAt: now,
    timerEndedAt: null,
    thresholdValue: existing?.thresholdValue ?? null,
    corrected: false,
    note: "",
    demo: false,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });
  await refresh();
}

export async function cancelTimer(goalId, date) {
  const id = `${goalId}:${date}`;
  const existing = state.dailyRecords.find((record) => record.id === id);
  if (!existing) return;
  if (existing.thresholdValue == null && !existing.explicit) {
    await db.del("dailyRecords", id);
  } else {
    await db.put("dailyRecords", { ...existing, timerStartedAt: null, timerEndedAt: null, updatedAt: new Date().toISOString() });
  }
  await refresh();
}

export async function logThreshold(goalId, date, value) {
  const id = `${goalId}:${date}`;
  const existing = state.dailyRecords.find((record) => record.id === id);
  const number = Number(value);
  const now = new Date().toISOString();
  await db.put("dailyRecords", {
    id,
    goalId,
    date,
    explicit: existing?.explicit ?? null,
    timerStartedAt: existing?.timerStartedAt ?? null,
    timerEndedAt: existing?.timerEndedAt ?? null,
    thresholdValue: Number.isFinite(number) ? number : null,
    corrected: Boolean(existing?.corrected),
    note: existing?.note || "",
    demo: false,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });
  await refresh();
}

export async function sleepBed(when = new Date()) {
  const check = submissionCheck(state.sleepRecords, "bedtime");
  if (!check.ok) return check;
  const stamp = captureStamp(when, zone());
  const record = {
    id: uid(),
    bedtimeUtc: stamp.utc,
    bedtimeTz: stamp.tz,
    bedtimeOffset: stamp.offset,
    wakeUtc: null,
    wakeTz: null,
    wakeOffset: null,
    wakeDate: null,
    targets: structuredClone(state.settings.sleepTargets),
    note: "",
    corrected: false,
    original: null,
    demo: false,
    createdAt: stamp.utc,
    updatedAt: stamp.utc,
  };
  await db.put("sleepRecords", record);
  await refresh();
  return { ok: true, record };
}

export async function sleepWake(when = new Date()) {
  const stamp = captureStamp(when, zone());
  const check = submissionCheck(state.sleepRecords, "wake", { wakeDate: stamp.isoDate });
  if (!check.ok) return { ...check, wakeDate: stamp.isoDate };
  const open = check.existing;
  const record = {
    ...open,
    wakeUtc: stamp.utc,
    wakeTz: stamp.tz,
    wakeOffset: stamp.offset,
    wakeDate: stamp.isoDate,
    updatedAt: stamp.utc,
  };
  await db.put("sleepRecords", record);
  await refresh();
  return { ok: true, record };
}

export async function saveSleepManual({ id, bedDate, bedTime, wakeDate, wakeTime, note, timeZone }) {
  const tz = timeZone || zone();
  let bedtimeUtc;
  let wakeUtc;
  try {
    bedtimeUtc = zonedDateTimeToUtc(bedDate, bedTime, tz).toISOString();
    wakeUtc = zonedDateTimeToUtc(wakeDate, wakeTime, tz).toISOString();
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (Date.parse(wakeUtc) <= Date.parse(bedtimeUtc)) return { ok: false, reason: "order" };
  const attributed = attributeWakeDate(wakeUtc, tz);
  const check = submissionCheck(state.sleepRecords, "manual", { wakeDate: attributed, recordId: id || null });
  if (!check.ok) return check;
  const existing = id ? state.sleepRecords.find((record) => record.id === id) : null;
  const changed = Boolean(existing && (existing.bedtimeUtc !== bedtimeUtc || existing.wakeUtc !== wakeUtc || existing.note !== (note || "")));
  const record = {
    id: id || uid(),
    bedtimeUtc,
    bedtimeTz: tz,
    bedtimeOffset: offsetString(new Date(bedtimeUtc), tz),
    wakeUtc,
    wakeTz: tz,
    wakeOffset: offsetString(new Date(wakeUtc), tz),
    wakeDate: attributed,
    targets: existing?.targets || structuredClone(state.settings.sleepTargets),
    note: note || "",
    corrected: Boolean(existing && existing.wakeUtc && changed),
    original: existing?.original || (existing && existing.wakeUtc ? {
      bedtimeUtc: existing.bedtimeUtc,
      wakeUtc: existing.wakeUtc,
      wakeDate: existing.wakeDate,
      note: existing.note || "",
    } : null),
    demo: existing?.demo || false,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db.put("sleepRecords", record);
  await refresh();
  return { ok: true, record };
}

export async function deleteSleep(id) {
  await db.del("sleepRecords", id);
  await refresh();
}

export async function saveJournal(entry) {
  const now = new Date().toISOString();
  const existing = state.journal.find((item) => item.id === entry.date);
  if (!String(entry.body || "").trim() && !entry.mood) {
    if (existing) await db.del("journal", existing.id);
    await refresh();
    return;
  }
  await db.put("journal", {
    id: entry.date,
    date: entry.date,
    body: String(entry.body || "").trim(),
    mood: entry.mood || null,
    demo: false,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });
  await refresh();
}

export async function deleteJournal(date) {
  await db.del("journal", date);
  await refresh();
}

export async function saveNote(draft) {
  const existing = draft?.id ? (state.notes || []).find((note) => note.id === draft.id) || null : null;
  const now = new Date().toISOString();
  const prepared = prepareNote(draft, existing, { now, today: today(), newId: uid });
  if (!prepared.ok) return prepared;
  const note = { ...prepared.note, id: existing?.id || prepared.note.id || uid() };
  await db.put("notes", note);
  await refresh();
  return { ok: true, id: note.id };
}

export async function deleteNote(id) {
  await db.del("notes", id);
  await refresh();
}

export async function toggleNoteItem(noteId, itemId) {
  const note = (state.notes || []).find((item) => item.id === noteId);
  if (!note) return { ok: false };
  let found = false;
  const items = (note.items || []).map((item) => {
    if (item.id !== itemId) return item;
    found = true;
    return { ...item, checked: !item.checked };
  });
  if (!found) return { ok: false };
  await db.put("notes", { ...note, items, updatedAt: new Date().toISOString() });
  await refresh();
  return { ok: true, checked: items.find((item) => item.id === itemId)?.checked };
}

export async function saveReview(review) {
  const now = new Date().toISOString();
  const existing = state.weeklyReviews.find((item) => item.id === review.weekStart);
  await db.put("weeklyReviews", {
    id: review.weekStart,
    weekStart: review.weekStart,
    weekEnd: review.weekEnd,
    wentWell: String(review.wentWell || "").trim(),
    heldBack: String(review.heldBack || "").trim(),
    improve: String(review.improve || "").trim(),
    skipped: Boolean(review.skipped),
    demo: false,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });
  await refresh();
}

export async function claimReward(goalId, weekStart) {
  const id = `${goalId}:${weekStart}`;
  const existing = state.rewardClaims.find((claim) => claim.id === id);
  const goal = state.goals.find((item) => item.id === goalId);
  const week = goal ? buildGoalWeek(goal, state, weekStart, today()) : null;
  if (!existing && week?.result.status !== "won") return;
  await db.put("rewardClaims", {
    id,
    goalId,
    weekStart,
    unlockedAt: existing?.unlockedAt || new Date().toISOString(),
    claimedAt: new Date().toISOString(),
    reward: existing?.reward || week?.snapshot.reward || null,
    demo: existing?.demo || false,
  });
  await refresh();
}

export async function claimMilestone(id) {
  const milestone = state.milestones.find((item) => item.id === id);
  if (!milestone?.unlockedAt || milestone.claimedAt) return;
  await db.put("milestones", { ...milestone, claimedAt: new Date().toISOString() });
  await refresh();
}

export async function updateSettings(patch) {
  const next = { ...state.settings, ...patch, id: "app" };
  if (patch.sleepTargets) next.sleepTargets = { ...state.settings.sleepTargets, ...patch.sleepTargets };
  if (patch.weekStartsOn && patch.weekStartsOn !== state.settings.weekStartsOn) {
    const todayStr = today();
    for (const goal of state.goals) {
      const remapped = remapSnapshots(state.weekSnapshots, goal, patch.weekStartsOn, todayStr);
      for (const snapshot of state.weekSnapshots.filter((item) => item.goalId === goal.id)) {
        await db.del("weekSnapshots", snapshot.id);
      }
      if (remapped.length) await db.bulkPut("weekSnapshots", remapped);
    }
  }
  await db.put("settings", next);
  await refresh();
}

export async function snoozeBackup(days = 14) {
  await db.put("settings", { ...state.settings, backupSnoozeUntil: addDays(today(), days) });
  await refresh();
}

export async function requestPersist() {
  if (!navigator.storage?.persist) return { supported: false, persisted: false };
  try {
    const already = await navigator.storage.persisted();
    if (already) return { supported: true, persisted: true };
    const persisted = await navigator.storage.persist();
    return { supported: true, persisted: Boolean(persisted) };
  } catch {
    return { supported: true, persisted: false };
  }
}

export async function sync() {
  await refresh();
}

export async function saveImage(blob, mime = "image/jpeg", { silent = false } = {}) {
  const image = { id: uid(), blob, mime, createdAt: new Date().toISOString() };
  await db.put("images", image);
  if (!silent) {
    state = await db.loadState();
    emit();
  }
  return image.id;
}

export async function exportBackup() {
  const payload = await buildBackup(state);
  const stamp = today();
  downloadFile(`b4o7-backup-${stamp}.json`, new Blob([JSON.stringify(payload)], { type: "application/json" }));
  await db.put("settings", { ...state.settings, lastBackupAt: new Date().toISOString(), backupSnoozeUntil: null });
  await refresh();
}

export function exportCsv() {
  const csv = `\uFEFF${buildCsv(state, today())}\n`;
  downloadFile(`b4o7-history-${today()}.csv`, new Blob([csv], { type: "text/csv;charset=utf-8" }));
}

export async function importBackup(data, mode) {
  const error = validateBackup(data);
  if (error) return { ok: false, reason: error };
  const rows = backupToRows(data);
  if (mode === "replace") await db.clearAll();
  const settings = rows.settings || defaultSettings();
  if (mode === "merge" && state.settings) {
    settings.createdAt = state.settings.createdAt || settings.createdAt;
  }
  await db.put("settings", { ...defaultSettings(), ...settings, id: "app" });
  for (const field of ["goals", "dailyRecords", "sleepRecords", "milestones", "journal", "weeklyReviews", "weekSnapshots", "rewardClaims", "images", "notes"]) {
    if (rows[field]?.length) await db.bulkPut(field, rows[field]);
  }
  await refresh();
  return { ok: true };
}

export async function deleteAllData() {
  await db.clearAll();
  await db.put("settings", defaultSettings());
  await refresh();
}

export async function loadDemo() {
  const demo = buildDemo(today(), zone(), state.settings.weekStartsOn || "monday");
  await removeDemo({ refreshAfter: false });
  state = await db.loadState();
  const journal = demo.journal.filter((entry) => !state.journal.some((item) => item.date === entry.date && !item.demo));
  const reviews = demo.weeklyReviews.filter((entry) => !state.weeklyReviews.some((item) => item.id === entry.id && !item.demo));
  await db.bulkPut("goals", demo.goals);
  await db.bulkPut("dailyRecords", demo.dailyRecords);
  await db.bulkPut("sleepRecords", demo.sleepRecords);
  await db.bulkPut("milestones", demo.milestones);
  await db.bulkPut("weekSnapshots", demo.weekSnapshots);
  await db.bulkPut("rewardClaims", demo.rewardClaims);
  if (journal.length) await db.bulkPut("journal", journal);
  if (reviews.length) await db.bulkPut("weeklyReviews", reviews);
  await refresh();
}

export async function removeDemo({ refreshAfter = true } = {}) {
  const current = state || await db.loadState();
  for (const goal of current.goals.filter(isDemo)) await deleteGoalQuiet(goal.id, current);
  for (const record of current.sleepRecords.filter(isDemo)) await db.del("sleepRecords", record.id);
  for (const entry of current.journal.filter(isDemo)) await db.del("journal", entry.id);
  for (const review of current.weeklyReviews.filter(isDemo)) await db.del("weeklyReviews", review.id);
  if (refreshAfter) await refresh();
}

async function deleteGoalQuiet(id, current) {
  for (const record of current.dailyRecords.filter((item) => item.goalId === id)) await db.del("dailyRecords", record.id);
  for (const milestone of current.milestones.filter((item) => item.goalId === id)) await db.del("milestones", milestone.id);
  for (const snapshot of current.weekSnapshots.filter((item) => item.goalId === id)) await db.del("weekSnapshots", snapshot.id);
  for (const claim of current.rewardClaims.filter((item) => item.goalId === id)) await db.del("rewardClaims", claim.id);
  await db.del("goals", id);
}

async function sweepImages() {
  const latest = await db.loadState();
  const used = new Set();
  for (const goal of latest.goals) {
    if (goal.imageId) used.add(goal.imageId);
    if (goal.weeklyReward?.imageId) used.add(goal.weeklyReward.imageId);
  }
  for (const snapshot of latest.weekSnapshots) if (snapshot.reward?.imageId) used.add(snapshot.reward.imageId);
  for (const claim of latest.rewardClaims) if (claim.reward?.imageId) used.add(claim.reward.imageId);
  for (const image of latest.images) if (!used.has(image.id)) await db.del("images", image.id);
}

function isDemo(item) {
  return Boolean(item?.demo) || String(item?.id || "").startsWith("demo-");
}

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function fileToImageBlob(file, max = 1400) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  bitmap.close?.();
  return blob || file;
}
