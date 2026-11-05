import { formatRange, formatShortDate, weekMeta } from "../dates.js";
import { buildGoalWeek, milestoneCards } from "../selectors.js";
import { h, imageUrl, meter, topbar } from "../ui.js";

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
    topbar({ title: "Rewards", onSettings: () => ctx.go("/settings") }),
    h("p", { class: "muted", text: "A reward belongs to one goal. Nothing here is shared or ranked." }),
    shown.length ? h("div", { class: "stack", style: { marginTop: "16px" } }, shown.map((item) => rewardCard(ctx, item.goal, item.week, item.reward, item.status, item.claim, currentStart))) : h("p", { class: "hint", style: { marginTop: "12px" }, text: "Add a reward when you edit a goal." }),
    milestoneSection(ctx),
    history.length ? h("section", {}, [
      h("p", { class: "eyebrow", text: "History" }),
      h("div", { class: "list" }, history.map(({ claim, goal }) => h("div", { class: "list-row" }, [
        h("span", { class: "emoji", text: goal.icon || "•" }),
        h("span", { class: "grow" }, [
          h("strong", { text: claim.reward?.name || "Reward" }),
          h("span", { class: "sub", text: `${goal.name} · ${formatShortDate(claim.weekStart)}` }),
        ]),
        h("span", { class: "pill", text: claim.claimedAt ? "Claimed" : "Unlocked" }),
      ]))),
    ]) : null,
  ]);
}

function rewardCard(ctx, goal, week, reward, status, claim, currentStart) {
  const fresh = status === "unlocked" && !seen.has(`${goal.id}:${week.weekStart}`);
  if (fresh) seen.add(`${goal.id}:${week.weekStart}`);
  const photo = imageUrl(ctx.state, reward.imageId);
  return h("article", { class: `card reward ${status}${fresh ? " just-unlocked" : ""}` }, [
    photo ? h("img", { class: "reward-photo", alt: "", src: photo }) : null,
    h("p", { class: `status-line ${status === "unlocked" || status === "claimed" ? "won" : ""}`, text: status.toUpperCase() }),
    h("h2", { class: "goal-name", style: { marginTop: "6px" }, text: reward.name }),
    h("p", { class: "hint", text: `${goal.name} · ${week.weekStart === currentStart ? "This week" : formatRange(week.weekStart, week.weekEnd)}` }),
    reward.description ? h("p", { style: { marginTop: "8px" }, text: reward.description }) : null,
    reward.priceLabel ? h("p", { class: "price", text: reward.priceLabel }) : null,
    status === "locked" ? meter(week.result.wins, week.result.target) : null,
    status === "locked" ? h("p", { class: "copy", text: week.copy }) : null,
    status === "unlocked" ? h("button", {
      class: "btn primary block",
      style: { marginTop: "12px" },
      onClick: () => ctx.confirm({
        title: "Claim this reward?",
        text: `${reward.name} will be marked claimed today.`,
        confirmLabel: "Claim",
        onConfirm: async () => {
          await ctx.actions.claimReward(goal.id, week.weekStart);
          ctx.closeModal();
        },
      }),
    }, "Claim reward") : null,
    status === "claimed" && claim?.claimedAt ? h("p", { class: "hint", text: `Claimed ${formatShortDate(claim.claimedAt.slice(0, 10))}` }) : null,
  ]);
}

function milestoneSection(ctx) {
  const cards = ctx.state.goals.flatMap((goal) => milestoneCards(goal, ctx.state, ctx.today, ctx.now).map((item) => ({ goal, ...item })));
  if (!cards.length) return null;
  return h("section", {}, [
    h("p", { class: "eyebrow", text: "Milestones" }),
    h("p", { class: "hint", text: "A missed week starts a consecutive count over. Weeks already won stay in the total." }),
    h("div", { class: "stack", style: { marginTop: "10px" } }, cards.map(({ goal, milestone, progress }) => h("article", { class: `card reward ${progress.unlocked ? "unlocked" : "locked"}` }, [
      h("p", { class: "status-line", text: milestone.claimedAt ? "CLAIMED" : progress.unlocked ? "UNLOCKED" : "LOCKED" }),
      h("h2", { class: "goal-name", style: { marginTop: "6px" }, text: milestone.rewardDescription || "Milestone" }),
      h("p", { class: "hint", text: `${goal.name} · ${milestone.kind === "consecutive" ? "Consecutive" : "Total"}` }),
      meter(Math.min(progress.current, progress.required), progress.required),
      h("p", { class: "hint", text: `${progress.current} / ${progress.required} · ${progress.remaining} remaining` }),
      progress.unlocked && !milestone.claimedAt ? h("button", {
        class: "btn primary block",
        style: { marginTop: "12px" },
        onClick: () => ctx.actions.claimMilestone(milestone.id),
      }, "Claim milestone") : null,
    ]))),
  ]);
}
