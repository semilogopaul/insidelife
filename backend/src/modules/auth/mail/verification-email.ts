import type { OutgoingMail } from '../../../common/mail/mail.service.js';

const INK = '#0e2733';
const DANFO = '#f6b90b';
const PAPER = '#ffffff';
const SOFT = '#5b6f77';

/**
 * The sign-up code email: short, branded, readable without images. Nothing in it is user-supplied except the
 * recipient, so there is nothing to escape; no remote images, no tracking pixels, no tracked links.
 */
export function verificationEmail(to: string, code: string, validMinutes: number): OutgoingMail {
  const subject = `${code} is your Inside Life code`;
  const text = [
    'Welcome to Lagos.',
    '',
    `Your Inside Life code is: ${code}`,
    '',
    `Enter it on the sign-up screen. It works for ${validMinutes} minutes.`,
    '',
    'Didn’t sign up? Ignore this email. Nobody can play with this address without the code.',
    '',
    'Inside Life · https://insidelife.online · hello@insidelife.online',
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background:#f2f4f3;">
    <div style="display:none;max-height:0;overflow:hidden;">Your code is ${code}. It works for ${validMinutes} minutes.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f3;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${PAPER};border-radius:16px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
            <tr>
              <td style="background:${INK};padding:22px 28px;border-bottom:6px solid ${DANFO};">
                <span style="font-size:22px;font-weight:900;letter-spacing:1px;color:${DANFO};text-transform:uppercase;">Inside Life</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 28px 8px;color:${INK};">
                <p style="margin:0 0 6px;font-size:20px;font-weight:700;">Welcome to Lagos.</p>
                <p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:${SOFT};">Enter this code on the sign-up screen to confirm your email and start your life.</p>
                <p style="margin:0 0 20px;padding:16px 0;text-align:center;background:#fff6d6;border-radius:12px;font-family:'Courier New',Courier,monospace;font-size:36px;font-weight:700;letter-spacing:10px;color:${INK};">${code}</p>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:${SOFT};">It works for ${validMinutes} minutes. Didn’t sign up? Ignore this email. Nobody can play with this address without the code.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 24px;border-top:1px solid #e3e8e6;font-size:12px;line-height:1.5;color:${SOFT};">
                Inside Life · insidelife.online · hello@insidelife.online
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { to, subject, text, html };
}
