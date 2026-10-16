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
    "single": { label: "Single 1-on-1 session",  players: 1, price: 75, sessions: 1 },
    "1on1":   { label: "1-on-1",                 players: 1, price: 250 },
    "group2": { label: "Small group · 2 players", players: 2, price: 300 },
    "group3": { label: "Small group · 3 players", players: 3, price: 350 },
    "group4": { label: "Small group · 4 players", players: 4, price: 375 },
    "open_group": { label: "Join a group solo", players: 1, price: 125, solo: true }
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
window.payLink=k=>{const l=((window.SITE.paymentLinks||{})[k])||"";return /^https:\/\//.test(l)?l:""};
window.pkgText=k=>{const p=(window.SITE.packages||{})[k];return p?`${p.label} — $${p.price} · ${window.pkgSessions(k)} session${window.pkgSessions(k)>1?"s":""} · 2 hrs ${window.pkgSessions(k)>1?"each":""}`.trim():""};

// ===== DEALS (DEALS-SLOT) =====
// Grand Opening start. null = the launch deal never renders. Set an ISO time with offset, e.g. "2026-12-05T09:00:00-07:00".
// Keep training.deals (supabase/2026-10-16-deals.sql) in sync: it drives the +1 bonus in the back office, paid page and email.
window.SITE.LAUNCH_AT = null;
// LAUNCH-6: pre-launch Founding Family Bonus starts at deploy time. Hard cap = earlier of LAUNCH_AT+72h or PRELAUNCH_AT+10 days.
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
  { id: "grand-opening-2026", status: "approved", offer_type: "value_add",
    headline: "Grand Opening: Founding Family Bonus", offer_detail: "+1 bonus session",
    banner_detail: "free 5th session with any 4-session package in our first 72 hours",
    eligible_packages: ["1on1", "open_group", "group2", "group3", "group4"],
    cta_label: "See packages", cta_url: "pricing.html",
    summary_line: "this package includes a free 5th session (use within 90 days).",
    confirm_line: "Includes 1 Founding Family bonus session, use within 90 days",
    fine_print: "Buy any 4-session package in our first 72 hours and get a 5th session free. Use it within 90 days. Not valid on single sessions. One per package; can't be combined.",
    surfaces: ["home_banner", "pricing_badge", "book_page", "confirmation_line"],
    promo_code: null, price_display: null, countdown: false, spots_left: null,
    ...(()=>{const L=window.SITE.LAUNCH_AT,P=window.SITE.PRELAUNCH_AT,cap=new Date(P).getTime()+10*864e5;
      // Pre-launch (LAUNCH_AT null): live from PRELAUNCH_AT to the 10-day cap; no countdown, no end date, no 72h wording.
      if(!L)return {state:"prelaunch",start_at:P,end_at:new Date(cap).toISOString(),banner_text:"Grand Opening: Founding Family Bonus. Free 5th session with any 4-pack.",
        fine_print:"Use it within 90 days. Not valid on single sessions. One per package; can't be combined.",countdown:false};
      // Launched: 72h window, auto-ends at the earlier of LAUNCH_AT+72h or the cap; countdown only in the last 48h.
      // Before LAUNCH_AT the prelaunch copy stays; deals.js swaps in launch_copy once now >= LAUNCH_AT.
      return {state:"launch",start_at:P,launch_at:L,end_at:new Date(Math.min(new Date(L).getTime()+72*3600e3,cap)).toISOString(),countdown_hours:48,
        banner_text:"Grand Opening: Founding Family Bonus. Free 5th session with any 4-pack.",fine_print:"Use it within 90 days. Not valid on single sessions. One per package; can't be combined.",
        launch_copy:{banner_text:null,fine_print:"Buy any 4-session package in our first 72 hours and get a 5th session free. Use it within 90 days. Not valid on single sessions. One per package; can't be combined."}}})()  }
];
