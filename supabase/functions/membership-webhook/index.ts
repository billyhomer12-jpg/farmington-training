// MEMBERSHIP-3 draft (NOT DEPLOYED). Test-mode endpoint; secrets MEMBERSHIP_WEBHOOK_SECRET + STRIPE_TEST_SECRET_KEY (not yet available).
import Stripe from "npm:stripe@14";
import { createClient } from "npm:@supabase/supabase-js@2";
const stripe = new Stripe(Deno.env.get("STRIPE_TEST_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const GRANT: Record<string, number> = { "1on1_monthly": 4, "1on1_monthly_plus": 8, "open_group_monthly": 4 };
const ts = (s?: number | null) => (s ? new Date(s * 1000).toISOString() : null);
Deno.serve(async (req) => {
  const body = await req.text();
  let ev: Stripe.Event;
  try { ev = await stripe.webhooks.constructEventAsync(body, req.headers.get("stripe-signature") ?? "", Deno.env.get("MEMBERSHIP_WEBHOOK_SECRET")!); }
  catch { return new Response("bad signature", { status: 400 }); }
  const { error: dup } = await sb.from("stripe_events_processed").insert({ event_id: ev.id });
  if (dup) return new Response("duplicate", { status: 200 });
  const o: any = ev.data.object;
  switch (ev.type) {
    case "checkout.session.completed":
      if (o.mode === "subscription") await sb.from("memberships").upsert({
        parent_email: o.customer_details?.email, athlete: o.metadata?.athlete, tier: o.metadata?.tier,
        stripe_customer_id: o.customer, stripe_subscription_id: o.subscription, status: "active",
      }, { onConflict: "stripe_subscription_id" });
      break;
    case "invoice.paid": {
      const { data: m } = await sb.from("memberships").select("*").eq("stripe_subscription_id", o.subscription).single();
      if (!m) break;
      const p = o.lines?.data?.[0]?.period;
      const left = m.sessions_granted + m.rollover - m.sessions_used; // closure credits tracked separately, uncapped
      await sb.from("memberships").update({
        sessions_granted: GRANT[m.tier], sessions_used: 0,
        rollover: m.sessions_granted === 0 ? 0 : Math.min(2, Math.max(0, left)),
        payment_failed: false, status: "active",
        current_period_start: ts(p?.start), current_period_end: ts(p?.end), updated_at: new Date().toISOString(),
      }).eq("id", m.id);
      break; }
    case "invoice.payment_failed":
      await sb.from("memberships").update({ payment_failed: true, status: "past_due" }).eq("stripe_subscription_id", o.subscription); break;
    case "customer.subscription.updated":
      await sb.from("memberships").update({ status: o.status, cancel_at_period_end: o.cancel_at_period_end,
        current_period_end: ts(o.current_period_end) }).eq("stripe_subscription_id", o.id); break;
    case "customer.subscription.deleted":
      await sb.from("memberships").update({ status: "canceled", sessions_granted: 0, rollover: 0, closure_rollover: 0, sessions_used: 0 })
        .eq("stripe_subscription_id", o.id); break;
  }
  return new Response("ok");
});
