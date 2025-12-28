import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

type Message = {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  createdAt: Date;
  sessionId: string;
};

const MessageRole = {
  user: 'user' as const,
  assistant: 'assistant' as const,
  system: 'system' as const,
};
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateMessageDto } from './dto/create-message.dto';

const SYSTEM_PROMPT = `You are a helpful support agent for a small e‑commerce store. Answer clearly and concisely.`;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject('GEMINI_CLIENT') private readonly gemini: GoogleGenerativeAI,
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
          role: 'user',
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
        if (history && history.length > 0) {
          await this.redis.set(`history:${session.id}`, history, this.CACHE_TTL);
        }
      }

      const orderedHistory = (history || []).reverse();

      // Build conversation history for Gemini
      const conversationHistory = orderedHistory.map((msg: Message) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      }));

      // Get model - prioritize gemini-1.5-flash as it's most accessible
      let modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
      
      // Remove -latest suffix if present (not needed for Gemini API)
      if (modelName.endsWith('-latest')) {
        modelName = modelName.replace('-latest', '');
        this.logger.warn(`Model name corrected: removed -latest suffix -> ${modelName}`);
      }
      
      // Try models in order of accessibility (flash is most accessible)
      const modelAttempts = [
        'gemini-1.5-flash',  // Most accessible, try first
        'gemini-1.5-pro',
        'gemini-pro',
      ];
      
      // If user specified a model, try it first
      if (process.env.GEMINI_MODEL && modelAttempts.includes(process.env.GEMINI_MODEL)) {
        modelAttempts.unshift(process.env.GEMINI_MODEL);
        // Remove duplicate
        const uniqueModels = [...new Set(modelAttempts)];
        modelAttempts.length = 0;
        modelAttempts.push(...uniqueModels);
      }
      
      let result;
      let lastError: Error | null = null;
      let successfulModel: string | null = null;
      
      // Try each model with different approaches
      for (const attemptModel of modelAttempts) {
        try {
          this.logger.log(`🔄 Attempting model: ${attemptModel}`);
          
          // Try approach 1: Simple generation without history (most reliable)
          try {
            const fullPrompt = [
              SYSTEM_PROMPT,
              ...orderedHistory.map((msg: Message) => 
                `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
              ),
              `User: ${dto.content.trim()}`,
              'Assistant:',
            ].join('\n\n');
            
            const model = this.gemini.getGenerativeModel({ 
              model: attemptModel,
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 300,
              },
            });

            result = await model.generateContentStream(fullPrompt);
            successfulModel = attemptModel;
            this.logger.log(`✅ Successfully using model: ${attemptModel} (simple generation)`);
            break;
          } catch (simpleError) {
            // If simple generation fails, try with chat history
            this.logger.debug(`Simple generation failed for ${attemptModel}, trying with chat history...`);
            
            try {
              const model = this.gemini.getGenerativeModel({ 
                model: attemptModel,
                generationConfig: {
                  temperature: 0.2,
                  maxOutputTokens: 300,
                },
                systemInstruction: SYSTEM_PROMPT,
              });

              const chat = model.startChat({
                history: conversationHistory,
              });

              result = await chat.sendMessageStream(dto.content.trim());
              successfulModel = attemptModel;
              this.logger.log(`✅ Successfully using model: ${attemptModel} (with chat history)`);
              break;
            } catch (chatError) {
              lastError = chatError instanceof Error ? chatError : new Error(String(chatError));
              this.logger.warn(`❌ Model ${attemptModel} failed: ${lastError.message}`);
              continue;
            }
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          this.logger.warn(`❌ Model ${attemptModel} failed: ${lastError.message}`);
          continue;
        }
      }
      
      if (!result || !successfulModel) {
        // Log detailed error information
        const errorDetails = lastError ? {
          message: lastError.message,
          stack: lastError.stack,
          name: lastError.name,
        } : 'Unknown error';
        
        this.logger.error('❌ All model attempts failed', errorDetails);
        this.logger.error(`   Tried models: ${modelAttempts.join(', ')}`);
        this.logger.error(`   API Key present: ${!!process.env.GEMINI_API_KEY}`);
        this.logger.error(`   API Key length: ${process.env.GEMINI_API_KEY?.length || 0}`);
        
        throw lastError || new Error('Failed to initialize any Gemini model');
      }
      let assistantText = '';

      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          assistantText += chunkText;
          res.write(chunkText);
        }
      }

      const assistantMessage = await this.prisma.message.create({
        data: {
          sessionId: session.id,
          role: 'assistant',
          content: assistantText.trim(),
        },
      });

      // Invalidate cache after new message
      await this.redis.del(`history:${session.id}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = (error as any)?.status || (error as any)?.code;
      
      this.logger.error('Streaming error', {
        message: errorMessage,
        code: errorCode,
        stack: error instanceof Error ? error.stack : undefined,
      });
      
      // Provide specific error message
      let fallback = '\nSorry, I ran into an issue completing that request. Please try again in a moment.';
      
      if (errorCode === 401 || errorMessage.includes('API key') || errorMessage.includes('Invalid API key')) {
        fallback = '\nGemini API key is missing or invalid. Please check your configuration.';
        this.logger.error('❌ Gemini API key issue - check GEMINI_API_KEY in .env');
      } else if (errorCode === 404 || errorMessage.includes('not found') || errorMessage.includes('is not found for API version')) {
        fallback = '\nGemini model not found. Please check: 1) API key is from https://makersuite.google.com/app/apikey, 2) Try setting GEMINI_MODEL=gemini-1.5-flash in .env';
        this.logger.error('❌ Gemini model not found');
        this.logger.error(`   Error: ${errorMessage}`);
        this.logger.error(`   API Key present: ${!!process.env.GEMINI_API_KEY}`);
        this.logger.error(`   API Key length: ${process.env.GEMINI_API_KEY?.length || 0}`);
      } else if (errorCode === 429) {
        fallback = '\nRate limit exceeded. Please try again in a moment.';
        this.logger.warn('⚠️  Gemini rate limit hit');
      }
      
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
    sessionId: string | undefined,
    content: string,
    emitChunk?: (chunk: string) => void,
    emitComplete?: (message: any) => void,
  ) {
    const session = await this.ensureSession(sessionId);

    try {
       // Validate input
      if (!content || !content.trim()) {
        throw new Error('Message content is required');
      }

      // Check Gemini client is configured
      if (!this.gemini) {
        throw new Error('Gemini client is not configured');
      }

      // Save user message
      await this.prisma.message.create({
        data: {
          sessionId: session.id,
          role: 'user',
          content: content.trim(),
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
        
        if (history && history.length > 0) {
          await this.redis.set(`history:${session.id}`, history, this.CACHE_TTL);
        }
      }

      const orderedHistory = (history || []).reverse();

      // Build conversation history for Gemini
      const conversationHistory = orderedHistory.map((msg: Message) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      }));

      // Get model - prioritize gemini-1.5-flash as it's most accessible
      let modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
      
      // Remove -latest suffix if present (not needed for Gemini API)
      if (modelName.endsWith('-latest')) {
        modelName = modelName.replace('-latest', '');
        this.logger.warn(`Model name corrected: removed -latest suffix -> ${modelName}`);
      }
      
      // Try models in order of accessibility (flash is most accessible)
      const modelAttempts = [
        'gemini-1.5-flash',  // Most accessible, try first
        'gemini-1.5-pro',
        'gemini-pro',
      ];
      
      // If user specified a model, try it first
      if (process.env.GEMINI_MODEL && modelAttempts.includes(process.env.GEMINI_MODEL)) {
        modelAttempts.unshift(process.env.GEMINI_MODEL);
        // Remove duplicate
        const uniqueModels = [...new Set(modelAttempts)];
        modelAttempts.length = 0;
        modelAttempts.push(...uniqueModels);
      }
      
      let result;
      let lastError: Error | null = null;
      let successfulModel: string | null = null;
      
      // Try each model with different approaches
      for (const attemptModel of modelAttempts) {
        try {
          this.logger.log(`🔄 Attempting model: ${attemptModel}`);
          
          // Try approach 1: Simple generation without history (most reliable)
          try {
            const fullPrompt = [
              SYSTEM_PROMPT,
              ...orderedHistory.map((msg: Message) => 
                `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
              ),
              `User: ${content.trim()}`,
              'Assistant:',
            ].join('\n\n');
            
            const model = this.gemini.getGenerativeModel({ 
              model: attemptModel,
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 300,
              },
            });

            result = await model.generateContentStream(fullPrompt);
            successfulModel = attemptModel;
            this.logger.log(`✅ Successfully using model: ${attemptModel} (simple generation)`);
            break;
          } catch (simpleError) {
            // If simple generation fails, try with chat history
            this.logger.debug(`Simple generation failed for ${attemptModel}, trying with chat history...`);
            
            try {
              const model = this.gemini.getGenerativeModel({ 
                model: attemptModel,
                generationConfig: {
                  temperature: 0.2,
                  maxOutputTokens: 300,
                },
                systemInstruction: SYSTEM_PROMPT,
              });

              const chat = model.startChat({
                history: conversationHistory,
              });

              result = await chat.sendMessageStream(content.trim());
              successfulModel = attemptModel;
              this.logger.log(`✅ Successfully using model: ${attemptModel} (with chat history)`);
              break;
            } catch (chatError) {
              lastError = chatError instanceof Error ? chatError : new Error(String(chatError));
              this.logger.warn(`❌ Model ${attemptModel} failed: ${lastError.message}`);
              continue;
            }
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          this.logger.warn(`❌ Model ${attemptModel} failed: ${lastError.message}`);
          continue;
        }
      }
      
      if (!result || !successfulModel) {
        // Log detailed error information
        const errorDetails = lastError ? {
          message: lastError.message,
          stack: lastError.stack,
          name: lastError.name,
        } : 'Unknown error';
        
        this.logger.error('❌ All model attempts failed', errorDetails);
        this.logger.error(`   Tried models: ${modelAttempts.join(', ')}`);
        this.logger.error(`   API Key present: ${!!process.env.GEMINI_API_KEY}`);
        this.logger.error(`   API Key length: ${process.env.GEMINI_API_KEY?.length || 0}`);
        
        throw lastError || new Error('Failed to initialize any Gemini model');
      }
      let assistantText = '';

      // Stream chunks via callback
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          assistantText += chunkText;
          if (emitChunk) emitChunk(chunkText);
        }
      }
      
      // Get final response if streaming didn't capture it all
      if (assistantText.trim() === '' && result.response) {
        const response = await result.response;
        assistantText = response.text();
      }

      // Save assistant message
      const assistantMessage = await this.prisma.message.create({
        data: {
          sessionId: session.id,
          role: 'assistant',
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
          sessionId: session.id,
        });
      }

      return {
        message: assistantMessage,
        sessionId: session.id,
      };
    } catch (error) {
      // Extract detailed error information
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      const errorCode = (error as any)?.status || (error as any)?.code;
      const errorType = (error as any)?.type;
      
      // Log full error details for debugging
      this.logger.error('WebSocket streaming error', {
        message: errorMessage,
        code: errorCode,
        type: errorType,
        stack: errorStack,
        sessionId: session.id,
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)),
      });

      // Provide more specific error messages based on error type
      let userMessage = 'Sorry, I ran into an issue. Please try again.';
      
      // Check for Gemini API specific errors
      if (errorCode === 401 || errorMessage.includes('API key') || errorMessage.includes('authentication') || errorMessage.includes('Invalid API key')) {
        userMessage = 'Gemini API key is missing or invalid. Please check your configuration.';
        this.logger.error('❌ Gemini API key issue - check GEMINI_API_KEY in .env');
      } else if (errorCode === 404 || errorMessage.includes('not found') || errorMessage.includes('is not found for API version')) {
        userMessage = 'Gemini model not found. Your API key might not have access to these models. Please check: 1) API key is from https://makersuite.google.com/app/apikey, 2) API key has proper permissions, 3) Try using gemini-1.5-flash instead.';
        this.logger.error('❌ Gemini model not found - check GEMINI_API_KEY in .env');
        this.logger.error(`   Error: ${errorMessage}`);
        this.logger.error(`   This usually means:`);
        this.logger.error(`   1. API key is invalid or expired`);
        this.logger.error(`   2. API key doesn't have access to v1beta models`);
        this.logger.error(`   3. API key is from wrong service (need Google AI Studio, not Vertex AI)`);
        this.logger.error(`   Get a new key from: https://makersuite.google.com/app/apikey`);
      } else if (errorCode === 429 || errorMessage.includes('rate limit') || errorMessage.includes('429') || errorMessage.includes('Rate limit')) {
        userMessage = 'Rate limit exceeded. Please try again in a moment.';
        this.logger.warn('⚠️  Gemini rate limit hit - consider upgrading your plan or waiting');
      } else if (errorCode === 500 || errorMessage.includes('Internal server error')) {
        userMessage = 'Gemini service is temporarily unavailable. Please try again in a moment.';
        this.logger.error('❌ Gemini internal server error');
      } else if (errorCode === 503 || errorMessage.includes('service unavailable')) {
        userMessage = 'Gemini service is temporarily unavailable. Please try again in a moment.';
        this.logger.error('❌ Gemini service unavailable');
      } else if (errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND')) {
        userMessage = 'Network error. Please check your connection and try again.';
        this.logger.error('❌ Network error connecting to Gemini');
      } else if (errorMessage.includes('database') || errorMessage.includes('prisma') || errorMessage.includes('P1001')) {
        userMessage = 'Database error. Please try again.';
        this.logger.error('❌ Database error');
      } else if (errorMessage.includes('quota') || errorMessage.includes('QUOTA_EXCEEDED')) {
        userMessage = 'Gemini account quota exceeded. Please check your usage limits.';
        this.logger.error('❌ Gemini quota exceeded');
      } else {
        // Log unknown error for debugging
        this.logger.error(`❌ Unknown error: ${errorMessage}`);
        userMessage = `Error: ${errorMessage}. Please check backend logs for details.`;
      }

      if (emitChunk) {
        emitChunk(`\n\n${userMessage}`);
      }
      
      // Emit error to client
      if (emitComplete) {
        emitComplete({
          id: 'error',
          role: 'assistant',
          content: userMessage,
          error: true,
          sessionId: session.id,
        });
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

