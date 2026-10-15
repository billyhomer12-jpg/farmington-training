// ===== EDIT EVERYTHING HERE =====
window.SITE = {
  brand: "Four Corners Hoops & Performance", // PLACEHOLDER brand name
  tagline: "Basketball skills, speed and safe strength training for Farmington-area athletes, ages 12-18.",
  phone: "(505) 469-3851",
  email: "billyhomer12@gmail.com",
  location: "Gym address TBD, Farmington, NM", // PLACEHOLDER
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
