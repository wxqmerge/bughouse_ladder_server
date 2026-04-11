import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '../.env' });

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../middleware/auth.middleware.js';

const router = Router();

// In-memory user store (replace with database in production)
interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: 'user' | 'admin';
}

const users: Map<string, User> = new Map();

// Validate required environment variables for admin credentials
const defaultAdminUsername = process.env.ADMIN_USERNAME!;
const defaultAdminPassword = process.env.ADMIN_PASSWORD!;

if (!defaultAdminUsername || !defaultAdminPassword) {
  console.error('ERROR: ADMIN_USERNAME and ADMIN_PASSWORD environment variables are required');
  console.error('Please set these in your .env file before starting the server');
  process.exit(1);
}

async function initializeDefaultAdmin(): Promise<void> {
  if (!users.has(defaultAdminUsername)) {
    const passwordHash = await bcrypt.hash(defaultAdminPassword, 10);
    users.set(defaultAdminUsername, {
      id: '1',
      username: defaultAdminUsername,
      passwordHash,
      role: 'admin',
    });
  }
}

initializeDefaultAdmin();

// Register new user
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({
        success: false,
        error: { message: 'Username and password required' },
      });
      return;
    }

    if (users.has(username)) {
      res.status(409).json({
        success: false,
        error: { message: 'Username already exists' },
      });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user: User = {
      id: Date.now().toString(),
      username,
      passwordHash,
      role: 'user', // Default role is 'user'
    };

    users.set(username, user);

    res.status(201).json({
      success: true,
      data: { message: 'User registered successfully' },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Registration failed' },
    });
  }
});

// Login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({
        success: false,
        error: { message: 'Username and password required' },
      });
      return;
    }

    const user = users.get(username);
    if (!user) {
      res.status(401).json({
        success: false,
        error: { message: 'Invalid credentials' },
      });
      return;
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      res.status(401).json({
        success: false,
        error: { message: 'Invalid credentials' },
      });
      return;
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Login failed' },
    });
  }
});

export { router };
