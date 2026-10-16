// Membership subscription Checkout (TEST). Validates picked dates, stores them as pending, returns a Checkout Session URL.
import Stripe from "npm:stripe@14";
import { createClient } from "npm:@supabase/supabase-js@2";
const stripe = new Stripe(Deno.env.get("MEMBERSHIP_TEST_STRIPE_KEY")!, { apiVersion: "2024-06-20" });
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const PRICE: Record<string, string> = JSON.parse(Deno.env.get("MEMBERSHIP_TEST_PRICES") ?? "{}");
const SITE = "https://fourcornershoopsandperformance.com";
const POLICY = "Month to month. Cancel anytime, keep access through the end of your month. 1 reschedule per billing month. No partial refunds; no pausing.";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, authorization, apikey", "Content-Type": "application/json" };
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: cors });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const b = await req.json();
    if (b.portal_token) {
      const { data: v } = await sb.rpc("membership_customer_for_token", { p_token: b.portal_token });
      if (!v) return j({ error: "invalid link" }, 400);
      const ps = await stripe.billingPortal.sessions.create({ customer: v, configuration: Deno.env.get("MEMBERSHIP_TEST_PORTAL_CONFIG") || undefined,
        return_url: (["http://localhost:8765", SITE].includes(b.origin) ? b.origin : SITE) + "/member.html?m=" + b.portal_token });
      return j({ url: ps.url });
    }
    if (Deno.env.get("MEMBERSHIP_TEST_CHECKOUT_OFF") === "1") return j({ error: "Online sign-up is paused. Text (505) 469-3851 to join." }, 503);
    const price = PRICE[b.tier]; if (!price) return j({ error: "Unknown plan" }, 400);
    if (!b.email || !b.athlete || !b.parent) return j({ error: "Parent, athlete and email are required." }, 400);
    const program = b.tier === "open_group_monthly" ? "Basketball Skills" : (["Basketball Skills", "Athletic Performance"].includes(b.program) ? b.program : "Basketball Skills");
    const wtype = b.tier === "open_group_monthly" ? "OpenGroup" : "Gym";
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const { data: ref, error } = await sb.rpc("membership_pending_create", { p_tier: b.tier, p_parent: b.parent, p_athlete: b.athlete, p_email: b.email,
      p_phone: b.phone ?? "", p_program: program, p_type: wtype, p_starts: b.starts, p_token: token });
    if (error) return j({ error: error.message }, 400);
    const origin = ["http://localhost:8765", SITE].includes(b.origin) ? b.origin : SITE;
    const s = await stripe.checkout.sessions.create({ mode: "subscription", line_items: [{ price, quantity: 1 }], customer_email: b.email,
      metadata: { ref, tier: b.tier, athlete: b.athlete }, subscription_data: { metadata: { ref, tier: b.tier, athlete: b.athlete }, description: POLICY },
      custom_text: { submit: { message: POLICY + " Terms: " + SITE + "/membership-terms.html" } },
      success_url: `${origin}/member.html?m=${token}&welcome=1`, cancel_url: `${origin}/pricing.html?membership_preview=1#memberships` });
    await sb.from("membership_pending").update({ checkout_session: s.id }).eq("ref", ref);
    return j({ url: s.url });
  } catch (e) { console.error(e); return j({ error: "Something went wrong. Please try again." }, 500); }
});
