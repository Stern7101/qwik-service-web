// Advisor-Dashboard: liest die öffentlichen (schreibgeschützten) Benachrichtigungen des Cloudflare Workers.
import { initLangSwitch, t, escapeHtml } from "./i18n.js";

const API = "https://qwik-advisor.frosty-frost-aa13.workers.dev/notifications";
const list = document.getElementById("list");
const updated = document.getElementById("updated");
let items = [];
let failed = false;

const lang = initLangSwitch(() => render());

const fmtDate = (iso, l) => {
  if (!iso) return "—";
  const d = new Date(iso + "T12:00:00Z");
  return new Intl.DateTimeFormat(l === "de" ? "de-DE" : "en-US", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(d);
};
const fmtStamp = (iso, l) => new Intl.DateTimeFormat(l === "de" ? "de-DE" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
const slot = (s, l) => s ? `${fmtDate(s.date, l)} · ${escapeHtml(s.time || "")} · ${escapeHtml(s.location || "")}` : "—";

function render() {
  const l = lang();
  if (failed) { list.innerHTML = `<div class="empty">${escapeHtml(t("dash.error", l, "Could not load notifications."))}</div>`; return; }
  if (!items.length) { list.innerHTML = `<div class="empty">${escapeHtml(t("dash.empty", l, "No notifications yet. Reschedule an appointment by phone to create one."))}</div>`; return; }
  list.innerHTML = items.map((n) => `
    <article class="notif">
      <div><span class="id">${escapeHtml(n.appointment_id)}</span> · ${escapeHtml(t("dash.moved", l, "rescheduled"))}</div>
      <div class="time">${escapeHtml(fmtStamp(n.received_at, l))}</div>
      <div class="move"><s>${slot(n.previous, l)}</s> → <b>${slot(n.updated, l)}</b></div>
      <div class="tags">
        <span class="tag">${escapeHtml(n.notification_id)}</span>
        ${n.service_type ? `<span class="tag">${escapeHtml(n.service_type)}</span>` : ""}
        <span class="tag">${escapeHtml(n.recipient || "Service Advisor")} · ${escapeHtml(n.status || "sent")}</span>
        ${n.language ? `<span class="tag">${escapeHtml(n.language.toUpperCase())}</span>` : ""}
        ${n.channel ? `<span class="tag">${escapeHtml(n.channel)}</span>` : ""}
      </div>
    </article>`).join("");
}

async function load() {
  try {
    const res = await fetch(API, { cache: "no-store" });
    const json = await res.json();
    items = (json && json.data && json.data.notifications) || [];
    failed = !res.ok;
  } catch (e) {
    failed = true;
  }
  updated.textContent = new Date().toLocaleTimeString();
  render();
}

document.getElementById("btnRefresh").addEventListener("click", load);
load();
// Nur abfragen, solange der Tab sichtbar ist (schont das KV-Kontingent des Workers); beim Zurückkehren sofort aktualisieren.
setInterval(() => { if (document.visibilityState === "visible") load(); }, 15000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") load(); });
