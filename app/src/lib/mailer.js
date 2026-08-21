import nodemailer from "nodemailer";

let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

// Falls back to logging the message when no SMTP is configured, so the
// password-reset flow stays testable in local dev without real credentials.
export async function sendMail({ to, subject, text }) {
  if (!transporter) {
    console.log(`[mailer] SMTP not configured — would send to ${to}:\n${subject}\n${text}`);
    return;
  }
  await transporter.sendMail({ from: process.env.SMTP_FROM, to, subject, text });
}
