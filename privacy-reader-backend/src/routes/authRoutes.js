// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const userModel = require('../models/userModel');
const { logger, ValidationError, AuthenticationError } = require('../middleware/errorHandler');
const { verifyToken } = require('../middleware/authMiddleware');

/**
 * User registration
 */
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name, company } = req.body;
    
    // Validate inputs
    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }
    
    if (password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }
    
    // Check if user already exists
    const existingUser = await userModel.getUserByEmail(email);
    if (existingUser) {
      throw new ValidationError('Email is already registered');
    }
    
    // Create user
    const apiKey = uuidv4();
    const user = await userModel.createUser({
      email,
      password, // Will be hashed in the model
      name: name || email.split('@')[0],
      company: company || null,
      apiKey,
      plan: 'free', // Default plan
      role: 'user'  // Default role
    });
    
    // Create token
    const token = jwt.sign(
      { 
        id: user.id,
        email: user.email,
        role: user.role,
        plan: user.plan
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // Log analytics
    await userModel.logActivity(user.id, 'user_registered', { 
      method: 'email'
    });
    
    // Return user info (without password) and token
    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        company: user.company,
        plan: user.plan,
        role: user.role,
        apiKey: user.apiKey,
        created_at: user.created_at
      },
      token
    });
  } catch (error) {
    next(error);
  }
});

/**
 * User login
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    // Validate inputs
    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }
    
    // Get user
    const user = await userModel.getUserByEmail(email);
    if (!user) {
      throw new AuthenticationError('Invalid email or password');
    }
    
    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      // Log failed login attempt
      await userModel.logActivity(user.id, 'login_failed', {
        reason: 'invalid_password',
        ip: req.ip
      });
      
      throw new AuthenticationError('Invalid email or password');
    }
    
    // Create token
    const token = jwt.sign(
      { 
        id: user.id,
        email: user.email,
        role: user.role,
        plan: user.plan
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // Log successful login
    await userModel.logActivity(user.id, 'user_logged_in', { 
      method: 'email',
      ip: req.ip
    });
    
    // Return user info and token
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        company: user.company,
        plan: user.plan,
        role: user.role,
        apiKey: user.apiKey,
        created_at: user.created_at
      },
      token
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get current user
 */
router.get('/me', verifyToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Get user
    const user = await userModel.getUserById(userId);
    if (!user) {
      throw new AuthenticationError('User not found');
    }
    
    // Return user info
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        company: user.company,
        plan: user.plan,
        role: user.role,
        apiKey: user.apiKey,
        created_at: user.created_at,
        usage: user.usage || {}
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Refresh API key
 */
router.post('/refresh-api-key', verifyToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Generate new API key
    const apiKey = uuidv4();
    
    // Update user
    const updated = await userModel.updateUserApiKey(userId, apiKey);
    if (!updated) {
      throw new Error('Failed to update API key');
    }
    
    // Log activity
    await userModel.logActivity(userId, 'api_key_refreshed', {
      ip: req.ip
    });
    
    res.json({
      apiKey
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Update user profile
 */
router.put('/profile', verifyToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { name, company } = req.body;
    
    // Update user
    const user = await userModel.updateUserProfile(userId, { name, company });
    if (!user) {
      throw new Error('Failed to update profile');
    }
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        company: user.company,
        plan: user.plan,
        role: user.role,
        created_at: user.created_at
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Change password
 */
router.post('/change-password', verifyToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;
    
    // Validate inputs
    if (!currentPassword || !newPassword) {
      throw new ValidationError('Current password and new password are required');
    }
    
    if (newPassword.length < 8) {
      throw new ValidationError('New password must be at least 8 characters');
    }
    
    // Get user
    const user = await userModel.getUserById(userId);
    if (!user) {
      throw new AuthenticationError('User not found');
    }
    
    // Check current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      throw new ValidationError('Current password is incorrect');
    }
    
    // Update password
    const updated = await userModel.updateUserPassword(userId, newPassword);
    if (!updated) {
      throw new Error('Failed to update password');
    }
    
    // Log activity
    await userModel.logActivity(userId, 'password_changed', {
      ip: req.ip
    });
    
    res.json({
      message: 'Password updated successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * API key authentication
 */
router.post('/verify-api-key', async (req, res, next) => {
  try {
    const { apiKey } = req.body;
    
    if (!apiKey) {
      throw new ValidationError('API key is required');
    }
    
    // Get user by API key
    const user = await userModel.getUserByApiKey(apiKey);
    if (!user) {
      throw new AuthenticationError('Invalid API key');
    }
    
    // Create token
    const token = jwt.sign(
      { 
        id: user.id,
        email: user.email,
        role: user.role,
        plan: user.plan
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' } // Shorter expiry for API key auth
    );
    
    // Log API key usage
    await userModel.logActivity(user.id, 'api_key_used', {
      ip: req.ip
    });
    
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        company: user.company,
        plan: user.plan
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;