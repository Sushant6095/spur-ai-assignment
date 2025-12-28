'use client';

import { ChatInput } from '../components/ChatInput';
import { ChatWindow } from '../components/ChatWindow';
import { useChatWebSocket } from '../hooks/use-chat-websocket';

export default function Home() {
  const {
    messages,
    input,
    setInput,
    sendMessage,
    isSending,
    thinking,
    error,
    isTyping,
    isConnected,
    handleTyping,
    bottomRef,
  } = useChatWebSocket();

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-4 py-8">
      <div className="flex w-full max-w-4xl flex-col h-[calc(100vh-4rem)] overflow-hidden rounded-3xl bg-[#0f0f0f] border border-[#1f1f1f] shadow-2xl">
        {/* Header */}
        <div className="border-b border-[#1f1f1f] px-6 py-4 bg-[#0f0f0f]">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-[#e5e5e5]">
                Spur Support
              </h1>
              <p className="text-sm text-[#a3a3a3] mt-0.5">
                Ask about returns, shipping, or orders. Responses stream live.
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <div
                className={`h-2.5 w-2.5 rounded-full transition-all duration-300 ${
                  isConnected
                    ? 'bg-[#22c55e] shadow-[0_0_8px_rgba(34,197,94,0.4)]'
                    : 'bg-[#ef4444] shadow-[0_0_8px_rgba(239,68,68,0.4)]'
                }`}
                title={isConnected ? 'Connected' : 'Disconnected'}
              />
              <span className="text-xs text-[#737373] font-medium">
                {isConnected ? 'Live' : 'Offline'}
              </span>
            </div>
          </div>
        </div>

        {/* Chat Window */}
        <ChatWindow
          messages={messages}
          thinking={thinking}
          isTyping={isTyping}
          bottomRef={bottomRef}
        />

        {/* Error Message */}
        {error && (
          <div className="px-6 py-3 bg-[#1a1a1a] border-t border-[#1f1f1f]">
            <div className="text-sm text-[#ef4444] flex items-center gap-2">
              <span className="text-xs">⚠️</span>
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Input */}
        <ChatInput
          value={input}
          onChange={(value) => {
            setInput(value);
            handleTyping();
          }}
          onSubmit={sendMessage}
          disabled={isSending || !isConnected}
        />
      </div>
    </main>
  );
}
