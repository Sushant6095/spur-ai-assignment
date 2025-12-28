import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ChatService } from './chat.service';
import { RedisService } from '../redis/redis.service';

interface TypingEvent {
  sessionId: string;
  isTyping: boolean;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || '*',
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private readonly activeSessions = new Map<string, Set<string>>(); // sessionId -> Set of socketIds

  constructor(
    private readonly chatService: ChatService,
    private readonly redis: RedisService,
  ) {}

  async handleConnection(client: Socket) {
    const sessionId = client.handshake.query.sessionId as string;
    
    if (sessionId) {
      if (!this.activeSessions.has(sessionId)) {
        this.activeSessions.set(sessionId, new Set());
      }
      this.activeSessions.get(sessionId)!.add(client.id);
      
      // Join room for this session
      client.join(`session:${sessionId}`);
      
      // Update online status in Redis
      await this.redis.increment(`session:${sessionId}:online`);
      
      // Notify others in the session
      this.server.to(`session:${sessionId}`).emit('userOnline', { sessionId });
      
      this.logger.log(`Client connected: ${client.id} to session: ${sessionId}`);
    }
  }

  async handleDisconnect(client: Socket) {
    const sessionId = client.handshake.query.sessionId as string;
    
    if (sessionId && this.activeSessions.has(sessionId)) {
      this.activeSessions.get(sessionId)!.delete(client.id);
      
      if (this.activeSessions.get(sessionId)!.size === 0) {
        this.activeSessions.delete(sessionId);
      }
      
      // Update online status in Redis
      const count = await this.redis.increment(`session:${sessionId}:online`);
      if (count <= 0) {
        await this.redis.del(`session:${sessionId}:online`);
      }
      
      this.logger.log(`Client disconnected: ${client.id} from session: ${sessionId}`);
    }
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @MessageBody() data: TypingEvent,
    @ConnectedSocket() client: Socket,
  ) {
    const { sessionId, isTyping } = data;
    
    // Broadcast typing status to others in the session (excluding sender)
    client.to(`session:${sessionId}`).emit('typing', {
      sessionId,
      isTyping,
    });
  }

  @SubscribeMessage('stopTyping')
  async handleStopTyping(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { sessionId } = data;
    
    client.to(`session:${sessionId}`).emit('typing', {
      sessionId,
      isTyping: false,
    });
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @MessageBody() data: { sessionId?: string; content: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { sessionId, content } = data;
    let currentSessionId = sessionId;
    
    try {
      // Process message via chat service with callbacks
      // The service will create a session if sessionId is not provided
      const result = await this.chatService.streamChatWebSocket(
        sessionId,
        content,
        (chunk) => {
          // Emit to client directly
          client.emit('streamChunk', chunk);
        },
        (message) => {
          // Include sessionId in the complete message
          client.emit('streamComplete', message);
        },
      );
      
      // Update sessionId if it was created
      if (result?.sessionId) {
        currentSessionId = result.sessionId;
        
        // If we have a new sessionId, join the room and update connection
        if (!sessionId) {
          client.join(`session:${currentSessionId}`);
          if (!this.activeSessions.has(currentSessionId)) {
            this.activeSessions.set(currentSessionId, new Set());
          }
          this.activeSessions.get(currentSessionId)!.add(client.id);
          client.handshake.query.sessionId = currentSessionId;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Error handling sendMessage', {
        message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        sessionId: currentSessionId,
      });
      
      // Emit error to client
      client.emit('error', { 
        message: 'Failed to process message',
        details: errorMessage,
      });
      
      // Also emit as streamComplete so frontend can handle it
      client.emit('streamComplete', {
        id: 'error',
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your message. Please try again.',
        error: true,
        sessionId: currentSessionId,
      });
    }
  }

  // Method to emit new message to session room
  emitNewMessage(sessionId: string, message: any) {
    this.server.to(`session:${sessionId}`).emit('newMessage', message);
  }

  // Method to emit streaming chunk
  emitStreamChunk(sessionId: string, chunk: string) {
    this.server.to(`session:${sessionId}`).emit('streamChunk', chunk);
  }

  // Method to emit stream complete
  emitStreamComplete(sessionId: string, fullMessage: any) {
    this.server.to(`session:${sessionId}`).emit('streamComplete', fullMessage);
  }
}

