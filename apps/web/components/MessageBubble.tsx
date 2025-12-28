'use client';

import { ChatMessage } from '../hooks/use-chat-websocket';

type Props = {
  message: ChatMessage;
};

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';

  return (
    <div
      className={`flex w-full message-enter ${
        isUser ? 'justify-end' : 'justify-start'
      }`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm transition-all duration-200 ${
          isUser
            ? 'bg-[#3a3a3a] text-[#e5e5e5]'
            : 'bg-[#1a1a1a] text-[#d4d4d4] border border-[#2a2a2a]'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        {message.isStreaming && (
          <span className="inline-block w-2 h-4 ml-1 bg-[#737373] animate-pulse" />
        )}
      </div>
    </div>
  );
}
