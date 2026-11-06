import { addDays, formatPrettyDate, weekMeta } from "../dates.js";
import { displayDuration, moodLabel, t } from "../i18n.js";
import { shouldRemindBackup } from "../reminders.js";
import { buildGoalWeek } from "../selectors.js";
import { evaluateSleep, findOpenSleep } from "../sleep.js";
import { MOODS, emptyState, h, meter, renderTodayAction, seriesCard, topbar } from "../ui.js";

export function renderHome(ctx) {
  const active = ctx.state.goals.filter((goal) => goal.status === "active");
  const weekStart = weekMeta(ctx.today, ctx.state.settings.weekStartsOn).start;
  const ranked = active
    .map((goal) => ({ goal, week: buildGoalWeek(goal, ctx.state, weekStart, ctx.today, ctx.now) }))
    .sort((a, b) => rank(a.week.result) - rank(b.week.result) || b.week.result.winsNeeded - a.week.result.winsNeeded);

  return h("div", {}, [
    topbar({
      brand: true,
      date: formatPrettyDate(ctx.today),
      onSettings: () => ctx.go("/settings"),
    }),
    ctx.reminder ? reminderBanner(ctx) : null,
    shouldRemindBackup(ctx.state, ctx.today) ? backupBanner(ctx) : null,
    ranked.length ? homeFilled(ctx, ranked) : homeEmpty(ctx),
  ]);
}

function rank(result) {
  if (result.status === "in_progress") return 0;
  if (result.status === "won") return 1;
  return 2;
}

function homeEmpty(ctx) {
  return h("section", { class: "empty hero-empty" }, [
    h("img", { class: "brand-hero", src: "./icons/favicon.svg", alt: "", width: "96", height: "96" }),
    h("p", { class: "slogan", text: t("copy.own") }),
    h("h2", { text: t("copy.series") }),
    h("p", { class: "muted", text: t("copy.win4") }),
    h("button", { class: "btn primary block", onClick: () => ctx.go("/goals/new") }, t("home.addGoal")),
  ]);
}

function homeFilled(ctx, ranked) {
  const review = reviewPrompt(ctx);
  const [lead, ...rest] = ranked;
  const card = (goal, week, featured) => seriesCard({
    goal,
    week,
    weekStartsOn: ctx.state.settings.weekStartsOn,
    featured,
    onOpen: () => ctx.go(`/goals/${goal.id}`),
    footer: h("div", { class: featured ? "hero-action" : "spread series-foot" }, [
      h("span", { class: "hint", text: actionHint(goal, week) }),
      renderTodayAction(ctx, goal, week),
    ]),
  });
  return h("div", { class: "home-grid" }, [
    h("section", { class: "home-primary" }, [
      card(lead.goal, lead.week, true),
      rest.length ? h("p", { class: "eyebrow", text: t("home.also") }) : null,
      rest.length ? h("div", { class: "stack" }, rest.map(({ goal, week }) => card(goal, week, false))) : null,
    ]),
    h("div", { class: "side" }, [
      h("p", { class: "eyebrow", text: t("home.today") }),
      h("div", { class: "list" }, ranked.map(({ goal, week }) => h("div", { class: "list-row" }, [
        h("span", { class: "emoji", text: goal.icon || "•" }),
        h("div", { class: "grow" }, [
          h("strong", { text: goal.name }),
          h("div", { class: "sub", text: dayLabel(week, ctx.today) }),
        ]),
        renderTodayAction(ctx, goal, week),
      ]))),
      sleepSummary(ctx),
      journalCard(ctx),
      rewardPreview(ctx, ranked),
      review ? reviewCard(ctx, review) : null,
      h("p", { class: "footer-line", text: t("copy.footer") }),
    ]),
  ]);
}

function actionHint(goal, week) {
  if (goal.completionMethod === "threshold") {
    return `${week.snapshot.thresholdTarget ?? goal.thresholdTarget} ${week.snapshot.thresholdLabel || goal.thresholdLabel || ""}`.trim();
  }
  if (goal.completionMethod === "timer") return t("home.minutes", { count: week.snapshot.timerDurationMinutes || goal.timerDurationMinutes });
  if (goal.completionMethod === "sleep") return t("home.fromSleep");
  return t("home.oneWin");
}

function dayLabel(week, today) {
  const state = week.dayStates[week.dates.indexOf(today)];
  if (state === "win") return t("home.wonToday");
  if (state === "loss") return t("home.closedToday");
  if (state === "neutral") return t("home.restDay");
  if (state === "pending") return t("home.openToday");
  return t("home.upcoming");
}

function sleepSummary(ctx) {
  const open = findOpenSleep(ctx.state.sleepRecords);
  let body;
  if (open) {
    const time = open.bedtimeUtc ? new Date(open.bedtimeUtc) : null;
    const label = time
      ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: open.bedtimeTz || ctx.zone }).format(time)
      : "";
    body = h("div", {}, [
      h("p", { class: "muted", text: t("home.inBed", { time: label }) }),
      h("p", { class: "hint", text: `${open.bedtimeOffset || ""} ${open.bedtimeTz || ""}`.trim() }),
      h("button", { class: "btn primary block", style: { marginTop: "12px" }, onClick: () => ctx.actions.sleepWake().then(afterSleep(ctx)) }, t("home.awake")),
    ]);
  } else {
    const latest = [...ctx.state.sleepRecords].filter((record) => record.wakeUtc).sort((a, b) => (a.wakeDate < b.wakeDate ? 1 : -1))[0];
    if (!latest) {
      body = h("p", { class: "muted", text: t("home.noNight") });
    } else {
      const evaluation = evaluateSleep(latest);
      body = h("div", {}, [
        h("p", { class: "big-time", text: displayDuration(evaluation.durationLabel) || t("home.incomplete") }),
        h("p", { class: "hint", text: latest.wakeDate === ctx.today ? t("home.attributed") : t("home.wakeDate", { date: latest.wakeDate }) }),
        h("p", { class: "hint", text: evaluation.win ? t("home.targetsPassed") : t("home.targetMissed") }),
      ]);
    }
  }
  return h("section", {}, [
    h("p", { class: "eyebrow", text: t("home.sleep") }),
    h("div", { class: "card" }, [
      body,
      open ? null : h("button", { class: "btn ghost small", style: { marginTop: "10px" }, onClick: () => ctx.go("/sleep") }, t("home.openSleep")),
    ]),
  ]);
}

function afterSleep(ctx) {
  return (result) => {
    if (!result?.ok) ctx.toast(sleepMessage(result));
  };
}

function sleepMessage(result) {
  if (result?.reason === "wake-date") return t("sleep.errorWakeDateLong");
  if (result?.reason === "no-open") return t("sleep.errorNoOpen");
  if (result?.reason === "open") return t("sleep.errorAlreadyBed");
  return t("sleep.errorGeneric");
}

function journalCard(ctx) {
  const entry = ctx.state.journal.find((item) => item.date === ctx.today);
  const editing = ctx.memory.journalEditing;
  return h("section", {}, [
    h("p", { class: "eyebrow", text: t("home.journal") }),
    h("div", { class: "card" }, [
      h("h2", { class: "note-label", text: t("home.noteLabel") }),
      editing ? journalEditor(ctx, entry) : journalRead(ctx, entry),
    ]),
  ]);
}

function journalRead(ctx, entry) {
  if (!entry) {
    return h("button", {
      class: "btn ghost block",
      style: { marginTop: "12px" },
      onClick: () => {
        ctx.memory.journalEditing = true;
        ctx.memory.journalDraft = { body: "", mood: null };
        ctx.draw();
      },
    }, t("home.notePlaceholder"));
  }
  return h("div", {}, [
    entry.mood ? h("p", { class: "hint", text: moodLabel(entry.mood) }) : null,
    h("p", { class: "note-body", text: entry.body }),
    h("div", { class: "correct-row" }, [
      h("button", {
        class: "btn ghost small",
        onClick: () => {
          ctx.memory.journalEditing = true;
          ctx.memory.journalDraft = { body: entry.body, mood: entry.mood };
          ctx.draw();
        },
      }, t("goal.edit")),
      h("button", { class: "btn ghost small", onClick: () => ctx.actions.deleteJournal(ctx.today) }, t("goal.delete")),
    ]),
  ]);
}

function journalEditor(ctx, entry) {
  const draft = ctx.memory.journalDraft || { body: entry?.body || "", mood: entry?.mood || null };
  return h("div", {}, [
    h("textarea", {
      "aria-label": t("home.noteLabel"),
      placeholder: t("home.notePlaceholder"),
      "data-live": "text",
      value: draft.body,
      onInput: (event) => {
        draft.body = event.target.value;
        ctx.memory.journalDraft = draft;
      },
    }),
    h("div", { class: "mood-row" }, MOODS.map((mood) => h("button", {
      class: `chip${draft.mood === mood ? " on" : ""}`,
      onClick: () => {
        draft.mood = draft.mood === mood ? null : mood;
        ctx.memory.journalDraft = draft;
        ctx.draw();
      },
    }, moodLabel(mood)))),
    h("div", { class: "correct-row" }, [
      h("button", {
        class: "btn primary small",
        onClick: async () => {
          await ctx.actions.saveJournal({ date: ctx.today, body: draft.body, mood: draft.mood });
          ctx.memory.journalEditing = false;
          ctx.draw();
        },
      }, t("home.saveNote")),
      h("button", {
        class: "btn ghost small",
        onClick: () => {
          ctx.memory.journalEditing = false;
          ctx.draw();
        },
      }, t("action.close")),
    ]),
  ]);
}

function rewardPreview(ctx, ranked) {
  const unlocked = [];
  for (const goal of ctx.state.goals) {
    if (goal.status === "archived") continue;
    for (const claim of ctx.state.rewardClaims.filter((item) => item.goalId === goal.id && !item.claimedAt)) {
      unlocked.push({ goal, claim, reward: claim.reward });
    }
  }
  let card;
  if (unlocked.length) {
    const item = unlocked[unlocked.length - 1];
    card = h("div", { class: "card reward unlocked" }, [
      h("p", { class: "status-line won", text: t("rewardStatus.unlocked") }),
      h("h2", { class: "goal-name", style: { marginTop: "6px" }, text: item.reward?.name || t("home.weeklyReward") }),
      h("p", { class: "hint", text: `${item.goal.name}${item.reward?.priceLabel ? ` · ${item.reward.priceLabel}` : ""}` }),
      h("button", { class: "btn primary block", style: { marginTop: "12px" }, onClick: () => ctx.go("/rewards") }, t("home.viewReward")),
    ]);
  } else {
    const closest = ranked
      .filter(({ week }) => week.snapshot.reward && week.result.status === "in_progress")
      .sort((a, b) => a.week.result.winsNeeded - b.week.result.winsNeeded)[0];
    if (!closest) return null;
    card = h("div", { class: "card" }, [
      h("p", { class: "status-line", text: t("rewardStatus.locked") }),
      h("h2", { class: "goal-name", style: { marginTop: "6px" }, text: closest.week.snapshot.reward.name }),
      h("p", { class: "hint", text: closest.goal.name }),
      meter(closest.week.result.wins, closest.week.result.target),
      h("p", { class: "copy", text: t("home.moreWins", { count: closest.week.result.winsNeeded }) }),
    ]);
  }
  return h("section", {}, [
    h("p", { class: "eyebrow", text: t("home.nextReward") }),
    card,
  ]);
}

function reviewPrompt(ctx) {
  const start = weekMeta(ctx.today, ctx.state.settings.weekStartsOn).start;
  const end = addDays(start, 6);
  const candidates = ctx.today === end ? [start, addDays(start, -7)] : [addDays(start, -7)];
  for (const weekStart of candidates) {
    if (ctx.state.weeklyReviews.some((review) => review.weekStart === weekStart)) continue;
    const weekEnd = addDays(weekStart, 6);
    const existed = ctx.state.goals.some((goal) => String(goal.createdAt).slice(0, 10) <= weekEnd);
    if (existed) return { weekStart, weekEnd };
  }
  return null;
}

function reviewCard(ctx, review) {
  return h("section", {}, [
    h("p", { class: "eyebrow", text: t("home.review") }),
    h("div", { class: "card" }, [
      h("h2", { class: "goal-name", text: t("home.reviewTitle") }),
      h("p", { class: "hint", text: t("home.reviewHint") }),
      h("div", { class: "correct-row" }, [
        h("button", { class: "btn primary small", onClick: () => ctx.go(`/history/review/${review.weekStart}`) }, t("home.writeReview")),
        h("button", {
          class: "btn ghost small",
          onClick: () => ctx.actions.saveReview({ ...review, wentWell: "", heldBack: "", improve: "", skipped: true }),
        }, t("home.skip")),
      ]),
    ]),
  ]);
}

function reminderBanner(ctx) {
  return h("div", { class: "banner spread" }, [
    h("div", {}, [
      h("strong", { text: ctx.reminder.title }),
      h("p", { class: "hint", text: t("home.reminderHint") }),
    ]),
    h("button", { class: "btn ghost small", onClick: ctx.dismissReminder }, t("action.dismiss")),
  ]);
}

function backupBanner(ctx) {
  return h("div", { class: "banner" }, [
    h("strong", { text: t("home.backupTitle") }),
    h("p", { class: "hint", text: t("home.backupHint") }),
    h("div", { class: "correct-row" }, [
      h("button", { class: "btn primary small", onClick: () => ctx.actions.exportBackup() }, t("home.exportBackup")),
      h("button", { class: "btn ghost small", onClick: () => ctx.actions.snoozeBackup(14) }, t("action.later")),
    ]),
  ]);
}

export { emptyState };
