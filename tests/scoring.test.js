import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, weekDates } from "../js/dates.js";
import {
  deriveDayState,
  evaluateWeek,
  makeWeekSnapshot,
  milestoneProgress,
  remapSnapshots,
  resolveSnapshot,
  seriesCopy,
  statusLabel,
  streakStats,
  thresholdMet,
  timerStatus,
  validateGoalConfig,
} from "../js/scoring.js";
import { buildGoalWeek } from "../js/selectors.js";

const WEEK = weekDates("2026-11-05", "monday");
const TODAY = "2026-11-05";

function statesFrom(marks, today = TODAY, restDays = []) {
  return WEEK.map((date) => deriveDayState({
    date,
    today,
    restDays,
    record: marks[date] ? { explicit: marks[date] } : null,
    method: "manual",
  }));
}

function evaluate(marks, target, today = TODAY, restDays = []) {
  return evaluateWeek({
    states: statesFrom(marks, today, restDays),
    target,
    today,
    weekEnd: WEEK[6],
  });
}

describe("series scoring", () => {
  it("wins a 4-of-7 series with non-consecutive wins", () => {
    const marks = {
      "2026-11-02": "win",
      "2026-11-03": "loss",
      "2026-11-04": "win",
      "2026-11-05": "loss",
      "2026-11-06": "win",
      "2026-11-07": "loss",
      "2026-11-08": "win",
    };
    const result = evaluate(marks, 4, "2026-11-09");
    assert.equal(result.wins, 4);
    assert.equal(result.losses, 3);
    assert.equal(result.score, "4–3");
    assert.equal(result.status, "won");
    assert.equal(result.weekClosed, true);
    assert.match(seriesCopy(result), /SERIES WON/);
    assert.equal(statusLabel(result.status), "SERIES WON");
  });

  it("keeps counting wins after the series is already won", () => {
    const marks = {
      "2026-11-02": "win",
      "2026-11-03": "win",
      "2026-11-04": "win",
      "2026-11-05": "win",
      "2026-11-06": "win",
    };
    const result = evaluate(marks, 4, "2026-11-06");
    assert.equal(result.status, "won");
    assert.equal(result.wins, 5);
    assert.equal(result.score, "5–0");
    assert.match(seriesCopy(result), /Extra wins still count/);
  });

  it("honours targets other than 4", () => {
    const one = evaluate({ "2026-11-02": "win" }, 1, TODAY);
    assert.equal(one.status, "won");

    const fiveEarly = evaluate({
      "2026-11-02": "win",
      "2026-11-03": "win",
      "2026-11-04": "win",
    }, 5, TODAY);
    assert.equal(fiveEarly.status, "in_progress");
    assert.equal(fiveEarly.winsNeeded, 2);

    const all = evaluate({
      "2026-11-02": "win",
      "2026-11-03": "win",
      "2026-11-04": "win",
      "2026-11-05": "win",
      "2026-11-06": "win",
      "2026-11-07": "win",
      "2026-11-08": "win",
    }, 7, "2026-11-08");
    assert.equal(all.status, "won");
    assert.equal(all.wins, 7);
  });

  it("treats today as pending and a missed past day as a loss", () => {
    const states = statesFrom({ "2026-11-02": "win" }, TODAY);
    assert.deepEqual(states, ["win", "loss", "loss", "pending", "upcoming", "upcoming", "upcoming"]);
    const result = evaluateWeek({ states, target: 4, today: TODAY, weekEnd: WEEK[6] });
    assert.equal(result.status, "in_progress");
    assert.equal(result.score, "1–2");
    assert.equal(result.winsNeeded, 3);
    assert.equal(seriesCopy(result), "STILL IN THE GAME. You have 3 more chances to reach your target.");
  });

  it("uses the two-chance comeback line while the series is open", () => {
    const result = evaluate({
      "2026-11-02": "win",
      "2026-11-03": "win",
      "2026-11-04": "loss",
    }, 4, TODAY);
    assert.equal(result.wins, 2);
    assert.equal(result.losses, 1);
    assert.equal(result.winsNeeded, 2);
    assert.equal(result.status, "in_progress");
    assert.equal(seriesCopy(result), "STILL IN THE GAME. You have 2 more chances to reach your target.");
  });

  it("closes a series when the target becomes impossible", () => {
    const friday = "2026-11-06";
    const result = evaluate({}, 4, friday);
    assert.equal(result.wins, 0);
    assert.equal(result.chances, 3);
    assert.equal(result.status, "lost");
    assert.equal(result.weekClosed, false);
    assert.match(seriesCopy(result), /out of reach/);
  });

  it("closes a finished week that ended below the target", () => {
    const result = evaluate({
      "2026-11-02": "win",
      "2026-11-03": "win",
      "2026-11-04": "win",
    }, 4, "2026-11-09");
    assert.equal(result.weekClosed, true);
    assert.equal(result.status, "lost");
    assert.equal(result.score, "3–4");
    assert.match(seriesCopy(result), /Every week is another series/);
  });

  it("does not let a leftover pending day keep a closed week alive", () => {
    const result = evaluateWeek({
      states: ["win", "win", "win", "pending", "loss", "loss", "loss"],
      target: 4,
      today: "2026-11-09",
      weekEnd: "2026-11-08",
    });
    assert.equal(result.pending, 1);
    assert.equal(result.status, "lost");
  });

  it("scores rest days as neutral and rejects an impossible target", () => {
    assert.equal(validateGoalConfig({ weeklyTarget: 4, restDays: [0, 6] }).ok, true);
    assert.equal(validateGoalConfig({ weeklyTarget: 6, restDays: [0, 6] }).ok, false);
    assert.equal(validateGoalConfig({ weeklyTarget: 4, restDays: [1, 2, 3, 4] }).ok, false);
    assert.match(validateGoalConfig({ weeklyTarget: 4, restDays: [1, 1, 2, 3, 4] }).reason, /impossible/);

    const today = "2026-11-08";
    const states = statesFrom({
      "2026-11-02": "win",
      "2026-11-03": "win",
      "2026-11-04": "win",
      "2026-11-05": "win",
      "2026-11-06": "loss",
    }, today, [0, 6]);
    assert.equal(states[5], "neutral");
    assert.equal(states[6], "neutral");
    const result = evaluateWeek({ states, target: 4, today, weekEnd: WEEK[6] });
    assert.equal(result.status, "won");
    assert.equal(result.neutral, 2);
    assert.equal(result.score, "4–1");
  });

  it("lets an explicit win override a rest day and lets a pause erase a loss", () => {
    assert.equal(deriveDayState({
      date: "2026-11-07",
      today: "2026-11-08",
      restDays: [6],
      record: { explicit: "win" },
    }), "win");
    assert.equal(deriveDayState({
      date: "2026-11-03",
      today: TODAY,
      skipIntervals: [{ start: "2026-11-03", end: "2026-11-04" }],
    }), "neutral");
  });

  it("completes timers from the stored start and thresholds from the number", () => {
    const start = "2026-11-05T00:00:00.000Z";
    const now = Date.parse(start) + 25 * 60000;
    assert.equal(timerStatus(start, 25, now).done, true);
    assert.equal(timerStatus(start, 25, Date.parse(start) + 10 * 60000).done, false);
    assert.equal(timerStatus(null, 25, now).done, false);
    assert.equal(deriveDayState({
      date: TODAY,
      today: TODAY,
      method: "timer",
      timerDurationMinutes: 25,
      record: { timerStartedAt: start },
      nowMs: now,
    }), "win");
    assert.equal(thresholdMet(20, 20), true);
    assert.equal(thresholdMet(19, 20), false);
    assert.equal(deriveDayState({
      date: "2026-11-03",
      today: TODAY,
      method: "threshold",
      thresholdTarget: 20,
      record: { thresholdValue: 20 },
    }), "win");
  });

  it("keeps incomplete sleep pending and failed sleep as a loss", () => {
    assert.equal(deriveDayState({
      date: "2026-11-03",
      today: TODAY,
      method: "sleep",
      sleepEval: { complete: false, win: false },
    }), "pending");
    assert.equal(deriveDayState({
      date: "2026-11-03",
      today: TODAY,
      method: "sleep",
      sleepEval: { complete: true, win: false },
    }), "loss");
    assert.equal(deriveDayState({
      date: "2026-11-03",
      today: TODAY,
      method: "sleep",
      sleepEval: { complete: true, win: true },
    }), "win");
    assert.equal(deriveDayState({ date: "2026-11-03", today: TODAY, method: "sleep" }), "loss");
    assert.equal(deriveDayState({ date: TODAY, today: TODAY, method: "sleep" }), "pending");
  });
});

describe("history integrity", () => {
  it("does not let a new target rewrite a past week snapshot", () => {
    const goal = {
      id: "g1",
      weeklyTarget: 4,
      restDays: [],
      completionMethod: "manual",
      weeklyReward: { name: "Book", description: "A paperback", priceLabel: "$20", imageId: null },
    };
    const past = makeWeekSnapshot(goal, "2026-10-26", "monday", "2026-10-26T00:00:00.000Z");
    const edited = { ...goal, weeklyTarget: 7, restDays: [0, 6], weeklyReward: { name: "Trip", description: "", priceLabel: "", imageId: "new" } };
    const frozen = resolveSnapshot(past, edited, "2026-10-26", "monday", "2026-11-05");
    assert.equal(frozen.target, 4);
    assert.deepEqual(frozen.restDays, []);
    assert.equal(frozen.reward.name, "Book");

    const open = makeWeekSnapshot(goal, "2026-11-02", "monday", "2026-11-02T00:00:00.000Z");
    const current = resolveSnapshot(open, edited, "2026-11-02", "monday", "2026-11-05");
    assert.equal(current.target, 7);
    assert.deepEqual(current.restDays, [0, 6]);
    assert.equal(current.reward.name, "Trip");
  });

  it("scores a saved week with its snapshot after the goal changes", () => {
    const goal = {
      id: "g1",
      name: "Read",
      weeklyTarget: 7,
      restDays: [0, 6],
      completionMethod: "threshold",
      thresholdTarget: 50,
      thresholdLabel: "pages",
      timerDurationMinutes: null,
      weeklyReward: null,
      createdAt: "2026-10-26T00:00:00.000Z",
      skipIntervals: [],
    };
    const weekStart = "2026-10-26";
    const dates = weekDates(weekStart, "monday");
    const snapshot = makeWeekSnapshot({ ...goal, weeklyTarget: 4, restDays: [], completionMethod: "manual", thresholdTarget: null }, weekStart, "monday", "2026-10-26T00:00:00.000Z");
    const dailyRecords = [
      { id: "a", goalId: "g1", date: dates[0], explicit: "win" },
      { id: "b", goalId: "g1", date: dates[2], explicit: "win" },
      { id: "c", goalId: "g1", date: dates[4], explicit: "win" },
      { id: "d", goalId: "g1", date: dates[6], explicit: "win" },
    ];
    const week = buildGoalWeek(goal, {
      settings: { weekStartsOn: "monday" },
      weekSnapshots: [snapshot],
      dailyRecords,
      sleepRecords: [],
    }, weekStart, "2026-11-05");
    assert.equal(week.result.status, "won");
    assert.equal(week.result.score, "4–3");
    assert.equal(week.snapshot.target, 4);
  });

  it("carries the old target onto regrouped weeks when the week start changes", () => {
    const goal = {
      id: "g1",
      weeklyTarget: 7,
      restDays: [],
      completionMethod: "manual",
      createdAt: "2026-10-20T00:00:00.000Z",
    };
    const old = [makeWeekSnapshot({ ...goal, weeklyTarget: 4 }, "2026-10-26", "monday", "2026-10-26T00:00:00.000Z")];
    const remapped = remapSnapshots(old, goal, "sunday", "2026-11-05");
    const overlapped = remapped.find((snapshot) => snapshot.weekStart === "2026-10-25");
    assert.ok(overlapped);
    assert.equal(overlapped.target, 4);
    assert.equal(overlapped.weekStartsOn, "sunday");
    const current = remapped.find((snapshot) => snapshot.weekStart === weekDates("2026-11-05", "sunday")[0]);
    assert.equal(current.target, 7);
  });
});

describe("streaks and milestones", () => {
  const weeks = [
    { status: "won", wins: 4 },
    { status: "won", wins: 5 },
    { status: "lost", wins: 2 },
    { status: "won", wins: 4 },
    { status: "won", wins: 4 },
    { status: "won", wins: 4 },
    { status: "in_progress", wins: 2 },
  ];

  it("counts the current streak, the longest streak, and the win rate", () => {
    const stats = streakStats(weeks);
    assert.equal(stats.currentStreak, 3);
    assert.equal(stats.longestStreak, 3);
    assert.equal(stats.totalWon, 5);
    assert.equal(stats.totalLost, 1);
    assert.equal(stats.winRate, 5 / 6);
    assert.equal(stats.totalSuccessfulDays, 25);
    const ended = streakStats([...weeks.slice(0, 3), { status: "lost", wins: 1 }]);
    assert.equal(ended.currentStreak, 0);
    assert.equal(ended.longestStreak, 2);
  });

  it("resets consecutive progress on a loss and keeps the total", () => {
    const history = [
      { status: "won" },
      { status: "won" },
      { status: "won" },
      { status: "lost" },
      { status: "won" },
    ];
    const consecutive = milestoneProgress(history, { kind: "consecutive", required: 4 });
    assert.equal(consecutive.current, 1);
    assert.equal(consecutive.remaining, 3);
    assert.equal(consecutive.unlocked, false);
    const total = milestoneProgress(history, { kind: "total", required: 4 });
    assert.equal(total.current, 4);
    assert.equal(total.remaining, 0);
    assert.equal(total.unlocked, true);
    const kept = milestoneProgress(
      [...history, { status: "lost" }],
      { kind: "consecutive", required: 3, unlockedAt: "2026-10-01T00:00:00.000Z" },
    );
    assert.equal(kept.current, 0);
    assert.equal(kept.unlocked, true);
    assert.equal(kept.remaining, 0);
  });
});

describe("sunday series", () => {
  it("scores a Sunday-start week on its own seven dates", () => {
    const dates = weekDates("2026-11-05", "sunday");
    const states = dates.map((date) => deriveDayState({
      date,
      today: "2026-11-08",
      record: ["2026-11-01", "2026-11-03", "2026-11-05", "2026-11-07"].includes(date) ? { explicit: "win" } : null,
    }));
    const result = evaluateWeek({ states, target: 4, today: "2026-11-08", weekEnd: dates[6] });
    assert.equal(dates[0], "2026-11-01");
    assert.equal(dates[6], "2026-11-07");
    assert.equal(result.status, "won");
    assert.equal(result.score, "4–3");
  });
});
