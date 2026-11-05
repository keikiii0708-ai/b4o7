import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDemo } from "../js/demo.js";
import { buildGoalWeek } from "../js/selectors.js";
import { evaluateSleep } from "../js/sleep.js";

describe("demo data", () => {
  it("builds a Thursday series that is still in the game, 2–1", () => {
    const demo = buildDemo("2026-11-05", "Australia/Melbourne", "monday");
    const state = { settings: { weekStartsOn: "monday" }, sleepRecords: demo.sleepRecords, ...demo };
    const read = demo.goals.find((goal) => goal.id === "demo-read");
    const week = buildGoalWeek(read, state, "2026-11-02", "2026-11-05");
    assert.equal(week.result.score, "2–1");
    assert.equal(week.result.status, "in_progress");
    assert.equal(week.copy, "STILL IN THE GAME. You have 2 more chances to reach your target.");

    const strength = demo.goals.find((goal) => goal.id === "demo-strength");
    const strengthWeek = buildGoalWeek(strength, state, "2026-11-02", "2026-11-05");
    assert.equal(strengthWeek.result.score, "3–0");
    assert.equal(strengthWeek.result.winsNeeded, 1);

    const lights = demo.goals.find((goal) => goal.id === "demo-sleep");
    const sleepWeek = buildGoalWeek(lights, state, "2026-11-02", "2026-11-05");
    assert.equal(sleepWeek.result.wins, 3);
    assert.equal(sleepWeek.result.status, "in_progress");

    const past = buildGoalWeek(read, state, "2026-10-19", "2026-11-05");
    assert.equal(past.result.score, "4–3");
    assert.equal(past.result.status, "won");

    const lastNight = demo.sleepRecords.find((record) => record.wakeDate === "2026-11-04");
    assert.equal(evaluateSleep(lastNight).win, true);
    assert.equal(evaluateSleep(lastNight).durationLabel, "7h 53m");
  });
});
