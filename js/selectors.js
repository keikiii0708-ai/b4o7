import { addDays, weekMeta } from "./dates.js";
import {
  deriveDayState,
  evaluateWeek,
  makeWeekSnapshot,
  milestoneProgress,
  monthPerformance,
  rewardState,
  seriesCopy,
  streakStats,
} from "./scoring.js";
import { sleepSessionForDate } from "./sleep.js";

export function buildGoalWeek(goal, state, weekStart, today, nowMs = Date.now()) {
  const weekStartsOn = state.settings?.weekStartsOn || "monday";
  const dates = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const stored = (state.weekSnapshots || []).find((snapshot) => snapshot.id === `${goal.id}:${weekStart}`);
  const snapshot = stored || makeWeekSnapshot(goal, weekStart, weekStartsOn, null);
  const dayStates = dates.map((date) => {
    const record = (state.dailyRecords || []).find((item) => item.goalId === goal.id && item.date === date) || null;
    const session = snapshot.completionMethod === "sleep"
      ? sleepSessionForDate(state.sleepRecords || [], date)
      : null;
    return deriveDayState({
      date,
      today,
      restDays: snapshot.restDays || [],
      record,
      method: snapshot.completionMethod || "manual",
      timerDurationMinutes: snapshot.timerDurationMinutes,
      thresholdTarget: snapshot.thresholdTarget,
      sleepEval: session?.evaluation || null,
      skipIntervals: goal.skipIntervals || [],
      createdOn: String(goal.createdOn || goal.createdAt || "").slice(0, 10),
      nowMs,
    });
  });
  const result = evaluateWeek({
    states: dayStates,
    target: snapshot.target,
    today,
    weekEnd: dates[6],
  });
  const claim = (state.rewardClaims || []).find((item) => item.id === `${goal.id}:${weekStart}`) || null;
  return {
    goalId: goal.id,
    weekStart,
    weekEnd: dates[6],
    dates,
    dayStates,
    result,
    snapshot,
    copy: seriesCopy(result),
    meta: weekMeta(weekStart, snapshot.weekStartsOn || weekStartsOn),
    claim,
    rewardStatus: snapshot.reward ? rewardState(result.status, claim) : null,
  };
}

export function listWeeks(goal, state, today, nowMs = Date.now()) {
  const weekStartsOn = state.settings?.weekStartsOn || "monday";
  const created = String(goal.createdAt || today).slice(0, 10);
  let cursor = weekStartOf(created, weekStartsOn);
  const current = weekStartOf(today, weekStartsOn);
  const weeks = [];
  while (cursor <= current) {
    weeks.push(buildGoalWeek(goal, state, cursor, today, nowMs));
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

function weekStartOf(iso, weekStartsOn) {
  return buildWeekStart(iso, weekStartsOn);
}

function buildWeekStart(iso, weekStartsOn) {
  return weekMeta(iso, weekStartsOn).start;
}

export function goalStats(goal, state, today, nowMs = Date.now()) {
  const weeks = listWeeks(goal, state, today, nowMs);
  const stats = streakStats(weeks.map((week) => ({
    status: week.result.status,
    wins: week.result.wins,
  })));
  return { weeks, stats };
}

export function milestoneCards(goal, state, today, nowMs = Date.now()) {
  const { weeks } = goalStats(goal, state, today, nowMs);
  const inputs = weeks.map((week) => ({ status: week.result.status, wins: week.result.wins }));
  return (state.milestones || [])
    .filter((milestone) => milestone.goalId === goal.id)
    .map((milestone) => ({ milestone, progress: milestoneProgress(inputs, milestone) }));
}

export function monthDaysForGoal(goal, state, year, month, today, nowMs = Date.now()) {
  const weekStartsOn = state.settings?.weekStartsOn || "monday";
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const start = weekMeta(first, weekStartsOn).start;
  const entries = [];
  let cursor = start;
  const monthEnd = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  while (cursor < monthEnd || entries.length % 7 !== 0) {
    const weekStart = weekMeta(cursor, weekStartsOn).start;
    const week = buildGoalWeek(goal, state, weekStart, today, nowMs);
    const index = week.dates.indexOf(cursor);
    const parts = cursor.split("-").map(Number);
    entries.push({
      date: cursor,
      inMonth: parts[1] === month && parts[0] === year,
      state: index >= 0 ? week.dayStates[index] : "upcoming",
    });
    cursor = addDays(cursor, 1);
    if (entries.length > 42) break;
  }
  return entries;
}

export function performanceForMonth(goal, state, year, month, today, nowMs = Date.now()) {
  const days = monthDaysForGoal(goal, state, year, month, today, nowMs).filter((day) => day.inMonth);
  return monthPerformance(days);
}
