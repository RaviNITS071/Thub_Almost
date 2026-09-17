import { Router } from 'express';
import { 
  register, 
  login, 
  refresh, 
  logout,
  sendOtp,
  verifyOtp,
  googleAuth,
  googleCallback,
  getMe
} from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.middleware.js';
import { registerSchema, loginSchema } from '../validators/auth.validator.js';
import { 
  authLimiter, 
  otpSendLimiter, 
  otpVerifyLimiter 
} from '../middleware/rateLimiter.middleware.js';
import { verifyToken } from '../middleware/auth.middleware.js';

const router = Router();

// --- 1. Google OAuth 2.0 / OpenID Connect ---
router.get('/google', googleAuth);
router.get('/google/callback', googleCallback);

// --- 2. Passwordless Email OTP Authentication ---
router.post('/send-otp', otpSendLimiter, sendOtp);
router.post('/verify-otp', otpVerifyLimiter, verifyOtp);

// --- 3. Session Metadata & Profile ---
router.get('/me', verifyToken, getMe);
router.post('/logout', logout);

// --- 4. Password-Based Fallback & Token Refresh ---
router.post('/register', authLimiter, validate(registerSchema), register);
router.post('/login', authLimiter, validate(loginSchema), login);
router.post('/refresh', refresh);

export default router;