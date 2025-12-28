'use client';

import { useEffect, useRef } from 'react';
import { ChatMessage } from '../hooks/use-chat-websocket';
import { MessageBubble } from './MessageBubble';

type Props = {
  messages: ChatMessage[];
  thinking: boolean;
  isTyping?: boolean;
  bottomRef: React.RefObject<HTMLDivElement>;
};

export function ChatWindow({ messages, thinking, isTyping, bottomRef }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Smooth auto-scroll to latest message
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, thinking, isTyping, bottomRef]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4 py-6 space-y-4 scroll-smooth"
    >
      {messages.length === 0 && (
        <div className="flex items-center justify-center h-full">
          <div className="text-center space-y-2">
            <h2 className="text-lg font-medium text-[#a3a3a3]">
              Start a conversation
            </h2>
            <p className="text-sm text-[#737373]">
              Ask about returns, shipping, or orders
            </p>
          </div>
        </div>
      )}

      {messages.map((message, idx) => (
        <MessageBubble key={message.id ?? `msg-${idx}`} message={message} />
      ))}

      {thinking && (
        <div className="flex items-center gap-3 text-[#a3a3a3] text-sm">
          <div className="flex gap-1.5 px-4 py-3 rounded-2xl bg-[#1a1a1a] border border-[#2a2a2a]">
            <div className="typing-dot h-2 w-2 rounded-full bg-[#737373]" />
            <div className="typing-dot h-2 w-2 rounded-full bg-[#737373]" />
            <div className="typing-dot h-2 w-2 rounded-full bg-[#737373]" />
          </div>
          <span className="text-[#737373]">AI is thinking...</span>
        </div>
      )}

      {isTyping && !thinking && (
        <div className="flex items-center gap-3 text-[#a3a3a3] text-sm">
          <div className="flex gap-1.5 px-4 py-3 rounded-2xl bg-[#1a1a1a] border border-[#2a2a2a]">
            <div className="typing-dot h-2 w-2 rounded-full bg-[#737373]" />
            <div className="typing-dot h-2 w-2 rounded-full bg-[#737373]" />
            <div className="typing-dot h-2 w-2 rounded-full bg-[#737373]" />
          </div>
          <span className="text-[#737373]">AI is typing...</span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
