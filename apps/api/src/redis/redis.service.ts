import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private isConnected = false;
  private connectionFailed = false;

  constructor() {
    // Support REDIS_URL connection string or individual host/port
    const redisUrl = process.env.REDIS_URL;
    
    if (redisUrl) {
      // Parse connection string (supports redis:// and rediss://)
      this.client = new Redis(redisUrl, {
        retryStrategy: () => null, // Disable automatic reconnection
        maxRetriesPerRequest: null, // Disable retries
        lazyConnect: true,
        enableOfflineQueue: false, // Don't queue commands when offline
      });
    } else {
      // Use individual host/port configuration
      this.client = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        retryStrategy: () => null, // Disable automatic reconnection
        maxRetriesPerRequest: null, // Disable retries
        lazyConnect: true,
        enableOfflineQueue: false, // Don't queue commands when offline
      });
    }

    this.client.on('error', (err) => {
      // Only log errors if we haven't already failed to connect
      if (!this.connectionFailed) {
        this.logger.warn('Redis connection failed - operating without cache', err.message);
        this.connectionFailed = true;
      }
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      this.logger.log('Redis Client Connected');
      this.isConnected = true;
      this.connectionFailed = false;
    });

    this.client.on('close', () => {
      if (this.isConnected) {
        this.logger.warn('Redis Client Disconnected');
      }
      this.isConnected = false;
    });
  }

  async onModuleInit() {
    if (!this.client) {
      return;
    }
    
    try {
      await this.client.connect();
      await this.client.ping();
      this.logger.log('Redis connection established');
      this.isConnected = true;
      this.connectionFailed = false;
    } catch (error) {
      this.logger.warn('Failed to connect to Redis - continuing without cache');
      this.logger.warn('Redis is optional - the application will work without it, but caching will be disabled');
      this.isConnected = false;
      this.connectionFailed = true;
      
      // Disconnect to stop all retry attempts
      try {
        await this.client.disconnect();
      } catch (disconnectError) {
        // Ignore disconnect errors
      }
    }
  }

  async onModuleDestroy() {
    if (this.client && this.isConnected) {
      try {
        await this.client.quit();
      } catch (error) {
        // Ignore disconnect errors during shutdown
      }
    }
  }

  getClient(): Redis | null {
    return this.client;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.client || !this.isConnected) {
      return null;
    }
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      // Silently fail - Redis is optional
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    if (!this.client || !this.isConnected) {
      return;
    }
    try {
      const stringValue = JSON.stringify(value);
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, stringValue);
      } else {
        await this.client.set(key, stringValue);
      }
    } catch (error) {
      // Silently fail - Redis is optional
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client || !this.isConnected) {
      return;
    }
    try {
      await this.client.del(key);
    } catch (error) {
      // Silently fail - Redis is optional
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      return false;
    }
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      return false;
    }
  }

  async increment(key: string): Promise<number> {
    if (!this.client || !this.isConnected) {
      return 0;
    }
    try {
      return await this.client.incr(key);
    } catch (error) {
      return 0;
    }
  }
}

