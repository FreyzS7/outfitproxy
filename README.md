# Roblox API Proxy Server

Custom proxy server untuk bypass rate limiting Roblox API dengan caching dan retry logic.

## ✨ Features

- ✅ Bypass rate limiting Roblox API
- ✅ Response caching (5 minutes TTL)
- ✅ Automatic retry dengan exponential backoff
- ✅ Rate limiting per IP (100 req/min)
- ✅ CORS enabled
- ✅ Error handling yang robust
- ✅ Health check endpoint
- ✅ Cache management

## Installation
```bash
npm install
```

## Usage

### Development:
```bash
npm run dev
```

### Production:
```bash
npm start
```

## API Endpoints

### Get User Outfits
```
GET /v1/users/:userId/outfits
```

### Get Outfit Details
```
GET /v1/outfits/:outfitId/details
```

### Get User Info
```
GET /v1/users/:userId
```

### Get User Avatar
```
GET /v1/users/:userId/avatar
```

### Get Thumbnails
```
POST /v1/users/avatar-headshot
Body: { "userIds": [123, 456], "size": "150x150" }
```

### Generic Proxy
```
ALL /proxy/*
```

### Cache Management
```
GET /cache/stats
POST /cache/clear
DELETE /cache/:key
```

### Health Check
```
GET /health
```

## Configuration

Edit `.env` file untuk custom configuration.

## Example Usage
```javascript
// Fetch outfits
fetch('http://localhost:3000/v1/users/456687425/outfits')
  .then(res => res.json())
  .then(data => console.log(data));
```

## Security

- Helmet.js untuk security headers
- Rate limiting per IP
- CORS configured
- Request timeout (15s)

## Cache Stats

Check cache performance:
```bash
curl http://localhost:3000/cache/stats
```

## Debugging

Set `NODE_ENV=development` in `.env` untuk detailed error messages.