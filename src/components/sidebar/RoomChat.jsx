import React, { useState, useRef, useEffect } from 'react';
import { Send, MessageSquare } from 'lucide-react';
import { socketService } from '../../services/socketService';

export function RoomChat({
  currentUser,
  messages = [],
  onSendMessage,
}) {
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  const quickReactions = ['👍', '🚀', '🔥', '👏', '💡', '❤️'];

  return (
    <div className="flex flex-col h-full overflow-hidden select-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#ecece7] bg-white px-3.5 py-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-[#9aab76]" />
          <span className="text-xs font-bold text-[#32342e]">Meeting chat</span>
        </div>
        <span className="font-mono text-[10px] text-[#8b8e85]">{messages.length} messages</span>
      </div>

      {/* Messages Scroll View */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center text-[#85887f]">
            <MessageSquare className="mb-2 h-8 w-8 text-[#a8ba88]" />
            <p className="text-xs font-medium text-[#555850]">No messages yet</p>
            <p className="mt-1 max-w-[200px] text-[11px] text-[#92958d]">
              Send messages, links, and quick notes to everyone in the call.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const localSocketId = socketService.getSocketId();
            const isMe = msg.senderSocketId
              ? msg.senderSocketId === localSocketId
              : msg.senderId === currentUser?.id || msg.senderName === currentUser?.name;
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] font-semibold text-[#8a745f]">
                    {isMe ? 'You' : msg.senderName}
                  </span>
                  <span className="font-mono text-[9px] text-[#a1a39c]">{msg.timestamp}</span>
                </div>
                <div
                  className={`p-3 rounded-2xl text-xs leading-relaxed max-w-[85%] ${
                    isMe
                      ? 'rounded-tr-sm bg-[#f4e6dc] text-[#4c4038]'
                      : 'rounded-tl-sm border border-[#ecece7] bg-white text-[#4b4e46]'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Quick Reaction Bar */}
      <div className="flex items-center gap-1 border-t border-[#f0f0ec] bg-white px-3 py-1.5">
        {quickReactions.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onSendMessage(emoji)}
            className="rounded-lg p-1.5 text-sm transition-transform hover:bg-[#f1f2ee] active:scale-125"
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Message Input Form */}
      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-[#ecece7] bg-white p-3">
        <input
          type="text"
          placeholder="Send a message to room..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-[#e8e9e3] bg-[#f7f8f5] px-3.5 py-2 text-xs text-[#34362f] placeholder-[#999b94] focus:border-[#b1c68a] focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-xl bg-[#171815] p-2.5 text-white transition-all hover:bg-[#363831] active:scale-95"
          title="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
