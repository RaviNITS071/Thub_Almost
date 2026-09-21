/**
 * Telegram Notification Service for TenderHub
 * Sends real-time crawl updates, milestones, completion summaries, and alerts.
 * Uses native Node.js fetch (zero external dependencies).
 */

class TelegramService {
  constructor() {
    this.token = process.env.TELEGRAM_BOT_TOKEN || '';
    this.chatId = process.env.TELEGRAM_CHAT_ID || '';
    this.apiUrl = this.token ? `https://api.telegram.org/bot${this.token}/sendMessage` : null;
    this.lastProgressSentAt = 0;
  }

  /**
   * Check if Telegram notifications are configured
   */
  isEnabled() {
    return Boolean(this.token && this.chatId);
  }

  /**
   * Send a raw HTML-formatted message to Telegram
   * @param {string} text - HTML formatted text
   */
  async sendMessage(text) {
    if (!this.isEnabled()) return false;

    let telegramSent = false;
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        })
      });

      const data = await response.json();
      if (data.ok) {
        telegramSent = true;
      } else {
        console.warn(`⚠️ [Telegram] API Warning: ${data.description || 'Unknown error'}`);
      }
    } catch (err) {
      console.warn(`⚠️ [Telegram] Direct connection failed (${err.code || err.message}). Likely ISP restriction on api.telegram.org in local network.`);
    }

    return telegramSent;
  }

  /**
   * Send an urgent email alert via Brevo to ensure the user is notified even if Telegram is blocked.
   */
  async sendEmailAlert(subject, htmlContent, textContent) {
    const apiKey = process.env.EMAIL_API_KEY;
    const toEmail = process.env.EMAIL_FROM ? process.env.EMAIL_FROM.replace(/.*<(.+)>/, '$1').trim() : 'bgmiwale@gmail.com';

    if (!apiKey) return false;

    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sender: { name: 'TenderHub Alerts', email: toEmail },
          to: [{ email: toEmail }],
          subject,
          textContent: textContent || htmlContent.replace(/<[^>]+>/g, ''),
          htmlContent
        })
      });

      const data = await res.json();
      return !!data.messageId;
    } catch (e) {
      console.warn('⚠️ [Email Alert] Failed to send email alert:', e.message);
      return false;
    }
  }

  /**
   * Crawl Started Notification
   */
  async sendCrawlStarted({ mode = 'FULL', targetLimit = 'All', resumed = false, resumeDetails = null }) {
    const title = mode === 'FULL' ? '🚀 <b>TenderHub Full Crawl Started</b>' : '⚡ <b>TenderHub Daily Catch-Up Started</b>';
    let msg = `${title}\n\n`;
    msg += `📍 <b>Portal:</b> J&K Tenders (jktenders.gov.in)\n`;
    msg += `🎯 <b>Target Limit:</b> ${targetLimit}\n`;
    msg += `🔄 <b>Status:</b> ${resumed ? 'Resuming from Checkpoint' : 'Fresh Run'}\n`;

    if (resumed && resumeDetails) {
      msg += `🏛️ <b>Resuming At:</b> <code>${resumeDetails.orgName || 'N/A'}</code>\n`;
      msg += `📊 <b>Prior Saved:</b> ${resumeDetails.totalProcessed || 0} tenders\n`;
    }

    msg += `⏰ <b>Time:</b> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST\n`;
    msg += `\n<i>We'll notify you as milestones are reached.</i>`;

    return this.sendMessage(msg);
  }

  /**
   * Milestone / Org Progress Notification (Throttled to avoid Telegram spam)
   * Minimum 60 seconds interval between progress pings unless force = true
   */
  async sendCrawlProgress({
    mode = 'FULL',
    orgName = '',
    orgIndex = 0,
    totalOrgs = 0,
    savedCount = 0,
    skippedCount = 0,
    pdfCount = 0,
    boqCount = 0,
    elapsedSeconds = 0,
    force = false
  }) {
    const now = Date.now();
    // Throttle to at most once every 90 seconds unless forced
    if (!force && (now - this.lastProgressSentAt < 90000)) {
      return false;
    }
    this.lastProgressSentAt = now;

    const mins = Math.floor(elapsedSeconds / 60);
    const secs = elapsedSeconds % 60;
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

    let msg = `📊 <b>TenderHub Crawl Progress Update</b>\n\n`;
    if (orgName) {
      msg += `🏛️ <b>Current Org (${orgIndex + 1}/${totalOrgs || '?'}):</b>\n<code>${orgName}</code>\n\n`;
    }
    msg += `✅ <b>Newly Saved:</b> ${savedCount}\n`;
    msg += `⏩ <b>Skipped (Completed):</b> ${skippedCount}\n`;
    msg += `📄 <b>PDFs Downloaded:</b> ${pdfCount}\n`;
    msg += `📦 <b>BOQ Archives:</b> ${boqCount}\n`;
    msg += `⏱️ <b>Elapsed:</b> ${timeStr}\n`;
    msg += `⏰ <b>Time:</b> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`;

    return this.sendMessage(msg);
  }

  /**
   * Crawl Completed Notification
   */
  async sendCrawlCompleted({
    mode = 'FULL',
    savedCount = 0,
    skippedCount = 0,
    pdfCount = 0,
    boqCount = 0,
    missingPdfCount = 0,
    durationMs = 0
  }) {
    const mins = Math.floor(durationMs / 60000);
    const secs = Math.floor((durationMs % 60000) / 1000);
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

    let msg = `🎉 <b>TenderHub Crawl Completed Successfully!</b>\n\n`;
    msg += `📋 <b>Mode:</b> ${mode === 'FULL' ? 'Full Active Tenders Crawl' : 'Daily Incremental Sync'}\n`;
    msg += `✅ <b>Tenders Saved / Updated:</b> ${savedCount}\n`;
    msg += `⏩ <b>Tenders Skipped:</b> ${skippedCount}\n`;
    msg += `📄 <b>PDFs Secured to R2:</b> ${pdfCount}\n`;
    msg += `📦 <b>BOQs Secured to R2:</b> ${boqCount}\n`;
    if (missingPdfCount > 0) {
      msg += `⚠️ <b>Pending PDFs:</b> ${missingPdfCount}\n`;
    }
    msg += `⏱️ <b>Total Duration:</b> ${timeStr}\n`;
    msg += `⏰ <b>Finished:</b> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST\n\n`;
    msg += `<i>All documents are stored safely in Cloudflare R2 & MongoDB Atlas.</i>`;

    return this.sendMessage(msg);
  }

  /**
   * Crawl Error / Interruption Notification
   */
  async sendCrawlError({ mode = 'FULL', error = '', checkpointSaved = true, lastOrg = '' }) {
    let msg = `🚨 <b>TenderHub Crawl Alert: Process Interrupted</b>\n\n`;
    msg += `📋 <b>Mode:</b> ${mode}\n`;
    msg += `❌ <b>Error:</b> <code>${(error || 'Unknown error').slice(0, 200)}</code>\n`;
    if (lastOrg) {
      msg += `🏛️ <b>At Org:</b> <code>${lastOrg}</code>\n`;
    }
    if (checkpointSaved) {
      msg += `💾 <b>Checkpoint:</b> Saved to disk. Crawl will resume seamlessly from here when re-triggered.\n`;
    }
    msg += `⏰ <b>Time:</b> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`;

    // 1. Attempt Telegram alert
    const tgResult = await this.sendMessage(msg);

    // 2. Dispatch urgent Email alert via Brevo so user is guaranteed to receive it
    const emailSubject = `🚨 [TenderHub Alert] Crawl Interrupted (${mode})`;
    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #e11d48; margin-top: 0;">🚨 TenderHub Crawl Alert</h2>
        <p>A crawl operation encountered an interruption and needs your attention:</p>
        <ul style="line-height: 1.8;">
          <li><b>Mode:</b> ${mode}</li>
          <li><b>Error:</b> <code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${error || 'Unknown error'}</code></li>
          ${lastOrg ? `<li><b>Organisation:</b> ${lastOrg}</li>` : ''}
          <li><b>Checkpoint:</b> ${checkpointSaved ? '✅ Saved to disk (.crawl_checkpoint.json). Resumption is ready.' : '❌ Not saved'}</li>
          <li><b>Timestamp:</b> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</li>
        </ul>
        <p style="color: #64748b; font-size: 12px; margin-top: 24px;">This is an automated alert from your TenderHub backend monitoring system.</p>
      </div>
    `;
    await this.sendEmailAlert(emailSubject, emailHtml, msg.replace(/<[^>]+>/g, ''));

    return tgResult;
  }
}

export const telegramService = new TelegramService();
export default telegramService;
