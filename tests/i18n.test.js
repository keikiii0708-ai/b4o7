import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateBackup, buildCsv } from "../js/backup.js";
import { formatMonthYear, formatPrettyDate, weekDayLetters, weekMeta } from "../js/dates.js";
import { buildDemo } from "../js/demo.js";
import { zh } from "../js/locales/zh.js";
import {
  LOCALE_STORAGE_KEY,
  displayDuration,
  getLocale,
  historySummary,
  messageKeys,
  moodLabel,
  onLocaleChange,
  setLocale,
  t,
} from "../js/i18n.js";
import { seriesCopy, statusLabel, validateGoalConfig } from "../js/scoring.js";
import { blankGoal, defaultSettings } from "../js/store.js";

const memory = new Map();
globalThis.localStorage = {
  getItem(key) {
    return memory.has(key) ? memory.get(key) : null;
  },
  setItem(key, value) {
    memory.set(String(key), String(value));
  },
  removeItem(key) {
    memory.delete(key);
  },
};

const SAMPLE = {
  count: 2,
  target: 4,
  wins: 3,
  losses: 1,
  hours: 7,
  minutes: 53,
  number: 2,
  padded: "02",
  field: "goals",
  name: "Read",
  word: "DELETE",
  date: "6 Nov",
  time: "23:11",
  zone: "UTC",
  streak: 3,
  days: "2 successful days",
  current: 1,
  required: 4,
  remaining: 3,
  length: "7h",
  parts: "bed by 01:00",
};

beforeEach(() => {
  memory.clear();
  setLocale("en");
});

afterEach(() => {
  memory.clear();
  setLocale("en");
});

describe("language preference", () => {
  it("stays English when nothing has been chosen, even if the device language is Chinese", () => {
    const previous = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { language: "zh-CN", languages: ["zh-CN", "zh"] },
    });
    try {
      memory.delete(LOCALE_STORAGE_KEY);
      assert.equal(getLocale(), "en");
      assert.equal(t("nav.home"), "Home");
    } finally {
      Object.defineProperty(globalThis, "navigator", { configurable: true, value: previous });
    }
  });

  it("ignores unknown saved values and keeps English", () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "zh-CN");
    assert.equal(getLocale(), "en");
    localStorage.setItem(LOCALE_STORAGE_KEY, "fr");
    assert.equal(getLocale(), "en");
    localStorage.setItem(LOCALE_STORAGE_KEY, "");
    assert.equal(getLocale(), "en");
  });

  it("persists an explicit choice and reads it again like a reload", () => {
    assert.equal(setLocale("zh"), "zh");
    assert.equal(localStorage.getItem(LOCALE_STORAGE_KEY), "zh");
    assert.equal(getLocale(), "zh");
    assert.equal(t("title.settings"), "设置");
    setLocale("en");
    assert.equal(localStorage.getItem(LOCALE_STORAGE_KEY), "en");
    assert.equal(getLocale(), "en");
    assert.equal(t("title.settings"), "Settings");
  });

  it("keeps the choice for this visit when storage is blocked", () => {
    const real = globalThis.localStorage;
    globalThis.localStorage = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    };
    try {
      assert.equal(setLocale("zh"), "zh");
      assert.equal(getLocale(), "zh");
      assert.equal(t("nav.sleep"), "睡眠");
    } finally {
      globalThis.localStorage = real;
    }
    assert.equal(getLocale(), "en");
  });

  it("notifies listeners only when the language actually changes", () => {
    const seen = [];
    const stop = onLocaleChange((locale) => seen.push(locale));
    setLocale("en");
    setLocale("zh");
    setLocale("zh");
    setLocale("en");
    stop();
    setLocale("zh");
    assert.deepEqual(seen, ["zh", "en"]);
  });
});

describe("catalogs", () => {
  it("gives Simplified Chinese a string for every English key, and falls back when one is missing", () => {
    const english = messageKeys("en");
    const chinese = messageKeys("zh");
    assert.deepEqual(chinese, english);
    for (const key of english) {
      const enText = t(key, SAMPLE, "en");
      const zhText = t(key, SAMPLE, "zh");
      assert.equal(typeof enText, "string", key);
      assert.equal(typeof zhText, "string", key);
      assert.notEqual(enText, key, key);
      assert.notEqual(zhText, key, key);
      assert.notEqual(zhText, enText, key);
    }

    const saved = zh.nav.home;
    delete zh.nav.home;
    try {
      assert.equal(t("nav.home", {}, "zh"), "Home");
    } finally {
      zh.nav.home = saved;
    }
    assert.equal(t("nav.home", {}, "zh"), "首页");
    assert.equal(t("does.not.exist", {}, "zh"), "does.not.exist");
    assert.equal(t("nav.home", {}, "zh-CN"), "Home");
  });

  it("uses every t() key that the app asks for", () => {
    const root = fileURLToPath(new URL("../js/", import.meta.url));
    const files = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name === "locales") continue;
          walk(path);
        } else if (name.endsWith(".js")) files.push(path);
      }
    };
    walk(root);
    const used = new Set();
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/\bt\(\s*"([^"]+)"/g)) used.add(match[1]);
    }
    assert.ok(used.size > 100);
    for (const key of used) assert.notEqual(t(key, SAMPLE, "zh"), key, key);
    for (const key of ["state.win", "state.loss", "state.pending", "state.neutral", "goalStatus.active", "goalStatus.paused", "goalStatus.archived", "rewardStatus.locked", "rewardStatus.unlocked", "rewardStatus.claimed", "mood.Productive", "mood.Focused"]) {
      assert.notEqual(t(key, {}, "zh"), key);
    }
  });

  it("keeps the language names recognizable in both languages", () => {
    const settings = readFileSync(new URL("../js/views/settings.js", import.meta.url), "utf8");
    assert.match(settings, /"English"/);
    assert.match(settings, /"简体中文"/);
    assert.match(settings, /data-locale": value/);
  });
});

describe("plurals, dates, and copy", () => {
  it("pluralizes English counts and keeps a single Chinese form", () => {
    setLocale("en");
    assert.equal(t("series.chances", { count: 1 }), "STILL IN THE GAME. You have 1 more chance to reach your target.");
    assert.equal(t("series.chances", { count: 2 }), "STILL IN THE GAME. You have 2 more chances to reach your target.");
    assert.equal(seriesCopy({ status: "in_progress", winsNeeded: 1 }), "STILL IN THE GAME. You have 1 more chance to reach your target.");
    assert.equal(statusLabel("won"), "SERIES WON");
    assert.match(validateGoalConfig({ weeklyTarget: 4, restDays: [1, 2, 3, 4] }).reason, /impossible/);
    assert.equal(historySummary({ streak: 3, days: 1, wins: 1, losses: 2 }), "Longest streak 3 · 1 successful day · this month 1 win, 2 losses");

    setLocale("zh");
    assert.equal(seriesCopy({ status: "in_progress", winsNeeded: 2 }), "还在系列里。还差 2 次就能达到目标。");
    assert.equal(seriesCopy({ status: "won", wins: 4, target: 4 }), "系列赛已赢。");
    assert.equal(statusLabel("lost"), "系列赛结束");
    assert.equal(t("series.chances", { count: 1 }), t("series.chances", { count: 2 }).replace("2", "1"));
    assert.match(validateGoalConfig({ weeklyTarget: 4, restDays: [1, 2, 3, 4] }).reason, /不可能/);
    assert.equal(historySummary({ streak: 3, days: 10, wins: 4, losses: 2 }), "最长连胜 3 · 成功 10 天 · 本月赢 4，输 2");
  });

  it("formats dates and weekday letters for the active language without moving the week", () => {
    setLocale("en");
    assert.match(formatPrettyDate("2026-11-06"), /Friday/);
    assert.match(formatPrettyDate("2026-11-06"), /November/);
    assert.deepEqual(weekDayLetters("monday"), ["M", "T", "W", "T", "F", "S", "S"]);
    const label = weekMeta("2026-11-05", "monday").label;

    setLocale("zh");
    const pretty = formatPrettyDate("2026-11-06");
    assert.match(pretty, /11月/);
    assert.match(pretty, /6日|星期五|周五/);
    assert.match(formatMonthYear(2026, 11), /2026年11月/);
    assert.deepEqual(weekDayLetters("sunday"), ["日", "一", "二", "三", "四", "五", "六"]);
    assert.equal(weekMeta("2026-11-05", "monday").label, label);
    assert.equal(weekMeta("2026-11-05", "monday").start, "2026-11-02");
    assert.equal(displayDuration("7h 53m"), "7小时53分");

    setLocale("en");
    assert.equal(displayDuration("7h 53m"), "7h 53m");
  });
});

describe("stored data stays put", () => {
  it("does not put language into settings, goal defaults, demo records, or CSV enums", () => {
    setLocale("zh");
    const settings = defaultSettings();
    assert.equal(settings.weekStartsOn, "monday");
    assert.equal(Object.hasOwn(settings, "locale"), false);
    assert.equal(Object.hasOwn(settings, "language"), false);
    assert.equal(blankGoal().thresholdLabel, "pages");
    assert.equal(blankGoal().status, "active");

    const demo = buildDemo("2026-11-06", "UTC");
    assert.equal(demo.goals.find((goal) => goal.id === "demo-read").name, "Read");
    assert.equal(demo.journal[0].mood, "Focused");
    assert.match(demo.journal[0].body, /Kept the evening/);
    assert.equal(moodLabel(demo.journal[0].mood), "专注");
    assert.equal(moodLabel("我自己写的心情"), "我自己写的心情");
    assert.equal(t("reminder.open", { name: "Read" }), "Read 今天还没记。");
    assert.equal(t("goal.deleteTitle", { name: "晨跑" }), "删除晨跑？");

    const csv = buildCsv({
      goals: [],
      sleepRecords: [],
      journal: [],
      weeklyReviews: [],
      rewardClaims: [],
    }, "2026-11-06");
    assert.match(csv, /^type,date,goal,status,detail,note,corrected/);

    const reason = validateBackup({
      app: "B4O7",
      version: 1,
      goals: [{ id: "goal-1", name: "Read 20 pages", weeklyTarget: 9 }],
    });
    assert.match(reason, /Read 20 pages/);
    assert.match(reason, /不在 1 到 7/);
    const field = validateBackup({ app: "B4O7", version: 1, goals: {} });
    assert.match(field, /goals/);
    assert.match(field, /不是列表/);

    setLocale("en");
    assert.equal(validateBackup({ app: "nope" }), "That file is not a B4O7 backup.");
    assert.equal(moodLabel("Focused"), "Focused");
  });
});
