/**
 * @file backend/src/services/emailService.js
 * @description Abstracted transactional email service with support for Resend, Brevo, and Console fallback.
 * Uses native fetch (Node 18+) to avoid unnecessary extra packages.
 */
import pino from 'pino';
import { env } from '../config/env.js';

const logger = pino({
  transport: env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
});

/**
 * Send a 6-digit verification code email.
 *
 * @param {string} to - Recipient email address
 * @param {string} otp - Plain 6-digit OTP (never logged in production)
 * @returns {Promise<{ success: boolean, messageId?: string }>}
 */
export const sendOtpEmail = async (to, otp) => {
  const subject = 'Your verification code';
  const textBody = `Your verification code is:\n\n${otp}\n\nThis code expires in 5 minutes.\n\nIf you did not request this code, you can safely ignore this email.`;

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; color: #1e293b;">
      <div style="margin-bottom: 24px;">
        <span style="font-size: 20px; font-weight: 800; color: #0E3A5D; letter-spacing: -0.5px;">Tender<span style="color: #D34528;">Hub</span></span>
        <span style="font-size: 11px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; margin-left: 6px; color: #64748b; font-weight: 600;">J&amp;K</span>
      </div>
      <h2 style="font-size: 18px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 8px;">Your verification code</h2>
      <p style="font-size: 13px; color: #64748b; margin-top: 0; margin-bottom: 24px;">Use the verification code below to sign in to your TenderHub account:</p>
      
      <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 18px 24px; text-align: center; margin-bottom: 24px;">
        <span style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #0E3A5D; display: inline-block;">${otp}</span>
      </div>

      <p style="font-size: 12px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
        This code expires in <strong>5 minutes</strong> and can only be used once.<br/>
        If you did not request this code, you can safely disregard this email.
      </p>

      <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
      <p style="font-size: 11px; color: #94a3b8; margin: 0;">TenderHub — Official J&amp;K Public Works &amp; Procurement Radar</p>
    </div>
  `;

  // Fallback to console if no email API key is configured (developer mode)
  if (!env.EMAIL_API_KEY || env.EMAIL_PROVIDER === 'console') {
    logger.info(`[EMAIL SERVICE] (Dev Mode) To: ${to} | OTP: [${otp}] | Provider: ${env.EMAIL_PROVIDER}`);
    return { success: true, messageId: 'dev-console-message-id' };
  }

  try {
    if (env.EMAIL_PROVIDER === 'resend') {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.EMAIL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [to],
          subject: subject,
          text: textBody,
          html: htmlBody,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        logger.error({ errData }, '[EMAIL SERVICE] Resend API error');
        throw new Error(errData.message || 'Failed to send OTP email via Resend');
      }

      const resData = await response.json();
      return { success: true, messageId: resData.id };
    }

    if (env.EMAIL_PROVIDER === 'brevo') {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': env.EMAIL_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'TenderHub', email: env.EMAIL_FROM.replace(/.*<(.+)>/, '$1').trim() },
          to: [{ email: to }],
          subject: subject,
          textContent: textBody,
          htmlContent: htmlBody,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        logger.error({ errData }, '[EMAIL SERVICE] Brevo API error');
        throw new Error(errData.message || 'Failed to send OTP email via Brevo');
      }

      const resData = await response.json();
      return { success: true, messageId: resData.messageId };
    }

    throw new Error(`Unsupported email provider: ${env.EMAIL_PROVIDER}`);
  } catch (error) {
    logger.error({ err: error.message }, '[EMAIL SERVICE] Delivery failure');
    // In development, log the OTP anyway so the flow never gets stuck
    if (env.NODE_ENV !== 'production') {
      logger.info(`[EMAIL SERVICE] (Dev Fallback) To: ${to} | OTP: [${otp}]`);
    }
    throw error;
  }
};
