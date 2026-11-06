import { addDays, formatMonthYear, formatPrettyDate, formatRange, monthGrid, shiftMonth, weekDayLetters, weekMeta } from "../dates.js";
import { displayDuration, historySummary, moodLabel, stateLabel, t, weekLabel } from "../i18n.js";
import { goalStats, monthDaysForGoal, performanceForMonth } from "../selectors.js";
import { sleepSessionForDate, evaluateSleep } from "../sleep.js";
import { buildGoalWeek } from "../selectors.js";
import { MOODS, calendar, formatPercent, h, monthSwitcher, progressRing, sheetFrame, topbar } from "../ui.js";
import { statusLabel } from "../scoring.js";

export function renderHistory(ctx) {
  if (ctx.route.name === "day") return renderDay(ctx);
  const home = renderHistoryHome(ctx);
  if (ctx.route.name === "review") return h("div", {}, [home, renderReview(ctx)]);
  return home;
}

function renderHistoryHome(ctx) {
  const goals = ctx.state.goals;
  const selected = goals.find((goal) => goal.id === ctx.route.goalId) || goals[0] || null;
  const month = ctx.memory.historyMonth || monthOf(ctx.today);
  ctx.memory.historyMonth = month;
  return h("div", {}, [
    topbar({ title: t("title.history"), onSettings: () => ctx.go("/settings") }),
    goals.length ? h("div", { class: "chips" }, goals.map((goal) => h("button", {
      class: `chip${selected?.id === goal.id ? " on" : ""}`,
      onClick: () => ctx.go(`/history/${goal.id}`),
    }, goal.name))) : h("p", { class: "muted", text: t("history.empty") }),
    selected ? goalHistory(ctx, selected, month) : null,
  ]);
}

function goalHistory(ctx, goal, month) {
  const { stats, weeks } = goalStats(goal, ctx.state, ctx.today, ctx.now);
  const cells = monthGrid(month.year, month.month, ctx.state.settings.weekStartsOn);
  const dayMap = new Map(monthDaysForGoal(goal, ctx.state, month.year, month.month, ctx.today, ctx.now).map((day) => [day.date, day.state]));
  const performance = performanceForMonth(goal, ctx.state, month.year, month.month, ctx.today, ctx.now);
  const recent = [...weeks].reverse().slice(0, 16);
  return h("div", {}, [
    h("div", { class: "stats", style: { marginTop: "16px" } }, [
      stat(String(stats.totalWon), t("goal.weeksWon")),
      stat(String(stats.totalLost), t("goal.weeksClosed")),
      stat(formatPercent(stats.winRate), t("history.winRate")),
      stat(String(stats.currentStreak), t("goal.currentStreak")),
    ]),
    h("p", { class: "hint", style: { marginTop: "8px" }, text: historySummary({
      streak: stats.longestStreak,
      days: stats.totalSuccessfulDays,
      wins: performance.wins,
      losses: performance.losses,
    }) }),
    monthSwitcher(formatMonthYear(month.year, month.month), () => {
      ctx.memory.historyMonth = shiftMonth(month.year, month.month, -1);
      ctx.draw();
    }, () => {
      ctx.memory.historyMonth = shiftMonth(month.year, month.month, 1);
      ctx.draw();
    }),
    calendar({
      cells,
      letters: weekDayLetters(ctx.state.settings.weekStartsOn),
      today: ctx.today,
      marks: (date) => dayMap.get(date) || "none",
      onPick: (date) => ctx.go(`/history/day/${date}`),
    }),
    h("p", { class: "eyebrow", text: t("history.series") }),
    h("div", { class: "list" }, recent.map((week) => h("button", {
      class: "list-row",
      onClick: () => ctx.go(`/history/review/${week.weekStart}`),
    }, [
      progressRing(week.dayStates, { size: 32, hidden: true }),
      h("span", { class: "grow" }, [
        h("strong", { text: `${weekLabel(week.meta.number)}  ${week.result.score}` }),
        h("span", { class: "sub", text: `${formatRange(week.weekStart, week.weekEnd)} · ${statusLabel(week.result.status)}` }),
      ]),
    ]))),
  ]);
}

function renderDay(ctx) {
  const date = ctx.route.date;
  const entry = ctx.state.journal.find((item) => item.date === date);
  const session = sleepSessionForDate(ctx.state.sleepRecords, date);
  const evaluation = session.record?.wakeUtc ? evaluateSleep(session.record) : null;
  return h("div", {}, [
    topbar({ title: formatPrettyDate(date), onBack: () => ctx.go("/history"), onSettings: () => ctx.go("/settings") }),
    h("section", { class: "card" }, [
      h("h2", { class: "note-label", text: t("home.noteLabel") }),
      dayNote(ctx, date, entry),
    ]),
    h("p", { class: "eyebrow", text: t("home.sleep") }),
    session.record ? h("button", { class: "list-row", onClick: () => ctx.go(`/sleep/${session.record.wakeDate || "open"}`) }, [
      h("span", { class: "grow" }, [
        h("strong", { text: displayDuration(evaluation?.durationLabel) || (session.open ? t("home.incomplete") : t("history.night")) }),
        h("span", { class: "sub", text: evaluation ? (evaluation.win ? t("history.targetsPassed") : t("history.targetMissed")) : t("history.noDuration") }),
      ]),
    ]) : h("p", { class: "muted", text: t("history.noSleep") }),
    h("p", { class: "eyebrow", text: t("title.goals") }),
    h("div", { class: "stack" }, ctx.state.goals.map((goal) => dayGoal(ctx, goal, date))),
    rewardLines(ctx, date),
  ]);
}

function dayNote(ctx, date, entry) {
  const editing = ctx.memory.dayNote?.date === date;
  if (!editing) {
    return h("div", {}, [
      entry?.mood ? h("p", { class: "hint", text: moodLabel(entry.mood) }) : null,
      h("p", { class: entry ? "note-body" : "hint", text: entry?.body || t("home.notePlaceholder") }),
      h("div", { class: "correct-row" }, [
        h("button", {
          class: "btn ghost small",
          onClick: () => {
            ctx.memory.dayNote = { date, body: entry?.body || "", mood: entry?.mood || null };
            ctx.draw();
          },
        }, entry ? t("goal.edit") : t("history.addNote")),
        entry ? h("button", { class: "btn ghost small", onClick: () => ctx.actions.deleteJournal(date) }, t("goal.delete")) : null,
      ]),
    ]);
  }
  const draft = ctx.memory.dayNote;
  return h("div", {}, [
    h("textarea", {
      "aria-label": t("home.noteLabel"),
      placeholder: t("home.notePlaceholder"),
      "data-live": "text",
      value: draft.body,
      onInput: (event) => { draft.body = event.target.value; },
    }),
    h("div", { class: "mood-row" }, MOODS.map((mood) => h("button", {
      type: "button",
      class: `chip${draft.mood === mood ? " on" : ""}`,
      onClick: () => {
        draft.mood = draft.mood === mood ? null : mood;
        ctx.draw();
      },
    }, moodLabel(mood)))),
    h("div", { class: "correct-row" }, [
      h("button", {
        class: "btn primary small",
        onClick: async () => {
          await ctx.actions.saveJournal({ date, body: draft.body, mood: draft.mood });
          ctx.memory.dayNote = null;
          ctx.draw();
        },
      }, t("home.saveNote")),
      h("button", { class: "btn ghost small", onClick: () => { ctx.memory.dayNote = null; ctx.draw(); } }, t("action.close")),
    ]),
  ]);
}

function dayGoal(ctx, goal, date) {
  const week = buildGoalWeek(goal, ctx.state, weekMeta(date, ctx.state.settings.weekStartsOn).start, ctx.today, ctx.now);
  const index = week.dates.indexOf(date);
  const state = index >= 0 ? week.dayStates[index] : "none";
  const record = ctx.state.dailyRecords.find((item) => item.goalId === goal.id && item.date === date);
  return h("div", { class: "card" }, [
    h("div", { class: "spread" }, [
      h("strong", { text: `${goal.icon || ""} ${goal.name}`.trim() }),
      h("span", { class: `pill ${state === "win" ? "win" : state === "loss" ? "loss" : ""}`, text: stateLabel(state) }),
    ]),
    record?.corrected ? h("p", { class: "hint", text: t("sleep.corrected") }) : null,
    h("div", { class: "correct-row" }, [
      ["win", t("state.win")],
      ["loss", t("state.loss")],
      ["neutral", t("state.neutral")],
      [null, t("history.clear")],
    ].map(([explicit, label]) => h("button", {
      class: `chip${record?.explicit === explicit ? " on" : ""}`,
      onClick: () => ctx.actions.setDayExplicit(goal.id, date, explicit),
    }, label))),
  ]);
}

function rewardLines(ctx, date) {
  const hits = ctx.state.rewardClaims.filter((claim) => claim.unlockedAt?.slice(0, 10) === date || claim.claimedAt?.slice(0, 10) === date);
  if (!hits.length) return null;
  return h("section", {}, [
    h("p", { class: "eyebrow", text: t("history.rewards") }),
    h("div", { class: "stack" }, hits.map((claim) => {
      const goal = ctx.state.goals.find((item) => item.id === claim.goalId);
      const verb = claim.claimedAt?.slice(0, 10) === date ? t("history.claimed") : t("history.unlocked");
      return h("p", { text: `${goal?.name || t("history.goalFallback")} · ${claim.reward?.name || t("reward.fallback")} · ${verb}` });
    })),
  ]);
}

function renderReview(ctx) {
  const weekStart = ctx.route.weekStart;
  const weekEnd = addDays(weekStart, 6);
  const existing = ctx.state.weeklyReviews.find((review) => review.weekStart === weekStart);
  const draft = ctx.memory.reviewDraft?.weekStart === weekStart
    ? ctx.memory.reviewDraft
    : {
      weekStart,
      wentWell: existing?.wentWell || "",
      heldBack: existing?.heldBack || "",
      improve: existing?.improve || "",
    };
  ctx.memory.reviewDraft = draft;
  const goal = ctx.state.goals[0];
  const sample = goal ? buildGoalWeek(goal, ctx.state, weekStart, ctx.today, ctx.now) : null;
  return sheetFrame({
    title: t("home.review"),
    onClose: () => ctx.go("/history"),
    children: h("form", {
      class: "sheet-form",
      onSubmit: async (event) => {
        event.preventDefault();
        await ctx.actions.saveReview({ ...draft, weekEnd, skipped: false });
        ctx.go("/history");
      },
    }, [
    h("p", { class: "hint", text: formatRange(weekStart, weekEnd) }),
    sample ? h("p", { class: "hint", text: t("history.reviewNote") }) : null,
    area(t("history.wentWell"), "wentWell", draft),
    area(t("history.heldBack"), "heldBack", draft),
    area(t("history.improve"), "improve", draft),
    h("p", { class: "hint", text: t("history.canStayEmpty") }),
    h("div", { class: "stack", style: { marginTop: "14px" } }, [
      h("button", { class: "btn primary block", type: "submit" }, t("history.saveReview")),
      h("button", {
        class: "btn ghost block",
        type: "button",
        onClick: async () => {
          await ctx.actions.saveReview({ weekStart, weekEnd, wentWell: "", heldBack: "", improve: "", skipped: true });
          ctx.go("/history");
        },
      }, t("home.skip")),
    ]),
    ]),
  });
}

function area(label, key, draft) {
  return h("label", { class: "field" }, [
    h("span", { class: "field-label", text: label }),
    h("textarea", {
      "data-live": "text",
      value: draft[key],
      onInput: (event) => { draft[key] = event.target.value; },
    }),
  ]);
}

function stat(num, label) {
  return h("div", { class: "stat" }, [h("p", { class: "stat-num", text: num }), h("p", { text: label })]);
}

function monthOf(iso) {
  const [year, month] = iso.split("-").map(Number);
  return { year, month };
}
