// Qwik Service – Click-to-Call mit Cognigy Click To Call SDK (vendored, MIT)
// - "Anrufen als": simulierte Rufnummer als userId + zusätzlich per SIP INFO (simulated_ani)
// - Live-Transkript (transcription-Event)
// - xApp-Panel: öffnet sich, wenn der Flow Daten mit show_xapp/xAppUrl sendet (infoReceived)
import { createWebRTCClient, checkWebRTCSupport } from "../vendor/click-to-call-sdk-0.2.0.es.js";
import { initLangSwitch, t } from "./i18n.js";

const ENDPOINT_URL = "https://endpoint-app.cognigy.ai/e901c7d80aee92758b50a42d9f618aa3f2446da0dec3f8d63f930968e948b0ca";

const $ = (id) => document.getElementById(id);
const els = {
  status: $("callStatus"), call: $("btnCall"), mute: $("btnMute"), end: $("btnEnd"), caller: $("callerId"),
  transcript: $("transcript"), xapp: $("xapp"), frame: $("xappFrame"), open: $("xappOpen"), qr: $("xappQr"), pin: $("xappPin"), pinUrl: $("xappPinUrl")
};

const onLang = (lang) => {
  els.transcript.dataset.empty = t("rt.transcriptEmpty", lang, "Live transcript appears here during the call.");
  if (stateReady && state === "idle") setStatus("idle");
};
let stateReady = false;
const currentLang = initLangSwitch(onLang);
let client = null;
let state = "idle";
stateReady = true;
let muted = false;

function setStatus(s) {
  state = s;
  const lang = currentLang();
  const map = {
    idle: ["", t("call.idle", lang, "Ready")],
    connecting: ["busy", t("rt.connecting", lang, "Connecting …")],
    live: ["live", t("rt.live", lang, "On call")],
    ended: ["", t("rt.ended", lang, "Ended")],
    failed: ["busy", t("rt.failed", lang, "Failed")]
  };
  const [cls, label] = map[s] || map.idle;
  els.status.className = "status " + cls;
  els.status.textContent = label;
  const inCall = s === "connecting" || s === "live";
  els.call.disabled = inCall;
  els.caller.disabled = inCall;
  els.mute.disabled = s !== "live";
  els.end.disabled = !inCall;
}

function addMsg(who, text) {
  if (!text) return;
  const div = document.createElement("div");
  div.className = "msg " + (who === "user" ? "user" : "bot");
  div.textContent = text;
  els.transcript.appendChild(div);
  els.transcript.scrollTop = els.transcript.scrollHeight;
}

// Sucht einen Schlüssel in beliebig verschachtelten Daten (Format der SIP-INFO-Daten ist nicht fest dokumentiert)
function findKey(obj, key, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 6) return undefined;
  if (key in obj) return obj[key];
  for (const v of Object.values(obj)) {
    const r = findKey(v, key, depth + 1);
    if (r !== undefined) return r;
  }
  return undefined;
}

let xappUrl = null;
let xappWin = null;

function renderQr(url) {
  els.qr.innerHTML = "";
  try {
    const qr = window.qrcode(0, "M");
    qr.addData(url);
    qr.make();
    els.qr.innerHTML = qr.createSvgTag({ cellSize: 3, margin: 0, scalable: true });
  } catch (e) { console.warn("QR failed", e); }
}

// Rückfall, falls der Browser die eingebettete xApp blockiert: Popup im Handy-Format (Klick nötig)
function openXapp(ev) {
  if (ev) ev.preventDefault();
  if (!xappUrl) return;
  const w = 430, h = 780;
  const left = Math.max(0, window.screenX + window.outerWidth - w - 24);
  const top = Math.max(0, window.screenY + 60);
  xappWin = window.open(xappUrl, "qwik-xapp", `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
  if (!xappWin) window.open(xappUrl, "_blank", "noopener");
}

function handleData(payload) {
  const show = findKey(payload, "show_xapp");
  if (show === "true" || show === true) {
    const url = findKey(payload, "xAppUrl");
    if (url) {
      xappUrl = url;
      els.frame.src = url;
      renderQr(url);
      els.pin.textContent = String(findKey(payload, "pin") || "—").toUpperCase();
      const pinUrl = findKey(payload, "pinPageUrl");
      if (pinUrl) { els.pinUrl.href = pinUrl; els.pinUrl.textContent = pinUrl.replace(/^https?:\/\//, ""); }
      els.xapp.classList.add("open");
      els.xapp.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  } else if (show === "false" || show === false) {
    els.xapp.classList.remove("open");
    els.frame.src = "about:blank";
    xappUrl = null;
    if (xappWin && !xappWin.closed) { try { xappWin.close(); } catch (e) { /* ignore */ } }
  }
}

async function startCall() {
  const support = checkWebRTCSupport();
  if (!support.supported) { alert(t("rt.unsupported", currentLang(), "Your browser does not support WebRTC.")); return; }
  els.transcript.innerHTML = "";
  els.xapp.classList.remove("open");
  setStatus("connecting");

  const ani = els.caller.value; // "" = unbekannte Nummer
  const userId = ani || "web-" + Math.random().toString(36).slice(2, 10);
  try {
    client = await createWebRTCClient({ endpointUrl: ENDPOINT_URL, userId });
    client.on("answered", async () => {
      setStatus("live");
      if (ani) {
        // Fallback, falls die userId nicht als Rufnummer im Flow ankommt
        try { await client.sendInfo("", { simulated_ani: ani }); } catch (e) { console.warn("sendInfo failed", e); }
      }
    });
    client.on("ended", () => cleanup("ended"));
    client.on("failed", (s, info) => { console.warn("call failed", info); cleanup("failed"); });
    client.on("error", (e) => console.error("Click-to-Call error", e));
    client.on("transcription", (tr) => {
      const who = tr && tr.originator === "user" ? "user" : "bot";
      (tr && tr.messages || []).forEach((m) => addMsg(who, m.text));
    });
    client.on("infoReceived", (data) => {
      const body = data && data.info && data.info.body;
      let parsed = body;
      try { parsed = JSON.parse(body); } catch (e) { /* kein JSON */ }
      console.debug("SIP INFO", parsed);
      handleData(parsed);
    });
    await client.connectAndCall();
  } catch (e) {
    console.error(e);
    if (String(e && e.message || e).toLowerCase().includes("permission")) alert(t("rt.mic", currentLang(), "Please allow microphone access."));
    cleanup("failed");
  }
}

async function cleanup(next) {
  const c = client; client = null; muted = false;
  els.mute.textContent = t("call.mute", currentLang(), "Mute");
  setStatus(next);
  if (c) { try { await c.destroy(); } catch (e) { /* ignore */ } }
}

els.call.addEventListener("click", startCall);
els.open.addEventListener("click", openXapp);
els.end.addEventListener("click", async () => { if (client) { try { await client.endCall(); } catch (e) { /* ignore */ } } cleanup("ended"); });
els.mute.addEventListener("click", () => {
  if (!client) return;
  muted = !muted;
  muted ? client.mute() : client.unmute();
  els.mute.textContent = muted ? t("call.unmute", currentLang(), "Unmute") : t("call.mute", currentLang(), "Mute");
});
window.addEventListener("beforeunload", () => { if (client) client.destroy().catch(() => {}); });
onLang(currentLang());
setStatus("idle");

// Vorschau des App-Panels ohne Anruf (für Layout-Prüfung): …/#xapp-demo oder …/#xapp-demo=<xApp-URL>
if (location.hash.startsWith("#xapp-demo")) {
  const demoUrl = decodeURIComponent(location.hash.split("=").slice(1).join("=")) || "https://static-app.cognigy.ai?token=demo";
  handleData({ show_xapp: "true", xAppUrl: demoUrl, pin: "demo42", pinPageUrl: "https://static-app.cognigy.ai" });
}
