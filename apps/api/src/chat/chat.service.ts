import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Message, MessageRole } from '@prisma/client';
import OpenAI from 'openai';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateMessageDto } from './dto/create-message.dto';

const SYSTEM_PROMPT = `
You are Spur's helpful support agent. Keep answers concise, actionable, and friendly.
Company policy:
- Return policy: 30 days from delivery, items must be unused and in original packaging.
- Shipping: Free for orders over $50 in the US; standard shipping is $6.99 otherwise.
- Support hours: 9am-6pm EST, Monday to Friday.
If you are unsure, ask a brief clarifying question instead of guessing.
`;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject('OPENAI_CLIENT') private readonly openai: OpenAI,
  ) {}

  async streamChat(dto: CreateMessageDto, res: Response) {
    const session = await this.ensureSession(dto.sessionId);

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Session-Id', session.id);
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    try {
      await this.prisma.message.create({
        data: {
          sessionId: session.id,
          role: MessageRole.user,
          content: dto.content,
        },
      });

      // Try to get history from cache first
      let history = await this.redis.get<Message[]>(`history:${session.id}`);
      
      if (!history) {
        // Cache miss - fetch from database
        history = await this.prisma.message.findMany({
          where: { sessionId: session.id },
          orderBy: { createdAt: 'desc' },
          take: 10,
        });
        
        // Cache the history
        if (history.length > 0) {
          await this.redis.set(`history:${session.id}`, history, this.CACHE_TTL);
        }
      }

      const orderedHistory = history.reverse();

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...orderedHistory.map((msg: Message) => ({
          role: msg.role as OpenAI.Chat.ChatCompletionMessageParam['role'],
          content: msg.content,
        })),
        { role: 'user', content: dto.content },
      ];

      const stream = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages,
        stream: true,
        temperature: 0.2,
        max_tokens: 300,
      });

      let assistantText = '';

      for await (const part of stream) {
        const delta = part.choices[0]?.delta?.content;
        if (!delta) continue;
        assistantText += delta;
        res.write(delta);
      }

      const assistantMessage = await this.prisma.message.create({
        data: {
          sessionId: session.id,
          role: MessageRole.assistant,
          content: assistantText.trim(),
        },
      });

      // Invalidate cache after new message
      await this.redis.del(`history:${session.id}`);
    } catch (error) {
      this.logger.error('Streaming error', error instanceof Error ? error.stack : `${error}`);
      const fallback =
        '\nSorry, I ran into an issue completing that request. Please try again in a moment.';
      res.write(fallback);
    } finally {
      res.end();
    }
  }

  async getHistory(sessionId: string) {
    // Try cache first
    const cacheKey = `session:${sessionId}:full`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      this.logger.debug(`Cache hit for session ${sessionId}`);
      return cached;
    }

    // Cache miss - fetch from database
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Cache the result
    await this.redis.set(cacheKey, session, this.CACHE_TTL);

    return session;
  }

  async streamChatWebSocket(
    sessionId: string,
    content: string,
    emitChunk?: (chunk: string) => void,
    emitComplete?: (message: any) => void,
  ) {
    const session = await this.ensureSession(sessionId);

    try {
      // Save user message
      await this.prisma.message.create({
        data: {
          sessionId: session.id,
          role: MessageRole.user,
          content,
        },
      });

      // Invalidate cache
      await this.redis.del(`history:${session.id}`);

      // Get history (with caching)
      let history = await this.redis.get<Message[]>(`history:${session.id}`);
      
      if (!history) {
        history = await this.prisma.message.findMany({
          where: { sessionId: session.id },
          orderBy: { createdAt: 'desc' },
          take: 10,
        });
        
        if (history.length > 0) {
          await this.redis.set(`history:${session.id}`, history, this.CACHE_TTL);
        }
      }

      const orderedHistory = history.reverse();

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...orderedHistory.map((msg: Message) => ({
          role: msg.role as OpenAI.Chat.ChatCompletionMessageParam['role'],
          content: msg.content,
        })),
        { role: 'user', content },
      ];

      const stream = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages,
        stream: true,
        temperature: 0.2,
        max_tokens: 300,
      });

      let assistantText = '';

      // Stream chunks via callback
      for await (const part of stream) {
        const delta = part.choices[0]?.delta?.content;
        if (!delta) continue;
        assistantText += delta;
        if (emitChunk) emitChunk(delta);
      }

      // Save assistant message
      const assistantMessage = await this.prisma.message.create({
        data: {
          sessionId: session.id,
          role: MessageRole.assistant,
          content: assistantText.trim(),
        },
      });

      // Invalidate cache
      await this.redis.del(`history:${session.id}`);

      // Emit complete message
      if (emitComplete) {
        emitComplete({
          id: assistantMessage.id,
          role: assistantMessage.role,
          content: assistantMessage.content,
          createdAt: assistantMessage.createdAt,
        });
      }

      return assistantMessage;
    } catch (error) {
      this.logger.error('WebSocket streaming error', error instanceof Error ? error.stack : `${error}`);
      if (emitChunk) {
        emitChunk('\nSorry, I ran into an issue. Please try again.');
      }
      throw error;
    }
  }

  private async ensureSession(sessionId?: string) {
    if (sessionId) {
      const session = await this.prisma.chatSession.findUnique({
        where: { id: sessionId },
      });
      if (session) return session;
    }

    return this.prisma.chatSession.create({
      data: { metadata: { source: 'api' } },
    });
  }
}

