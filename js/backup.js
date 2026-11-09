import { STORE_NAMES } from "./db.js";
import { t } from "./i18n.js";
import { normalizeNote } from "./notes.js";
import { evaluateSleep } from "./sleep.js";
import { listWeeks } from "./selectors.js";

export const BACKUP_VERSION = 2;

const ARRAY_FIELDS = [
  "goals",
  "dailyRecords",
  "sleepRecords",
  "milestones",
  "journal",
  "weeklyReviews",
  "weekSnapshots",
  "rewardClaims",
  "images",
  "notes",
];

export function validateBackup(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return t("backupError.notBackup");
  if (data.app !== "B4O7") return t("backupError.notBackup");
  if (typeof data.version !== "number") return t("backupError.version");
  for (const field of ARRAY_FIELDS) {
    if (data[field] != null && !Array.isArray(data[field])) return t("backupError.field", { field });
  }
  for (const goal of data.goals || []) {
    if (!goal || typeof goal.id !== "string" || !String(goal.name || "").trim()) {
      return t("backupError.goalName");
    }
    if (goal.weeklyTarget != null) {
      const target = Number(goal.weeklyTarget);
      if (!Number.isInteger(target) || target < 1 || target > 7) return t("backupError.target", { name: goal.name });
    }
  }
  for (const image of data.images || []) {
    if (!image?.id || typeof image.dataBase64 !== "string") return t("backupError.photo");
  }
  for (const sleep of data.sleepRecords || []) {
    if (!sleep?.id) return t("backupError.sleepId");
  }
  for (const note of data.notes || []) {
    if (!note || typeof note.id !== "string" || !note.id.trim()) return t("backupError.noteId");
    if (note.items != null && !Array.isArray(note.items)) return t("backupError.noteItems");
    for (const item of note.items || []) {
      if (!item || typeof item.id !== "string" || !item.id.trim()) return t("backupError.noteId");
    }
    if (note.countdownDate != null && note.countdownDate !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(note.countdownDate)) {
      return t("backupError.noteDate");
    }
  }
  return "";
}

export async function buildBackup(state) {
  const images = [];
  for (const image of state.images || []) {
    images.push({
      id: image.id,
      mime: image.mime || "image/jpeg",
      createdAt: image.createdAt || null,
      dataBase64: await blobToBase64(image.blob),
    });
  }
  return {
    app: "B4O7",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    note: "Private B4O7 backup. This file contains your data. Keep it off the public web. 这是 B4O7 的私人备份，内含你的数据。不要把它放到公开网页上。",
    settings: state.settings,
    goals: state.goals,
    dailyRecords: state.dailyRecords,
    sleepRecords: state.sleepRecords,
    milestones: state.milestones,
    journal: state.journal,
    weeklyReviews: state.weeklyReviews,
    weekSnapshots: state.weekSnapshots,
    rewardClaims: state.rewardClaims,
    notes: state.notes || [],
    images,
  };
}

export function backupToRows(backup) {
  const images = (backup.images || []).map((image) => ({
    id: image.id,
    mime: image.mime || "image/jpeg",
    createdAt: image.createdAt || new Date().toISOString(),
    blob: base64ToBlob(image.dataBase64, image.mime || "image/jpeg"),
  }));
  const settings = backup.settings ? { ...backup.settings, id: "app" } : null;
  const notes = (backup.notes || []).map(normalizeNote).filter(Boolean);
  return { ...backup, images, settings, notes };
}

export function buildCsv(state, today) {
  const rows = [["type", "date", "goal", "status", "detail", "note", "corrected"]];
  for (const goal of state.goals) {
    for (const week of listWeeks(goal, state, today)) {
      week.dates.forEach((date, index) => {
        if (date > today) return;
        const record = state.dailyRecords.find((item) => item.goalId === goal.id && item.date === date);
        const detail = [
          week.meta.label,
          week.result.score,
          record?.thresholdValue != null ? `${record.thresholdValue}` : "",
        ].filter(Boolean).join(" ");
        rows.push([
          "day",
          date,
          goal.name,
          week.dayStates[index],
          detail,
          record?.note || "",
          record?.corrected ? "yes" : "",
        ]);
      });
    }
  }
  for (const sleep of state.sleepRecords) {
    const evaluation = evaluateSleep(sleep);
    rows.push([
      "sleep",
      sleep.wakeDate || "",
      "Sleep",
      evaluation.complete ? (evaluation.win ? "win" : "loss") : "incomplete",
      evaluation.durationLabel || "",
      sleep.note || "",
      sleep.corrected ? "yes" : "",
    ]);
  }
  for (const entry of state.journal) {
    rows.push(["journal", entry.date, "", entry.mood || "", "", entry.body || "", ""]);
  }
  for (const note of state.notes || []) {
    const lines = (note.items || [])
      .filter((item) => item && String(item.text || "").trim())
      .map((item) => `${item.checked ? "[x]" : "[ ]"} ${String(item.text).trim()}`);
    const written = [note.body || "", ...lines].filter(Boolean).join("\n");
    rows.push([
      "note",
      note.countdownDate || note.createdOn || String(note.createdAt || "").slice(0, 10),
      note.title || "",
      note.countdownDate ? "countdown" : "",
      note.countdownDate || "",
      written,
      "",
    ]);
  }
  for (const review of state.weeklyReviews) {
    rows.push([
      "weekly_review",
      review.weekStart,
      "",
      review.skipped ? "skipped" : "saved",
      review.wentWell || "",
      [review.heldBack, review.improve].filter(Boolean).join(" | "),
      "",
    ]);
  }
  for (const claim of state.rewardClaims) {
    const goal = state.goals.find((item) => item.id === claim.goalId);
    rows.push([
      "reward",
      claim.weekStart,
      goal?.name || "",
      claim.claimedAt ? "claimed" : "unlocked",
      claim.reward?.name || "",
      claim.claimedAt || claim.unlockedAt || "",
      "",
    ]);
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

export function csvCell(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const size = 0x8000;
  for (let index = 0; index < bytes.length; index += size) {
    binary += String.fromCharCode(...bytes.subarray(index, index + size));
  }
  return btoa(binary);
}

export function base64ToBlob(data, mime) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime || "application/octet-stream" });
}

export function downloadFile(filename, blob) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

export { STORE_NAMES };
