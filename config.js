// ===== EDIT EVERYTHING HERE =====
window.SITE = {
  // Programs: "key" is the database value (don't change); "label" is what parents/coaches see. Order = dropdown order.
  programs: [
    { key: "Basketball Skills",       label: "Basketball Training", abbr: "BB" },
    { key: "Youth Strength Training", label: "Weightlifting", abbr: "WL" },
    { key: "Athletic Performance",    label: "Conditioning",  abbr: "COND" }
  ],
  brand: "Four Corners Hoops & Performance", // PLACEHOLDER brand name
  tagline: "Basketball skills, speed and safe strength training for Farmington-area athletes, ages 12-18.",
  phone: "(505) 469-3851",
  email: "billyhomer12@gmail.com",
  location: "San Juan College Health & Human Performance Center, 4601 College Blvd, Farmington, NM 87402, United States",
  instagram: "#", tiktok: "#",  // PLACEHOLDER links
  // Form: "mailto" (opens the parent's email app) or "formspree" (paste your endpoint)
  formMode: "supabase", // "supabase" | "mailto" | "formspree"
  supabaseUrl: "https://jrcozcrfbjcsuqkmoaki.supabase.co",
  supabaseKey: "sb_publishable_cAiiq9Vv_9H_3ZCGD6yOXA_NeDnSkAe",
  formspreeEndpoint: "https://formspree.io/f/YOUR_FORM_ID",
  // Packages: every package = FOUR 2-hour sessions. Price is the TOTAL for the 4 sessions (small group: total for the group).
  sessionsPerPackage: 4, sessionHours: 2,
  packages: {
    "1on1":   { label: "1-on-1",                 players: 1, price: 250 },
    "group2": { label: "Small group · 2 players", players: 2, price: 300 },
    "group3": { label: "Small group · 3 players", players: 3, price: 350 },
    "group4": { label: "Small group · 4 players", players: 4, price: 375 }
  },
  // Stripe Payment Links per package (leave "" until created in Stripe). ?client_reference_id=<booking ref> is appended.
  paymentLinks: { "1on1": "", "group2": "", "group3": "", "group4": "" }
};

window.progLabel=k=>((window.SITE.programs||[]).find(p=>p.key===k||p.label===k)||{label:k}).label;
window.progOptions=()=>(window.SITE.programs||[]).map(p=>`<option value="${p.key}">${p.label}</option>`).join("");
window.pkgText=k=>{const p=(window.SITE.packages||{})[k];return p?`${p.label} — $${p.price} · 4 sessions · 2 hrs each`:""};
