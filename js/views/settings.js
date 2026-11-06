import { formatPrettyDate } from "../dates.js";
import { getLocale, setLocale, t } from "../i18n.js";
import { h, topbar } from "../ui.js";

export function renderSettings(ctx) {
  const settings = ctx.state.settings;
  const locale = getLocale();
  const hasDemo = ctx.state.goals.some((goal) => goal.demo) || ctx.state.sleepRecords.some((record) => record.demo);
  return h("div", {}, [
    topbar({ title: t("title.settings"), onBack: () => ctx.go("/home") }),
    h("p", { class: "eyebrow", text: t("settings.language") }),
    h("div", { class: "seg", role: "group", "aria-label": t("settings.language") }, [
      ["en", "English"],
      ["zh", "简体中文"],
    ].map(([value, label]) => h("button", {
      class: locale === value ? "on" : "",
      "aria-pressed": locale === value ? "true" : "false",
      "data-locale": value,
      onClick: () => setLocale(value),
    }, label))),
    h("p", { class: "hint", text: t("settings.languageHint") }),
    h("p", { class: "eyebrow", text: t("settings.weekStarts") }),
    h("div", { class: "seg" }, [
      ["monday", t("settings.monday")],
      ["sunday", t("settings.sunday")],
    ].map(([value, label]) => h("button", {
      class: settings.weekStartsOn === value ? "on" : "",
      onClick: () => ctx.actions.updateSettings({ weekStartsOn: value }),
    }, label))),
    h("p", { class: "hint", text: t("settings.weekHint") }),
    h("p", { class: "eyebrow", text: t("settings.backup") }),
    h("div", { class: "card stack" }, [
      h("p", { class: "muted", text: settings.lastBackupAt ? t("settings.lastBackup", { date: formatPrettyDate(settings.lastBackupAt.slice(0, 10)) }) : t("settings.noBackup") }),
      h("button", { class: "btn primary block", onClick: () => ctx.actions.exportBackup() }, t("settings.exportBackup")),
      h("button", { class: "btn ghost block", onClick: () => ctx.actions.exportCsv() }, t("settings.exportCsv")),
      h("button", {
        class: "btn ghost block",
        onClick: () => ctx.pickJson((data) => {
          ctx.confirm({
            title: t("settings.importTitle"),
            text: t("settings.importText"),
            confirmLabel: null,
            cancelLabel: t("action.close"),
            body: h("div", { class: "stack" }, [
              h("button", {
                class: "btn primary block",
                onClick: async () => {
                  const result = await ctx.actions.importBackup(data, "merge");
                  ctx.closeModal();
                  ctx.toast(result.ok ? t("toast.merged") : result.reason);
                },
              }, t("settings.merge")),
              h("button", {
                class: "btn danger block",
                onClick: () => ctx.confirm({
                  title: t("settings.replaceTitle"),
                  text: t("settings.replaceText"),
                  typed: "REPLACE",
                  confirmLabel: t("settings.replace"),
                  danger: true,
                  onConfirm: async () => {
                    const result = await ctx.actions.importBackup(data, "replace");
                    ctx.closeModal();
                    ctx.toast(result.ok ? t("toast.restored") : result.reason);
                  },
                }),
              }, t("settings.replaceAll")),
            ]),
          });
        }),
      }, t("settings.importBackup")),
      h("p", { class: "hint", text: persistText(ctx.persistInfo) }),
      h("button", { class: "btn ghost block", onClick: () => ctx.actions.requestPersist() }, t("settings.keepData")),
    ]),
    h("p", { class: "eyebrow", text: t("settings.reminders") }),
    h("div", { class: "card" }, [
      h("p", { text: t("settings.remindersOptional") }),
      h("p", { class: "hint", text: t("settings.remindersBody") }),
      h("button", {
        class: "btn ghost block",
        style: { marginTop: "10px" },
        onClick: async () => {
          if (!("Notification" in window)) {
            ctx.toast(t("toast.notificationsUnsupported"));
            return;
          }
          const permission = await Notification.requestPermission();
          ctx.toast(permission === "granted" ? t("toast.notificationsOn") : t("toast.notificationsOff"));
        },
      }, t("settings.allowNotifications")),
    ]),
    h("p", { class: "eyebrow", text: t("settings.sample") }),
    h("div", { class: "card stack" }, [
      h("p", { class: "muted", text: t("settings.sampleBody") }),
      h("button", {
        class: "btn ghost block",
        "data-action": "load-demo",
        onClick: () => ctx.confirm({
          title: t("settings.loadDemoTitle"),
          text: t("settings.loadDemoText"),
          confirmLabel: t("settings.loadDemo"),
          onConfirm: async () => {
            await ctx.actions.loadDemo();
            ctx.closeModal();
            ctx.go("/home");
          },
        }),
      }, t("settings.loadDemo")),
      hasDemo ? h("button", {
        class: "btn ghost block",
        onClick: () => ctx.confirm({
          title: t("settings.removeDemoTitle"),
          text: t("settings.removeDemoText"),
          confirmLabel: t("settings.removeDemo"),
          danger: true,
          onConfirm: async () => {
            await ctx.actions.removeDemo();
            ctx.closeModal();
          },
        }),
      }, t("settings.removeDemo")) : null,
    ]),
    h("p", { class: "eyebrow", text: t("settings.deleteData") }),
    h("div", { class: "card stack" }, [
      h("p", { class: "hint", text: t("settings.deleteHint") }),
      h("button", {
        class: "btn danger block",
        onClick: () => ctx.confirm({
          title: t("settings.deleteAllTitle"),
          text: t("settings.deleteAllText"),
          typed: "DELETE",
          confirmLabel: t("settings.deleteEverything"),
          danger: true,
          onConfirm: async () => {
            await ctx.actions.deleteAllData();
            ctx.closeModal();
            ctx.go("/home");
          },
        }),
      }, t("settings.deleteAll")),
    ]),
    h("p", { class: "eyebrow", text: t("settings.about") }),
    h("div", { class: "card about-card" }, [
      h("img", { class: "brand-hero", src: "./icons/favicon.svg", alt: "", width: "72", height: "72" }),
      h("p", { class: "slogan", text: t("copy.own") }),
      h("p", { text: `${t("copy.series")} ${t("copy.win4")}` }),
      h("p", { class: "hint", text: t("copy.still") }),
      h("p", { class: "hint", text: t("copy.about") }),
    ]),
  ]);
}

function persistText(info) {
  if (!info?.supported) return t("settings.persistUnsupported");
  if (info.persisted) return t("settings.persistOn");
  return t("settings.persistOff");
}
