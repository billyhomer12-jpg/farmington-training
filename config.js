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
  location: "San Juan College HHPC, 4601 College Blvd, Farmington, NM 87402",
  instagram: "#", tiktok: "#",  // PLACEHOLDER links
  // Form: "mailto" (opens the parent's email app) or "formspree" (paste your endpoint)
  formMode: "supabase", // "supabase" | "mailto" | "formspree"
  supabaseUrl: "https://jrcozcrfbjcsuqkmoaki.supabase.co",
  supabaseKey: "sb_publishable_cAiiq9Vv_9H_3ZCGD6yOXA_NeDnSkAe",
  formspreeEndpoint: "https://formspree.io/f/YOUR_FORM_ID",
  // Stripe Payment Links per program (leave "" until Billy creates them in Stripe).
  // The booking ref is appended as ?client_reference_id=<ref> so a webhook can mark it paid.
  stripePaymentLinks: { "Basketball Skills": "", "Athletic Performance": "", "Youth Strength Training": "" }
};

window.progLabel=k=>((window.SITE.programs||[]).find(p=>p.key===k||p.label===k)||{label:k}).label;
window.progOptions=()=>(window.SITE.programs||[]).map(p=>`<option value="${p.key}">${p.label}</option>`).join("");
