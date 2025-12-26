import { useCallback, useEffect, useRef, useState } from 'react';

export type ChatMessage = {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:3001';

export function useChatStream(initialSessionId?: string) {
  const [sessionId, setSessionId] = useState<string | undefined>(
    initialSessionId,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadHistory = useCallback(
    async (existingSessionId: string) => {
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
        setError(
          err instanceof Error ? err.message : 'Unable to load chat history',
        );
      }
    },
    [],
  );

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isSending) return;
    setIsSending(true);
    setThinking(true);
    setError(null);

    const userContent = input.trim();
    setInput('');

    const controller = new AbortController();
    abortRef.current = controller;

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: userContent },
      { role: 'assistant', content: '', isStreaming: true },
    ]);

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, content: userContent }),
        signal: controller.signal,
      });

      const headerSession = res.headers.get('x-session-id');
      if (headerSession) setSessionId(headerSession);

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('Streaming is not available');
      }

      const decoder = new TextDecoder();
      let assistantText = '';
      setThinking(true);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;
        assistantText += chunk;

        setMessages((prev) => {
          const clone = [...prev];
          const idx = clone.findIndex((m) => m.isStreaming);
          if (idx >= 0) {
            clone[idx] = { ...clone[idx], content: assistantText };
          }
          return clone;
        });
      }

      setMessages((prev) =>
        prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setMessages((prev) => prev.filter((m) => !m.isStreaming));
    } finally {
      setThinking(false);
      setIsSending(false);
      abortRef.current = null;
    }
  }, [input, isSending, sessionId]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsSending(false);
    setThinking(false);
    setMessages((prev) => prev.filter((m) => !m.isStreaming));
  }, []);

  return {
    sessionId,
    messages,
    input,
    setInput,
    isSending,
    thinking,
    error,
    sendMessage,
    loadHistory,
    abort,
    bottomRef,
  };
}

