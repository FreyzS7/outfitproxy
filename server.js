require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const NodeCache = require('node-cache');
const { RateLimiterMemory } = require('rate-limiter-flexible');

const app = express();
const PORT = process.env.PORT || 3000;

// Cache setup (5 minutes TTL)
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// Rate limiter (100 requests per minute per IP)
const rateLimiter = new RateLimiterMemory({
  points: 100,
  duration: 60,
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Rate limiting middleware
const rateLimiterMiddleware = async (req, res, next) => {
  try {
    const ip = req.ip || req.connection.remoteAddress;
    await rateLimiter.consume(ip);
    next();
  } catch (error) {
    res.status(429).json({
      success: false,
      error: 'Too many requests from this IP',
      retryAfter: error.msBeforeNext / 1000
    });
  }
};

app.use(rateLimiterMiddleware);

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Base Roblox API configurations
const ROBLOX_APIS = {
  avatar: 'https://avatar.roblox.com',
  users: 'https://users.roblox.com',
  games: 'https://games.roblox.com',
  thumbnails: 'https://thumbnails.roblox.com',
  economy: 'https://economy.roblox.com',
  catalog: 'https://catalog.roblox.com',
  presence: 'https://presence.roblox.com'
};

// Axios instance with retry logic
const createAxiosInstance = () => {
  const instance = axios.create({
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
    }
  });

  // Retry interceptor
  instance.interceptors.response.use(
    response => response,
    async error => {
      const config = error.config;
      
      if (!config || !config.retry) {
        config.retry = 0;
      }
      
      // Retry on 429 (rate limit) or 5xx errors
      if (config.retry < 3 && (error.response?.status === 429 || error.response?.status >= 500)) {
        config.retry += 1;
        
        // Exponential backoff
        const delay = Math.pow(2, config.retry) * 1000;
        console.log(`Retrying request (attempt ${config.retry}) after ${delay}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return instance(config);
      }
      
      return Promise.reject(error);
    }
  );

  return instance;
};

const axiosInstance = createAxiosInstance();

// Helper function to get from cache or fetch
async function getCachedOrFetch(cacheKey, fetchFunction) {
  // Check cache first
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log(`Cache HIT: ${cacheKey}`);
    return { data: cached, fromCache: true };
  }

  // Fetch if not in cache
  console.log(`Cache MISS: ${cacheKey}`);
  const data = await fetchFunction();
  
  // Store in cache
  cache.set(cacheKey, data);
  
  return { data, fromCache: false };
}

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Roblox API Proxy',
    version: '1.0.0',
    author: 'fLINK',
    endpoints: {
      avatar: '/v1/users/:userId/outfits',
      outfitDetails: '/v1/outfits/:outfitId/details',
      userInfo: '/v1/users/:userId',
      avatar: '/v1/users/:userId/avatar',
      thumbnails: '/v1/users/avatar-headshot',
      presence: '/v1/presence/users'
    },
    cache: {
      enabled: true,
      ttl: '5 minutes',
      stats: cache.getStats()
    }
  });
});

// Get user outfits
app.get('/v1/users/:userId/outfits', async (req, res) => {
  try {
    const { userId } = req.params;
    const cacheKey = `outfits_${userId}`;

    const result = await getCachedOrFetch(cacheKey, async () => {
      const response = await axiosInstance.get(
        `${ROBLOX_APIS.avatar}/v1/users/${userId}/outfits`
      );
      return response.data;
    });

    res.json({
      success: true,
      fromCache: result.fromCache,
      ...result.data
    });

  } catch (error) {
    console.error('Error fetching outfits:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.errors?.[0]?.message || 'Failed to fetch outfits',
      details: error.message
    });
  }
});

// Get outfit details
app.get('/v1/outfits/:outfitId/details', async (req, res) => {
  try {
    const { outfitId } = req.params;
    const cacheKey = `outfit_details_${outfitId}`;

    const result = await getCachedOrFetch(cacheKey, async () => {
      const response = await axiosInstance.get(
        `${ROBLOX_APIS.avatar}/v1/outfits/${outfitId}/details`
      );
      return response.data;
    });

    res.json({
      success: true,
      fromCache: result.fromCache,
      ...result.data
    });

  } catch (error) {
    console.error('Error fetching outfit details:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.errors?.[0]?.message || 'Failed to fetch outfit details',
      details: error.message
    });
  }
});

// Get user info
app.get('/v1/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const cacheKey = `user_${userId}`;

    const result = await getCachedOrFetch(cacheKey, async () => {
      const response = await axiosInstance.get(
        `${ROBLOX_APIS.users}/v1/users/${userId}`
      );
      return response.data;
    });

    res.json({
      success: true,
      fromCache: result.fromCache,
      ...result.data
    });

  } catch (error) {
    console.error('Error fetching user info:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: 'Failed to fetch user info',
      details: error.message
    });
  }
});

// Get user avatar
app.get('/v1/users/:userId/avatar', async (req, res) => {
  try {
    const { userId } = req.params;
    const cacheKey = `avatar_${userId}`;

    const result = await getCachedOrFetch(cacheKey, async () => {
      const response = await axiosInstance.get(
        `${ROBLOX_APIS.avatar}/v1/users/${userId}/avatar`
      );
      return response.data;
    });

    res.json({
      success: true,
      fromCache: result.fromCache,
      ...result.data
    });

  } catch (error) {
    console.error('Error fetching avatar:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: 'Failed to fetch avatar',
      details: error.message
    });
  }
});

// Get user thumbnails
app.post('/v1/users/avatar-headshot', async (req, res) => {
  try {
    const { userIds, size = '150x150', format = 'Png' } = req.body;
    
    if (!userIds || !Array.isArray(userIds)) {
      return res.status(400).json({
        success: false,
        error: 'userIds array is required'
      });
    }

    const cacheKey = `thumbnails_${userIds.join(',')}_${size}`;

    const result = await getCachedOrFetch(cacheKey, async () => {
      const response = await axiosInstance.get(
        `${ROBLOX_APIS.thumbnails}/v1/users/avatar-headshot`,
        {
          params: {
            userIds: userIds.join(','),
            size,
            format
          }
        }
      );
      return response.data;
    });

    res.json({
      success: true,
      fromCache: result.fromCache,
      ...result.data
    });

  } catch (error) {
    console.error('Error fetching thumbnails:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: 'Failed to fetch thumbnails',
      details: error.message
    });
  }
});

// Get user presence
app.post('/v1/presence/users', async (req, res) => {
  try {
    const { userIds } = req.body;
    
    if (!userIds || !Array.isArray(userIds)) {
      return res.status(400).json({
        success: false,
        error: 'userIds array is required'
      });
    }

    const response = await axiosInstance.post(
      `${ROBLOX_APIS.presence}/v1/presence/users`,
      { userIds }
    );

    res.json({
      success: true,
      ...response.data
    });

  } catch (error) {
    console.error('Error fetching presence:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: 'Failed to fetch presence',
      details: error.message
    });
  }
});

// Generic proxy endpoint (for other Roblox APIs)
app.all('/proxy/*', async (req, res) => {
  try {
    const path = req.params[0];
    const method = req.method.toLowerCase();
    
    // Determine which Roblox API to use based on path
    let baseUrl = ROBLOX_APIS.avatar;
    if (path.includes('users')) baseUrl = ROBLOX_APIS.users;
    if (path.includes('games')) baseUrl = ROBLOX_APIS.games;
    if (path.includes('thumbnails')) baseUrl = ROBLOX_APIS.thumbnails;
    if (path.includes('economy')) baseUrl = ROBLOX_APIS.economy;
    if (path.includes('catalog')) baseUrl = ROBLOX_APIS.catalog;

    const url = `${baseUrl}/${path}`;
    const config = {
      method,
      url,
      params: req.query,
      data: req.body,
    };

    const response = await axiosInstance(config);

    res.json({
      success: true,
      ...response.data
    });

  } catch (error) {
    console.error('Proxy error:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: 'Proxy request failed',
      details: error.message
    });
  }
});

// Cache management endpoints
app.get('/cache/stats', (req, res) => {
  res.json({
    success: true,
    stats: cache.getStats(),
    keys: cache.keys().length
  });
});

app.post('/cache/clear', (req, res) => {
  cache.flushAll();
  res.json({
    success: true,
    message: 'Cache cleared successfully'
  });
});

app.delete('/cache/:key', (req, res) => {
  const { key } = req.params;
  const deleted = cache.del(key);
  res.json({
    success: deleted > 0,
    message: deleted > 0 ? 'Key deleted' : 'Key not found'
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    cache: cache.getStats()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║   🚀 Roblox API Proxy Server Started     ║
║                                           ║
║   Port: ${PORT}                              ║
║   URL: http://localhost:${PORT}              ║
║   Cache: Enabled (5min TTL)               ║
║   Rate Limit: 100 req/min per IP          ║
║                                           ║
║   Author: fREyzS77                           ║
╚═══════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  cache.flushAll();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, closing server...');
  cache.flushAll();
  process.exit(0);
});