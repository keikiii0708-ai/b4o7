import { formatPrettyDate } from "../dates.js";
import { h, topbar } from "../ui.js";

export function renderSettings(ctx) {
  const settings = ctx.state.settings;
  const hasDemo = ctx.state.goals.some((goal) => goal.demo) || ctx.state.sleepRecords.some((record) => record.demo);
  return h("div", {}, [
    topbar({ title: "Settings", onBack: () => ctx.go("/home") }),
    h("p", { class: "eyebrow", text: "Week starts" }),
    h("div", { class: "seg" }, [
      ["monday", "Monday"],
      ["sunday", "Sunday"],
    ].map(([value, label]) => h("button", {
      class: settings.weekStartsOn === value ? "on" : "",
      onClick: () => ctx.actions.updateSettings({ weekStartsOn: value }),
    }, label))),
    h("p", { class: "hint", text: "Past series keep the target they were played with. Days stay on their dates." }),
    h("p", { class: "eyebrow", text: "Backup" }),
    h("div", { class: "card stack" }, [
      h("p", { class: "muted", text: settings.lastBackupAt ? `Last backup ${formatPrettyDate(settings.lastBackupAt.slice(0, 10))}.` : "No backup exported from this device yet." }),
      h("button", { class: "btn primary block", onClick: () => ctx.actions.exportBackup() }, "Export backup"),
      h("button", { class: "btn ghost block", onClick: () => ctx.actions.exportCsv() }, "Export history CSV"),
      h("button", {
        class: "btn ghost block",
        onClick: () => ctx.pickJson((data) => {
          ctx.confirm({
            title: "Import this backup?",
            text: "Merge adds and updates records by id. Replace removes what is on this device first.",
            confirmLabel: null,
            cancelLabel: "Close",
            body: h("div", { class: "stack" }, [
              h("button", {
                class: "btn primary block",
                onClick: async () => {
                  const result = await ctx.actions.importBackup(data, "merge");
                  ctx.closeModal();
                  ctx.toast(result.ok ? "Backup merged." : result.reason);
                },
              }, "Merge"),
              h("button", {
                class: "btn danger block",
                onClick: () => ctx.confirm({
                  title: "Replace everything on this device?",
                  text: "Records that are not in the file will be deleted.",
                  typed: "REPLACE",
                  confirmLabel: "Replace",
                  danger: true,
                  onConfirm: async () => {
                    const result = await ctx.actions.importBackup(data, "replace");
                    ctx.closeModal();
                    ctx.toast(result.ok ? "Backup restored." : result.reason);
                  },
                }),
              }, "Replace everything"),
            ]),
          });
        }),
      }, "Import backup"),
      h("p", { class: "hint", text: persistText(ctx.persistInfo) }),
      h("button", { class: "btn ghost block", onClick: () => ctx.actions.requestPersist() }, "Ask to keep data on this device"),
    ]),
    h("p", { class: "eyebrow", text: "Reminders" }),
    h("div", { class: "card" }, [
      h("p", { text: "Reminders are optional." }),
      h("p", { class: "hint", text: "iPhone does not run this app in the background, and there is no server to ping you. A reminder can show only while B4O7 is open. If you allow notifications, a system alert can appear in that same moment." }),
      h("button", {
        class: "btn ghost block",
        style: { marginTop: "10px" },
        onClick: async () => {
          if (!("Notification" in window)) {
            ctx.toast("This browser does not offer notifications.");
            return;
          }
          const permission = await Notification.requestPermission();
          ctx.toast(permission === "granted" ? "Notifications allowed while the app is open." : "Notifications stay off.");
        },
      }, "Allow notifications"),
    ]),
    h("p", { class: "eyebrow", text: "Sample" }),
    h("div", { class: "card stack" }, [
      h("p", { class: "muted", text: "Demo data is sample only. It is not loaded until you ask." }),
      h("button", {
        class: "btn ghost block",
        "data-action": "load-demo",
        onClick: () => ctx.confirm({
          title: "Load demo data?",
          text: "This adds sample goals, sleep, and notes so you can look around. Your own records stay. You can remove the sample later.",
          confirmLabel: "Load demo data",
          onConfirm: async () => {
            await ctx.actions.loadDemo();
            ctx.closeModal();
            ctx.go("/home");
          },
        }),
      }, "Load demo data"),
      hasDemo ? h("button", {
        class: "btn ghost block",
        onClick: () => ctx.confirm({
          title: "Remove demo data?",
          text: "Sample goals and sample nights are deleted. Your own records stay.",
          confirmLabel: "Remove demo data",
          danger: true,
          onConfirm: async () => {
            await ctx.actions.removeDemo();
            ctx.closeModal();
          },
        }),
      }, "Remove demo data") : null,
    ]),
    h("p", { class: "eyebrow", text: "Delete data" }),
    h("div", { class: "card stack" }, [
      h("p", { class: "hint", text: "Delete a goal from its page. Delete a note from Today's Log. Delete a night from the sleep day. Delete a review by replacing it with a blank one." }),
      h("button", {
        class: "btn danger block",
        onClick: () => ctx.confirm({
          title: "Delete all data on this device?",
          text: "Goals, sleep, notes, rewards, and photos are removed. Export a backup first if you want them back.",
          typed: "DELETE",
          confirmLabel: "Delete everything",
          danger: true,
          onConfirm: async () => {
            await ctx.actions.deleteAllData();
            ctx.closeModal();
            ctx.go("/home");
          },
        }),
      }, "Delete all data"),
    ]),
    h("p", { class: "eyebrow", text: "About" }),
    h("div", { class: "card about-card" }, [
      h("img", { class: "brand-hero", src: "./icons/favicon.svg", alt: "", width: "72", height: "72" }),
      h("p", { class: "slogan", text: "WIN 4. OWN YOUR WEEK." }),
      h("p", { text: "A week is like a 7 game series. All you gotta do is win 4 days." }),
      h("p", { class: "hint", text: "STILL IN THE GAME. EVERY WEEK IS ANOTHER SERIES. PROGRESS OVER PERFECTION." }),
      h("p", { class: "hint", text: "B4O7 stores everything in this browser. There is no account, no network, and no shared score." }),
    ]),
  ]);
}

function persistText(info) {
  if (!info?.supported) return "This browser does not offer persistent storage. Export a backup regularly.";
  if (info.persisted) return "Storage persistence is on. iOS can still clear site data, so keep a backup.";
  return "Storage persistence is not granted yet. iOS may clear site data if space runs low.";
}
