// NOTIFY-ALL (Billy via Cisco 10/17): OWNER notifications (bookings, sign-ups, memberships, refunds, reschedules, cancellations)
// go ONLY to the business inbox. No personal addresses here.
export const OWNER_RECIPIENTS: string[] = ['fourcornershoopsandperformance@gmail.com'];
// Separate COACH list for coaches' own booking notices. Empty by default; set function secret COACH_RECIPIENTS="a@x.com,b@y.com".
export const COACH_RECIPIENTS: string[] = (Deno.env.get('COACH_RECIPIENTS') || '').split(',').map(s => s.trim()).filter(Boolean);
export const ALL_RECIPIENTS = [...new Set([...OWNER_RECIPIENTS, ...COACH_RECIPIENTS])];
// QA allowlist: test customers qa-notify*@example.com get REAL notices (subject "[QA] ..."); other @example.* stay suppressed. Never a parent address.
export const isQA = (email: string) => /^qa-notify[^@]*@example\.com$/i.test(String(email || ''));
