import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, Sparkles, User, HelpCircle, MessageSquare } from 'lucide-react';
import { queryAIAssistant } from '../../services/geminiService';

export function AIAssistantChat({
  roomId,
  transcripts = [],
  notesData = null,
}) {
  const [messages, setMessages] = useState([
    {
      id: 'ai-init',
      sender: 'ai',
      text: '👋 Hi! I am your AI Meeting Assistant. You can ask me anything about what was said in this call, ask for specific task breakdowns, or draft follow-up summaries.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  const handleAsk = async (e) => {
    e?.preventDefault();
    const query = inputQuestion.trim();
    if (!query) return;

    // Append user question
    const userMsg = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuestion('');
    setIsThinking(true);

    try {
      const answer = await queryAIAssistant(roomId, transcripts, notesData, query);
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: answer,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err) {
      console.warn('AIAssistant query error:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: 'I encountered an issue processing that query. Please try again.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  const sampleQuestions = [
    "What action items are pending?",
    "What did Alex say about auth?",
    "Draft a follow-up email",
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden select-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#ecece7] bg-white px-3.5 py-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-[#8fa765]" />
          <span className="text-xs font-bold text-[#32342e]">Ask Meeting AI</span>
        </div>
        <span className="rounded-full border border-[#e4e9d9] bg-[#f1f4eb] px-2 py-0.5 text-[10px] font-semibold text-[#758b55]">
          Meeting assistant
        </span>
      </div>

      {/* Messages Scroll Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => {
          const isAi = msg.sender === 'ai';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isAi ? 'items-start' : 'items-end'}`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                {isAi ? (
                  <Bot className="h-3.5 w-3.5 text-[#879e60]" />
                ) : (
                  <User className="h-3.5 w-3.5 text-[#85887f]" />
                )}
                <span className="text-[10px] font-semibold text-[#777a72]">
                  {isAi ? 'Meeting AI' : 'You'}
                </span>
                <span className="font-mono text-[9px] text-[#a1a39c]">{msg.timestamp}</span>
              </div>
              <div
                className={`p-3 rounded-2xl text-xs leading-relaxed max-w-[90%] whitespace-pre-wrap ${
                  isAi
                    ? 'border border-[#ecece7] bg-white text-[#4b4e46]'
                    : 'bg-[#f4e6dc] text-[#4c4038]'
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}

        {isThinking && (
          <div className="flex w-fit animate-pulse items-center gap-2 rounded-2xl border border-[#e4e9d9] bg-white p-3 text-xs text-[#758b55]">
            <Sparkles className="w-4 h-4 animate-spin" />
            <span>Analyzing meeting context...</span>
          </div>
        )}
      </div>

      {/* Suggested Quick Prompts */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-t border-[#f0f0ec] bg-white px-3 py-1.5">
        {sampleQuestions.map((q, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => { setInputQuestion(q); }}
            className="whitespace-nowrap rounded-lg border border-[#ecece7] bg-[#fafaf8] px-2.5 py-1 text-[10px] text-[#686b63] transition-colors hover:bg-[#f1f2ee]"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Input Form */}
      <form onSubmit={handleAsk} className="flex gap-2 border-t border-[#ecece7] bg-white p-3">
        <input
          type="text"
          placeholder="Ask a question about this meeting..."
          value={inputQuestion}
          onChange={(e) => setInputQuestion(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-[#e8e9e3] bg-[#f7f8f5] px-3.5 py-2 text-xs text-[#34362f] placeholder-[#999b94] focus:border-[#b1c68a] focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-xl bg-[#171815] p-2.5 text-white transition-all hover:bg-[#363831] active:scale-95"
          title="Ask AI"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
