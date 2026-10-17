// NOTIFY-ALL: the ONE list of owner/coach recipients for every coach notice (bookings, joins, memberships, reschedules, cancellations).
// Override without a code change: function secret NOTIFY_RECIPIENTS="a@x.com,b@y.com".
export const COACH_RECIPIENTS: string[] = (Deno.env.get('NOTIFY_RECIPIENTS') || 'fourcornershoopsandperformance@gmail.com,billyhomer12@gmail.com,collins.devin2018@gmail.com')
  .split(',').map(s => s.trim()).filter(Boolean);
// QA allowlist: test customers qa-notify*@example.com get REAL coach notices (subject "[QA] ..."); other @example.* stay suppressed. Never a parent address.
export const isQA = (email: string) => /^qa-notify[^@]*@example\.com$/i.test(String(email || ''));
