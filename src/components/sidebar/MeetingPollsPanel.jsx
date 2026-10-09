import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, Check, CirclePlus, LoaderCircle, Plus, X, MessageCircle, ThumbsUp } from 'lucide-react';
import { apiService } from '../../services/apiService';
import { socketService } from '../../services/socketService';

const getPollId = (poll) => poll.id || poll._id;
const getQuestionId = (question) => question.id || question._id;

export function MeetingPollsPanel({ roomId, currentUser, isHost = false }) {
  const [polls, setPolls] = useState([]);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState({});
  const [questions, setQuestions] = useState([]);
  const [questionText, setQuestionText] = useState('');
  const [activeView, setActiveView] = useState('polls');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadPolls = useCallback(async () => {
    try {
      const [pollResult, questionResult] = await Promise.all([
        apiService.getMeetingPolls(roomId),
        apiService.getMeetingQuestions(roomId),
      ]);
      setPolls(pollResult.polls || []);
      setQuestions(questionResult.questions || []);
      setError('');
    } catch (requestError) {
      setError(requestError.message || 'Could not load meeting polls.');
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    setLoading(true);
    void loadPolls();
    const handlePollUpdate = ({ poll }) => {
      if (!poll || poll.roomId !== roomId) return;
      setPolls((existing) => {
        const pollId = getPollId(poll);
        const exists = existing.some((item) => getPollId(item) === pollId);
        return exists
          ? existing.map((item) => getPollId(item) === pollId ? poll : item)
          : [poll, ...existing];
      });
    };
    const handleQuestionUpdate = ({ question: updatedQuestion }) => {
      if (!updatedQuestion || updatedQuestion.roomId !== roomId) return;
      setQuestions((existing) => {
        const questionId = getQuestionId(updatedQuestion);
        const exists = existing.some((item) => getQuestionId(item) === questionId);
        return exists
          ? existing.map((item) => getQuestionId(item) === questionId ? updatedQuestion : item)
          : [updatedQuestion, ...existing];
      });
    };
    socketService.on('meeting-poll-updated', handlePollUpdate);
    socketService.on('meeting-question-updated', handleQuestionUpdate);
    return () => {
      socketService.off('meeting-poll-updated', handlePollUpdate);
      socketService.off('meeting-question-updated', handleQuestionUpdate);
    };
  }, [loadPolls, roomId]);

  const handleCreate = async (event) => {
    event.preventDefault();
    const cleanOptions = options.map((option) => option.trim()).filter(Boolean);
    if (!question.trim() || cleanOptions.length < 2) {
      setError('Add a question and at least two answer options.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await apiService.createMeetingPoll(roomId, {
        question: question.trim(),
        options: cleanOptions,
        allowMultiple,
        createdBy: currentUser?.id || 'guest',
      });
      setPolls((existing) => [result.poll, ...existing]);
      socketService.broadcastPollUpdate(result.poll);
      setQuestion('');
      setOptions(['', '']);
      setAllowMultiple(false);
    } catch (requestError) {
      setError(requestError.message || 'Could not create this poll.');
    } finally {
      setSaving(false);
    }
  };

  const toggleOption = (poll, optionId) => {
    const id = getPollId(poll);
    const existing = selectedOptions[id] || [];
    const next = poll.allowMultiple
      ? (existing.includes(optionId) ? existing.filter((value) => value !== optionId) : [...existing, optionId])
      : [optionId];
    setSelectedOptions((current) => ({ ...current, [id]: next }));
  };

  const handleVote = async (poll) => {
    const id = getPollId(poll);
    const optionIds = selectedOptions[id] || [];
    if (!optionIds.length) return;
    setError('');
    try {
      const result = await apiService.voteMeetingPoll(roomId, id, {
        voterId: currentUser?.id || socketService.getSocketId() || 'guest',
        optionIds,
      });
      setPolls((existing) => existing.map((item) => getPollId(item) === id ? result.poll : item));
      socketService.broadcastPollUpdate(result.poll);
    } catch (requestError) {
      setError(requestError.message || 'Could not submit your vote.');
    }
  };

  const handleClose = async (poll) => {
    const id = getPollId(poll);
    try {
      const result = await apiService.closeMeetingPoll(roomId, id);
      setPolls((existing) => existing.map((item) => getPollId(item) === id ? result.poll : item));
      socketService.broadcastPollUpdate(result.poll);
    } catch (requestError) {
      setError(requestError.message || 'Could not close this poll.');
    }
  };

  const handleSubmitQuestion = async (event) => {
    event.preventDefault();
    if (!questionText.trim()) return;
    setSaving(true);
    setError('');
    try {
      const result = await apiService.createMeetingQuestion(roomId, {
        text: questionText.trim(),
        authorId: currentUser?.id || socketService.getSocketId() || 'guest',
        authorName: currentUser?.name || 'Guest',
      });
      setQuestions((existing) => [result.question, ...existing]);
      socketService.broadcastQuestionUpdate(result.question);
      setQuestionText('');
    } catch (requestError) {
      setError(requestError.message || 'Could not submit your question.');
    } finally {
      setSaving(false);
    }
  };

  const handleQuestionUpvote = async (question) => {
    const id = getQuestionId(question);
    try {
      const result = await apiService.upvoteMeetingQuestion(
        roomId,
        id,
        currentUser?.id || socketService.getSocketId() || 'guest'
      );
      setQuestions((existing) => existing.map((item) => getQuestionId(item) === id ? result.question : item));
      socketService.broadcastQuestionUpdate(result.question);
    } catch (requestError) {
      setError(requestError.message || 'Could not update your vote.');
    }
  };

  const handleQuestionAnswered = async (question) => {
    const id = getQuestionId(question);
    try {
      const result = await apiService.setMeetingQuestionAnswered(roomId, id);
      setQuestions((existing) => existing.map((item) => getQuestionId(item) === id ? result.question : item));
      socketService.broadcastQuestionUpdate(result.question);
    } catch (requestError) {
      setError(requestError.message || 'Could not update question status.');
    }
  };

  return (
    <section className="flex h-full flex-col overflow-hidden bg-[#fbfbf8]">
      <header className="flex items-center justify-between border-b border-[#ecece7] bg-white px-4 py-3">
        <div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-[#8aa767]" /><h2 className="text-xs font-bold text-[#32342e]">Polls & Q&amp;A</h2></div>
        <span className="text-[10px] text-[#85877f]">{activeView === 'polls' ? `${polls.length} polls` : `${questions.length} questions`}</span>
      </header>
      <div className="flex shrink-0 gap-1 border-b border-[#ecece7] bg-white px-3 py-2">
        {[{ id: 'polls', label: 'Polls', Icon: BarChart3 }, { id: 'questions', label: 'Questions', Icon: MessageCircle }].map(({ id, label, Icon }) => (
          <button key={id} type="button" aria-pressed={activeView === id} onClick={() => setActiveView(id)} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-[10px] font-semibold ${activeView === id ? 'bg-[#171815] text-white' : 'text-[#777a72] hover:bg-[#f1f2ee]'}`}><Icon className="h-3.5 w-3.5" />{label}</button>
        ))}
      </div>
      {activeView === 'polls' ? (
      <>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {error && <p role="alert" className="rounded-xl bg-[#fae8e4] px-3 py-2 text-[10px] text-[#a85f51]">{error}</p>}
        {loading ? <div className="flex justify-center py-8"><LoaderCircle className="h-5 w-5 animate-spin text-[#8aa767]" /></div> : polls.length ? polls.map((poll) => {
          const pollId = getPollId(poll);
          const totalVotes = poll.options.reduce((total, option) => total + (option.voters?.length || 0), 0);
          const mySelections = selectedOptions[pollId] || [];
          return (
            <article key={pollId} className="rounded-2xl border border-[#e8e9e3] bg-white p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div><h3 className="text-xs font-semibold text-[#3b3d36]">{poll.question}</h3><p className="mt-1 text-[9px] text-[#92948d]">{totalVotes} {totalVotes === 1 ? 'vote' : 'votes'} · {poll.allowMultiple ? 'Select all that apply' : 'Choose one'}</p></div>
                {isHost && poll.status === 'open' && <button type="button" onClick={() => void handleClose(poll)} aria-label="Close poll" className="rounded-lg p-1 text-[#92948d] hover:bg-[#f1f2ee]"><X className="h-3.5 w-3.5" /></button>}
              </div>
              <div className="mt-3 space-y-1.5">
                {poll.options.map((option) => {
                  const voteCount = option.voters?.length || 0;
                  const percentage = totalVotes ? Math.round(voteCount / totalVotes * 100) : 0;
                  const hasVoted = poll.status === 'closed' || totalVotes > 0;
                  return (
                    <button key={option.id} type="button" disabled={poll.status !== 'open'} onClick={() => toggleOption(poll, option.id)} className={`relative flex w-full items-center justify-between overflow-hidden rounded-xl border px-3 py-2 text-left text-[11px] ${mySelections.includes(option.id) ? 'border-[#b9cb9a] bg-[#f1f4e9]' : 'border-[#ecece7] bg-[#fbfbf8]'}`}>
                      {hasVoted && <span className="absolute inset-y-0 left-0 bg-[#edf2e5]" style={{ width: `${percentage}%` }} />}
                      <span className="relative flex items-center gap-2 text-[#50534b]">{mySelections.includes(option.id) ? <Check className="h-3.5 w-3.5 text-[#718b4f]" /> : <span className="h-3.5 w-3.5 rounded-full border border-[#c9cbc3]" />}{option.text}</span>
                      {hasVoted && <span className="relative text-[9px] text-[#777a72]">{percentage}%</span>}
                    </button>
                  );
                })}
              </div>
              {poll.status === 'open' && <button type="button" onClick={() => void handleVote(poll)} disabled={!mySelections.length} className="mt-2 w-full rounded-lg bg-[#171815] px-3 py-2 text-[10px] font-semibold text-white disabled:opacity-40">Submit vote</button>}
              {poll.status === 'closed' && <p className="mt-2 text-[9px] font-medium text-[#92948d]">Poll closed</p>}
            </article>
          );
        }) : <p className="rounded-xl border border-dashed border-[#dfe1d9] px-4 py-8 text-center text-xs text-[#85877f]">Create a quick poll to gather decisions from the room.</p>}
      </div>
      {isHost && (
        <form onSubmit={handleCreate} className="space-y-2.5 border-t border-[#ecece7] bg-white p-3">
          <input value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={300} placeholder="Ask the meeting a question…" className="w-full rounded-xl border border-[#e8e9e3] bg-[#f7f8f5] px-3 py-2 text-xs outline-none focus:border-[#9bbc6d]" />
          {options.map((option, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <input value={option} onChange={(event) => setOptions((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} maxLength={120} placeholder={`Option ${index + 1}`} className="min-w-0 flex-1 rounded-lg border border-[#e8e9e3] bg-[#fbfbf8] px-2.5 py-2 text-[10px] outline-none focus:border-[#9bbc6d]" />
              {options.length > 2 && <button type="button" aria-label={`Remove option ${index + 1}`} onClick={() => setOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded p-1 text-[#92948d]"><X className="h-3.5 w-3.5" /></button>}
            </div>
          ))}
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button type="button" onClick={() => setOptions((current) => current.length < 8 ? [...current, ''] : current)} disabled={options.length >= 8} className="inline-flex items-center gap-1 text-[9px] font-semibold text-[#718b4f] disabled:opacity-40"><CirclePlus className="h-3 w-3" />Option</button>
              <label className="flex items-center gap-1 text-[9px] text-[#777a72]"><input type="checkbox" checked={allowMultiple} onChange={(event) => setAllowMultiple(event.target.checked)} />Multiple choice</label>
            </div>
            <button type="submit" disabled={saving || !question.trim()} className="inline-flex items-center gap-1 rounded-lg bg-[#171815] px-3 py-2 text-[10px] font-semibold text-white disabled:opacity-40">{saving ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}Create poll</button>
          </div>
        </form>
      )}
      </>
      ) : (
        <>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {error && <p role="alert" className="rounded-xl bg-[#fae8e4] px-3 py-2 text-[10px] text-[#a85f51]">{error}</p>}
            {loading ? <div className="flex justify-center py-8"><LoaderCircle className="h-5 w-5 animate-spin text-[#8aa767]" /></div> : questions.length ? [...questions].sort((a, b) => (b.upvoterIds?.length || 0) - (a.upvoterIds?.length || 0)).map((item) => {
              const id = getQuestionId(item);
              const myId = currentUser?.id || socketService.getSocketId() || 'guest';
              const hasUpvoted = item.upvoterIds?.includes(myId);
              return (
                <article key={id} className="rounded-2xl border border-[#e8e9e3] bg-white p-3">
                  <p className="text-xs leading-relaxed text-[#3b3d36]">{item.text}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="truncate text-[9px] text-[#92948d]">Asked by {item.authorName}</span>
                    <div className="flex items-center gap-1.5">
                      {isHost && <button type="button" onClick={() => void handleQuestionAnswered(item)} className={`rounded-lg px-2 py-1 text-[9px] font-semibold ${item.status === 'answered' ? 'bg-[#f1f4e9] text-[#607745]' : 'bg-[#f1f2ee] text-[#686b63]'}`}>{item.status === 'answered' ? 'Answered' : 'Mark answered'}</button>}
                      <button type="button" aria-pressed={Boolean(hasUpvoted)} onClick={() => void handleQuestionUpvote(item)} className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] font-semibold ${hasUpvoted ? 'bg-[#f1f4e9] text-[#607745]' : 'bg-[#f1f2ee] text-[#686b63]'}`}><ThumbsUp className="h-3 w-3" />{item.upvoterIds?.length || 0}</button>
                    </div>
                  </div>
                </article>
              );
            }) : <p className="rounded-xl border border-dashed border-[#dfe1d9] px-4 py-8 text-center text-xs text-[#85877f]">Questions from the room will appear here. Upvote to surface what matters most.</p>}
          </div>
          <form onSubmit={handleSubmitQuestion} className="flex gap-2 border-t border-[#ecece7] bg-white p-3">
            <input value={questionText} onChange={(event) => setQuestionText(event.target.value)} maxLength={1000} placeholder="Add a question for the host…" className="min-w-0 flex-1 rounded-xl border border-[#e8e9e3] bg-[#f7f8f5] px-3 py-2 text-xs outline-none focus:border-[#9bbc6d]" />
            <button type="submit" disabled={saving || !questionText.trim()} aria-label="Submit question" className="flex items-center gap-1 rounded-xl bg-[#171815] px-3 py-2 text-[10px] font-semibold text-white disabled:opacity-40">{saving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}Ask</button>
          </form>
        </>
      )}
    </section>
  );
}
