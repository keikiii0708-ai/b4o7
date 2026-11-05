import { addDays, formatPrettyDate, weekMeta } from "../dates.js";
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
    h("p", { class: "slogan", text: "WIN 4. OWN YOUR WEEK." }),
    h("h2", { text: "A week is like a 7 game series." }),
    h("p", { class: "muted", text: "All you gotta do is win 4 days." }),
    h("button", { class: "btn primary block", onClick: () => ctx.go("/goals/new") }, "Add a goal"),
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
      rest.length ? h("p", { class: "eyebrow", text: "Also this week" }) : null,
      rest.length ? h("div", { class: "stack" }, rest.map(({ goal, week }) => card(goal, week, false))) : null,
    ]),
    h("div", { class: "side" }, [
      h("p", { class: "eyebrow", text: "Today" }),
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
      h("p", { class: "footer-line", text: "EVERY WEEK IS ANOTHER SERIES." }),
    ]),
  ]);
}

function actionHint(goal, week) {
  if (goal.completionMethod === "threshold") {
    return `${week.snapshot.thresholdTarget ?? goal.thresholdTarget} ${week.snapshot.thresholdLabel || goal.thresholdLabel || ""}`.trim();
  }
  if (goal.completionMethod === "timer") return `${week.snapshot.timerDurationMinutes || goal.timerDurationMinutes} min`;
  if (goal.completionMethod === "sleep") return "From the sleep log";
  return "One clear win";
}

function dayLabel(week, today) {
  const state = week.dayStates[week.dates.indexOf(today)];
  if (state === "win") return "Won today";
  if (state === "loss") return "Closed for today";
  if (state === "neutral") return "Rest day";
  if (state === "pending") return "Still open today";
  return "Upcoming";
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
      h("p", { class: "muted", text: `In bed since ${label}` }),
      h("p", { class: "hint", text: `${open.bedtimeOffset || ""} ${open.bedtimeTz || ""}`.trim() }),
      h("button", { class: "btn primary block", style: { marginTop: "12px" }, onClick: () => ctx.actions.sleepWake().then(afterSleep(ctx)) }, "I'M AWAKE"),
    ]);
  } else {
    const latest = [...ctx.state.sleepRecords].filter((record) => record.wakeUtc).sort((a, b) => (a.wakeDate < b.wakeDate ? 1 : -1))[0];
    if (!latest) {
      body = h("p", { class: "muted", text: "No night recorded yet." });
    } else {
      const evaluation = evaluateSleep(latest);
      body = h("div", {}, [
        h("p", { class: "big-time", text: evaluation.durationLabel || "Incomplete" }),
        h("p", { class: "hint", text: latest.wakeDate === ctx.today ? "Attributed to this morning" : `Wake date ${latest.wakeDate}` }),
        h("p", { class: evaluation.win ? "hint" : "hint", text: evaluation.win ? "All targets passed" : "A target was missed" }),
      ]);
    }
  }
  return h("section", {}, [
    h("p", { class: "eyebrow", text: "Sleep" }),
    h("div", { class: "card" }, [
      body,
      open ? null : h("button", { class: "btn ghost small", style: { marginTop: "10px" }, onClick: () => ctx.go("/sleep") }, "Open sleep"),
    ]),
  ]);
}

function afterSleep(ctx) {
  return (result) => {
    if (!result?.ok) ctx.toast(sleepMessage(result));
  };
}

function sleepMessage(result) {
  if (result?.reason === "wake-date") return "That wake-up date already has a night. Open it to correct it.";
  if (result?.reason === "no-open") return "There is no bedtime to wake from yet.";
  if (result?.reason === "open") return "A bedtime is already recorded.";
  return "That night could not be saved.";
}

function journalCard(ctx) {
  const entry = ctx.state.journal.find((item) => item.date === ctx.today);
  const editing = ctx.memory.journalEditing;
  return h("section", {}, [
    h("p", { class: "eyebrow", text: "Today's log" }),
    h("div", { class: "card" }, [
      h("h2", { class: "note-label", text: "A little note about today" }),
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
    }, "Write something about your day…");
  }
  return h("div", {}, [
    entry.mood ? h("p", { class: "hint", text: entry.mood }) : null,
    h("p", { class: "note-body", text: entry.body }),
    h("div", { class: "correct-row" }, [
      h("button", {
        class: "btn ghost small",
        onClick: () => {
          ctx.memory.journalEditing = true;
          ctx.memory.journalDraft = { body: entry.body, mood: entry.mood };
          ctx.draw();
        },
      }, "Edit"),
      h("button", { class: "btn ghost small", onClick: () => ctx.actions.deleteJournal(ctx.today) }, "Delete"),
    ]),
  ]);
}

function journalEditor(ctx, entry) {
  const draft = ctx.memory.journalDraft || { body: entry?.body || "", mood: entry?.mood || null };
  return h("div", {}, [
    h("textarea", {
      "aria-label": "A little note about today",
      placeholder: "Write something about your day…",
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
    }, mood))),
    h("div", { class: "correct-row" }, [
      h("button", {
        class: "btn primary small",
        onClick: async () => {
          await ctx.actions.saveJournal({ date: ctx.today, body: draft.body, mood: draft.mood });
          ctx.memory.journalEditing = false;
          ctx.draw();
        },
      }, "Save note"),
      h("button", {
        class: "btn ghost small",
        onClick: () => {
          ctx.memory.journalEditing = false;
          ctx.draw();
        },
      }, "Close"),
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
      h("p", { class: "status-line won", text: "UNLOCKED" }),
      h("h2", { class: "goal-name", style: { marginTop: "6px" }, text: item.reward?.name || "Weekly reward" }),
      h("p", { class: "hint", text: `${item.goal.name}${item.reward?.priceLabel ? ` · ${item.reward.priceLabel}` : ""}` }),
      h("button", { class: "btn primary block", style: { marginTop: "12px" }, onClick: () => ctx.go("/rewards") }, "View reward"),
    ]);
  } else {
    const closest = ranked
      .filter(({ week }) => week.snapshot.reward && week.result.status === "in_progress")
      .sort((a, b) => a.week.result.winsNeeded - b.week.result.winsNeeded)[0];
    if (!closest) return null;
    card = h("div", { class: "card" }, [
      h("p", { class: "status-line", text: "LOCKED" }),
      h("h2", { class: "goal-name", style: { marginTop: "6px" }, text: closest.week.snapshot.reward.name }),
      h("p", { class: "hint", text: closest.goal.name }),
      meter(closest.week.result.wins, closest.week.result.target),
      h("p", { class: "copy", text: `${closest.week.result.winsNeeded} more ${closest.week.result.winsNeeded === 1 ? "win" : "wins"} this week.` }),
    ]);
  }
  return h("section", {}, [
    h("p", { class: "eyebrow", text: "Next reward" }),
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
    h("p", { class: "eyebrow", text: "Weekly review" }),
    h("div", { class: "card" }, [
      h("h2", { class: "goal-name", text: "The series is ready for a look back." }),
      h("p", { class: "hint", text: "Three questions. All of them can stay blank." }),
      h("div", { class: "correct-row" }, [
        h("button", { class: "btn primary small", onClick: () => ctx.go(`/history/review/${review.weekStart}`) }, "Write review"),
        h("button", {
          class: "btn ghost small",
          onClick: () => ctx.actions.saveReview({ ...review, wentWell: "", heldBack: "", improve: "", skipped: true }),
        }, "Skip for now"),
      ]),
    ]),
  ]);
}

function reminderBanner(ctx) {
  return h("div", { class: "banner spread" }, [
    h("div", {}, [
      h("strong", { text: ctx.reminder.title }),
      h("p", { class: "hint", text: "Still open today. Reminders only appear while B4O7 is open." }),
    ]),
    h("button", { class: "btn ghost small", onClick: ctx.dismissReminder }, "Dismiss"),
  ]);
}

function backupBanner(ctx) {
  return h("div", { class: "banner" }, [
    h("strong", { text: "A quiet reminder to export a backup." }),
    h("p", { class: "hint", text: "Your goals, sleep, and notes live only on this device." }),
    h("div", { class: "correct-row" }, [
      h("button", { class: "btn primary small", onClick: () => ctx.actions.exportBackup() }, "Export backup"),
      h("button", { class: "btn ghost small", onClick: () => ctx.actions.snoozeBackup(14) }, "Later"),
    ]),
  ]);
}

export { emptyState };
