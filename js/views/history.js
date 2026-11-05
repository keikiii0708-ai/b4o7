import { addDays, formatMonthYear, formatPrettyDate, formatRange, monthGrid, shiftMonth, weekDayLetters, weekMeta } from "../dates.js";
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
    topbar({ title: "History", onSettings: () => ctx.go("/settings") }),
    goals.length ? h("div", { class: "chips" }, goals.map((goal) => h("button", {
      class: `chip${selected?.id === goal.id ? " on" : ""}`,
      onClick: () => ctx.go(`/history/${goal.id}`),
    }, goal.name))) : h("p", { class: "muted", text: "History appears here after you add a goal." }),
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
      stat(String(stats.totalWon), "Weeks won"),
      stat(String(stats.totalLost), "Weeks closed"),
      stat(formatPercent(stats.winRate), "Win rate"),
      stat(String(stats.currentStreak), "Current streak"),
    ]),
    h("p", { class: "hint", style: { marginTop: "8px" }, text: `Longest streak ${stats.longestStreak} · ${stats.totalSuccessfulDays} successful days · this month ${performance.wins} wins, ${performance.losses} losses` }),
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
    h("p", { class: "eyebrow", text: "Series" }),
    h("div", { class: "list" }, recent.map((week) => h("button", {
      class: "list-row",
      onClick: () => ctx.go(`/history/review/${week.weekStart}`),
    }, [
      progressRing(week.dayStates, { size: 32, hidden: true }),
      h("span", { class: "grow" }, [
        h("strong", { text: `${week.meta.label}  ${week.result.score}` }),
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
      h("h2", { class: "note-label", text: "A little note about today" }),
      dayNote(ctx, date, entry),
    ]),
    h("p", { class: "eyebrow", text: "Sleep" }),
    session.record ? h("button", { class: "list-row", onClick: () => ctx.go(`/sleep/${session.record.wakeDate || "open"}`) }, [
      h("span", { class: "grow" }, [
        h("strong", { text: evaluation?.durationLabel || (session.open ? "Incomplete" : "Night") }),
        h("span", { class: "sub", text: evaluation ? (evaluation.win ? "Targets passed" : "A target was missed") : "No duration yet" }),
      ]),
    ]) : h("p", { class: "muted", text: "No sleep record." }),
    h("p", { class: "eyebrow", text: "Goals" }),
    h("div", { class: "stack" }, ctx.state.goals.map((goal) => dayGoal(ctx, goal, date))),
    rewardLines(ctx, date),
  ]);
}

function dayNote(ctx, date, entry) {
  const editing = ctx.memory.dayNote?.date === date;
  if (!editing) {
    return h("div", {}, [
      entry?.mood ? h("p", { class: "hint", text: entry.mood }) : null,
      h("p", { class: entry ? "note-body" : "hint", text: entry?.body || "Write something about your day…" }),
      h("div", { class: "correct-row" }, [
        h("button", {
          class: "btn ghost small",
          onClick: () => {
            ctx.memory.dayNote = { date, body: entry?.body || "", mood: entry?.mood || null };
            ctx.draw();
          },
        }, entry ? "Edit" : "Add a note"),
        entry ? h("button", { class: "btn ghost small", onClick: () => ctx.actions.deleteJournal(date) }, "Delete") : null,
      ]),
    ]);
  }
  const draft = ctx.memory.dayNote;
  return h("div", {}, [
    h("textarea", {
      "aria-label": "A little note about today",
      placeholder: "Write something about your day…",
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
    }, mood))),
    h("div", { class: "correct-row" }, [
      h("button", {
        class: "btn primary small",
        onClick: async () => {
          await ctx.actions.saveJournal({ date, body: draft.body, mood: draft.mood });
          ctx.memory.dayNote = null;
          ctx.draw();
        },
      }, "Save note"),
      h("button", { class: "btn ghost small", onClick: () => { ctx.memory.dayNote = null; ctx.draw(); } }, "Close"),
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
      h("span", { class: `pill ${state === "win" ? "win" : state === "loss" ? "loss" : ""}`, text: state }),
    ]),
    record?.corrected ? h("p", { class: "hint", text: "Corrected" }) : null,
    h("div", { class: "correct-row" }, [
      ["win", "Win"],
      ["loss", "Loss"],
      ["neutral", "Rest"],
      [null, "Clear"],
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
    h("p", { class: "eyebrow", text: "Rewards" }),
    h("div", { class: "stack" }, hits.map((claim) => {
      const goal = ctx.state.goals.find((item) => item.id === claim.goalId);
      return h("p", { text: `${goal?.name || "Goal"} · ${claim.reward?.name || "Reward"} · ${claim.claimedAt?.slice(0, 10) === date ? "claimed" : "unlocked"}` });
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
    title: "Weekly review",
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
    sample ? h("p", { class: "hint", text: "Each goal keeps its own result. This note is private and does not change a score." }) : null,
    area("What went well?", "wentWell", draft),
    area("What held you back?", "heldBack", draft),
    area("What to improve next week?", "improve", draft),
    h("p", { class: "hint", text: "Every question can stay empty." }),
    h("div", { class: "stack", style: { marginTop: "14px" } }, [
      h("button", { class: "btn primary block", type: "submit" }, "Save review"),
      h("button", {
        class: "btn ghost block",
        type: "button",
        onClick: async () => {
          await ctx.actions.saveReview({ weekStart, weekEnd, wentWell: "", heldBack: "", improve: "", skipped: true });
          ctx.go("/history");
        },
      }, "Skip for now"),
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
