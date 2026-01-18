import nodemailer from 'nodemailer';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

const getSmtpTransport = () => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      'SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env'
    );
  }

  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
};

export const sendEmail = async (msg: EmailMessage): Promise<void> => {
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
  if (!from) throw new Error('Missing EMAIL_FROM (or SMTP_USER)');

  const transport = getSmtpTransport();
  await transport.sendMail({
    from,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
  });
};



