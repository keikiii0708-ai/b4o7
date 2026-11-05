import { STORE_NAMES } from "./db.js";
import { evaluateSleep } from "./sleep.js";
import { listWeeks } from "./selectors.js";

export const BACKUP_VERSION = 1;

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
];

export function validateBackup(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "That file is not a B4O7 backup.";
  if (data.app !== "B4O7") return "That file is not a B4O7 backup.";
  if (typeof data.version !== "number") return "The backup is missing a version.";
  for (const field of ARRAY_FIELDS) {
    if (data[field] != null && !Array.isArray(data[field])) return `The backup field “${field}” is not a list.`;
  }
  for (const goal of data.goals || []) {
    if (!goal || typeof goal.id !== "string" || !String(goal.name || "").trim()) {
      return "A goal in the backup is missing a name.";
    }
    if (goal.weeklyTarget != null) {
      const target = Number(goal.weeklyTarget);
      if (!Number.isInteger(target) || target < 1 || target > 7) return `“${goal.name}” has a target outside 1–7.`;
    }
  }
  for (const image of data.images || []) {
    if (!image?.id || typeof image.dataBase64 !== "string") return "A photo in the backup could not be read.";
  }
  for (const sleep of data.sleepRecords || []) {
    if (!sleep?.id) return "A sleep record in the backup is missing an id.";
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
    note: "Private B4O7 backup. This file contains your data. Keep it off the public web.",
    settings: state.settings,
    goals: state.goals,
    dailyRecords: state.dailyRecords,
    sleepRecords: state.sleepRecords,
    milestones: state.milestones,
    journal: state.journal,
    weeklyReviews: state.weeklyReviews,
    weekSnapshots: state.weekSnapshots,
    rewardClaims: state.rewardClaims,
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
  return { ...backup, images, settings };
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
