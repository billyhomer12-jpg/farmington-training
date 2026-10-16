#!/usr/bin/env python3
"""Create LIVE membership Stripe objects on acct_1UR0vSRpcc5zZV0D. DRY-RUN BY DEFAULT.
Real run requires BOTH: --execute and env STRIPE_LIVE_KEY_FILE pointing at an sk_live_/rk_live_ key file,
plus typing the account id at the prompt. Run ONLY after Billy's go-live approval."""
import os, sys, json, requests
ACCT = "acct_1UR0vSRpcc5zZV0D"
POLICY = "Month to month. Cancel anytime, keep access through the end of your month. No partial refunds; memberships can't be paused."
SITE = "https://fourcornershoopsandperformance.com"
TIERS = [("1on1_monthly", "1-on-1 Monthly", 24000, "4 two-hour 1-on-1 sessions per month"),
         ("1on1_monthly_plus", "1-on-1 Monthly Plus", 46000, "8 two-hour 1-on-1 sessions per month"),
         ("open_group_monthly", "Open Group Monthly", 12000, "4 two-hour open group sessions per month, per player")]
PLAN = []
for tier, name, amt, desc in TIERS:
    PLAN.append(("products", {"name": name, "description": desc, "metadata[tier]": tier}))
    PLAN.append(("prices", {"product": "<product from previous step>", "unit_amount": amt, "currency": "usd", "recurring[interval]": "month", "metadata[tier]": tier, "nickname": name}))
PLAN.append(("billing_portal/configurations", {
    "business_profile[headline]": "Four Corners Hoops & Performance memberships",
    "business_profile[terms_of_service_url]": SITE + "/membership-terms.html", "business_profile[privacy_policy_url]": SITE + "/privacy.html",
    "features[subscription_cancel][enabled]": "true", "features[subscription_cancel][mode]": "at_period_end",
    "features[subscription_cancel][proration_behavior]": "none", "features[subscription_update][enabled]": "false",
    "features[payment_method_update][enabled]": "true", "features[invoice_history][enabled]": "true",
    "features[customer_update][enabled]": "false", "default_return_url": SITE + "/my.html"}))
PLAN.append(("webhook_endpoints", {"url": "https://jrcozcrfbjcsuqkmoaki.supabase.co/functions/v1/membership-webhook",
    **{f"enabled_events[{i}]": e for i, e in enumerate(["checkout.session.completed", "invoice.paid", "invoice.payment_failed", "customer.subscription.updated", "customer.subscription.deleted"])}}))
def main():
    if "--execute" not in sys.argv:
        print("DRY RUN (nothing created). Would POST:"); [print(" ", p, json.dumps(d)) for p, d in PLAN]; return
    kf = os.environ.get("STRIPE_LIVE_KEY_FILE"); key = open(kf).read().strip()
    assert key.startswith(("sk_live_", "rk_live_")), "not a live key"
    if input(f"Type {ACCT} to create LIVE objects: ").strip() != ACCT: sys.exit("aborted")
    call = lambda p, d: requests.post("https://api.stripe.com/v1/" + p, auth=(key, ""), data=d).json()
    out, prod = {}, None
    for p, d in PLAN:
        if p == "prices": d = {**d, "product": prod}
        r = call(p, d); assert "error" not in r, r["error"]["message"]
        if p == "products": prod = r["id"]
        out.setdefault(p, []).append(r["id"])
        if p == "webhook_endpoints": print("Webhook signing secret -> store as MEMBERSHIP_WEBHOOK_SECRET (not printed). Saved to ./live_whsec (chmod 600).");
        if p == "webhook_endpoints": open("live_whsec", "w").write(r["secret"]); os.chmod("live_whsec", 0o600)
    tiers=[t[0] for t in TIERS]
    live={'prices':dict(zip(tiers,out['prices'])),'products':dict(zip(tiers,out['products'])),'portal_config':out['billing_portal/configurations'][0],'webhook':out['webhook_endpoints'][0]}
    json.dump(live,open('live_ids.json','w'),indent=1); print(json.dumps(live, indent=1))
if __name__ == "__main__": main()
