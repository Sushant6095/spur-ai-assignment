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
  server: Server;

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
    @MessageBody() data: { sessionId: string; content: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { sessionId, content } = data;
    
    // Process message via chat service with callbacks
    await this.chatService.streamChatWebSocket(
      sessionId,
      content,
      (chunk) => this.emitStreamChunk(sessionId, chunk),
      (message) => this.emitStreamComplete(sessionId, message),
    );
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

