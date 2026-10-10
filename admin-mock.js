/* Preview data for the admin panel (only used when config.js has mock: true). Nothing here is real or saved anywhere. */
(function () {
  const now = Date.now(), DAY = 864e5, iso = (d) => new Date(now + d * DAY).toISOString();
  const db = {
    orgs: [
      { id: "o1", name: "Bedales Schools", tenant_id: "5f1c…", created_at: iso(-3), managers: ["jack@bedales.org.uk"], members: 3, pending: 1, seated: 3,
        seats: 4, status: "active", source: "stripe", period: "yearly", ends: iso(362), unit_amount: 12000 },
      { id: "o2", name: "Hartwell Academy Trust", tenant_id: "a83d…", created_at: iso(-10), managers: ["it@hartwell.sch.uk"], members: 6, pending: 0, seated: 5,
        seats: 5, status: "active", source: "trial", ends: iso(12), note: "Bett show trial" },
      { id: "o3", name: "Riverside Primary", tenant_id: "77b2…", created_at: iso(-40), managers: ["office@riverside.sch.uk"], members: 1, pending: 0, seated: 0,
        seats: 0, status: "none", source: "stripe" },
    ],
    coupons: [{ id: "p1", code: "WELCOME10", active: true, times_redeemed: 3, max_redemptions: null, expires_at: null, first_time_only: true,
                percent_off: 10, duration: "once", coupon_valid: true }],
    audit: [{ at: iso(-0.2), admin: "you@entraplus.co.uk", action: "Granted trial", organisations: { name: "Hartwell Academy Trust" }, detail: { seats: 5 } }],
  };
  window.ADMIN_MOCK = async (action, b) => {
    await new Promise((r) => setTimeout(r, 120));
    const org = db.orgs.find((o) => o.id === b.org_id);
    switch (action) {
      case "overview": return { organisations: db.orgs, recent_invoices: [], totals: { organisations: 3, paying: 1, trials: 1, seats: 4, monthly_revenue_pence: 4000 } };
      case "organisation": return {
        organisation: { id: org.id, name: org.name, tenant_id: org.tenant_id, created_at: org.created_at },
        subscription: { status: org.status, seats: org.seats, source: org.source, period: org.period, current_period_end: org.ends, unit_amount: org.unit_amount,
                        currency: "gbp", note: org.note, stripe_subscription: org.source === "stripe" ? "sub_new" : null },
        members: [{ user_id: "u1", email: org.managers[0], name: "Jack Thomas", role: "manager", status: "active", seat: true },
                  { user_id: "u2", email: "alex@" + org.managers[0].split("@")[1], name: "Alex Morgan", role: "senior", status: "active", seat: true },
                  { user_id: "u3", email: "sam@" + org.managers[0].split("@")[1], name: "Sam Patel", role: "technician", status: "pending", seat: false }],
        invoices: org.source === "stripe" && org.status === "active" ? [{ id: "in1", number: "RM8E3BPB-0003", created: iso(-1), seats: 3, amount: 43200, currency: "gbp", status: "paid" }] : [],
        stripe_subscriptions: org.source === "stripe" && org.status === "active" ? [
          { id: "sub_new", status: "active", created: (now - DAY) / 1000, seats: 4, interval: "year", current: true },
          { id: "sub_old", status: "active", created: (now - 2 * DAY) / 1000, seats: 5, interval: "month", current: false }] : [],
        audit: db.audit.filter((a) => a.organisations.name === org.name) };
      case "grant": org.status = "active"; org.source = b.kind; org.seats = Number(b.seats); org.ends = new Date(b.until).toISOString(); org.note = b.note; return { ok: true };
      case "extend": org.ends = new Date(new Date(org.ends || now).getTime() + b.days * DAY).toISOString(); return { ok: true };
      case "set_seats": org.seats = Number(b.seats); return { ok: true };
      case "revoke": org.status = b.when === "now" ? "cancelled" : org.status; org.cancelling = b.when !== "now"; return { ok: true };
      case "resync": return { ok: true, subscriptions: 3, invoices: 3 };
      case "coupons": return { coupons: db.coupons };
      case "create_coupon": db.coupons.unshift({ id: "p" + now, code: b.code.toUpperCase(), active: true, times_redeemed: 0, max_redemptions: b.max_redemptions || null,
        expires_at: b.expires_at ? new Date(b.expires_at).getTime() / 1000 : null, first_time_only: b.first_time_only, percent_off: Number(b.percent_off),
        duration: b.duration, duration_in_months: Number(b.duration_in_months), coupon_valid: true }); return { ok: true };
      case "toggle_coupon": db.coupons.find((c) => c.id === b.id).active = b.active; return { ok: true };
      case "audit": return { audit: db.audit };
      default: return { ok: true };
    }
  };
})();
