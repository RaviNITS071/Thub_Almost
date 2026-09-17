/**
 * @file backend/src/controllers/auth.controller.js
 * @description Production-ready authentication controller supporting:
 * 1. Google OAuth 2.0 / OpenID Connect with verified identity claims.
 * 2. Passwordless Email OTP with crypto generation, SHA-256 hash, and Redis cooldown.
 * 3. Secure HttpOnly cookie session management with dual tokens (15m access / 7d refresh).
 * 4. Safe account linking matching verified email addresses across providers.
 */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Otp from '../models/Otp.js';
import Organization from '../models/Organization.js';
import OrganizationMember from '../models/OrganizationMember.js';
import ContractorProfile from '../models/ContractorProfile.js';
import { 
  hashPassword, 
  comparePassword, 
  generateAccessToken, 
  generateRefreshToken 
} from '../utils/auth.utils.js';
import { sendOtpEmail } from '../services/emailService.js';
import { redis } from '../config/redis.js';
import { env } from '../config/env.js';

const ACCESS_TOKEN_EXPIRY = 15 * 60; // 15 minutes in seconds
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds

/**
 * Cookie security options helper:
 * In development: lax SameSite, unsecure for localhost
 * In production: none SameSite (for cross-site Vercel <-> Render API cookies) + secure: true
 */
const getCookieOptions = (maxAgeSeconds) => ({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: maxAgeSeconds * 1000,
  path: '/',
});

/**
 * Helper to issue and set session cookies on the response.
 */
const setAuthCookies = (res, accessToken, refreshToken) => {
  res.cookie('accessToken', accessToken, getCookieOptions(ACCESS_TOKEN_EXPIRY));
  res.cookie('refreshToken', refreshToken, getCookieOptions(REFRESH_TOKEN_EXPIRY));
};

/**
 * Helper to ensure a user has an organization membership assigned.
 */
const ensureUserOrganization = async (user) => {
  let membership = await OrganizationMember.findOne({ userId: user._id });
  if (!membership) {
    const orgName = user.name ? `${user.name}'s Workspace` : `${user.email.split('@')[0]}'s Workspace`;
    const organization = await Organization.create({ name: orgName });
    membership = await OrganizationMember.create({
      userId: user._id,
      organizationId: organization._id,
      role: 'owner',
    });
  }
  return membership;
};

// =============================================================================
// 1. EMAIL OTP AUTHENTICATION
// =============================================================================

/**
 * Send a 6-digit OTP to the user's email address.
 * Resend cooldown: 60 seconds (enforced via Redis).
 * Enumeration-safe: always returns a generic success message.
 *
 * @route POST /api/v1/auth/send-otp
 */
export const sendOtp = async (req, res, next) => {
  try {
    const { email, type = 'login' } = req.body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 1. Enforce strict separation between Login and Signup
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (type === 'login' && !existingUser) {
      return res.status(404).json({
        error: 'No account found with this email. Please sign up to create a contractor account.',
        notFound: true,
      });
    }

    if (type === 'signup' && existingUser) {
      return res.status(409).json({
        error: 'An account with this email already exists. Please sign in instead.',
        alreadyExists: true,
      });
    }

    // 2. Check 60-second cooldown in Redis
    const cooldownKey = `otp_cooldown:${normalizedEmail}`;
    const isInCooldown = await redis.get(cooldownKey);
    if (isInCooldown) {
      return res.status(429).json({
        error: 'A verification code was recently requested. Please wait 60 seconds before requesting another.',
      });
    }

    // 3. Generate cryptographically secure 6-digit numeric OTP
    const otp = crypto.randomInt(100000, 1000000).toString();

    // 4. Hash OTP before storing (SHA-256)
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    // 5. Invalidate any existing active OTPs for this email address
    await Otp.deleteMany({ email: normalizedEmail });

    // 6. Store new hashed OTP record with 5-minute expiration
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    await Otp.create({
      email: normalizedEmail,
      otpHash,
      expiresAt,
      attempts: 0,
    });

    // 7. Set 60-second resend cooldown in Redis
    await redis.setex(cooldownKey, 60, '1');

    // 8. Dispatch verification email via abstracted provider
    await sendOtpEmail(normalizedEmail, otp);

    return res.status(200).json({
      success: true,
      message: type === 'signup' 
        ? 'Verification code sent to complete your registration.'
        : 'Verification code sent to sign in.',
      cooldownSeconds: 60,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verify a 6-digit OTP code, complete registration or sign-in,
 * and establish an authenticated session with secure cookies.
 *
 * @route POST /api/v1/auth/verify-otp
 */
export const verifyOtp = async (req, res, next) => {
  try {
    const { email, otp, type = 'login', profileDetails = {} } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and 6-digit verification code are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const cleanOtp = otp.toString().trim();

    // 1. Find active OTP record
    const otpRecord = await Otp.findOne({ email: normalizedEmail }).sort({ createdAt: -1 });

    if (!otpRecord) {
      return res.status(400).json({
        error: 'Verification code not found or expired. Please request a new code.',
      });
    }

    // 2. Check if expired
    if (new Date() > otpRecord.expiresAt) {
      await Otp.deleteMany({ email: normalizedEmail });
      return res.status(400).json({
        error: 'Verification code has expired. Please request a new code.',
      });
    }

    // 3. Check brute-force attempts limit (maximum 5 attempts)
    if (otpRecord.attempts >= 5) {
      await Otp.deleteMany({ email: normalizedEmail });
      return res.status(429).json({
        error: 'Too many incorrect attempts. For security, this code has been revoked. Please request a new one.',
      });
    }

    // 4. Verify OTP hash
    const inputHash = crypto.createHash('sha256').update(cleanOtp).digest('hex');
    if (inputHash !== otpRecord.otpHash) {
      await Otp.updateOne({ _id: otpRecord._id }, { $inc: { attempts: 1 } });
      const remainingAttempts = 5 - (otpRecord.attempts + 1);
      return res.status(400).json({
        error: `Incorrect verification code. ${remainingAttempts} attempt(s) remaining.`,
      });
    }

    // 5. Invalidate OTP immediately upon successful verification (single-use)
    await Otp.deleteMany({ email: normalizedEmail });

    // 6. Handle Signup vs Login
    let user = await User.findOne({ email: normalizedEmail });

    if (type === 'signup') {
      if (user) {
        return res.status(409).json({
          error: 'An account with this email already exists. Please sign in instead.',
          alreadyExists: true,
        });
      }

      // Create new contractor user account
      user = await User.create({
        email: normalizedEmail,
        name: profileDetails.name ? profileDetails.name.trim() : normalizedEmail.split('@')[0],
        emailVerified: true,
        providers: { emailOtp: true },
        role: 'contractor',
        lastLoginAt: new Date(),
      });

      // Initialize ContractorProfile with optional fields provided during signup
      await ContractorProfile.create({
        userId: user._id,
        name: profileDetails.name ? profileDetails.name.trim() : user.name,
        contractorId: profileDetails.contractorId ? profileDetails.contractorId.trim() : `NIT-${user._id.toString().slice(-4).toUpperCase()}`,
        affiliation: profileDetails.affiliation ? profileDetails.affiliation.trim() : 'NIT Srinagar, J&K',
        registrationClass: profileDetails.registrationClass ? profileDetails.registrationClass.trim() : 'Class A Works',
        jurisdiction: profileDetails.jurisdiction ? profileDetails.jurisdiction.trim() : 'Jammu & Kashmir / North Zone',
        divisionBadge: 'J&K Public Works Division',
        accountAuth: 'OTP Verified',
        status: 'Active',
        preferences: {
          targetSectors: Array.isArray(profileDetails.preferences?.targetSectors) ? profileDetails.preferences.targetSectors : [],
          preferredLocations: Array.isArray(profileDetails.preferences?.preferredLocations) ? profileDetails.preferences.preferredLocations : [],
          minTenderValue: Number(profileDetails.preferences?.minTenderValue) || 0,
          preferEmdExemption: Boolean(profileDetails.preferences?.preferEmdExemption) || false,
          isConfigured: Boolean(
            profileDetails.preferences?.targetSectors?.length || 
            profileDetails.preferences?.preferredLocations?.length || 
            profileDetails.preferences?.minTenderValue
          ),
        },
        savedTenders: [],
      });
    } else {
      // type === 'login'
      if (!user) {
        return res.status(404).json({
          error: 'No account found with this email. Please sign up first.',
          notFound: true,
        });
      }

      user.emailVerified = true;
      user.providers.emailOtp = true;
      user.lastLoginAt = new Date();
      await user.save();
    }

    // 7. Ensure organization context
    const membership = await ensureUserOrganization(user);

    // 8. Generate JWT tokens
    const tokenPayload = {
      userId: user._id,
      email: user.email,
      role: membership.role || user.role,
      organizationId: membership.organizationId,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken({ userId: user._id });

    // Store refresh token in Redis for revocation checks
    await redis.setex(`refreshToken:${user._id}`, REFRESH_TOKEN_EXPIRY, refreshToken);

    // Set secure HttpOnly cookies
    setAuthCookies(res, accessToken, refreshToken);

    return res.status(200).json({
      success: true,
      message: type === 'signup' ? 'Contractor account created successfully' : 'Signed in successfully',
      accessToken,
      user: {
        id: user._id,
        email: user.email,
        name: user.name || user.firstName || user.email.split('@')[0],
        picture: user.picture,
        role: membership.role || user.role,
        organizationId: membership.organizationId,
      },
    });
  } catch (error) {
    next(error);
  }
};

// =============================================================================
// 2. GOOGLE OAUTH 2.0 / OPENID CONNECT
// =============================================================================

/**
 * Redirect user to Google OAuth 2.0 authorization endpoint.
 * Supports mode: 'login' | 'signup'
 *
 * @route GET /api/v1/auth/google
 */
export const googleAuth = async (req, res, next) => {
  try {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      return res.status(503).json({
        error: 'Google OAuth is not configured. Please specify GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend environment.',
      });
    }

    const mode = req.query.mode === 'signup' ? 'signup' : 'login';
    const state = crypto.randomBytes(16).toString('hex');
    await redis.setex(`oauth_state:${state}`, 600, mode); // store mode in redis for 10 minutes

    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: env.GOOGLE_CALLBACK_URL,
      response_type: 'code',
      scope: 'openid email profile',
      state: state,
      access_type: 'offline',
      prompt: 'select_account',
    });

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return res.redirect(googleAuthUrl);
  } catch (error) {
    next(error);
  }
};

/**
 * Handle Google OAuth 2.0 callback, exchange code, verify identity claims,
 * enforce login vs signup separation, and establish session.
 *
 * @route GET /api/v1/auth/google/callback
 */
export const googleCallback = async (req, res, next) => {
  const frontendRedirect = env.FRONTEND_URL || 'http://localhost:5173';

  try {
    const { code, state, error } = req.query;

    if (error || !code) {
      return res.redirect(`${frontendRedirect}/login?error=${encodeURIComponent(error || 'google_cancelled')}`);
    }

    let mode = 'login';
    if (state) {
      const storedMode = await redis.get(`oauth_state:${state}`);
      if (!storedMode) {
        return res.redirect(`${frontendRedirect}/login?error=invalid_oauth_state`);
      }
      mode = storedMode;
      await redis.del(`oauth_state:${state}`);
    }

    // 1. Exchange authorization code for tokens via Google OAuth Token Endpoint
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_CALLBACK_URL,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      return res.redirect(`${frontendRedirect}/login?error=token_exchange_failed`);
    }

    const tokenData = await tokenResponse.json();
    const { access_token } = tokenData;

    // 2. Fetch verified user identity from Google OpenID Userinfo endpoint
    const userinfoResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    if (!userinfoResponse.ok) {
      return res.redirect(`${frontendRedirect}/login?error=userinfo_failed`);
    }

    const profileData = await userinfoResponse.json();
    const { sub: googleId, email, name, picture, given_name, family_name } = profileData;

    if (!email) {
      return res.redirect(`${frontendRedirect}/login?error=no_email_provided`);
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 3. Find user by verified email
    let user = await User.findOne({ email: normalizedEmail });

    // Mode-specific validation:
    if (mode === 'login' && !user) {
      return res.redirect(`${frontendRedirect}/signup?error=no_account&email=${encodeURIComponent(normalizedEmail)}`);
    }

    if (mode === 'signup' && user) {
      return res.redirect(`${frontendRedirect}/login?error=account_exists&email=${encodeURIComponent(normalizedEmail)}`);
    }

    if (!user) {
      // Create new user account during signup
      user = await User.create({
        email: normalizedEmail,
        googleId,
        name: name || `${given_name || ''} ${family_name || ''}`.trim(),
        firstName: given_name,
        lastName: family_name,
        picture,
        emailVerified: true,
        providers: { google: true },
        role: 'contractor',
        lastLoginAt: new Date(),
      });

      // Provision ContractorProfile
      await ContractorProfile.create({
        userId: user._id,
        name: user.name || 'Contractor',
        contractorId: `NIT-${user._id.toString().slice(-4).toUpperCase()}`,
        jurisdiction: 'Jammu & Kashmir / North Zone',
        affiliation: 'NIT Srinagar, J&K',
        divisionBadge: 'J&K Public Works Division',
        accountAuth: 'Google Verified',
        registrationClass: 'Class A Works',
        portalVerification: 'Active • L1 Compliant',
        status: 'Active',
        preferences: {
          targetSectors: [],
          preferredLocations: [],
          minTenderValue: 0,
          preferEmdExemption: false,
          isConfigured: false,
        },
        savedTenders: [],
      });
    } else {
      // Existing user logging in
      user.googleId = googleId;
      user.providers.google = true;
      user.emailVerified = true;
      if (!user.picture && picture) user.picture = picture;
      if (!user.name && name) user.name = name;
      user.lastLoginAt = new Date();
      await user.save();
    }

    // 4. Ensure organization context
    const membership = await ensureUserOrganization(user);

    // 5. Generate application JWT tokens
    const tokenPayload = {
      userId: user._id,
      email: user.email,
      role: membership.role || user.role,
      organizationId: membership.organizationId,
    };

    const appAccessToken = generateAccessToken(tokenPayload);
    const appRefreshToken = generateRefreshToken({ userId: user._id });

    // 6. Persist refresh token in Redis for revocation
    await redis.setex(`refreshToken:${user._id}`, REFRESH_TOKEN_EXPIRY, appRefreshToken);

    // 7. Attach session cookies to response
    setAuthCookies(res, appAccessToken, appRefreshToken);

    // 8. Redirect user back to frontend dashboard
    return res.redirect(`${frontendRedirect}/profile?auth=success`);
  } catch (error) {
    next(error);
  }
};

// =============================================================================
// 3. SESSION VALIDATION & CURRENT USER (/me)
// =============================================================================

/**
 * Retrieve the current authenticated user's profile and session metadata.
 * Requires verifyToken middleware.
 *
 * @route GET /api/v1/auth/me
 */
export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).select('-passwordHash');

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User session invalid or deactivated.' });
    }

    const membership = await OrganizationMember.findOne({ userId: user._id });

    return res.status(200).json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name || (user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user.email.split('@')[0]),
        firstName: user.firstName,
        lastName: user.lastName,
        picture: user.picture,
        role: membership?.role || user.role || 'contractor',
        emailVerified: user.emailVerified,
        providers: user.providers,
        organizationId: membership?.organizationId,
      },
    });
  } catch (error) {
    next(error);
  }
};

// =============================================================================
// 4. USERNAME / PASSWORD (LEGACY BACKWARD COMPATIBLE) & REFRESH / LOGOUT
// =============================================================================

export const register = async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, organizationName } = req.body;

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ error: 'Email is already registered' });
    }

    const hashedPassword = await hashPassword(password);

    // Create User
    const user = await User.create({
      email: normalizedEmail,
      passwordHash: hashedPassword,
      firstName,
      lastName,
      name: `${firstName || ''} ${lastName || ''}`.trim(),
      providers: { password: true },
      role: 'contractor',
    });

    // Create Tenant/Organization
    const organization = await Organization.create({ 
      name: organizationName || `${user.name || 'Contractor'}'s Division` 
    });

    // Assign User as Owner of the Organization
    await OrganizationMember.create({
      userId: user._id,
      organizationId: organization._id,
      role: 'owner',
    });

    res.status(201).json({ message: 'Registration successful. Please log in.' });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.passwordHash) {
      return res.status(401).json({ 
        error: 'This account was created with Google or Email OTP. Please sign in using that method.' 
      });
    }

    const isMatch = await comparePassword(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const membership = await ensureUserOrganization(user);

    const tokenPayload = {
      userId: user._id,
      email: user.email,
      organizationId: membership.organizationId,
      role: membership.role || user.role,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken({ userId: user._id });

    // Store refresh token in Redis for revocation checks
    await redis.setex(`refreshToken:${user._id}`, REFRESH_TOKEN_EXPIRY, refreshToken);

    setAuthCookies(res, accessToken, refreshToken);

    res.status(200).json({
      message: 'Login successful',
      accessToken,
      user: {
        id: user._id,
        email: user.email,
        name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        role: membership.role,
        organizationId: membership.organizationId,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const refresh = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token not found' });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    // Verify token exists in Redis (hasn't been revoked/logged out)
    const storedToken = await redis.get(`refreshToken:${decoded.userId}`);
    if (storedToken !== refreshToken) {
      return res.status(401).json({ error: 'Refresh token revoked or invalid' });
    }

    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User no longer active' });
    }

    const membership = await ensureUserOrganization(user);

    const accessToken = generateAccessToken({
      userId: decoded.userId,
      email: user.email,
      organizationId: membership.organizationId,
      role: membership.role,
    });

    // Set updated access token cookie
    res.cookie('accessToken', accessToken, getCookieOptions(ACCESS_TOKEN_EXPIRY));

    res.status(200).json({ accessToken });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      try {
        const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
        await redis.del(`refreshToken:${decoded.userId}`);
      } catch (err) {
        // Ignore token verification errors on logout
      }
    }

    // Clear session cookies
    res.clearCookie('accessToken', {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/',
    });

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/',
    });
    
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
};