import { Loader2 } from 'lucide-react';
import { ChatMessage } from '../hooks/use-chat-websocket';
import { MessageBubble } from './MessageBubble';

type Props = {
  messages: ChatMessage[];
  thinking: boolean;
  isTyping?: boolean;
  bottomRef: React.RefObject<HTMLDivElement>;
};

export function ChatWindow({ messages, thinking, isTyping, bottomRef }: Props) {
  return (
    <div className="flex-1 overflow-y-auto space-y-3 px-4 py-5">
      {messages.map((message, idx) => (
        <MessageBubble key={message.id ?? idx} message={message} />
      ))}

      {thinking && (
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Thinking...</span>
        </div>
      )}

      {isTyping && !thinking && (
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <div className="flex gap-1">
            <div className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <span>Someone is typing...</span>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

