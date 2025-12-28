import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      message: 'Spur AI Chat API is running',
      version: '1.0.0',
      endpoints: {
        http: [
          'POST /chat - HTTP streaming endpoint',
          'POST /chat/ws - WebSocket HTTP endpoint',
          'GET /chat/:sessionId - Get chat history',
        ],
        websocket: {
          namespace: '/chat',
          events: [
            'sendMessage - Send a message',
            'typing - Typing indicator',
            'stopTyping - Stop typing indicator',
            'streamChunk - Receive streaming chunks',
            'streamComplete - Receive complete message',
            'userOnline - User online notification',
          ],
        },
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health')
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('test-gemini')
  async testGemini() {
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    
    if (!apiKey || apiKey === 'your-gemini-api-key-here') {
      return {
        status: 'error',
        message: 'GEMINI_API_KEY is not set in .env file',
        apiKeyPresent: false,
      };
    }

    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      
      // Try to generate a simple response
      const geminiModel = genAI.getGenerativeModel({ 
        model: model,
        generationConfig: {
          maxOutputTokens: 50,
        },
      });

      const result = await geminiModel.generateContent('Say "Hello, API test successful!"');
      const response = await result.response;
      const text = response.text();

      return {
        status: 'success',
        message: 'Gemini API is working correctly!',
        model: model,
        apiKeyPresent: true,
        apiKeyLength: apiKey.length,
        testResponse: text,
      };
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = error?.status || error?.code;
      
      return {
        status: 'error',
        message: 'Gemini API test failed',
        model: model,
        apiKeyPresent: true,
        apiKeyLength: apiKey.length,
        error: errorMessage,
        errorCode: errorCode,
        suggestions: [
          'Check if API key is valid at https://makersuite.google.com/app/apikey',
          'Try setting GEMINI_MODEL=gemini-1.5-flash in .env',
          'Verify API key has proper permissions',
        ],
      };
    }
  }
}

