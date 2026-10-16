// MEMBERSHIP-3. Deployed ONLY as "membership-webhook-test" (Stripe TEST mode). Test-only secrets:
// MEMBERSHIP_LIVE_STRIPE_KEY, MEMBERSHIP_LIVE_WEBHOOK_SECRET. Emails are rendered into membership_email_log, never sent.
import Stripe from "npm:stripe@14";
import { createClient } from "npm:@supabase/supabase-js@2";
const stripe = new Stripe(Deno.env.get("MEMBERSHIP_LIVE_STRIPE_KEY")!, { apiVersion: "2024-06-20" });
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const KEY_LIVE = (Deno.env.get("MEMBERSHIP_LIVE_STRIPE_KEY") ?? "").includes("_live_");
const GRANT: Record<string, number> = { "1on1_monthly": 4, "1on1_monthly_plus": 8, "open_group_monthly": 4 };
const NAME: Record<string, string> = { "1on1_monthly": "1-on-1 Monthly", "1on1_monthly_plus": "1-on-1 Monthly Plus", "open_group_monthly": "Open Group Monthly" };
const POLICY = "Month to month. Cancel anytime, keep access through the end of your month. 1 reschedule per billing month. No partial refunds; memberships can't be paused.";
const ts = (s?: number | null) => (s ? new Date(s * 1000).toISOString() : null);
const d = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Denver", month: "short", day: "numeric", year: "numeric" }) : "";
// Parent emails: OFF by default everywhere. Always rendered into membership_email_log (back office / evidence).
// Real sending requires MEMBERSHIP_EMAILS_SEND=1 AND Billy's approval via Cisco; until then nothing is sent.
const EMAILS_SEND = Deno.env.get("MEMBERSHIP_EMAILS_SEND") === "1";
async function mail(m: any, kind: string, subject: string, body: string) {
  await sb.from("membership_email_log").insert({ membership_id: m.id, kind, to_email: m.parent_email, subject, body });
  if (!EMAILS_SEND) return; // default: rendered only, never sent
  const { sendEmail } = await import("../_shared/send.ts");
  await sendEmail(m.parent_email, { subject, text: body, html: body.replace(/\n/g, "<br>") });
}
async function bySub(id: string) { return (await sb.from("memberships").select("*").eq("stripe_subscription_id", id).maybeSingle()).data; }
async function ensure(subId: string, email?: string, athlete?: string) {
  let m = await bySub(subId);
  if (m) return m;
  const s = await stripe.subscriptions.retrieve(subId, { expand: ["customer"] });
  const c: any = s.customer;
  const tier = s.metadata?.tier;
  const ins = await sb.from("memberships").upsert({ parent_email: email ?? c.email, athlete: athlete ?? s.metadata?.athlete ?? "", tier,
    stripe_customer_id: c.id, stripe_subscription_id: s.id, status: s.status, is_test: !KEY_LIVE }, { onConflict: "stripe_subscription_id" }).select().single();
  return ins.data;
}
Deno.serve(async (req) => {
  const body = await req.text();
  let ev: Stripe.Event;
  try { ev = await stripe.webhooks.constructEventAsync(body, req.headers.get("stripe-signature") ?? "", Deno.env.get("MEMBERSHIP_LIVE_WEBHOOK_SECRET")!); }
  catch { return new Response("bad signature", { status: 400 }); }
  if (ev.livemode !== KEY_LIVE) return new Response("mode mismatch, ignored", { status: 200 });
  const { error: dup } = await sb.from("stripe_events_processed").insert({ event_id: ev.id });
  if (dup) return new Response("duplicate", { status: 200 });
  const o: any = ev.data.object;
  const invSub = o.subscription ?? o.parent?.subscription_details?.subscription; // basil API moved it
  const subEnd = o.current_period_end ?? o.items?.data?.[0]?.current_period_end;
  try {
  switch (ev.type) {
    case "checkout.session.completed": {
      if (o.mode !== "subscription") break;
      const athlete = o.custom_fields?.find((f: any) => f.key === "athlete")?.text?.value ?? o.metadata?.athlete;
      const m = await ensure(o.subscription, o.customer_details?.email, athlete);
      if (athlete && m && !m.athlete) await sb.from("memberships").update({ athlete }).eq("id", m.id);
      const ref = o.metadata?.ref;
      if (m && ref) {
        const { data: pd } = await sb.from("membership_pending").select("*").eq("ref", ref).eq("consumed", false).maybeSingle();
        if (pd) {
          await sb.from("membership_sessions").insert(pd.starts.map((t: string) => ({ membership_id: m.id, starts_at: t, period_start: m.current_period_start })));
          await sb.from("memberships").update({ ref, token_hash: pd.token_hash, program: pd.program, workout_type: pd.workout_type, athlete: pd.athlete }).eq("id", m.id);
          await sb.rpc("membership_recount", { p_id: m.id });
          await sb.from("membership_pending").update({ consumed: true }).eq("ref", ref);
          const dates = pd.starts.map((t: string) => new Date(t).toLocaleString("en-US", { timeZone: "America/Denver", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })).join("\n- ");
          const plus = pd.tier === "1on1_monthly_plus" ? "\n\nMonthly Plus: pick your other 4 sessions before the start of week 3 of your billing month." : "";
          await mail({ ...m, parent_email: pd.email }, "booking_confirmation", `You're booked: ${NAME[pd.tier]}`, `Your sessions for ${pd.athlete}:\n- ${dates}${plus}\n\nNeed to move one? Use your reschedule link (1 reschedule per billing month, at least 24 hours before the session; it resets when your membership renews).\n\n${POLICY}`);
        }
      }
      break; }
    case "invoice.paid": {
      if (!invSub) break;
      const m = await ensure(invSub);
      if (!m) break;
      const p = o.lines?.data?.[0]?.period;
      const first = m.sessions_granted === 0 && !m.current_period_end;
      const left = Math.max(0, m.sessions_granted + m.rollover - m.sessions_used);
      const roll = first ? 0 : Math.min(2, left);
      const upd: any = { sessions_granted: GRANT[m.tier], rollover: roll, payment_failed: false, status: "active",
        current_period_start: ts(p?.start), current_period_end: ts(p?.end), updated_at: new Date().toISOString() };
      if (!first) { upd.sessions_used = 0; upd.reschedules_used = 0; }
      await sb.from("memberships").update(upd).eq("id", m.id);
      if (first) await sb.rpc("membership_recount", { p_id: m.id }); // signup picks counted atomically (race-safe)
      const total = GRANT[m.tier] + roll + m.closure_rollover;
      if (first) await mail(m, "welcome", `Welcome to ${NAME[m.tier]}`, `Hi! ${m.athlete}'s ${NAME[m.tier]} membership is active: ${GRANT[m.tier]} two-hour sessions this month, renewing ${d(upd.current_period_end)}. Book up to 4 weeks ahead from your dashboard.\n\n${POLICY}`);
      else await mail(m, "renewal", `Membership renewed: ${total} sessions ready`, `Your ${NAME[m.tier]} renewed ($${(o.amount_paid/100).toFixed(2)}). This month: ${GRANT[m.tier]} new sessions + ${roll} rolled over (max 2)${m.closure_rollover ? ` + ${m.closure_rollover} from gym closures` : ""}. Next renewal ${d(upd.current_period_end)}.\n\n${POLICY}`);
      break; }
    case "invoice.payment_failed": {
      const m = invSub && await bySub(invSub); if (!m) break;
      await sb.from("memberships").update({ payment_failed: true, status: "past_due" }).eq("id", m.id);
      await mail(m, "payment_failed", "Payment didn't go through", `We couldn't charge your card for ${NAME[m.tier]}. New bookings are paused until your card is updated in the billing portal (Manage/Cancel on your dashboard).`);
      break; }
    case "customer.subscription.updated": {
      const m = await bySub(o.id); if (!m) break;
      const end = ts(subEnd);
      const canceling = !!(o.cancel_at_period_end || o.cancel_at); // portal (basil API) sets cancel_at
      await sb.from("memberships").update({ status: o.status, cancel_at_period_end: canceling, current_period_end: end }).eq("id", m.id);
      if (canceling && !m.cancel_at_period_end)
        await mail(m, "cancel_confirmed", "Your membership will end " + d(end), `Your ${NAME[m.tier]} is canceled. You keep access and can use your sessions through ${d(end)}. You won't be billed again. No partial refunds are issued for the current month. Memberships are month to month and can't be paused.`);
      break; }
    case "customer.subscription.deleted": {
      const m = await bySub(o.id); if (!m) break;
      await sb.from("memberships").update({ status: "canceled", cancel_at_period_end: false, sessions_granted: 0, rollover: 0, closure_rollover: 0, sessions_used: 0 }).eq("id", m.id);
      break; }
  }
  } catch (e) { await sb.from("stripe_events_processed").delete().eq("event_id", ev.id); console.error(e); return new Response("error", { status: 500 }); }
  return new Response("ok");
});
