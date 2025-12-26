# Setup Guide

## 🚀 Advanced Features

This project now includes:
- ✅ **WebSocket** for real-time bidirectional communication
- ✅ **Redis** for high-performance caching
- ✅ **Typing indicators** and online status
- ✅ **Real-time message streaming** via WebSocket
- ✅ **Cached chat history** for faster load times

## Environment Variables

### Backend (apps/api)
Create a `.env` file in `apps/api/` with:

```env
# Database
DATABASE_URL="postgresql://spur:spurpass@localhost:5432/spur_chat?schema=public"

# Redis (Optional - defaults to localhost:6379)
REDIS_HOST="localhost"
REDIS_PORT="6379"

# OpenAI API Key (REQUIRED)
OPENAI_API_KEY="sk-your-openai-api-key-here"

# Optional
OPENAI_MODEL="gpt-4o-mini"
PORT=3001
CORS_ORIGIN="http://localhost:3000"
```

### Frontend (apps/web)
Create a `.env.local` file in `apps/web/` with:

```env
# API URL (REQUIRED)
NEXT_PUBLIC_API_URL="http://localhost:3001"
```

## Setup Steps

1. **Start Services** (PostgreSQL + Redis using Docker):
   ```bash
   docker-compose up -d
   ```
   This starts:
   - PostgreSQL on port 5432
   - Redis on port 6379

2. **Install Dependencies**:
   ```bash
   # Backend
   cd apps/api
   npm install
   
   # Frontend
   cd ../web
   npm install
   ```

3. **Setup Database**:
   ```bash
   cd apps/api
   npm run prisma:generate
   npm run prisma:migrate
   ```

4. **Start Backend API**:
   ```bash
   cd apps/api
   npm run dev
   ```
   Should run on http://localhost:3001
   - WebSocket available at: `ws://localhost:3001/chat`

5. **Start Frontend**:
   ```bash
   cd apps/web
   npm run dev
   ```
   Should run on http://localhost:3000

## Architecture

```
Frontend (Next.js + Socket.io Client)
    ↕ WebSocket
Backend API (NestJS + Socket.io)
    ↓
PostgreSQL (Persistent Storage)
    +
Redis (Caching Layer)
    ↓
OpenAI API
```

## Key Features

### WebSocket Real-time Communication
- **Bidirectional**: Server can push updates to clients
- **Typing Indicators**: See when someone is typing
- **Online Status**: Connection status indicator
- **Live Streaming**: Real-time message streaming

### Redis Caching
- **Chat History**: Cached for 1 hour (configurable)
- **Session Data**: Fast session lookups
- **Performance**: Reduces database load significantly

### Backward Compatibility
- HTTP streaming endpoint still available at `POST /chat`
- WebSocket endpoint at `ws://localhost:3001/chat`
- Both methods work simultaneously

## Important Notes

- ✅ OpenAI API key goes in **backend** `.env` file only
- ✅ Frontend only needs `NEXT_PUBLIC_API_URL` to know where the API is
- ❌ Never put API keys in frontend code or frontend environment variables
- ✅ Redis caching improves performance for frequently accessed data
- ✅ WebSocket provides real-time features like typing indicators
