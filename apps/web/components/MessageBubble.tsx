import { ChatMessage } from '../hooks/use-chat-stream';
import clsx from 'classnames';

type Props = {
  message: ChatMessage;
};

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';

  return (
    <div
      className={clsx('flex w-full', {
        'justify-end': isUser,
        'justify-start': !isUser,
      })}
    >
      <div
        className={clsx(
          'max-w-[80%] rounded-2xl px-4 py-3 shadow-sm text-sm leading-6',
          {
            'bg-blue-600 text-white': isUser,
            'bg-white text-slate-900 border border-slate-200': !isUser,
          },
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
      </div>
    </div>
  );
}

