import { daysBetween, localParts, weekMeta } from "./dates.js";
import { t } from "./i18n.js";
import { buildGoalWeek } from "./selectors.js";

export function dueReminder(state, today, zone, now = new Date(), seen = new Set()) {
  const parts = localParts(now, zone);
  const nowMin = parts.hour * 60 + parts.minute;
  const weekStartsOn = state.settings?.weekStartsOn || "monday";
  for (const goal of state.goals || []) {
    if (goal.status !== "active" || !goal.reminder?.enabled || !goal.reminder.time) continue;
    const [hour, minute] = String(goal.reminder.time).split(":").map((value) => Number(value));
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) continue;
    const reminderMin = hour * 60 + minute;
    if (nowMin < reminderMin || nowMin > reminderMin + 30) continue;
    const key = `${goal.id}:${today}`;
    if (seen.has(key)) continue;
    const week = buildGoalWeek(goal, state, weekMeta(today, weekStartsOn).start, today, now.getTime());
    const index = week.dates.indexOf(today);
    if (week.dayStates[index] !== "pending") continue;
    return {
      key,
      goalId: goal.id,
      title: goal.name,
      text: t("reminder.open", { name: goal.name }),
    };
  }
  return null;
}

export function shouldRemindBackup(state, today) {
  const ownGoal = (state.goals || []).some((goal) => !goal.demo);
  const ownSleep = (state.sleepRecords || []).some((record) => !record.demo);
  const ownJournal = (state.journal || []).some((entry) => !entry.demo);
  const ownNotes = (state.notes || []).some((note) => !note.demo);
  if (!ownGoal && !ownSleep && !ownJournal && !ownNotes) return false;
  if (state.settings?.backupSnoozeUntil && today <= state.settings.backupSnoozeUntil) return false;
  if (!state.settings?.lastBackupAt) {
    const created = String(state.settings?.createdAt || today).slice(0, 10);
    return daysBetween(created, today) >= 3;
  }
  return daysBetween(String(state.settings.lastBackupAt).slice(0, 10), today) >= 14;
}

export function reminderSeen() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem("b4o7-reminded") || "[]"));
  } catch {
    return new Set();
  }
}

export function markReminderSeen(key) {
  const seen = reminderSeen();
  seen.add(key);
  sessionStorage.setItem("b4o7-reminded", JSON.stringify([...seen]));
}
