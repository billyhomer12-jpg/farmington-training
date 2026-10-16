// MEMBERSHIP-7/9 email copy (draft). Sent via existing send.ts; test addresses only until go-live.
const POLICY = "Month to month. Cancel anytime, keep access through the end of your month. No partial refunds; memberships can't be paused.";
export const membershipEmails = {
  welcome: (m) => ({ subject: `Welcome to ${m.tierName}`, text: `Hi! ${m.athlete}'s ${m.tierName} is active: ${m.sessions} sessions this month, renewing ${m.renewDate}. Book up to 4 weeks ahead from your dashboard.\n\n${POLICY}` }),
  renewal: (m) => ({ subject: `Membership renewed: ${m.sessionsLeft} sessions ready`, text: `Your ${m.tierName} renewed. This month: ${m.sessions} new sessions + ${m.rollover} rolled over${m.closureRollover ? ` + ${m.closureRollover} from gym closures` : ""}. Next renewal ${m.renewDate}.\n\n${POLICY}` }),
  paymentFailed: (m) => ({ subject: "Payment didn't go through", text: `We couldn't charge your card for ${m.tierName}. New bookings are paused until it's updated. Update your card here: ${m.portalUrl}` }),
  canceled: (m) => ({ subject: "Your membership is canceled", text: `Your ${m.tierName} is canceled. You keep access and can use your sessions through ${m.endDate}. You won't be billed again. No partial refunds are issued for the current month.` }),
};
