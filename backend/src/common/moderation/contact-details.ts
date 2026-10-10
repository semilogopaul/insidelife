/**
 * Contact details player text shown to strangers may not carry (refused, not masked: a masked number is still a
 * lure). Shared by DJ shoutouts (social) and speech bubbles (realtime).
 */

const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|ng|net|org|io|co|xyz|link|me|app|gg|ly|tv|info|biz|shop|site|online)\b)/i;
/** Ten or more digits, spaced or not ("0803 123 4567", "+2348031234567"): phone numbers and bank account numbers. */
const NUMBER = /(?:\+?\d[\s.-]?){10,}/;

/** A web link or a bare domain ("www.x.com", "cashapp.ng/ada"). */
export function containsLink(text: string): boolean {
  return LINK.test(text);
}

/** A phone number or a (NUBAN) account number. */
export function containsContactNumber(text: string): boolean {
  return NUMBER.test(text);
}
