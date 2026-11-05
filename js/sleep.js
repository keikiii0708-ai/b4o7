import { addDays, localParts, zonedDateTimeToUtc } from "./dates.js";

export function defaultSleepTargets() {
  return {
    latestBedtime: "01:00",
    latestBedtimeEnabled: true,
    latestWake: "09:30",
    latestWakeEnabled: true,
    minDurationMinutes: 7 * 60,
    minDurationEnabled: true,
  };
}

export function durationMs(bedtimeUtc, wakeUtc) {
  if (!bedtimeUtc || !wakeUtc) return null;
  return new Date(wakeUtc).getTime() - new Date(bedtimeUtc).getTime();
}

export function formatDuration(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return {
    hours,
    minutes,
    totalMinutes,
    label: `${hours}h ${minutes}m`,
  };
}

export function attributeWakeDate(wakeUtc, wakeTz) {
  return localParts(new Date(wakeUtc), wakeTz).isoDate;
}

/**
 * A latest bedtime at or after noon is the previous evening.
 * A latest bedtime before noon is after midnight on the wake date,
 * so 00:42 still counts as before 01:00.
 */
export function bedtimeDeadline(wakeDate, latestHHmm) {
  const [hour, minute] = String(latestHHmm).split(":").map((n) => Number(n));
  const hhmm = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  if (hour * 60 + minute >= 12 * 60) return { date: addDays(wakeDate, -1), hhmm };
  return { date: wakeDate, hhmm };
}

export function bedtimePasses({ bedtimeUtc, wakeDate, latestBedtime, zone }) {
  const deadline = bedtimeDeadline(wakeDate, latestBedtime);
  const deadlineUtc = zonedDateTimeToUtc(deadline.date, deadline.hhmm, zone);
  return new Date(bedtimeUtc).getTime() <= deadlineUtc.getTime();
}

export function wakePasses({ wakeUtc, wakeTz, latestWake }) {
  const local = localParts(new Date(wakeUtc), wakeTz);
  return local.hhmm <= String(latestWake).slice(0, 5);
}

export function evaluateSleep(record) {
  const targets = record.targets || defaultSleepTargets();
  const complete = Boolean(record.bedtimeUtc && record.wakeUtc);
  const rawMs = complete ? durationMs(record.bedtimeUtc, record.wakeUtc) : null;
  const invalidOrder = Boolean(complete && rawMs < 0);
  const duration = !complete || invalidOrder ? null : formatDuration(rawMs);
  const zone = record.wakeTz || record.bedtimeTz || "UTC";
  const wakeDate = record.wakeDate
    || (record.wakeUtc && record.wakeTz ? attributeWakeDate(record.wakeUtc, record.wakeTz) : null);
  const checks = [];

  if (targets.latestBedtimeEnabled && targets.latestBedtime) {
    checks.push({
      id: "bedtime",
      label: "Latest bedtime",
      detail: String(targets.latestBedtime).slice(0, 5),
      enabled: true,
      passed: Boolean(complete && !invalidOrder && wakeDate && bedtimePasses({
        bedtimeUtc: record.bedtimeUtc,
        wakeDate,
        latestBedtime: targets.latestBedtime,
        zone,
      })),
    });
  }
  if (targets.latestWakeEnabled && targets.latestWake) {
    checks.push({
      id: "wake",
      label: "Latest wake",
      detail: String(targets.latestWake).slice(0, 5),
      enabled: true,
      passed: Boolean(complete && !invalidOrder && wakePasses({
        wakeUtc: record.wakeUtc,
        wakeTz: record.wakeTz || zone,
        latestWake: targets.latestWake,
      })),
    });
  }
  if (targets.minDurationEnabled && targets.minDurationMinutes) {
    const need = Number(targets.minDurationMinutes);
    const hours = Math.floor(need / 60);
    const minutes = need % 60;
    checks.push({
      id: "duration",
      label: "Minimum time asleep",
      detail: minutes ? `${hours}h ${minutes}m` : `${hours}h`,
      enabled: true,
      passed: Boolean(complete && !invalidOrder && duration && duration.totalMinutes >= need),
    });
  }

  return {
    complete,
    invalidOrder,
    durationMs: duration ? rawMs : null,
    durationLabel: duration ? duration.label : null,
    checks,
    win: Boolean(complete && !invalidOrder && checks.every((check) => check.passed)),
    wakeDate,
  };
}

/** Evening bedtimes belong to the next morning. After-midnight bedtimes belong to that morning. */
export function expectedWakeDate(bedtimeUtc, bedtimeTz) {
  const local = localParts(new Date(bedtimeUtc), bedtimeTz);
  if (local.hour * 60 + local.minute >= 12 * 60) return addDays(local.isoDate, 1);
  return local.isoDate;
}

export function findOpenSleep(records) {
  return (records || []).find((record) => record.bedtimeUtc && !record.wakeUtc) || null;
}

export function findSleepByWakeDate(records, wakeDate, exceptId = null) {
  return (records || []).find((record) => record.wakeDate === wakeDate && record.id !== exceptId) || null;
}

export function submissionCheck(records, action, payload = {}) {
  if (action === "bedtime") {
    const existing = findOpenSleep(records);
    if (existing) return { ok: false, reason: "open", existing };
    return { ok: true, existing: null };
  }
  if (action === "wake") {
    const open = payload.recordId
      ? (records || []).find((record) => record.id === payload.recordId) || null
      : findOpenSleep(records);
    const clash = findSleepByWakeDate(records, payload.wakeDate, open?.id || null);
    if (clash) return { ok: false, reason: "wake-date", existing: clash };
    if (!open) return { ok: false, reason: "no-open", existing: null };
    return { ok: true, existing: open };
  }
  if (action === "manual") {
    const clash = findSleepByWakeDate(records, payload.wakeDate, payload.recordId || null);
    if (clash) return { ok: false, reason: "wake-date", existing: clash };
    const open = findOpenSleep(records);
    if (open && open.id !== payload.recordId) return { ok: false, reason: "open", existing: open };
    return { ok: true, existing: open && open.id === payload.recordId ? open : null };
  }
  return { ok: false, reason: "unknown", existing: null };
}

export function sleepSessionForDate(records, date) {
  const done = (records || []).find((record) => record.wakeDate === date);
  if (done) return { record: done, open: false, evaluation: evaluateSleep(done) };
  const open = (records || []).find((record) => (
    record.bedtimeUtc && !record.wakeUtc && expectedWakeDate(record.bedtimeUtc, record.bedtimeTz) === date
  ));
  if (open) {
    return {
      record: open,
      open: true,
      evaluation: {
        complete: false,
        invalidOrder: false,
        durationMs: null,
        durationLabel: null,
        checks: [],
        win: false,
        wakeDate: date,
      },
    };
  }
  return { record: null, open: false, evaluation: null };
}

export function sleepCalendarMark(session, date, today) {
  if (session?.open || (session?.record && session.record.bedtimeUtc && !session.record.wakeUtc)) return "incomplete";
  if (session?.evaluation?.complete) return session.evaluation.win ? "win" : "loss";
  if (date === today) return "pending";
  return "none";
}
