/**
 * @file backend/src/services/captcha.service.js
 * @description High-accuracy Captcha recognition service supporting:
 * 1. CapSolver ImageToTextTask (Primary, 99%+ accuracy on NIC eProcurement image captchas)
 * 2. Local Tesseract.js (Automatic fallback if API key is missing or network failure)
 * 3. Diagnostic error logging to SystemLog
 */
import pino from 'pino';
import { createWorker } from 'tesseract.js';
import SystemLog from '../models/SystemLog.js';

const logger = pino();

export class CaptchaService {
  constructor() {
    this.capsolverKey = process.env.CAPSOLVER_API_KEY || '';
    this.capsolverUrl = 'https://api.capsolver.com/createTask';
    this.tesseractWorker = null;
  }

  /**
   * Solves a base64 or buffer image captcha.
   * @param {Buffer|string} imageBufferOrBase64 - Raw image Buffer or base64 string
   * @returns {Promise<{ text: string, provider: string, durationMs: number }>}
   */
  async solveImageCaptcha(imageBufferOrBase64) {
    const startTime = Date.now();
    let base64Image = '';

    if (Buffer.isBuffer(imageBufferOrBase64)) {
      base64Image = imageBufferOrBase64.toString('base64');
    } else if (typeof imageBufferOrBase64 === 'string') {
      base64Image = imageBufferOrBase64.replace(/^data:image\/\w+;base64,/, '');
    } else {
      throw new Error('Invalid image input format for Captcha solver.');
    }

    // Attempt 1: CapSolver API
    if (this.capsolverKey && this.capsolverKey.trim() !== '') {
      try {
        logger.info('[CaptchaService] Dispatching image captcha to CapSolver API...');
        const solution = await this.solveWithCapSolver(base64Image);
        const durationMs = Date.now() - startTime;
        
        if (solution && solution.length >= 4) {
          logger.info(`[CaptchaService] CapSolver solved captcha in ${durationMs}ms: "${solution}"`);
          return { text: solution, provider: 'CAPSOLVER', durationMs };
        }
      } catch (capErr) {
        logger.warn(`[CaptchaService] CapSolver failed: ${capErr.message}. Falling back to local OCR...`);
        await SystemLog.create({
          level: 'WARN',
          source: 'WORKER_SCRAPER',
          message: `CapSolver request failed: ${capErr.message}`,
          problemCategory: 'CAPSOLVER_API_ERROR',
          suggestedResolution: {
            title: 'Verify CapSolver Account Balance & API Key',
            actionableSteps: [
              'Check your balance at https://dashboard.capsolver.com',
              'Verify that CAPSOLVER_API_KEY in backend/.env is correct and active',
              'The system automatically fell back to local Tesseract OCR in the interim'
            ],
            commandExample: 'CAPSOLVER_API_KEY=CAP-XXXXXXXXXXXXXXXX'
          }
        }).catch(() => {});
      }
    } else {
      logger.info('[CaptchaService] No CAPSOLVER_API_KEY detected. Using local Tesseract OCR engine...');
    }

    // Attempt 2: Local Tesseract.js Fallback
    try {
      logger.info('[CaptchaService] Running local Tesseract OCR fallback...');
      const tesseractResult = await this.solveWithTesseract(base64Image);
      const durationMs = Date.now() - startTime;
      
      logger.info(`[CaptchaService] Tesseract solved captcha in ${durationMs}ms: "${tesseractResult}"`);
      return { text: tesseractResult, provider: 'TESSERACT_LOCAL', durationMs };
    } catch (tessErr) {
      logger.error(`[CaptchaService] Both CapSolver and Tesseract failed: ${tessErr.message}`);
      
      await SystemLog.create({
        level: 'ERROR',
        source: 'WORKER_SCRAPER',
        message: `Captcha resolution completely failed: ${tessErr.message}`,
        problemCategory: 'CAPTCHA_RESOLUTION_EXHAUSTED',
        suggestedResolution: {
          title: 'Provide Valid CapSolver API Key for High-Volume Ingestion',
          actionableSteps: [
            'Sign up at CapSolver (https://www.capsolver.com)',
            'Add CAPSOLVER_API_KEY to your backend/.env file',
            'Restart the backend and worker processes'
          ],
          commandExample: 'echo CAPSOLVER_API_KEY="your_key" >> backend/.env'
        }
      }).catch(() => {});

      throw new Error(`Failed to solve captcha through both CapSolver and Tesseract: ${tessErr.message}`);
    }
  }

  /**
   * Directly solves via CapSolver ImageToTextTask REST API
   */
  async solveWithCapSolver(base64Body) {
    const response = await fetch(this.capsolverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientKey: this.capsolverKey,
        task: {
          type: 'ImageToTextTask',
          body: base64Body,
          module: 'common'
        }
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`CapSolver HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    if (data.errorId && data.errorId !== 0) {
      throw new Error(`CapSolver error ${data.errorCode}: ${data.errorDescription}`);
    }

    const rawSolution = data.solution?.text || '';
    // Strip unwanted whitespace or punctuation
    return rawSolution.replace(/[^a-zA-Z0-9]/g, '').trim();
  }

  /**
   * Fallback solver using Tesseract.js
   */
  async solveWithTesseract(base64Body) {
    const worker = await createWorker('eng');
    try {
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
      });
      const imgBuffer = Buffer.from(base64Body, 'base64');
      const ret = await worker.recognize(imgBuffer);
      await worker.terminate();
      return (ret.data?.text || '').replace(/[^a-zA-Z0-9]/g, '').trim();
    } catch (err) {
      await worker.terminate().catch(() => {});
      throw err;
    }
  }
}

export const captchaService = new CaptchaService();
