import React, { useEffect, useState } from 'react';
import { FileText, Sparkles, MessageSquare, Bot, PenTool, X, ListChecks, BarChart3 } from 'lucide-react';
import { LiveTranscript } from './LiveTranscript';
import { AINotesPanel } from './AINotesPanel';
import { RoomChat } from './RoomChat';
import { AIAssistantChat } from './AIAssistantChat';
import { WhiteboardPanel } from '../meeting/WhiteboardPanel';
import { AgendaPanel } from './AgendaPanel';
import { MeetingPollsPanel } from './MeetingPollsPanel';

export function SidebarContainer({
  currentUser,
  activeTab = 'notes',
  onTabChange,
  onClose,
  transcripts = [],
  interimText = '',
  isListening = true,
  transcriptionError = '',
  onAddTranscript,
  onClearTranscripts,
  notesData,
  isGeneratingNotes = false,
  onGenerateNotes,
  chatMessages = [],
  onSendChatMessage,
  roomId,
  isHost = false,
  agenda = [],
  onAgendaChange,
  onUpdateNotes,
}) {
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([activeTab]));

  useEffect(() => {
    setVisitedTabs((visited) => new Set([...visited, activeTab]));
  }, [activeTab]);

  const tabs = [
    { id: 'notes', label: 'AI Notes', icon: Sparkles, badge: null },
    { id: 'transcript', label: 'Transcript', icon: FileText, badge: transcripts.length || null },
    { id: 'chat', label: 'Chat', icon: MessageSquare, badge: chatMessages.length || null },
    { id: 'whiteboard', label: 'Canvas', icon: PenTool, badge: null },
    { id: 'agenda', label: 'Agenda', icon: ListChecks, badge: null },
    { id: 'polls', label: 'Polls', icon: BarChart3, badge: null },
    { id: 'ask_ai', label: 'Ask AI', icon: Bot, badge: 'NEW' },
  ];
  const activeTabInfo = tabs.find((tab) => tab.id === activeTab);
  const ActiveTabIcon = activeTabInfo?.icon;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#fbfbf8] text-[#292b26] select-none dark:bg-[#12151e] dark:text-[#f3f4f6]">
      {/* Tab Switcher Header */}
      <div className="flex min-h-[54px] items-center justify-between gap-2 border-b border-[#e9eae5] bg-[#fbfbf8] px-3 py-2 dark:border-[#1e2330] dark:bg-[#12151e]">
        <div className="hidden min-w-0 items-center gap-2.5 px-1 lg:flex">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#f1f4e9] text-[#718b4f] dark:bg-[#1e2a1b] dark:text-[#9bbc6d]">
            {ActiveTabIcon && <ActiveTabIcon className="h-4 w-4" />}
          </span>
          <span className="truncate text-xs font-semibold text-[#34362f] dark:text-[#f3f4f6]">
            {activeTabInfo?.label || 'Meeting tools'}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-xl border border-[#ecece8] bg-[#f1f2ee] p-1 scrollbar-none lg:hidden dark:border-[#1e2330] dark:bg-[#181d28]">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                aria-pressed={isActive}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-[#171815] font-semibold text-white shadow-sm dark:bg-[#222838]'
                    : 'text-[#85887f] hover:bg-white hover:text-[#282a25] dark:text-[#8d93a3] dark:hover:bg-[#1e2434] dark:hover:text-[#f3f4f6]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.badge && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                    isActive ? 'bg-white/15 text-white' : 'bg-[#e4e5df] text-[#777a72] dark:bg-[#252c3c] dark:text-[#8d93a3]'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close sidebar"
          className="ml-1 rounded-xl p-2 text-[#85887f] transition-colors hover:bg-[#eeefeb] hover:text-[#282a25] dark:text-[#8d93a3] dark:hover:bg-[#1c2230] dark:hover:text-[#f3f4f6]"
          title="Close sidebar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tab Content Panels */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {(activeTab === 'notes' || activeTab === 'chat' || visitedTabs.has('notes')) && (
          <div className={`min-h-0 ${
            activeTab === 'notes'
              ? 'h-full lg:h-[56%]'
              : activeTab === 'chat'
                ? 'hidden lg:block lg:h-[56%]'
                : 'hidden'
          }`}>
            <AINotesPanel
              notesData={notesData}
              isGenerating={isGeneratingNotes}
              onGenerateNotes={onGenerateNotes}
              onUpdateNotes={onUpdateNotes}
              transcriptCount={transcripts.length}
            />
          </div>
        )}

        {(activeTab === 'transcript' || visitedTabs.has('transcript')) && (
          <div className={`min-h-0 ${activeTab === 'transcript' ? 'h-full' : 'hidden'}`}>
            <LiveTranscript
              currentUser={currentUser}
              transcripts={transcripts}
              interimText={interimText}
              isListening={isListening}
              transcriptionError={transcriptionError}
              onAddTranscript={onAddTranscript}
              onClearTranscripts={onClearTranscripts}
            />
          </div>
        )}

        {(activeTab === 'notes' || activeTab === 'chat' || visitedTabs.has('chat')) && (
          <div className={`min-h-0 ${
            activeTab === 'chat'
              ? 'h-full lg:h-[44%]'
              : activeTab === 'notes'
                ? 'hidden lg:block lg:h-[44%] lg:border-t lg:border-[#e9eae5] dark:lg:border-[#1e2330]'
                : 'hidden'
          }`}>
            <RoomChat
              currentUser={currentUser}
              messages={chatMessages}
              onSendMessage={onSendChatMessage}
            />
          </div>
        )}

        {(activeTab === 'whiteboard' || visitedTabs.has('whiteboard')) && (
          <div className={`min-h-0 ${activeTab === 'whiteboard' ? 'h-full' : 'hidden'}`}>
            <WhiteboardPanel />
          </div>
        )}

        {(activeTab === 'ask_ai' || visitedTabs.has('ask_ai')) && (
          <div className={`min-h-0 ${activeTab === 'ask_ai' ? 'h-full' : 'hidden'}`}>
            <AIAssistantChat
              roomId={roomId}
              transcripts={transcripts}
              notesData={notesData}
            />
          </div>
        )}

        {(activeTab === 'agenda' || visitedTabs.has('agenda')) && (
          <div className={`min-h-0 ${activeTab === 'agenda' ? 'h-full' : 'hidden'}`}>
            <AgendaPanel agenda={agenda} onChange={onAgendaChange} isHost={isHost} />
          </div>
        )}

        {(activeTab === 'polls' || visitedTabs.has('polls')) && (
          <div className={`min-h-0 ${activeTab === 'polls' ? 'h-full' : 'hidden'}`}>
            <MeetingPollsPanel roomId={roomId} currentUser={currentUser} isHost={isHost} />
          </div>
        )}
      </div>
    </div>
  );
}
