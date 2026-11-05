import { addDays, offsetString, weekDates, zonedDateTimeToUtc } from "./dates.js";
import { makeWeekSnapshot } from "./scoring.js";
import { defaultSleepTargets } from "./sleep.js";

const PLANS = {
  read: ["win", "win", "loss", "win", "win", "loss", "win"],
  strength: ["win", "win", "win", "win", "loss", "win", "loss"],
  sleep: ["win", "win", "win", "loss", "win", "win", "loss"],
};

export function buildDemo(today, zone, weekStartsOn = "monday") {
  const dates = weekDates(today, weekStartsOn);
  const prev = dates.map((_, index) => addDays(dates[0], index - 7));
  const prev2 = dates.map((_, index) => addDays(dates[0], index - 14));
  const targets = defaultSleepTargets();
  const stamp = new Date().toISOString();

  const read = goal({
    id: "demo-read",
    name: "Read",
    description: "Twenty pages, anywhere quiet.",
    icon: "📖",
    notes: "Paper or screen. Twenty pages is a win. More is extra.",
    completionMethod: "manual",
    weeklyReward: {
      name: "An hour at the bookshop",
      description: "Browse with no errand attached.",
      priceLabel: "$24",
      imageId: null,
    },
    createdAt: isoAt(prev2[0], "08:00", zone),
    createdOn: prev2[0],
  });
  const strength = goal({
    id: "demo-strength",
    name: "Strength",
    description: "Twenty-five quiet minutes.",
    icon: "🏋️",
    notes: "Start the timer before anything else.",
    completionMethod: "timer",
    timerDurationMinutes: 25,
    weeklyReward: {
      name: "New lifting straps",
      description: "A small thing that makes the next session easier.",
      priceLabel: "$32",
      imageId: null,
    },
    createdAt: isoAt(prev2[0], "08:05", zone),
    createdOn: prev2[0],
  });
  const lights = goal({
    id: "demo-sleep",
    name: "Lights out",
    description: "In bed by 1:00, up by 9:30, at least 7 hours.",
    icon: "🌙",
    notes: "The interval is a record of the night, not a medical score.",
    completionMethod: "sleep",
    weeklyTarget: 4,
    weeklyReward: {
      name: "A slow morning",
      description: "No alarm on the morning after the series is won.",
      priceLabel: "Free",
      imageId: null,
    },
    createdAt: isoAt(prev2[0], "08:10", zone),
    createdOn: prev2[0],
  });

  const goals = [read, strength, lights];
  const dailyRecords = [
    ...explicitWins(read.id, prev2, [0, 2, 4, 6], today),
    ...explicitWins(read.id, prev, [0, 1, 3, 5], today),
    ...explicitWins(read.id, dates, indexes(PLANS.read, "win"), today),
    ...explicitWins(strength.id, prev2, [0, 1], today),
    ...explicitWins(strength.id, prev, [0, 2, 4, 6], today),
    ...explicitWins(strength.id, dates, indexes(PLANS.strength, "win"), today),
  ];
  const sleepRecords = [
    ...sleepPlan(prev2, today, zone, ["win", "win", "win", "win", "loss", "win", "win"], targets),
    ...sleepPlan(prev, today, zone, ["win", "win", "win", "win", "win", "win", "loss"], targets),
    ...sleepPlan(dates, today, zone, PLANS.sleep, targets),
  ];
  const weeks = [prev2[0], prev[0], dates[0]];
  const weekSnapshots = goals.flatMap((item) => weeks.map((weekStart) => ({
    ...makeWeekSnapshot(item, weekStart, weekStartsOn, isoAt(weekStart, "00:10", zone)),
    demo: true,
  })));
  const rewardClaims = [
    claim(read, prev2[0], weekSnapshots, true),
    claim(read, prev[0], weekSnapshots, true),
    claim(strength, prev[0], weekSnapshots, false),
    claim(lights, prev2[0], weekSnapshots, true),
    claim(lights, prev[0], weekSnapshots, true),
  ].filter(Boolean);
  const milestones = [
    {
      id: "demo-ms-read",
      goalId: read.id,
      kind: "consecutive",
      required: 4,
      rewardDescription: "A weekend with nothing scheduled.",
      unlockedAt: null,
      claimedAt: null,
      demo: true,
    },
    {
      id: "demo-ms-strength",
      goalId: strength.id,
      kind: "total",
      required: 8,
      rewardDescription: "New training shoes.",
      unlockedAt: null,
      claimedAt: null,
      demo: true,
    },
  ];
  const journal = [{
    id: today,
    date: today,
    body: "Kept the evening clear. The series is still open, and that is enough.",
    mood: "Focused",
    demo: true,
    createdAt: stamp,
    updatedAt: stamp,
  }];
  const weeklyReviews = [{
    id: prev[0],
    weekStart: prev[0],
    weekEnd: prev[6],
    wentWell: "The book stayed on the table, so reading actually happened.",
    heldBack: "A late night made the next morning slower than I wanted.",
    improve: "Start the timer before opening anything else.",
    skipped: false,
    demo: true,
    createdAt: stamp,
    updatedAt: stamp,
  }];
  return { goals, dailyRecords, sleepRecords, milestones, journal, weeklyReviews, weekSnapshots, rewardClaims };
}

function goal(partial) {
  return {
    description: "",
    icon: "🎯",
    imageId: null,
    weeklyTarget: 4,
    completionMethod: "manual",
    timerDurationMinutes: 25,
    thresholdLabel: "pages",
    thresholdTarget: 20,
    restDays: [],
    reminder: { enabled: false, time: "21:00" },
    notes: "",
    weeklyReward: { name: "", description: "", priceLabel: "", imageId: null },
    status: "active",
    skipIntervals: [],
    demo: true,
    updatedAt: partial.createdAt,
    ...partial,
  };
}

function indexes(plan, kind) {
  return plan.map((mark, index) => (mark === kind ? index : -1)).filter((index) => index >= 0);
}

function explicitWins(goalId, dates, marks, today) {
  return marks
    .filter((index) => dates[index] && dates[index] < today)
    .map((index) => ({
      id: `${goalId}:${dates[index]}`,
      goalId,
      date: dates[index],
      explicit: "win",
      timerStartedAt: null,
      timerEndedAt: null,
      thresholdValue: null,
      corrected: false,
      note: "",
      demo: true,
      createdAt: `${dates[index]}T12:00:00.000Z`,
      updatedAt: `${dates[index]}T12:00:00.000Z`,
    }));
}

function sleepPlan(dates, today, zone, plan, targets) {
  return dates.flatMap((date, index) => {
    if (date >= today) return [];
    if (plan[index] === "win") return [sleepNight(date, zone, { bed: "23:11", wake: "07:04", targets })];
    if (plan[index] === "loss") return [sleepNight(date, zone, { bed: "01:40", wake: "07:05", targets })];
    return [];
  });
}

function sleepNight(wakeDate, zone, { bed, wake, targets }) {
  const bedHour = Number(bed.slice(0, 2));
  const bedDate = bedHour >= 12 ? addDays(wakeDate, -1) : wakeDate;
  const bedUtc = zonedDateTimeToUtc(bedDate, bed, zone);
  const wakeUtc = zonedDateTimeToUtc(wakeDate, wake, zone);
  return {
    id: `demo-sleep-${wakeDate}`,
    bedtimeUtc: bedUtc.toISOString(),
    bedtimeTz: zone,
    bedtimeOffset: offsetString(bedUtc, zone),
    wakeUtc: wakeUtc.toISOString(),
    wakeTz: zone,
    wakeOffset: offsetString(wakeUtc, zone),
    wakeDate,
    targets,
    note: "",
    corrected: false,
    original: null,
    demo: true,
    createdAt: wakeUtc.toISOString(),
    updatedAt: wakeUtc.toISOString(),
  };
}

function claim(item, weekStart, snapshots, claimed) {
  const snapshot = snapshots.find((entry) => entry.id === `${item.id}:${weekStart}`);
  if (!snapshot?.reward) return null;
  return {
    id: `${item.id}:${weekStart}`,
    goalId: item.id,
    weekStart,
    unlockedAt: `${weekStart}T18:00:00.000Z`,
    claimedAt: claimed ? `${weekStart}T19:00:00.000Z` : null,
    reward: snapshot.reward,
    demo: true,
  };
}

function isoAt(date, hhmm, zone) {
  return zonedDateTimeToUtc(date, hhmm, zone).toISOString();
}
