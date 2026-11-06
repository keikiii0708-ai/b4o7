import { addDays, weekdayIndex, weekStartDate } from "./dates.js";
import { t } from "./i18n.js";

export function validateGoalConfig({ weeklyTarget, restDays }) {
  const target = Number(weeklyTarget);
  const unique = [...new Set((restDays || []).map((d) => Number(d)).filter((d) => d >= 0 && d <= 6))];
  const playable = 7 - unique.length;
  if (!Number.isInteger(target) || target < 1 || target > 7) {
    return { ok: false, playable, restDays: unique, reason: t("error.targetRange") };
  }
  if (playable < target) {
    return {
      ok: false,
      playable,
      restDays: unique,
      reason: t("error.restDays", { count: playable, target }),
    };
  }
  return { ok: true, playable, restDays: unique, reason: "" };
}

export function timerStatus(startedAtIso, durationMinutes, nowMs) {
  const minutes = Number(durationMinutes) || 0;
  const need = minutes * 60000;
  if (!startedAtIso || minutes <= 0) {
    return { running: false, elapsedMs: 0, rawElapsedMs: 0, remainingMs: need, done: false };
  }
  const elapsed = Math.max(0, nowMs - new Date(startedAtIso).getTime());
  const done = elapsed >= need;
  return {
    running: !done,
    elapsedMs: Math.min(elapsed, need),
    rawElapsedMs: elapsed,
    remainingMs: Math.max(0, need - elapsed),
    done,
  };
}

export function thresholdMet(value, target) {
  if (value == null || value === "" || target == null || target === "") return false;
  const n = typeof value === "number" ? value : Number(value);
  const t = typeof target === "number" ? target : Number(target);
  if (!Number.isFinite(n) || !Number.isFinite(t)) return false;
  return n >= t;
}

export function dateInIntervals(date, intervals) {
  return (intervals || []).some((interval) => date >= interval.start && (interval.end == null || date <= interval.end));
}

/**
 * Day state for one goal on one civil date.
 * Today without a result is pending. A past unfinished day is a loss.
 * An incomplete sleep session stays pending. Rest days are neutral.
 */
export function deriveDayState({
  date,
  today,
  restDays = [],
  record = null,
  method = "manual",
  timerDurationMinutes = null,
  thresholdTarget = null,
  sleepEval = null,
  skipIntervals = [],
  createdOn = "",
  nowMs = Date.now(),
}) {
  if (createdOn && date < createdOn) return "neutral";
  if (dateInIntervals(date, skipIntervals)) return "neutral";
  if (record?.explicit === "win") return "win";
  if (record?.explicit === "loss") return "loss";
  if (record?.explicit === "neutral") return "neutral";

  let autoWin = false;
  if (method === "timer" && record?.timerStartedAt) {
    const status = timerStatus(record.timerStartedAt, timerDurationMinutes, nowMs);
    if (status.done || record.timerEndedAt) autoWin = true;
  }
  if (method === "threshold" && thresholdMet(record?.thresholdValue, thresholdTarget)) autoWin = true;
  if (method === "sleep" && sleepEval?.complete && sleepEval.win) autoWin = true;
  if (autoWin) return "win";

  if (restDays.includes(weekdayIndex(date))) return "neutral";

  if (method === "sleep" && sleepEval && sleepEval.complete === false) return "pending";
  if (method === "sleep" && sleepEval?.complete && sleepEval.win === false) return "loss";

  if (date > today) return "upcoming";
  if (date === today) return "pending";
  return "loss";
}

export function evaluateWeek({ states, target, today, weekEnd }) {
  let wins = 0;
  let losses = 0;
  let pending = 0;
  let neutral = 0;
  let upcoming = 0;
  for (const state of states) {
    if (state === "win") wins += 1;
    else if (state === "loss") losses += 1;
    else if (state === "pending") pending += 1;
    else if (state === "neutral") neutral += 1;
    else upcoming += 1;
  }
  const weekClosed = today > weekEnd;
  const chances = weekClosed ? 0 : pending + upcoming;
  const winsNeeded = Math.max(0, target - wins);
  let status;
  if (wins >= target) status = "won";
  else if (weekClosed || wins + chances < target) status = "lost";
  else status = "in_progress";
  return {
    wins,
    losses,
    pending,
    neutral,
    upcoming,
    chances,
    winsNeeded,
    status,
    weekClosed,
    score: `${wins}–${losses}`,
    target,
  };
}

export function seriesCopy(result) {
  if (result.status === "won") {
    if (result.wins > result.target) return t("series.wonExtra");
    return t("series.won");
  }
  if (result.status === "lost") {
    if (result.weekClosed) return t("series.lostClosed");
    return t("series.lostReach");
  }
  return t("series.chances", { count: result.winsNeeded });
}

export function statusLabel(status) {
  if (status === "won") return t("series.statusWon");
  if (status === "lost") return t("series.statusLost");
  return t("series.statusLive");
}

function rewardSnapshot(goal) {
  const reward = goal.weeklyReward;
  if (!reward || !String(reward.name || "").trim()) return null;
  return {
    name: String(reward.name).trim(),
    description: reward.description || "",
    priceLabel: reward.priceLabel || "",
    imageId: reward.imageId || null,
  };
}

export function makeWeekSnapshot(goal, weekStart, weekStartsOn, capturedAt) {
  return {
    id: `${goal.id}:${weekStart}`,
    goalId: goal.id,
    weekStart,
    weekStartsOn,
    target: goal.weeklyTarget,
    restDays: [...(goal.restDays || [])],
    completionMethod: goal.completionMethod || "manual",
    timerDurationMinutes: goal.timerDurationMinutes ?? null,
    thresholdLabel: goal.thresholdLabel ?? null,
    thresholdTarget: goal.thresholdTarget ?? null,
    reward: rewardSnapshot(goal),
    capturedAt: capturedAt || null,
  };
}

/** Past weeks keep the snapshot. The open week follows the goal as it is now. */
export function resolveSnapshot(existing, goal, weekStart, weekStartsOn, today) {
  const weekEnd = addDays(weekStart, 6);
  if (existing && today > weekEnd) return existing;
  return makeWeekSnapshot(goal, weekStart, weekStartsOn, existing?.capturedAt || null);
}

export function snapshotsEqual(a, b) {
  if (!a || !b) return false;
  return a.target === b.target
    && a.weekStartsOn === b.weekStartsOn
    && a.completionMethod === b.completionMethod
    && a.timerDurationMinutes === b.timerDurationMinutes
    && a.thresholdTarget === b.thresholdTarget
    && a.thresholdLabel === b.thresholdLabel
    && JSON.stringify(a.restDays) === JSON.stringify(b.restDays)
    && JSON.stringify(a.reward) === JSON.stringify(b.reward);
}

/**
 * When the week-start setting changes, past series keep the target from the
 * snapshot that covered most of those dates.
 */
export function remapSnapshots(oldSnapshots, goal, newWeekStartsOn, today) {
  const created = String(goal.createdAt || today).slice(0, 10);
  let cursor = weekStartDate(created, newWeekStartsOn);
  const current = weekStartDate(today, newWeekStartsOn);
  const mine = (oldSnapshots || []).filter((snapshot) => snapshot.goalId === goal.id);
  const out = [];
  while (cursor <= current) {
    const end = addDays(cursor, 6);
    const dates = Array.from({ length: 7 }, (_, i) => addDays(cursor, i));
    let best = null;
    let bestCount = 0;
    for (const snapshot of mine) {
      const snapshotEnd = addDays(snapshot.weekStart, 6);
      const count = dates.filter((date) => date >= snapshot.weekStart && date <= snapshotEnd).length;
      if (count > bestCount) {
        best = snapshot;
        bestCount = count;
      }
    }
    const past = today > end;
    if (past && best) {
      out.push({
        ...best,
        id: `${goal.id}:${cursor}`,
        goalId: goal.id,
        weekStart: cursor,
        weekStartsOn: newWeekStartsOn,
      });
    } else {
      out.push(makeWeekSnapshot(goal, cursor, newWeekStartsOn, best?.capturedAt || null));
    }
    cursor = addDays(cursor, 7);
  }
  return out;
}

export function streakStats(weeks) {
  let longest = 0;
  let run = 0;
  let totalWon = 0;
  let totalLost = 0;
  let successfulDays = 0;
  for (const week of weeks) {
    successfulDays += week.wins || 0;
    if (week.status === "in_progress") continue;
    if (week.status === "won") {
      totalWon += 1;
      run += 1;
      if (run > longest) longest = run;
    } else if (week.status === "lost") {
      totalLost += 1;
      run = 0;
    }
  }
  const finished = totalWon + totalLost;
  return {
    currentStreak: run,
    longestStreak: longest,
    totalWon,
    totalLost,
    winRate: finished === 0 ? null : totalWon / finished,
    totalSuccessfulDays: successfulDays,
  };
}

export function milestoneProgress(weeks, milestone) {
  const countable = weeks.filter((week) => week.status === "won" || week.status === "lost");
  let consecutive = 0;
  for (let i = countable.length - 1; i >= 0; i -= 1) {
    if (countable[i].status === "won") consecutive += 1;
    else break;
  }
  const total = countable.filter((week) => week.status === "won").length;
  const current = milestone.kind === "consecutive" ? consecutive : total;
  const reached = current >= milestone.required;
  const unlocked = reached || Boolean(milestone.unlockedAt);
  return {
    current,
    required: milestone.required,
    remaining: unlocked ? 0 : Math.max(0, milestone.required - current),
    reached,
    unlocked,
  };
}

export function rewardState(weekStatus, claim) {
  if (claim?.claimedAt) return "claimed";
  if (weekStatus === "won") return "unlocked";
  return "locked";
}

export function monthPerformance(dayEntries) {
  let wins = 0;
  let losses = 0;
  let pending = 0;
  let neutral = 0;
  for (const entry of dayEntries) {
    if (entry.state === "win") wins += 1;
    else if (entry.state === "loss") losses += 1;
    else if (entry.state === "pending" || entry.state === "incomplete") pending += 1;
    else if (entry.state === "neutral") neutral += 1;
  }
  const decided = wins + losses;
  return {
    wins,
    losses,
    pending,
    neutral,
    rate: decided === 0 ? null : wins / decided,
  };
}
