/**
 * @file backend/src/middleware/adminAuth.middleware.js
 * @description Secure administrative authorization middleware.
 * Validates either:
 * 1. Admin Secret Key via `x-admin-key` header (fast & secure server-to-server or admin dashboard)
 * 2. Admin JWT Token via `Authorization: Bearer <token>`
 */
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY || 'tenderhub_admin_secret_2026';

export const adminAuth = (req, res, next) => {
  try {
    const adminKeyHeader = req.headers['x-admin-key'];
    const authHeader = req.headers.authorization;

    // Method 1: Static Admin Secret Key
    if (adminKeyHeader && adminKeyHeader === ADMIN_SECRET) {
      req.adminUser = { role: 'SUPER_ADMIN', authMethod: 'API_KEY' };
      return next();
    }

    // Method 2: Bearer JWT Token signed with ADMIN_SECRET or JWT_ACCESS_SECRET
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      
      try {
        // Try verifying with ADMIN_SECRET first
        const decoded = jwt.verify(token, ADMIN_SECRET);
        req.adminUser = decoded;
        return next();
      } catch (err1) {
        // Fallback to JWT_ACCESS_SECRET
        try {
          const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
          if (decoded.role === 'admin' || decoded.isAdmin) {
            req.adminUser = decoded;
            return next();
          }
        } catch (err2) {
          // Token invalid
        }
      }
    }

    return res.status(401).json({
      error: 'Unauthorized Administrative Access',
      message: 'A valid admin secret key or administrative JWT token is required.',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Admin authorization evaluation failed' });
  }
};
