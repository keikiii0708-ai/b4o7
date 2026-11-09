import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BURST_MS,
  CHECK_MS,
  CHECK_PATH,
  PARTICLE_LIMIT,
  PRESS_CANCEL_DISTANCE,
  PRESS_SCALE,
  SWITCH_TRAVEL,
  allowsNavBurst,
  buttonScale,
  canRoll,
  checkEndpoints,
  checkOffset,
  easeOutCubic,
  iconScale,
  isFrozenMetric,
  metricFrame,
  particleField,
  pressScale,
  reducePress,
  sameMetricShape,
  stackableMetric,
  stepCheck,
  stepMeter,
  stepMetric,
  stepSwitch,
  switchFrame,
} from "../js/motion.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const score = (wins, losses) => `${wins}–${losses}`;

describe("button press", () => {
  it("shrinks to 96% while held and springs past 100% before settling", () => {
    assert.equal(pressScale(1, 0), 1);
    assert.equal(pressScale(1, 1), PRESS_SCALE);
    assert.ok(pressScale(1, 0.5) > PRESS_SCALE && pressScale(1, 0.5) < 1);
    assert.equal(buttonScale(PRESS_SCALE, 0), PRESS_SCALE);
    assert.equal(buttonScale(PRESS_SCALE, 1), 1);
    assert.equal(buttonScale(0.98, 1), 1);
    let peak = 0;
    for (let step = 1; step < 20; step += 1) peak = Math.max(peak, buttonScale(PRESS_SCALE, step / 20));
    assert.ok(peak > 1.02 && peak < 1.08);
  });

  it("cancels a drag, ignores a second press, and never queues a spring", () => {
    let state = null;
    let step = reducePress(state, { type: "down", key: "tab:goals", disabled: false });
    state = step.state;
    assert.equal(step.effect, "press");
    step = reducePress(state, { type: "down", key: "tab:sleep" });
    assert.equal(step.effect, "none");
    assert.equal(step.state.key, "tab:goals");
    step = reducePress(state, { type: "move", key: "tab:goals", distance: PRESS_CANCEL_DISTANCE - 1 });
    assert.equal(step.effect, "none");
    step = reducePress(state, { type: "move", key: "tab:goals", distance: PRESS_CANCEL_DISTANCE });
    state = step.state;
    assert.equal(step.effect, "snap");
    assert.equal(state.phase, "cancelled");
    step = reducePress(state, { type: "up", key: "tab:goals", reduced: false });
    assert.equal(step.effect, "snap");
    assert.equal(step.state, null);
    assert.equal(reducePress(null, { type: "down", key: "tab:home", disabled: true }).effect, "none");
    const held = reducePress(null, { type: "down", key: "save" }).state;
    assert.equal(reducePress(held, { type: "up", key: "save", reduced: true }).effect, "snap");
    assert.equal(reducePress(held, { type: "cancel", key: "save" }).effect, "snap");
  });
});

describe("elastic switch", () => {
  it("stretches into a capsule while traveling and is a circle at the ends", () => {
    const start = switchFrame(0, SWITCH_TRAVEL, 0);
    const end = switchFrame(0, SWITCH_TRAVEL, 1);
    const mid = switchFrame(0, SWITCH_TRAVEL, 0.33);
    assert.equal(start.x, 0);
    assert.equal(start.scaleX, 1);
    assert.equal(end.x, SWITCH_TRAVEL);
    assert.equal(end.scaleX, 1);
    assert.equal(end.scaleY, 1);
    assert.ok(mid.scaleX > 1.25);
    assert.ok(mid.scaleY < 1);
    assert.ok(switchFrame(0, SWITCH_TRAVEL, 0.5).x > SWITCH_TRAVEL / 2);
    const settle = switchFrame(0, SWITCH_TRAVEL, 0.9);
    assert.ok(settle.scaleX < 1.12 && settle.scaleX > 0.94);
  });

  it("does not replay a resting switch and retargets a reversal immediately", () => {
    let step = stepSwitch(null, false, 0);
    assert.equal(step.animate, false);
    assert.equal(step.pose.x, 0);
    step = stepSwitch(step.state, false, 50);
    assert.equal(step.animate, false);
    step = stepSwitch(step.state, true, 100);
    assert.equal(step.animate, true);
    assert.equal(step.pose.x, 0);
    const started = step.state.started;
    const mid = stepSwitch(step.state, true, 100 + 120);
    assert.equal(mid.state.started, started);
    assert.equal(mid.state.toX, SWITCH_TRAVEL);
    assert.ok(mid.pose.scaleX > 1);
    const back = stepSwitch(mid.state, false, 100 + 120);
    assert.equal(back.state.toX, 0);
    assert.equal(back.state.on, false);
    assert.ok(Math.abs(back.state.fromX - mid.pose.x) < 0.001);
    const reduced = stepSwitch(mid.state, false, 100 + 120, { reduced: true });
    assert.equal(reduced.animate, false);
    assert.equal(reduced.pose.x, 0);
    assert.equal(reduced.pose.scaleX, 1);
  });
});

describe("nav burst", () => {
  it("only arms Goals, Sleep, and Rewards", () => {
    assert.equal(allowsNavBurst("goals"), true);
    assert.equal(allowsNavBurst("sleep"), true);
    assert.equal(allowsNavBurst("rewards"), true);
    assert.equal(allowsNavBurst("home"), false);
    assert.equal(allowsNavBurst("history"), false);
    assert.equal(allowsNavBurst("settings"), false);
  });

  it("keeps the particle field small, radial, and bounded", () => {
    const dots = particleField(7);
    assert.equal(dots.length, 7);
    assert.equal(particleField(40).length, PARTICLE_LIMIT);
    assert.equal(particleField(0).length, 0);
    const sum = dots.reduce((acc, dot) => ({ x: acc.x + dot.x, y: acc.y + dot.y }), { x: 0, y: 0 });
    assert.ok(Math.hypot(sum.x, sum.y) < 20);
    for (const dot of dots) {
      const radius = Math.hypot(dot.x, dot.y);
      assert.ok(radius >= 20 && radius <= 32);
      assert.ok(dot.size >= 3.5 && dot.size <= 4);
    }
    assert.ok(BURST_MS < 700);
    assert.equal(iconScale(0), 1);
    assert.equal(iconScale(1), 1);
    assert.ok(iconScale(0.3) > 1.1);
  });
});

describe("checkmark", () => {
  it("draws from the lower left toward the upper right in about 200ms", () => {
    const [start, corner, end] = checkEndpoints(CHECK_PATH);
    assert.ok(start.x < end.x);
    assert.ok(start.y > end.y);
    assert.ok(corner.y > start.y);
    assert.ok(corner.x > start.x);
    assert.equal(checkOffset(0), 1);
    assert.equal(checkOffset(1), 0);
    assert.equal(checkOffset(0.5), 0.5);
    let step = stepCheck(null, true, 0);
    assert.equal(step.animate, false);
    assert.equal(step.progress, 1);
    step = stepCheck(step.state, true, 80);
    assert.equal(step.animate, false);
    step = stepCheck(step.state, false, 90);
    step = stepCheck(step.state, true, 100);
    assert.equal(step.animate, true);
    assert.equal(step.progress, 0);
    const started = step.state.started;
    step = stepCheck(step.state, true, 100 + CHECK_MS / 2);
    assert.equal(step.progress, 0.5);
    assert.equal(step.state.started, started);
    step = stepCheck(step.state, true, 100 + CHECK_MS);
    assert.equal(step.animate, false);
    assert.equal(step.progress, 1);
    step = stepCheck(step.state, true, 100 + CHECK_MS + 50);
    assert.equal(step.animate, false);
    const armed = stepCheck(null, true, 10, { armed: true });
    assert.equal(armed.animate, true);
    const reduced = stepCheck({ checked: false, drawing: false, started: 0 }, true, 10, { reduced: true });
    assert.equal(reduced.animate, false);
    assert.equal(reduced.progress, 1);
  });
});

describe("numeric counters", () => {
  it("eases out, lands on the exact text, and does not roll clocks or dates", () => {
    assert.equal(canRoll(score(2, 1)), true);
    assert.equal(canRoll("3 of 4"), true);
    assert.equal(canRoll("3 / 8 · 5 remaining"), true);
    assert.equal(canRoll("50%"), true);
    assert.equal(canRoll("12:05"), false);
    assert.equal(canRoll("1:02:03"), false);
    assert.equal(canRoll("7h 53m"), false);
    assert.equal(canRoll("2026-11-08"), false);
    assert.equal(canRoll("—"), false);
    assert.equal(isFrozenMetric({ tagName: "INPUT", dataset: {}, className: "" }), true);
    assert.equal(isFrozenMetric({ tagName: "SPAN", dataset: { remaining: "1" }, className: "timer-readout" }), true);
    assert.equal(isFrozenMetric({ tagName: "P", dataset: { clock: "1" }, className: "clock-xl" }), true);
    assert.equal(isFrozenMetric({ tagName: "P", dataset: {}, className: "score" }), false);

    const early = Number(metricFrame("0", "100", 0.25));
    const mid = Number(metricFrame("0", "100", 0.5));
    const late = Number(metricFrame("0", "100", 0.75));
    assert.equal(metricFrame("0", "100", 0), "0");
    assert.equal(metricFrame("0", "100", 1), "100");
    assert.ok(early > 25);
    assert.ok(mid > 70);
    assert.ok(early - 0 > 100 - late);
    assert.ok(Number(metricFrame("10", "0", 0.5)) < 5);
    assert.ok(easeOutCubic(0.5) > 0.5);

    let step = stepMetric(null, score(2, 1), 0);
    assert.equal(step.animate, false);
    assert.equal(step.display, score(2, 1));
    step = stepMetric(step.state, score(2, 1), 40);
    assert.equal(step.animate, false);
    step = stepMetric(step.state, score(4, 1), 100);
    assert.equal(step.animate, true);
    assert.equal(step.display, score(2, 1));
    const started = step.state.started;
    const half = stepMetric(step.state, score(4, 1), 100 + step.state.dur / 2);
    assert.equal(half.state.started, started);
    assert.equal(half.state.to, score(4, 1));
    const shown = Number(half.display.split("–")[0]);
    assert.ok(shown > 3);
    const done = stepMetric(half.state, score(4, 1), half.state.started + half.state.dur);
    assert.equal(done.animate, false);
    assert.equal(done.display, score(4, 1));
    assert.equal(stepMetric(done.state, "04–1", done.state.started + 10).display, "04–1");
  });

  it("retargets a reversal instead of playing the stale count", () => {
    let step = stepMetric(null, score(1, 0), 0);
    step = stepMetric(step.state, score(9, 0), 1000);
    const halfway = 1000 + step.state.dur / 2;
    step = stepMetric(step.state, score(9, 0), halfway);
    step = stepMetric(step.state, score(4, 0), halfway);
    assert.equal(step.state.to, score(4, 0));
    assert.notEqual(step.state.to, score(9, 0));
    const finished = stepMetric(step.state, score(4, 0), step.state.started + step.state.dur + 5);
    assert.equal(finished.display, score(4, 0));
    assert.equal(finished.animate, false);
    const reduced = stepMetric(finished.state, score(1, 0), 5000, { reduced: true });
    assert.equal(reduced.display, score(1, 0));
    assert.equal(reduced.animate, false);
    assert.equal(sameMetricShape("2 of 4", "3 of 4"), true);
    assert.equal(sameMetricShape("2 wins", "1 win"), false);
    assert.equal(stackableMetric(score(2, 1), score(3, 1)), true);
    assert.equal(stackableMetric("0%", "80%"), false);
    assert.equal(stepMetric(null, "12:05", 0).animate, false);
    assert.equal(stepMetric({ from: "12:05", to: "12:05", started: 0, dur: 0 }, "12:06", 100).animate, false);
  });

  it("eases a meter to the exact ratio and does not restart it", () => {
    let step = stepMeter(null, 0.25, 0);
    assert.equal(step.animate, false);
    assert.equal(step.value, 0.25);
    step = stepMeter(step.state, 0.75, 200);
    assert.equal(step.animate, true);
    const mid = stepMeter(step.state, 0.75, 200 + step.state.dur / 2);
    assert.ok(mid.value > 0.25 + (0.75 - 0.25) * 0.5);
    assert.equal(mid.state.started, step.state.started);
    const done = stepMeter(mid.state, 0.75, mid.state.started + mid.state.dur);
    assert.equal(done.value, 0.75);
    assert.equal(done.animate, false);
    const back = stepMeter(done.state, 0.5, 900);
    const reversed = stepMeter(back.state, 0.1, 900);
    assert.equal(reversed.state.to, 0.1);
    const exact = stepMeter(reversed.state, 0.1, reversed.state.started + reversed.state.dur);
    assert.equal(exact.value, 0.1);
  });
});

describe("precache", () => {
  it("bumps the service worker and caches every app script", () => {
    const sw = readFileSync(join(root, "sw.js"), "utf8");
    assert.match(sw, /const CACHE = "b4o7-v6"/);
    assert.doesNotMatch(sw, /b4o7-v4/);
    const assets = [...sw.matchAll(/"(\.\/[^"]+)"/g)].map((match) => match[1]);
    const files = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (name.endsWith(".js")) files.push(path.slice(root.length).split("\\").join("/"));
      }
    };
    walk(join(root, "js"));
    for (const file of files) assert.ok(assets.includes(`./${file}`), file);
    const main = readFileSync(join(root, "js/main.js"), "utf8");
    assert.match(main, /installMotion\(\)/);
    assert.match(main, /syncMotion\(app\)/);
    const css = readFileSync(join(root, "css/app.css"), "utf8");
    assert.match(css, /\.toggle\.on i \{ transform: translateX\(20px\); \}/);
    assert.match(css, /\.nav-burst/);
    assert.match(css, /\.check-mark/);
    assert.doesNotMatch(css, /scale\(0\.985\)/);
  });
});
