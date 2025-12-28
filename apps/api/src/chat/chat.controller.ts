import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { CreateMessageDto } from './dto/create-message.dto';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // HTTP streaming endpoint (backward compatibility)
  @Post()
  async create(@Body() dto: CreateMessageDto, @Res() res: Response) {
    return this.chatService.streamChat(dto, res);
  }

  // WebSocket endpoint (recommended)
  @Post('ws')
  async createWebSocket(@Body() dto: CreateMessageDto) {
    return this.chatService.streamChatWebSocket(dto.sessionId, dto.content);
  }

  @Get(':sessionId')
  async history(@Param('sessionId') sessionId: string) {
    return this.chatService.getHistory(sessionId);
  }
}

