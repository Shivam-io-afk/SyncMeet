import React, { useState, useEffect } from 'react';
import { 
  Database, Clock, Sparkles, Trash2, X, Search, Check, Copy, HardDrive 
} from 'lucide-react';
import { dbService } from '../../services/dbService';
import { apiService } from '../../services/apiService';

export function MeetingHistoryModal({ isOpen, onClose, onSelectMeeting, isAccount = false }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState('');

  const loadHistory = async () => {
    setLoading(true);
    try {
      if (isAccount || apiService.getToken()) {
        const { meetings = [] } = await apiService.getRecentMeetings();
        setHistory(meetings);
        setSelectedMeeting((curr) => {
          if (!curr) return meetings[0] || null;
          return meetings.find((m) => m.roomId === curr.roomId) || meetings[0] || null;
        });
        return;
      }
      const data = await dbService.getMeetingHistory();
      setHistory(data);
      setSelectedMeeting((curr) => {
        if (!curr) return data[0] || null;
        return data.find((m) => m.roomId === curr.roomId) || data[0] || null;
      });
    } catch (err) {
      console.error('Error loading history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen, isAccount]);

  useEffect(() => {
    const roomId = selectedMeeting?.roomId;
    if (!roomId) {
      setArchiveLoading(false);
      setArchiveError('');
      return undefined;
    }

    let cancelled = false;
    setArchiveLoading(true);
    setArchiveError('');

    const fetchArchive = async () => {
      if (isAccount || apiService.getToken()) {
        try {
          const { record } = await apiService.getAccountHistory(roomId);
          if (record && !cancelled) {
            setSelectedMeeting((current) => current?.roomId === roomId ? {
              ...current,
              title: record.title || current.title,
              hostName: record.hostName || current.hostName,
              createdAt: record.createdAt || current.createdAt,
              transcripts: record.transcripts || [],
              transcriptCount: record.transcripts?.length ?? current.transcriptCount ?? 0,
              notes: record.aiNotes || current.notes || null,
              aiNotes: record.aiNotes || null,
            } : current);
            setArchiveLoading(false);
            return;
          }
        } catch (err) {
          if (!cancelled) {
            setArchiveLoading(false);
            setArchiveError('This meeting archive is private or not available for your account.');
          }
          return;
        }
      }

      try {
        const localData = await dbService.getRoomMeetingData(roomId);
        if (!cancelled && localData) {
          setSelectedMeeting((current) => current?.roomId === roomId ? {
            ...current,
            transcripts: localData.transcripts?.length ? localData.transcripts : current.transcripts || [],
            notes: localData.notes || current.notes || null,
            aiNotes: localData.notes || current.aiNotes || null,
          } : current);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Error loading meeting details:', err);
          setArchiveError('Could not load details for this meeting.');
        }
      } finally {
        if (!cancelled) setArchiveLoading(false);
      }
    };

    fetchArchive();

    return () => {
      cancelled = true;
    };
  }, [isAccount, selectedMeeting?.roomId]);

  const handleDelete = async (roomId, e) => {
    e.stopPropagation();
    const message = isAccount
      ? 'Remove this meeting from your archives? Other participants keep their copy.'
      : 'Delete this meeting archive and its AI notes permanently?';
    if (window.confirm(message)) {
      try {
        if (isAccount) await apiService.removeRecentMeeting(roomId);
        await dbService.deleteRoom(roomId);
      } catch (err) {
        console.error('Error deleting archive:', err);
        window.alert('Could not delete this meeting. Please try again.');
        return;
      }
      if (selectedMeeting?.roomId === roomId) {
        setSelectedMeeting(null);
      }
      window.dispatchEvent(new Event('syncmeet:history-changed'));
      await loadHistory();
    }
  };

  const copyNotes = (notes) => {
    if (!notes) return;
    const md = `# Meeting Summary: ${selectedMeeting?.title || selectedMeeting?.roomId}

## Executive Summary
${notes.summary || 'No summary available.'}

## Decisions
${notes.decisions?.map((item) => `- ${item}`).join('\n') || '- None'}

## Action Items
${notes.actionItems?.map((item) => `- [${item.isCompleted ? 'x' : ' '}] ${item.task} (${item.assignee || 'Unassigned'} · ${item.priority || 'Medium'})`).join('\n') || '- None'}

## Open Questions
${notes.openQuestions?.map((item) => `- ${item}`).join('\n') || '- None'}
`;
    navigator.clipboard.writeText(md);
    setCopiedId('notes');
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!isOpen) return null;

  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const filteredHistory = history.filter((meeting) => {
    if (!normalizedQuery) return true;
    const notes = meeting.notes || meeting.aiNotes;
    const searchableText = [
      meeting.roomId,
      meeting.title,
      notes?.summary,
      ...(notes?.decisions || []),
      ...(notes?.actionItems || []).flatMap((item) => [item.task, item.assignee]),
      ...(notes?.openQuestions || []),
      ...(meeting.transcripts || []).flatMap((entry) => [entry.speaker, entry.text]),
    ];
    return searchableText.some((value) => String(value || '').toLocaleLowerCase().includes(normalizedQuery));
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#20231d]/35 p-2 backdrop-blur-sm animate-in fade-in duration-150 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="meeting-history-title"
        className="flex h-[min(92dvh,860px)] w-full max-w-6xl flex-col overflow-hidden rounded-[24px] border border-white/80 bg-[#f8f8f5] text-[#30322c] shadow-[0_24px_80px_rgba(37,43,34,0.22)] sm:rounded-[30px]"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#e8e9e5] bg-[#fbfbf8] px-4 py-3.5 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-[#e4ead8] bg-[#f1f4e9] text-[#81995c]">
              <Database className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="meeting-history-title" className="text-sm font-bold tracking-tight text-[#30322c] sm:text-base">
                  Meeting archives
                </h2>
              </div>
              <p className="mt-0.5 hidden text-[11px] text-[#85877f] sm:block">
                {isAccount
                  ? 'Completed meetings come from your account; notes are shown when saved on this device.'
                  : 'Meeting history is saved in this browser and is not automatically shared across devices.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close meeting archives"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#777a72] transition-colors hover:bg-[#eff0eb] hover:text-[#30322c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9bbc6d]/50"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex shrink-0 flex-col gap-2.5 border-b border-[#e8e9e5] bg-white/70 p-3 sm:flex-row sm:items-center sm:gap-3 sm:px-5">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#92948d]" />
            <input
              type="search"
              aria-label="Search meeting archives"
              placeholder="Search meetings, notes, or action items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-[#e1e3dc] bg-[#fbfbf8] py-2.5 pl-9 pr-4 text-xs text-[#34362f] placeholder:text-[#a1a39c] focus:border-[#9bbc6d] focus:outline-none focus:ring-2 focus:ring-[#9bbc6d]/20"
            />
          </div>
          <div className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl border border-[#e8e9e3] bg-[#f8f9f5] px-3 py-2 text-[10px] font-medium text-[#777a72] sm:self-auto sm:text-xs">
            <HardDrive className="h-3.5 w-3.5 text-[#8aa767]" />
            <span>{history.length} {history.length === 1 ? 'meeting' : 'meetings'} saved</span>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
          <section aria-label="Saved meetings" className="max-h-[38%] shrink-0 overflow-y-auto border-b border-[#e8e9e5] bg-[#fdfdfb] p-2.5 sm:p-3 md:max-h-none md:w-[320px] md:border-b-0 md:border-r">
            {loading ? (
              <p role="status" className="px-3 py-8 text-center text-xs text-[#85877f]">Loading meeting archives…</p>
            ) : filteredHistory.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <p className="text-xs font-semibold text-[#555850]">{searchQuery ? 'No matching meetings' : 'No saved meetings yet'}</p>
                <p className="mt-1 text-[10px] leading-relaxed text-[#92948d]">
                  {searchQuery ? 'Try a different room code or search term.' : 'Your saved rooms will appear here.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredHistory.map((m) => {
                  const isSelected = selectedMeeting?.roomId === m.roomId;
                  return (
                    <div
                      key={m.roomId}
                      className={`flex items-center gap-1 rounded-2xl border p-2 transition-colors ${
                        isSelected
                          ? 'border-[#dce7cb] bg-[#f1f4e9] shadow-[0_4px_12px_rgba(37,43,34,0.05)]'
                          : 'border-[#ecece6] bg-white hover:border-[#dce7cb] hover:bg-[#f8f9f5]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedMeeting(m)}
                        aria-pressed={isSelected}
                        className="min-w-0 flex-1 rounded-xl px-1.5 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9bbc6d]/50"
                      >
                        <span className="mb-1 flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-mono text-[11px] font-bold text-[#3b3d36] sm:text-xs">
                            {m.title || m.roomId}
                          </span>
                          {m.hasNotes && <Sparkles aria-label="Has AI notes" className="h-3 w-3 shrink-0 text-[#8aa767]" />}
                        </span>
                        <span className="flex items-center gap-1.5 text-[9px] text-[#92948d] sm:text-[10px]">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>{new Date(m.createdAt).toLocaleDateString()}</span>
                          <span aria-hidden="true">·</span>
                          <span>{m.transcriptCount || 0} entries</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(m.roomId, e)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#92948d] transition-colors hover:bg-[#fff2ee] hover:text-[#b94f43] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d97868]/40"
                        title="Delete record"
                        aria-label={`Delete meeting archive ${m.roomId}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section aria-label="Meeting details" className="min-h-0 flex-1 overflow-y-auto bg-[#f8f8f5] p-4 sm:p-5 md:p-6">
            {selectedMeeting ? (
              <div className="mx-auto max-w-3xl space-y-4 sm:space-y-5">
                {archiveLoading && <p role="status" className="text-xs text-[#85877f]">Loading saved meeting details…</p>}
                {archiveError && <p role="alert" className="text-xs text-[#b94f43]">{archiveError}</p>}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e4e5df] pb-4">
                  <div className="min-w-0">
                    <h3 className="flex flex-wrap items-center gap-2 text-sm font-bold text-[#30322c] sm:text-base">
                      <span className="font-mono">Room: {selectedMeeting.roomId}</span>
                      {selectedMeeting.hostName && (
                        <span className="rounded-lg border border-[#e5e7df] bg-white px-2 py-1 text-[10px] font-medium text-[#718b4f]">
                          Host: {selectedMeeting.hostName}
                        </span>
                      )}
                    </h3>
                    <p className="mt-1 text-[10px] text-[#85877f] sm:text-xs">
                      Recorded on {new Date(selectedMeeting.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {selectedMeeting.notes && (
                    <button
                      type="button"
                      onClick={() => copyNotes(selectedMeeting.notes)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[#e1e3dc] bg-white px-3 py-2 text-[10px] font-semibold text-[#555850] transition-colors hover:border-[#cbd7b7] hover:bg-[#f1f4e9] hover:text-[#536a37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9bbc6d]/50 sm:text-xs"
                    >
                      {copiedId === 'notes' ? <Check className="h-3.5 w-3.5 text-[#718b4f]" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedId === 'notes' ? 'Copied' : 'Copy notes'}</span>
                    </button>
                  )}
                </div>

                {selectedMeeting.notes ? (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-[#e4ead8] bg-white p-4 shadow-[0_6px_20px_rgba(37,43,34,0.035)]">
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#718b4f]">Executive summary</span>
                      <p className="text-xs leading-relaxed text-[#555850]">{selectedMeeting.notes.summary}</p>
                    </div>
                    {selectedMeeting.notes.actionItems?.length > 0 && (
                      <div className="rounded-2xl border border-[#e8e9e3] bg-white p-4 shadow-[0_6px_20px_rgba(37,43,34,0.035)]">
                        <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#a2835b]">
                          Action items ({selectedMeeting.notes.actionItems.length})
                        </span>
                        <div className="space-y-2">
                          {selectedMeeting.notes.actionItems.map((a, i) => (
                            <div key={i} className="flex items-start gap-2 rounded-xl bg-[#f8f9f5] p-2.5 text-xs text-[#555850]">
                              <span className="font-bold text-[#8aa767]">•</span>
                              <div className="min-w-0 flex-1">
                                <span className="font-medium">{a.task}</span>
                                {a.assignee && <span className="ml-2 text-[10px] text-[#92948d]">({a.assignee})</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-[#e8e9e3] bg-white p-5 text-center text-xs text-[#85877f]">
                    No AI notes were generated for this meeting.
                  </div>
                )}

                <div>
                  <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#777a72] sm:text-xs">
                    Meeting transcript ({selectedMeeting.transcripts?.length || 0} entries)
                  </h4>
                  <div className="space-y-2">
                    {selectedMeeting.transcripts?.length ? selectedMeeting.transcripts.map((t, idx) => (
                      <article key={idx} className="rounded-xl border border-[#e8e9e3] bg-white p-3 text-xs">
                        <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                          <span className="text-[11px] font-semibold text-[#718b4f]">{t.speaker}</span>
                          <span className="font-mono text-[10px] text-[#92948d]">{t.timestamp}</span>
                        </div>
                        <p className="leading-relaxed text-[#555850]">{t.text}</p>
                      </article>
                    )) : (
                      <p className="rounded-xl border border-dashed border-[#dfe1d9] px-4 py-5 text-center text-[11px] text-[#92948d]">
                        No transcript entries were saved for this meeting.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-32 items-center justify-center rounded-2xl border border-dashed border-[#dfe1d9] bg-white/60 px-5 text-center text-xs text-[#85877f]">
                Select a meeting to view its notes and transcript.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
