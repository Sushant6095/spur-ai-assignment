'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export type ChatMessage = {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:3001';

export function useChatWebSocket(initialSessionId?: string) {
  const [sessionId, setSessionId] = useState<string | undefined>(initialSessionId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize WebSocket connection immediately (don't wait for sessionId)
  useEffect(() => {
    const socket = io(`${API_BASE}/chat`, {
      query: sessionId ? { sessionId } : {},
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    socket.on('connect', () => {
      setIsConnected(true);
      setError(null);
      console.log('WebSocket connected');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log('WebSocket disconnected');
    });

    socket.on('connect_error', (err) => {
      setIsConnected(false);
      setError('Connection error. Please check if backend is running.');
      console.error('WebSocket error:', err);
    });

    // Listen for streaming chunks
    socket.on('streamChunk', (chunk: string) => {
      setMessages((prev) => {
        const clone = [...prev];
        const idx = clone.findIndex((m) => m.isStreaming);
        if (idx >= 0) {
          clone[idx] = { ...clone[idx], content: clone[idx].content + chunk };
        }
        return clone;
      });
    });

    // Listen for complete message
    socket.on('streamComplete', (message: any) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.isStreaming
            ? {
                id: message.id,
                role: message.role,
                content: message.content,
                isStreaming: false,
              }
            : m,
        ),
      );
      setThinking(false);
      setIsSending(false);
      
      // Update sessionId if provided
      if (message.sessionId) {
        setSessionId(message.sessionId);
      }
      
      // Handle errors
      if (message.error) {
        setError(message.content || 'An error occurred');
        setMessages((prev) => prev.filter((m) => !m.isStreaming));
      }
    });
    
    // Listen for error events
    socket.on('error', (errorData: { message: string; details?: string }) => {
      setError(errorData.message || 'Connection error occurred');
      setThinking(false);
      setIsSending(false);
      setMessages((prev) => prev.filter((m) => !m.isStreaming));
      console.error('Socket error:', errorData);
    });

    // Listen for typing indicators
    socket.on('typing', (data: { sessionId: string; isTyping: boolean }) => {
      setIsTyping(data.isTyping);
    });

    socketRef.current = socket;

    // Update query when sessionId changes
    if (sessionId) {
      socket.io.opts.query = { sessionId };
    }

    return () => {
      socket.disconnect();
    };
  }, []); // Connect once on mount

  // Update socket query when sessionId changes
  useEffect(() => {
    if (socketRef.current && sessionId) {
      socketRef.current.io.opts.query = { sessionId };
    }
  }, [sessionId]);

  const loadHistory = useCallback(async (existingSessionId: string) => {
    if (!existingSessionId) return;
    try {
      const res = await fetch(`${API_BASE}/chat/${existingSessionId}`);
      if (!res.ok) {
        throw new Error('Failed to load previous messages');
      }
      const data = await res.json();
      const mapped: ChatMessage[] = (data.messages ?? []).map(
        (m: any) =>
          ({
            id: m.id,
            role: m.role,
            content: m.content,
          }) as ChatMessage,
      );
      setSessionId(data.id);
      setMessages(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load chat history');
    }
  }, []);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isSending) return;
    
    // Check connection
    if (!socketRef.current || !isConnected) {
      setError('Not connected to server. Please wait...');
      return;
    }
    
    setIsSending(true);
    setThinking(true);
    setError(null);

    const userContent = input.trim();
    setInput('');

    // Add user message optimistically
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: userContent },
      { role: 'assistant', content: '', isStreaming: true },
    ]);

    try {
      // Ensure we have a session ID - create one if needed
      let currentSessionId = sessionId;
      if (!currentSessionId && socketRef.current) {
        // Send message without sessionId - backend will create one
        socketRef.current.emit('sendMessage', {
          content: userContent,
        });
      } else if (socketRef.current && currentSessionId) {
        // Send message via WebSocket with sessionId
        socketRef.current.emit('sendMessage', {
          sessionId: currentSessionId,
          content: userContent,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setMessages((prev) => prev.filter((m) => !m.isStreaming));
      setThinking(false);
      setIsSending(false);
    }
  }, [input, isSending, sessionId, isConnected]);

  const handleTyping = useCallback(() => {
    if (!socketRef.current || !sessionId) return;

    // Emit typing indicator
    socketRef.current.emit('typing', { sessionId, isTyping: true });

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Stop typing after 3 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit('stopTyping', { sessionId });
    }, 3000);
  }, [sessionId]);

  return {
    sessionId,
    messages,
    input,
    setInput,
    isSending,
    thinking,
    error,
    isTyping,
    isConnected,
    sendMessage,
    loadHistory,
    handleTyping,
    bottomRef,
  };
}

