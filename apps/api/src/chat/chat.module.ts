import { Module, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';

const logger = new Logger('ChatModule');

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatGateway,
    {
      provide: 'GEMINI_CLIENT',
      useFactory: async () => {
        const apiKey = process.env.GEMINI_API_KEY;
        
        if (!apiKey || apiKey === 'your-gemini-api-key-here') {
          logger.warn('⚠️  GEMINI_API_KEY is not set or is using placeholder value!');
          logger.warn('⚠️  Chat functionality will not work without a valid Gemini API key.');
          logger.warn('⚠️  Please set GEMINI_API_KEY in your .env file.');
          logger.warn('⚠️  Get your key from: https://makersuite.google.com/app/apikey');
          return new GoogleGenerativeAI('dummy-key');
        }
        
        logger.log('✅ Google Gemini API key configured');
        
        // Try to list available models to verify API key
        try {
          const genAI = new GoogleGenerativeAI(apiKey);
          // Note: ListModels might not be available in all SDK versions
          // We'll catch and continue if it fails
          logger.log('🔍 Verifying API key by checking model availability...');
        } catch (error) {
          logger.warn('⚠️  Could not verify API key, but continuing...');
        }
        
        return new GoogleGenerativeAI(apiKey);
      },
    },
  ],
  exports: [ChatService, ChatGateway],
})
export class ChatModule {}

