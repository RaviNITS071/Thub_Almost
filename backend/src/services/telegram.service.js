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
      if (!data.ok) {
        console.warn(`⚠️ [Telegram] API Warning: ${data.description || 'Unknown error'}`);
        return false;
      }
      return true;
    } catch (err) {
      console.warn(`⚠️ [Telegram] Failed to send message: ${err.message}`);
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

    return this.sendMessage(msg);
  }
}

export const telegramService = new TelegramService();
export default telegramService;
