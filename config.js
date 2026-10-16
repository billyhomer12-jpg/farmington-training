// ===== EDIT EVERYTHING HERE =====
window.SITE = {
  siteUrl: "https://fourcornershoopsandperformance.com",
  // Programs: "key" is the database value (don't change); "label" is what parents/coaches see. Order = dropdown order.
  programs: [
    { key: "Basketball Skills",       label: "Basketball Training", abbr: "BB" },
    { key: "Athletic Performance",    label: "Conditioning",  abbr: "COND" }
  ],
  brand: "Four Corners Hoops & Performance", // PLACEHOLDER brand name
  tagline: "Basketball skills, speed and conditioning for Farmington-area athletes, ages 12-18.",
  phone: "(505) 469-3851", phoneTel: "+15054693851",
  email: "fourcornershoopsandperformance@gmail.com",
  location: "San Juan College Health & Human Performance Center, 4601 College Blvd, Farmington, NM 87402, United States",
  locationName: "San Juan College Health & Human Performance Center",
  appleMaps: "https://maps.apple.com/place?address=4601%20College%20Blvd,%20Farmington,%20NM%20%2087402,%20United%20States&coordinate=36.770237,-108.173952&name=San%20Juan%20College%20Health%20%26%20Human%20Performance%20Center&place-id=IBC9B4F4B78DAE618&map=explore",
  // Form: "mailto" (opens the parent's email app) or "formspree" (paste your endpoint)
  formMode: "supabase", // "supabase" | "mailto" | "formspree"
  supabaseUrl: "https://jrcozcrfbjcsuqkmoaki.supabase.co",
  supabaseKey: "sb_publishable_cAiiq9Vv_9H_3ZCGD6yOXA_NeDnSkAe",
  formspreeEndpoint: "https://formspree.io/f/YOUR_FORM_ID",
  // Packages: 2-hour sessions. "sessions" = how many sessions the package books (default 4). Price is the TOTAL (small group: total for the group).
  sessionsPerPackage: 4, sessionHours: 2,
  packages: {
    "single": { label: "Single 1-on-1 session",  players: 1, price: 75, sale: 60, sessions: 1 },
    "1on1":   { label: "1-on-1",                 players: 1, price: 250, sale: 200 },
    "group2": { label: "Small group · 2 players", players: 2, price: 300, sale: 240 },
    "group3": { label: "Small group · 3 players", players: 3, price: 350, sale: 280 },
    "group4": { label: "Small group · 4 players", players: 4, price: 375, sale: 300 },
    "open_group": { label: "Join a group solo", players: 1, price: 125, sale: 100, solo: true }
  },
  // Stripe Payment Links per package (leave "" until created in Stripe). ?client_reference_id=<booking ref> is appended.
  paymentLinks: { "single": "https://buy.stripe.com/bJeaEZfDS0BdcBF0gabV601", "1on1": "https://buy.stripe.com/eVq5kF63i2Jl9pt7ICbV605", "group2": "https://buy.stripe.com/8x2eVffDSdnZ8lp7ICbV602", "group3": "https://buy.stripe.com/cNi5kF4Zefw70SXaUObV603", "group4": "https://buy.stripe.com/4gM28t2R60BdbxB3smbV604", "open_group": "https://buy.stripe.com/00w8wR63iabNbxB7ICbV600" }
};

// Removed programs: display-only labels for old/DEMO rows. Not bookable (not in SITE.programs).
window.SITE.legacyPrograms={'Youth Strength Training':{label:'Weightlifting (legacy)',abbr:'WL'}};
window.progInfo=k=>(window.SITE.programs||[]).find(p=>p.key===k||p.label===k)||window.SITE.legacyPrograms[k]||{label:k,abbr:k};
window.progLabel=k=>window.progInfo(k).label;
window.progOptions=()=>(window.SITE.programs||[]).map(p=>`<option value="${p.key}">${p.label}</option>`).join("");
window.pkgSessions=k=>(((window.SITE.packages||{})[k]||{}).sessions)||window.SITE.sessionsPerPackage||4;
// Only real https Stripe links count; placeholders like TODO_SINGLE_LINK are treated as not set up.
window.payLink=k=>{const sl=window.DEALS&&window.DEALS.sale?((window.SITE.saleLinks||{})[k]||""):"",l=/^https:\/\//.test(sl)?sl:(((window.SITE.paymentLinks||{})[k])||"");return /^https:\/\//.test(l)?l:""};
window.pkgText=k=>{const p=(window.SITE.packages||{})[k];return p?`${p.label} — $${p.price} · ${window.pkgSessions(k)} session${window.pkgSessions(k)>1?"s":""} · 2 hrs ${window.pkgSessions(k)>1?"each":""}`.trim():""};

// ===== DEALS (DEALS-SLOT) =====
// Grand Opening start. null = the launch deal never renders. Set an ISO time with offset, e.g. "2026-12-05T09:00:00-07:00".
// Keep training.deals (supabase/2026-10-16-deals.sql) in sync: it drives the +1 bonus in the back office, paid page and email.
window.SITE.LAUNCH_AT = "2026-10-16T17:40:00-06:00";
// DEAL-20: Grand Opening sale window is LAUNCH_AT to LAUNCH_AT+72h.
window.SITE.PRELAUNCH_AT = "2026-10-16T14:30:00-06:00";
// Shown only when status is approved/live AND start_at <= now < end_at (America/Denver offsets). At most one shows (first match).
// Test only: ?deal_preview=<id> forces one deal; ?deal_now=2026-11-19 (or a full ISO time) fakes the clock. Both add noindex + a Preview tag.
window.SITE.deals = [
  { id: "holiday-4pack-2026", status: "approved", offer_type: "value_add",
    headline: "Holiday 4-Pack Bonus", offer_detail: "+1 bonus session",
    banner_detail: "free 5th session with any 4-session package · ends Nov 30",
    start_at: "2026-11-26T00:00:00-07:00", end_at: "2026-11-30T23:59:59-07:00",
    eligible_packages: ["1on1", "open_group", "group2", "group3", "group4"],
    cta_label: "See packages", cta_url: "pricing.html",
    summary_line: "this package includes a free 5th session (use by 3/31/27).",
    confirm_line: "Includes 1 bonus session, use by 3/31/27",
    fine_print: "Buy any 4-session package by Mon 11/30 and get a 5th session free. Use it Dec 1-Mar 31. Not valid on single sessions. One per package; can't be combined. Gym closed 11/25-29 and 12/21-1/2; outdoor sessions available.",
    faq_q: "How does the holiday bonus session work?",
    surfaces: ["home_banner", "pricing_badge", "book_page", "confirmation_line"],
    promo_code: null, price_display: null, countdown: false, spots_left: null },
  // DEAL-20 (Billy 10/16): 20% off everything, LAUNCH_AT -> LAUNCH_AT+72h. Sale prices live next to regular ones in packages / MEMBERSHIP_PRICES ("sale").
  // Sale Payment Links: fill SITE.saleLinks below; empty = regular link stays (and booking shows the regular price it charges). Auto-reverts by time.
  { id: "grand-opening-2026", status: "approved", offer_type: "percent_off", percent: 20,
    headline: "Grand Opening", offer_detail: "20% off",
    banner_text: "Grand Opening: 20% off everything for 72 hours",
    eligible_packages: ["single", "1on1", "open_group", "group2", "group3", "group4"],
    cta_label: "See prices", cta_url: "pricing.html",
    summary_line: "20% off for 72 hours.",
    fine_print: "First month only on monthly plans. Ends Mon 10/19 at 6:15 PM MT.",
    membership_fine_print: "Grand Opening: 20% off your first month. Ends Mon 10/19 at 6:15 PM MT.",
    surfaces: ["home_banner", "pricing_badge", "book_page"],
    promo_code: null, countdown: false, spots_left: null, countdown_hours: 72,
    ...(()=>{const L=window.SITE.LAUNCH_AT;return L?{start_at:L,end_at:"2026-10-19T18:15:00-06:00"}:{}})() }
];
// Single source for monthly membership prices (display only; Stripe is separate). Cards bind by data-tier.
window.SITE.MEMBERSHIP_PRICES = {"1on1_monthly":{price:240,sale:192,sessions:4},"1on1_monthly_plus":{price:460,sale:368,sessions:8},"open_group_monthly":{price:120,sale:96,per:"player",sessions:4}};
// DEAL-20 sale Payment Links (used only while the sale is live; "" = keep the regular link).
window.SITE.saleLinks = {"single":"https://buy.stripe.com/6oU3cx77m0Bd59d5AubV606","1on1":"https://buy.stripe.com/14A7sN63i83FbxBe70bV607","open_group":"https://buy.stripe.com/cNi9AV3Vafw77hl8MGbV608","group2":"https://buy.stripe.com/8x2fZj4Ze2JlfNRfb4bV609","group3":"https://buy.stripe.com/dRmbJ3gHWgAb1X19QKbV60a","group4":"https://buy.stripe.com/5kQ00l1N22Jl8lp7ICbV60b"};
// Price display helpers: p.regular is set by deals.js only while the sale is live.
window.priceTxt=p=>p.regular?`$${p.price} (was $${p.regular})`:`$${p.price}`;
window.priceHTML=p=>p.regular?`<s aria-hidden="true">$${p.regular}</s> <b>$${p.price}</b><span class="vh"> (was $${p.regular}, now $${p.price})</span>`:`$${p.price}`;

window.SITE.membershipCheckoutFn = "membership-checkout";
