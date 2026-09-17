import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const verifyToken = (req, res, next) => {
  let token = null;

  // 1. Prefer HttpOnly secure cookie
  if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  } 
  // 2. Fall back to Authorization: Bearer header
  else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  
  if (!token) {
    return res.status(401).json({ error: 'Access denied. Please sign in to continue.' });
  }

  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    
    // Attach to request for use in controllers and authorization middleware
    req.user = {
      userId: decoded.userId,
      role: decoded.role || 'contractor',
      email: decoded.email,
    };
    req.organizationId = decoded.organizationId;
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired.' });
    }
    return res.status(401).json({ error: 'Invalid token.' });
  }
};

/**
 * Optional authentication middleware: if token exists and is valid, attaches req.user;
 * otherwise leaves req.user = null and continues without erroring.
 */
export const optionalAuth = (req, res, next) => {
  let token = null;

  if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    req.user = {
      userId: decoded.userId,
      role: decoded.role || 'contractor',
      email: decoded.email,
    };
    req.organizationId = decoded.organizationId;
    next();
  } catch (error) {
    // Treat invalid/expired token gracefully as unauthenticated guest
    req.user = null;
    next();
  }
};