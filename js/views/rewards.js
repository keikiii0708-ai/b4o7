import { formatRange, formatShortDate, weekMeta } from "../dates.js";
import { rewardStatusLabel, t } from "../i18n.js";
import { buildGoalWeek, milestoneCards } from "../selectors.js";
import { h, imageUrl, meter, progressRing, topbar } from "../ui.js";

const seen = new Set();

export function renderRewards(ctx) {
  const currentStart = weekMeta(ctx.today, ctx.state.settings.weekStartsOn).start;
  const ready = ctx.state.rewardClaims
    .filter((claim) => !claim.claimedAt && claim.reward)
    .map((claim) => {
      const goal = ctx.state.goals.find((item) => item.id === claim.goalId);
      if (!goal) return null;
      const week = buildGoalWeek(goal, ctx.state, claim.weekStart, ctx.today, ctx.now);
      return { goal, week, reward: claim.reward, status: "unlocked", claim };
    })
    .filter(Boolean);
  const readyIds = new Set(ready.map((item) => `${item.goal.id}:${item.week.weekStart}`));
  const cards = ctx.state.goals
    .filter((goal) => goal.status !== "archived")
    .map((goal) => ({ goal, week: buildGoalWeek(goal, ctx.state, currentStart, ctx.today, ctx.now) }))
    .filter(({ goal, week }) => week.snapshot.reward && !readyIds.has(`${goal.id}:${week.weekStart}`));
  const history = ctx.state.rewardClaims
    .filter((claim) => claim.claimedAt)
    .map((claim) => ({ claim, goal: ctx.state.goals.find((goal) => goal.id === claim.goalId) }))
    .filter((item) => item.goal)
    .sort((a, b) => (a.claim.weekStart < b.claim.weekStart ? 1 : -1));
  const shown = [...ready, ...cards.map(({ goal, week }) => ({
    goal,
    week,
    reward: week.snapshot.reward,
    status: week.rewardStatus,
    claim: week.claim,
  }))];
  return h("div", {}, [
    topbar({ title: t("title.rewards"), onSettings: () => ctx.go("/settings") }),
    h("p", { class: "muted", text: t("reward.intro") }),
    shown.length ? h("div", { class: "stack", style: { marginTop: "16px" } }, shown.map((item) => rewardCard(ctx, item.goal, item.week, item.reward, item.status, item.claim, currentStart))) : h("p", { class: "hint", style: { marginTop: "12px" }, text: t("reward.empty") }),
    milestoneSection(ctx),
    history.length ? h("section", {}, [
      h("p", { class: "eyebrow", text: t("reward.history") }),
      h("div", { class: "list" }, history.map(({ claim, goal }) => h("div", { class: "list-row" }, [
        h("span", { class: "emoji", text: goal.icon || "•" }),
        h("span", { class: "grow" }, [
          h("strong", { text: claim.reward?.name || t("reward.fallback") }),
          h("span", { class: "sub", text: `${goal.name} · ${formatShortDate(claim.weekStart)}` }),
        ]),
        h("span", { class: "pill", text: claim.claimedAt ? t("rewardStatus.claimed") : t("rewardStatus.unlocked") }),
      ]))),
    ]) : null,
  ]);
}

function rewardCard(ctx, goal, week, reward, status, claim, currentStart) {
  const fresh = status === "unlocked" && !seen.has(`${goal.id}:${week.weekStart}`);
  if (fresh) seen.add(`${goal.id}:${week.weekStart}`);
  const photo = imageUrl(ctx.state, reward.imageId);
  const ring = progressRing(week.dayStates, { size: photo ? 36 : 78, hidden: true });
  return h("article", { class: `card reward ${status}${fresh ? " just-unlocked" : ""}` }, [
    photo ? h("img", { class: "reward-photo", alt: "", src: photo }) : h("div", { class: "reward-photo reward-fallback", "aria-hidden": "true" }, [ring]),
    h("div", { class: "spread" }, [
      h("p", { class: `status-line ${status === "unlocked" || status === "claimed" ? "won" : ""}`, text: rewardStatusLabel(status) }),
      photo ? ring : null,
    ]),
    h("h2", { class: "goal-name", style: { marginTop: "6px" }, text: reward.name }),
    h("p", { class: "hint", text: `${goal.name} · ${week.weekStart === currentStart ? t("reward.thisWeek") : formatRange(week.weekStart, week.weekEnd)}` }),
    reward.description ? h("p", { style: { marginTop: "8px" }, text: reward.description }) : null,
    reward.priceLabel ? h("p", { class: "price", text: reward.priceLabel }) : null,
    status === "locked" ? meter(week.result.wins, week.result.target, `meter:${goal.id}:${week.weekStart}`) : null,
    status === "locked" ? h("p", { class: "copy", text: week.copy }) : null,
    status === "unlocked" ? h("button", {
      class: "btn primary block",
      style: { marginTop: "12px" },
      onClick: () => ctx.confirm({
        title: t("reward.claimTitle"),
        text: t("reward.claimText", { name: reward.name }),
        confirmLabel: t("reward.claim"),
        onConfirm: async () => {
          await ctx.actions.claimReward(goal.id, week.weekStart);
          ctx.closeModal();
        },
      }),
    }, t("reward.claimReward")) : null,
    status === "claimed" && claim?.claimedAt ? h("p", { class: "hint", text: t("reward.claimedOn", { date: formatShortDate(claim.claimedAt.slice(0, 10)) }) }) : null,
  ]);
}

function milestoneSection(ctx) {
  const cards = ctx.state.goals.flatMap((goal) => milestoneCards(goal, ctx.state, ctx.today, ctx.now).map((item) => ({ goal, ...item })));
  if (!cards.length) return null;
  return h("section", {}, [
    h("p", { class: "eyebrow", text: t("reward.milestones") }),
    h("p", { class: "hint", text: t("reward.milestoneHint") }),
    h("div", { class: "stack", style: { marginTop: "10px" } }, cards.map(({ goal, milestone, progress }) => h("article", { class: `card reward ${progress.unlocked ? "unlocked" : "locked"}` }, [
      h("p", { class: "status-line", text: milestone.claimedAt ? t("rewardStatus.claimed") : progress.unlocked ? t("rewardStatus.unlocked") : t("rewardStatus.locked") }),
      h("h2", { class: "goal-name", style: { marginTop: "6px" }, text: milestone.rewardDescription || t("reward.milestone") }),
      h("p", { class: "hint", text: `${goal.name} · ${milestone.kind === "consecutive" ? t("reward.consecutive") : t("reward.total")}` }),
      meter(Math.min(progress.current, progress.required), progress.required, `ms:${milestone.id}`),
      h("p", {
        class: "hint",
        "data-metric-key": `progress:${milestone.id}`,
        text: t("goal.progress", { current: progress.current, required: progress.required, remaining: progress.remaining }),
      }),
      progress.unlocked && !milestone.claimedAt ? h("button", {
        class: "btn primary block",
        style: { marginTop: "12px" },
        onClick: () => ctx.actions.claimMilestone(milestone.id),
      }, t("reward.claimMilestone")) : null,
    ]))),
  ]);
}
