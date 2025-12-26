import { Module } from '@nestjs/common';
import OpenAI from 'openai';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatGateway,
    {
      provide: 'OPENAI_CLIENT',
      useFactory: () =>
        new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        }),
    },
  ],
  exports: [ChatService, ChatGateway],
})
export class ChatModule {}

