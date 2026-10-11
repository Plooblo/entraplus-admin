/* EntraPlus admin panel. Every action goes to the "admin" server function, which checks on every request that
   you're signed in with Microsoft AND on the ADMIN_USER_IDS list. This page has no special access of its own. */
// Never run inside another site's frame (stops "clickjacking"; a <meta> CSP can't enforce this).
if (window.top !== window.self) { document.documentElement.innerHTML = ""; throw new Error("Framed"); }
const cfg = window.ADMIN_CONFIG || {};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (p, c = "gbp") => new Intl.NumberFormat("en-GB", { style: "currency", currency: (c || "gbp").toUpperCase() }).format((p || 0) / 100);
const day = (iso) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "–";
const when = (iso) => iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
const show = (id, on = true) => { $(id).hidden = !on; };

let client = null, current = null, orgCache = [];

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("on"), 3500);
}

/* ------------------------------------------------------------- talking to the admin function */
async function api(action, body = {}) {
  if (cfg.mock) return window.ADMIN_MOCK(action, body);
  const { data: { session } } = await client.auth.getSession();
  const res = await fetch(`${cfg.supabaseUrl}/functions/v1/admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${session?.access_token ?? ""}` },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `Request failed (${res.status})`); e.status = res.status; e.data = data; throw e; }
  return data;
}

async function act(action, body, done) {
  try {
    const r = await api(action, body);
    toast(done || "Done");
    return r;
  } catch (e) {
    toast(e.message);
    throw e;
  }
}

/* ------------------------------------------------------------- start-up and sign-in */
const VERIFIER_KEY = "ep-admin-auth-code-verifier";

// Secret keys start sb_secret_ (new style) or are JWTs whose role is service_role (old style).
function isSecretKey(key) {
  if (key.startsWith("sb_secret_")) return true;
  try { return JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role"; }
  catch { return false; }
}

function signInProblem(msg) {
  show("#loading", false);
  show("#signin");
  $("#signin-error").innerHTML = msg;
  show("#signin-error");
}

let arrivedWithCode = false;
function diagnostics(extra = "") {
  $("#diag").textContent = [
    `Address: ${location.origin}${location.pathname}`,
    `Redirect URL Supabase must allow: ${location.origin}${location.pathname}`,
    `Arrived with a sign-in code: ${arrivedWithCode ? "yes" : "no"}`,
    `Saved sign-in check in this browser: ${localStorage.getItem(VERIFIER_KEY) ? "yes" : "no"}`,
    extra,
  ].filter(Boolean).join("\n");
  show("#diag-box");
}

async function start() {
  if (cfg.mock) { show("#mock-note"); return enter("you@entraplus.co.uk"); }
  cfg.supabaseAnonKey = String(cfg.supabaseAnonKey || "").replace(/\s+/g, "");      // stray spaces or line breaks
  if (!cfg.supabaseAnonKey || cfg.supabaseAnonKey.startsWith("PASTE")) {
    return signInProblem("config.js still needs the Supabase publishable (anon) key: the same one as the website's config.js.");
  }
  if (isSecretKey(cfg.supabaseAnonKey)) {
    return signInProblem("<strong>Stop: config.js contains your SECRET Supabase key.</strong> That key gives full access to your " +
      "database and must never be in a web page. In Supabase > Project Settings > API Keys, roll (replace) the secret key " +
      "now, update it wherever the server functions use it, and put the <strong>publishable</strong> key in config.js instead.");
  }
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  // We finish the Microsoft sign-in ourselves (rather than automatically) so any problem is shown, not swallowed.
  client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey,
                        { auth: { flowType: "pkce", storageKey: "ep-admin-auth", detectSessionInUrl: false } });

  const q = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.slice(1));
  const returnedError = q.get("error_description") || hash.get("error_description");
  const code = q.get("code");
  arrivedWithCode = !!code;
  if (returnedError || code) history.replaceState(null, "", location.pathname);      // tidy the address bar
  if (returnedError) {
    diagnostics();
    return signInProblem(`Microsoft or Supabase refused the sign-in: <strong>${esc(returnedError)}</strong>`);
  }
  if (code) {
    const hadVerifier = !!localStorage.getItem(VERIFIER_KEY);
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) {
      diagnostics(`Supabase said: ${error.message}`);
      if (error.status === 401 || /api key|apikey|unauthor/i.test(error.message)) {
        return signInProblem(`Supabase didn't accept the key in this panel's <strong>config.js</strong> (401: ` +
          `<strong>${esc(error.message)}</strong>). This panel is using a key starting <strong>${esc(cfg.supabaseAnonKey.slice(0, 16))}…</strong>. ` +
          "Copy the <strong>publishable</strong> key exactly as it appears in your website's config.js (it starts sb_publishable_ " +
          "or eyJ), on one line inside the quotes, then upload config.js again, wait a minute and press Ctrl+F5.");
      }
      return signInProblem(!hadVerifier || /verifier/i.test(error.message)
        ? "The sign-in came back, but this browser has no record of starting it here. This happens when sign-in starts " +
          "on a slightly different address from the one it returns to (http vs https, or another domain). Open the panel " +
          `at exactly <strong>${esc(location.origin + location.pathname)}</strong>, make sure that address is in Supabase's ` +
          "Redirect URLs, and press Sign in again."
        : `Couldn't finish signing in: <strong>${esc(error.message)}</strong>. Press Sign in to try again.`);
    }
  }

  const { data: { session } } = await client.auth.getSession();
  show("#loading", false);
  if (!session) { show("#signin"); return; }
  try {
    const me = await api("whoami");
    enter(me.email);
  } catch (e) {
    if (e.status === 403) {
      $("#denied-email").textContent = e.data.email || "this account";
      $("#denied-id").textContent = e.data.your_user_id || "";
      show("#denied");
    } else {
      diagnostics(`Admin function said: ${e.status || "no reply"} ${e.message}`);
      signInProblem(e.status
        ? `You're signed in, but the admin function refused: <strong>${esc(e.message)}</strong>`
        : "You're signed in, but the browser couldn't reach the admin function. The usual cause is the ADMIN_ORIGIN secret " +
          `not matching this address exactly: it should be <strong>${esc(location.origin)}</strong>. Also check the admin function is deployed.`);
    }
  }
}

$("#signin-btn").onclick = async () => {
  const { error } = await client.auth.signInWithOAuth({ provider: "azure", options: {
    scopes: "openid profile email", redirectTo: location.origin + location.pathname, queryParams: { prompt: "select_account" } } });
  if (error) { $("#signin-error").textContent = error.message; show("#signin-error"); }
};
const signOut = async () => { if (client) await client.auth.signOut(); location.reload(); };
$("#sign-out").onclick = signOut;
$("#denied-signout").onclick = signOut;
$("#copy-id").onclick = () => navigator.clipboard.writeText($("#denied-id").textContent).then(() => toast("Copied"));

function enter(email) {
  show("#loading", false);
  $("#who-email").textContent = email;
  show("#who");
  show("#app");
  loadOverview();
}

/* ------------------------------------------------------------- tabs */
$$(".tab").forEach((b) => b.addEventListener("click", () => openTab(b.dataset.tab)));
function openTab(name) {
  $$(".tab").forEach((b) => { if (b.dataset.tab === name) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  ["orgs", "org", "coupons", "audit"].forEach((t) => show(`#tab-${t}`, t === name));
  if (name === "orgs") loadOverview();
  if (name === "coupons") loadCoupons();
  if (name === "audit") loadAudit();
}

/* ------------------------------------------------------------- overview */
const SOURCE = { stripe: "Paid", trial: "Trial", manual: "Manual" };
function licenceBadge(r) {
  const tone = r.status === "active" ? (r.source === "trial" ? "amber" : "green") : r.status === "past_due" ? "red" : "grey";
  const word = r.status === "active" ? SOURCE[r.source] + (r.cancelling ? " (ending)" : "")
    : { expired: "Expired", past_due: "Payment due", cancelled: "Cancelled", none: "Free" }[r.status] || r.status;
  return `<span class="pill ${tone}">${esc(word)}</span>`;
}

async function loadOverview() {
  const d = await api("overview");
  orgCache = d.organisations;
  const t = d.totals;
  $("#totals").innerHTML = [
    ["Organisations", t.organisations], ["Paying", t.paying], ["Active trials", t.trials],
    ["Paid seats", t.seats], ["Monthly revenue (ex VAT)", money(t.monthly_revenue_pence)],
  ].map(([k, v]) => `<div class="total"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join("");
  renderOrgs();
}

function renderOrgs() {
  const q = $("#org-search").value.trim().toLowerCase();
  const rows = orgCache.filter((o) => !q || [o.name, o.tenant_id, ...(o.managers || [])].join(" ").toLowerCase().includes(q));
  $("#org-rows").innerHTML = rows.map((o) => `<tr>
      <td><button type="button" class="link" data-org="${esc(o.id)}">${esc(o.name)}</button></td>
      <td>${esc((o.managers || []).join(", "))}</td>
      <td>${o.members}${o.pending ? ` <span class="pill amber">${o.pending} waiting</span>` : ""}</td>
      <td>${o.seated} / ${o.seats}</td>
      <td>${licenceBadge(o)}</td>
      <td>${day(o.ends)}</td></tr>`).join("") || `<tr><td colspan="6" class="muted">No organisations${q ? " match" : " yet"}.</td></tr>`;
}
$("#org-search").addEventListener("input", renderOrgs);
$("#org-rows").addEventListener("click", (e) => { const b = e.target.closest("[data-org]"); if (b) openOrg(b.dataset.org); });
$("#back").onclick = () => openTab("orgs");

/* ------------------------------------------------------------- one organisation */
async function openOrg(id) {
  ["orgs", "coupons", "audit"].forEach((t) => show(`#tab-${t}`, false));
  show("#tab-org");
  const d = await api("organisation", { org_id: id });
  current = d;
  const o = d.organisation, s = d.subscription || { status: "none", seats: 0, source: "stripe" };
  $("#org-name").textContent = o.name;
  $("#org-meta").textContent = `Tenant ${o.tenant_id || "–"} · created ${day(o.created_at)} · ${o.id}`;
  const expired = s.current_period_end && new Date(s.current_period_end) < new Date();
  const status = s.status === "active" && expired ? "expired" : s.status;
  const facts = [
    ["Licence", licenceBadge({ status, source: s.source, cancelling: s.cancel_at_period_end })],
    ["Seats", `${d.members.filter((m) => m.seat && m.status === "active").length} used of ${s.seats}`],
    [s.cancel_at_period_end || status !== "active" ? "Ends" : s.source === "stripe" ? "Renews" : "Valid until", esc(day(s.current_period_end))],
    s.source === "stripe" && s.unit_amount ? ["Price", esc(`${money(s.unit_amount, s.currency)} per seat ${s.period === "yearly" ? "a year" : "a month"}`)] : null,
    s.note ? ["Note", esc(s.note)] : null,
  ].filter(Boolean);
  $("#lic-facts").innerHTML = facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("");
  $("#extend-hint").textContent = s.source === "stripe" && s.stripe_subscription
    ? "Paid through Stripe: this gives free time by pushing their next payment back. They aren't charged for it."
    : "Adds time to the trial or manual licence's end date.";
  show("#seats-box", s.source !== "stripe");
  $("#seats-box input[name=seats]").value = s.seats;
  const until = new Date(); until.setFullYear(until.getFullYear() + 1);
  $("form[data-act=manual] input[name=until]").value = until.toISOString().slice(0, 10);

  $("#stripe-subs").innerHTML = d.stripe_subscriptions.map((x) => {
    const live = ["active", "trialing", "past_due"].includes(x.status);
    return `<li><span><strong>${esc(x.seats)} seat${x.seats === 1 ? "" : "s"} ${x.interval === "year" ? "yearly" : "monthly"}</strong>
      · ${esc(x.status)}${x.current ? " · <em>current</em>" : ""}${x.cancel_at_period_end ? " · ending" : ""}<br>
      <span class="hint mono">${esc(x.id)} · started ${esc(day(new Date(x.created * 1000).toISOString()))}</span></span>
      ${live && !x.current ? `<button type="button" class="btn small danger" data-cancel="${esc(x.id)}">Cancel duplicate</button>` : ""}</li>`;
  }).join("") || `<li class="muted">No Stripe subscriptions for this organisation.</li>`;

  $("#member-rows").innerHTML = d.members.map((m) => `<tr data-user="${esc(m.user_id)}">
      <td><strong>${esc(m.name || m.email)}</strong><br><span class="hint">${esc(m.email)}</span></td>
      <td><select data-field="role" aria-label="Role for ${esc(m.name || m.email)}">${["manager", "senior", "technician"].map((r) =>
        `<option value="${r}"${r === m.role ? " selected" : ""}>${{ manager: "Manager", senior: "Senior technician", technician: "Technician" }[r]}</option>`).join("")}</select></td>
      <td><input type="checkbox" data-field="seat" aria-label="Pro seat for ${esc(m.name || m.email)}"${m.seat ? " checked" : ""}></td>
      <td>${m.status === "pending" ? `<span class="pill amber">Waiting</span> <button type="button" class="btn small" data-approve>Approve</button>` : `<span class="pill green">Active</span>`}</td>
      <td><button type="button" class="btn small danger" data-remove>Remove</button></td></tr>`).join("")
    || `<tr><td colspan="5" class="muted">Nobody yet.</td></tr>`;

  $("#invoice-rows").innerHTML = d.invoices.map((i) => `<tr><td>${esc(day(i.created))}</td>
      <td>${i.hosted_url ? `<a href="${esc(i.hosted_url)}" target="_blank" rel="noopener">${esc(i.number || "View")}</a>` : esc(i.number || "")}</td>
      <td>${esc(i.seats ?? "")}</td><td>${esc(money(i.amount, i.currency))}</td><td>${esc(i.status)}</td></tr>`).join("")
    || `<tr><td colspan="5" class="muted">No invoices recorded. Try Resync from Stripe.</td></tr>`;

  $("#org-audit").innerHTML = d.audit.map((a) => `<li><strong>${esc(a.action)}</strong><br><span class="hint">${esc(when(a.at))} · ${esc(a.admin)}</span></li>`).join("")
    || `<li class="muted">No admin changes yet.</li>`;
}

const orgId = () => current.organisation.id;
const reload = () => openOrg(orgId());
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + Number(n)); return d.toISOString().slice(0, 10); };

$$("#tab-org form[data-act]").forEach((f) => f.addEventListener("submit", async (e) => {
  e.preventDefault();
  const v = Object.fromEntries(new FormData(f));
  const kind = f.dataset.act;
  try {
    if (kind === "trial") await act("grant", { org_id: orgId(), kind: "trial", seats: v.seats, until: addDays(v.days), note: v.note }, "Trial started");
    if (kind === "manual") await act("grant", { org_id: orgId(), kind: "manual", seats: v.seats, until: v.until, note: v.note }, "Licence given");
    if (kind === "extend") await act("extend", { org_id: orgId(), days: v.days }, "Extended");
    if (kind === "seats") await act("set_seats", { org_id: orgId(), seats: v.seats }, "Seats saved");
    f.closest("details").open = false;
    reload();
  } catch { /* toast already shown */ }
}));

$("#tab-org").addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  try {
    if (b.dataset.act === "resync") {
      const r = await act("resync", { org_id: orgId() }, "Resynced");
      toast(`Resynced: ${r.subscriptions} subscription(s), ${r.invoices} invoice(s)`);
      reload();
    } else if (b.dataset.act === "revoke-now" && confirm(`Remove ${current.organisation.name}'s licence NOW? Paid subscriptions are cancelled in Stripe immediately.`)) {
      await act("revoke", { org_id: orgId(), when: "now" }, "Licence removed"); reload();
    } else if (b.dataset.act === "revoke-end" && confirm(`End ${current.organisation.name}'s licence at the end of the current period?`)) {
      await act("revoke", { org_id: orgId(), when: "period_end" }, "Licence will end at period end"); reload();
    } else if (b.dataset.cancel && confirm(`Cancel Stripe subscription ${b.dataset.cancel} now?`)) {
      await act("cancel_stripe_subscription", { org_id: orgId(), subscription: b.dataset.cancel }, "Subscription cancelled"); reload();
    } else if (b.hasAttribute("data-approve")) {
      await act("member", { org_id: orgId(), user_id: b.closest("tr").dataset.user, status: "active" }, "Approved"); reload();
    } else if (b.hasAttribute("data-remove") && confirm("Remove this person from the organisation?")) {
      await act("member", { org_id: orgId(), user_id: b.closest("tr").dataset.user, status: "removed" }, "Removed"); reload();
    }
  } catch { reload(); }
});

$("#member-rows").addEventListener("change", async (e) => {
  const field = e.target.dataset.field;
  if (!field) return;
  const value = field === "seat" ? e.target.checked : e.target.value;
  try { await act("member", { org_id: orgId(), user_id: e.target.closest("tr").dataset.user, [field]: value }, "Saved"); } catch { /* toast */ }
  reload();
});

/* ------------------------------------------------------------- coupons */
const form = $("#coupon-form");
form.duration.addEventListener("change", () => show("#months-label", form.duration.value === "repeating"));
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const v = Object.fromEntries(new FormData(form));
  v.first_time_only = form.first_time_only.checked;
  if (v.expires_at) v.expires_at = new Date(v.expires_at + "T23:59:59").toISOString();
  try { await act("create_coupon", v, `Coupon ${v.code.toUpperCase()} created`); form.reset(); show("#months-label", false); loadCoupons(); } catch { /* toast */ }
});

function applies(c) {
  if (c.duration === "once") return "First payment";
  if (c.duration === "forever") return "Every payment";
  return `${c.duration_in_months} month${c.duration_in_months === 1 ? "" : "s"}`;
}
async function loadCoupons() {
  const d = await api("coupons");
  $("#coupon-rows").innerHTML = d.coupons.map((c) => {
    const ended = (c.expires_at && c.expires_at * 1000 < Date.now()) || !c.coupon_valid;
    return `<tr><td class="mono"><strong>${esc(c.code)}</strong>${c.first_time_only ? `<br><span class="hint">new customers</span>` : ""}</td>
      <td>${c.percent_off ? esc(c.percent_off + "%") : esc(money(c.amount_off))}</td><td>${esc(applies(c))}</td>
      <td>${c.expires_at ? esc(day(new Date(c.expires_at * 1000).toISOString())) : "No end"}</td>
      <td>${esc(c.times_redeemed)}${c.max_redemptions ? " / " + esc(c.max_redemptions) : ""}</td>
      <td>${c.active && !ended ? `<span class="pill green">Active</span>` : `<span class="pill grey">${ended ? "Ended" : "Off"}</span>`}</td>
      <td>${ended ? "" : `<button type="button" class="btn small" data-coupon="${esc(c.id)}" data-active="${c.active ? "0" : "1"}">${c.active ? "Turn off" : "Turn on"}</button>`}</td></tr>`;
  }).join("") || `<tr><td colspan="7" class="muted">No coupons yet.</td></tr>`;
}
$("#coupon-rows").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-coupon]");
  if (!b) return;
  try { await act("toggle_coupon", { id: b.dataset.coupon, active: b.dataset.active === "1" }, "Coupon updated"); } catch { /* toast */ }
  loadCoupons();
});

/* ------------------------------------------------------------- audit */
async function loadAudit() {
  const d = await api("audit");
  $("#audit-rows").innerHTML = d.audit.map((a) => `<tr><td>${esc(when(a.at))}</td><td>${esc(a.admin)}</td><td>${esc(a.action)}</td>
      <td>${esc(a.organisations?.name || "")}</td><td class="mono small">${esc(JSON.stringify(a.detail))}</td></tr>`).join("")
    || `<tr><td colspan="5" class="muted">Nothing yet.</td></tr>`;
}

start().catch((e) => { show("#loading", false); show("#signin"); $("#signin-error").textContent = e.message; show("#signin-error"); });
