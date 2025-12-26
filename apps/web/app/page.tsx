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
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 px-4">
      <div className="flex w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Spur Support</h1>
              <p className="text-sm text-slate-500">
                Ask about returns, shipping, or orders. Responses stream live.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full ${
                  isConnected ? 'bg-green-500' : 'bg-red-500'
                }`}
                title={isConnected ? 'Connected' : 'Disconnected'}
              />
              <span className="text-xs text-slate-400">
                {isConnected ? 'Live' : 'Offline'}
              </span>
            </div>
          </div>
        </div>

        <ChatWindow
          messages={messages}
          thinking={thinking}
          isTyping={isTyping}
          bottomRef={bottomRef}
        />

        {error && (
          <div className="px-4 pb-2 text-sm text-red-600">
            {error || 'Something went wrong'}
          </div>
        )}

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

