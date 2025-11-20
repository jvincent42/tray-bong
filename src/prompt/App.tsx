import { useChat } from '@ai-sdk/react';
import type { ChatStatus, UIMessage, UIMessageChunk } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { twMerge } from 'tailwind-merge';

type PromptAPI = {
  getPromptInfo: () => Promise<{ label: string; systemPrompt: string }>;
  generateTitle: (systemPrompt: string, userMessage: string) => Promise<string>;
  streamChat: (
    messages: UIMessage[],
    callbacks: {
      onChunk: (chunk: UIMessageChunk) => void;
      onDone: () => void;
      onError: (error: string) => void;
    },
  ) => () => void;
};

declare global {
  var promptAPI: PromptAPI;
  var logger: {
    info: (message: string) => void;
    debug: (message: string) => void;
    error: (message: string) => void;
  };
}

function Message({
  message,
  isLastMessage,
  status,
}: {
  message: UIMessage;
  isLastMessage: boolean;
  status: ChatStatus;
}) {
  const textParts = message.parts.filter((part) => part.type === 'text');
  const textContent = textParts
    .map((part) => ('text' in part ? part.text : ''))
    .join('');

  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  const hasEmptyText = textParts.some(
    (part) => 'text' in part && part.text === '',
  );
  const showActivityIndicator =
    isAssistant &&
    isLastMessage &&
    (status === 'submitted' || (status === 'streaming' && hasEmptyText));

  return (
    <div
      className={twMerge(
        'flex max-w-[80%] flex-col transition-opacity duration-200 no-app-drag',
        isUser && 'self-end',
        isAssistant && 'self-start',
      )}
    >
      <div
        className={twMerge(
          'markdown-content rounded-2xl px-4 py-3 leading-6 wrap-break-word',
          isUser && 'rounded-br-sm',
          isAssistant && 'rounded-bl-sm',
          !showActivityIndicator && 'select-text',
        )}
        style={{
          backgroundColor: isUser
            ? 'var(--color-bg-message-user)'
            : 'var(--color-bg-message-assistant)',
        }}
      >
        {showActivityIndicator ? (
          <span
            className="inline-block animate-pulse"
            style={{ color: 'var(--color-text-muted)' }}
          >
            ●
          </span>
        ) : (
          <ReactMarkdown>{textContent}</ReactMarkdown>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [label, setLabel] = useState<string>('');
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [showSystemPrompt, setShowSystemPrompt] = useState<boolean>(false);
  const [input, setInput] = useState<string>('');
  const [streamingError, setStreamingError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, sendMessage, status, stop, setMessages } = useChat({
    transport: {
      sendMessages: async ({ messages: uiMessages, abortSignal }) => {
        logger.info(`sendMessages called with ${uiMessages.length} messages`);

        return new ReadableStream<UIMessageChunk>({
          start(controller) {
            if (abortSignal !== undefined && abortSignal.aborted) {
              logger.debug('ReadableStream aborted before start');
              controller.close();
              return;
            }

            logger.debug('ReadableStream started');
            const abortStream = promptAPI.streamChat(uiMessages, {
              onChunk: (chunk) => {
                logger.debug(
                  `onChunk: type=${chunk.type}, id=${'id' in chunk ? chunk.id : 'N/A'}`,
                );
                controller.enqueue(chunk);
              },
              onDone: () => {
                logger.debug('onDone called');
                controller.close();
              },
              onError: (error) => {
                logger.error(`onError: ${error}`);
                setStreamingError(error);
                controller.enqueue({
                  type: 'error',
                  errorText: error,
                });
                controller.close();
              },
            });

            abortSignal?.addEventListener('abort', () => {
              logger.debug('ReadableStream aborted');
              abortStream();
              controller.close();
            });
          },
          cancel() {
            logger.debug('ReadableStream cancelled');
          },
        });
      },
      reconnectToStream: async () => {
        return null;
      },
    },
    onError: (error) => {
      logger.error(`useChat error: ${error.message}`);
      setStreamingError(error.message);
    },
  });

  useEffect(() => {
    logger.debug(`Status changed: ${status}`);
  }, [status]);

  useEffect(() => {
    async function init(): Promise<void> {
      const { label: promptLabel, systemPrompt: systemPromptText } =
        await promptAPI.getPromptInfo();
      setLabel(promptLabel);
      setSystemPrompt(systemPromptText);
      document.title = promptLabel;

      // Initialize chat with system prompt as first message
      if (systemPromptText.trim() !== '') {
        setMessages([
          {
            id: 'system',
            role: 'system',
            parts: [{ type: 'text', text: systemPromptText }],
          },
        ]);
      }
    }

    void init();
  }, [setMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const visibleMessages = useMemo(() => {
    return messages.filter((message) => message.role !== 'system');
  }, [messages]);
  const messagesElements = useMemo(() => {
    const elements = visibleMessages.map((message, index) => (
      <Message
        key={message.id}
        isLastMessage={index === visibleMessages.length - 1}
        message={message}
        status={status}
      />
    ));
    if (
      status === 'submitted' &&
      visibleMessages.length > 0 &&
      visibleMessages[visibleMessages.length - 1]?.role === 'user'
    ) {
      elements.push(
        <Message
          isLastMessage
          message={{
            id: 'placeholder',
            role: 'assistant',
            parts: [{ type: 'text', text: '' }],
          }}
          status={status}
        />,
      );
    }

    return elements;
  }, [visibleMessages, status]);

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (status === 'streaming') {
        void stop();
      } else if (input.trim() !== '') {
        const userMessageText = input.trim();
        const isFirstUserMessage = visibleMessages.length === 0;

        void sendMessage({ text: userMessageText });
        setInput('');
        setStreamingError(null);

        if (isFirstUserMessage && systemPrompt.trim() !== '') {
          void promptAPI
            .generateTitle(systemPrompt, userMessageText)
            .then((title) => {
              setLabel(title);
              document.title = title;
            })
            .catch((error) => {
              logger.error(
                `Failed to generate title: ${error instanceof Error ? error.message : String(error)}`,
              );
            });
        }
      }
    },
    [input, sendMessage, status, stop, systemPrompt, visibleMessages],
  );

  return (
    <div className="flex h-full flex-col">
      <div
        className="shrink-0 p-4"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <h1 className="w-fit text-xl font-semibold no-app-drag">{label}</h1>
        {systemPrompt.trim() !== '' && (
          <button
            className="mt-1 block text-left text-xs transition-colors no-app-drag"
            style={{
              color: showSystemPrompt
                ? 'var(--color-text-secondary)'
                : 'var(--color-text-muted)',
              maxWidth: showSystemPrompt ? '100%' : '50%',
              overflow: showSystemPrompt ? 'visible' : 'hidden',
              textOverflow: showSystemPrompt ? 'clip' : 'ellipsis',
              whiteSpace: showSystemPrompt ? 'pre-wrap' : 'nowrap',
            }}
            type="button"
            onClick={() => {
              setShowSystemPrompt(!showSystemPrompt);
            }}
          >
            {showSystemPrompt ? '▼ ' : '► '}
            <span className={twMerge(!showSystemPrompt && 'italic')}>
              {systemPrompt}
            </span>
          </button>
        )}
      </div>
      {streamingError !== null && (
        <div
          className="shrink-0 px-4 py-3 no-app-drag"
          style={{
            borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex-1 text-xs select-text"
              style={{ color: 'rgb(185, 28, 28)' }}
            >
              {streamingError}
            </div>
            <button
              aria-label="Dismiss error"
              className="shrink-0 rounded px-2 py-1 text-xs transition-colors"
              style={{ color: 'rgb(185, 28, 28)' }}
              type="button"
              onClick={() => {
                setStreamingError(null);
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
      <div
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 no-app-drag"
        style={{ backgroundColor: 'var(--color-bg-chat)' }}
      >
        {messagesElements}
        <div ref={messagesEndRef} />
      </div>
      <form
        className="shrink-0 p-4"
        style={{ borderTop: '1px solid var(--color-border)' }}
        onSubmit={handleSubmit}
      >
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            className="max-h-60 flex-1 resize-none overflow-y-auto rounded-3xl px-4 py-3 text-[0.95rem] transition-[border-color] duration-200 outline-none no-app-drag disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-bg-secondary)',
              color: 'var(--color-text-primary)',
            }}
            disabled={status === 'streaming' || status === 'submitted'}
            placeholder="Type your message..."
            rows={input.split('\n').length}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border-focus)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border)';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const form = e.currentTarget.form;
                form?.requestSubmit();
              }
            }}
          />
          <button
            className="cursor-pointer rounded-3xl border-none px-6 py-3 text-[0.95rem] font-medium transition-[background] duration-200 no-app-drag disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              backgroundColor: 'var(--color-button-primary)',
              color: 'white',
            }}
            disabled={
              status === 'streaming' ||
              status === 'submitted' ||
              input.trim() === ''
            }
            type="submit"
            onMouseEnter={(e) => {
              if (!e.currentTarget.disabled) {
                e.currentTarget.style.backgroundColor =
                  'var(--color-button-primary-hover)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor =
                'var(--color-button-primary)';
            }}
          >
            {status === 'streaming' ? 'Stop' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
