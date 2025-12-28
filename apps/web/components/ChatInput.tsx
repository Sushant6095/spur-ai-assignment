'use client';

import { useRef, useEffect, KeyboardEvent } from 'react';
import { Send } from 'lucide-react';

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
};

export function ChatInput({ value, onChange, onSubmit, disabled }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const maxHeight = 200; // Max height in pixels (about 8-9 lines)
      textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  }, [value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter to send, Shift+Enter for new line
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) {
        onSubmit();
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!disabled && value.trim()) {
      onSubmit();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-[#1f1f1f] bg-[#0f0f0f] px-4 py-3"
    >
      <div className="flex items-end gap-3">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            className="w-full resize-none rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-3 text-sm text-[#e5e5e5] placeholder:text-[#737373] focus:border-[#3a3a3a] focus:outline-none focus:ring-1 focus:ring-[#3a3a3a] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            placeholder="Type your message... (Press Enter to send, Shift+Enter for new line)"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            rows={1}
            style={{
              minHeight: '44px',
              maxHeight: '200px',
            }}
          />
        </div>
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#3a3a3a] text-[#e5e5e5] transition-all duration-200 hover:bg-[#4a4a4a] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#3a3a3a] focus:outline-none focus:ring-2 focus:ring-[#4a4a4a] focus:ring-offset-2 focus:ring-offset-[#0f0f0f] active:scale-95"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}
