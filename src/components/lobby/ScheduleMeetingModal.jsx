import React, { useEffect, useState } from 'react';
import { CalendarPlus, Clock3, Copy, Download, LoaderCircle, Trash2, Users, X } from 'lucide-react';
import { apiService } from '../../services/apiService';

function toLocalDateTime(value) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function createAgendaId() {
  return globalThis.crypto?.randomUUID?.() || `agenda-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeCalendarText(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function getCreatorId(user) {
  if (user?.id && !user.isGuest) return user.id;
  const key = 'syncmeet_scheduler_identity';
  let id = '';
  try {
    id = sessionStorage.getItem(key);
    if (!id) {
      id = globalThis.crypto?.randomUUID?.() || `scheduler-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem(key, id);
    }
  } catch {
    id = globalThis.crypto?.randomUUID?.() || `scheduler-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
  return id;
}

function downloadCalendarInvite(meeting) {
  const start = new Date(meeting.startsAt);
  const end = new Date(start.getTime() + meeting.durationMinutes * 60000);
  const formatUtc = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const link = `${window.location.origin}/?room=${encodeURIComponent(meeting.roomId)}`;
  const agenda = (meeting.agenda || []).map((item) => `- ${item.text}`).join('\n');
  const content = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SyncMeet AI//Meeting//EN',
    'BEGIN:VEVENT',
    `UID:${meeting.roomId}@syncmeet`,
    `DTSTAMP:${formatUtc(new Date())}`,
    `DTSTART:${formatUtc(start)}`,
    `DTEND:${formatUtc(end)}`,
    `SUMMARY:${escapeCalendarText(meeting.title)}`,
    `DESCRIPTION:${escapeCalendarText(`Join: ${link}\n\nAgenda:\n${agenda}`)}`,
    `URL:${link}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT10M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeCalendarText(`SyncMeet starts in 10 minutes: ${meeting.title}`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${meeting.title.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'syncmeet'}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ScheduleMeetingModal({ isOpen, onClose, onJoinScheduled, currentUser }) {
  const [templates, setTemplates] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState(() => toLocalDateTime(Date.now() + 60 * 60 * 1000));
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [templateId, setTemplateId] = useState('general');
  const [agenda, setAgenda] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [templateData, scheduleData] = await Promise.all([
        apiService.getMeetingTemplates(),
        apiService.getScheduledMeetings(),
      ]);
      setTemplates(templateData.templates || []);
      setMeetings(scheduleData.meetings || []);
    } catch (requestError) {
      setError(requestError.message || 'Could not load scheduling data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) void loadData();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !templates.length) return;
    const selected = templates.find((item) => item.id === templateId) || templates[0];
    setAgenda(selected.agenda.map((text) => ({ id: createAgendaId(), text })));
  }, [isOpen, templateId, templates]);

  if (!isOpen) return null;

  const hasEmptyAgendaItem = agenda.some((item) => !item.text.trim());

  const selectTemplate = (nextId) => {
    setTemplateId(nextId);
    const selected = templates.find((item) => item.id === nextId);
    if (!title.trim() || templates.some((item) => item.title === title)) {
      setTitle(selected?.title || '');
    }
  };

  const handleSchedule = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (hasEmptyAgendaItem) {
      setError('Fill in or remove empty agenda items before scheduling.');
      return;
    }
    setSaving(true);
    try {
      const result = await apiService.createScheduledMeeting({
        title: title.trim(),
        startsAt: new Date(startsAt).toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        durationMinutes: Number(durationMinutes),
        templateId,
        agenda,
        createdBy: getCreatorId(currentUser),
        hostName: currentUser?.name || 'Meeting Host',
      });
      const meeting = result.meeting;
      setMeetings((previous) => [...previous, meeting].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)));
      setTitle('');
      setNotice('Meeting scheduled. Download the calendar invite or share its room link.');
    } catch (requestError) {
      setError(requestError.message || 'Could not schedule this meeting.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (roomId) => {
    try {
      await apiService.cancelScheduledMeeting(roomId);
      setMeetings((previous) => previous.filter((meeting) => meeting.roomId !== roomId));
    } catch (requestError) {
      setError(requestError.message || 'Could not cancel this meeting.');
    }
  };

  const copyMeetingLink = async (meeting) => {
    const link = `${window.location.origin}/?room=${encodeURIComponent(meeting.roomId)}`;
    try {
      await navigator.clipboard.writeText(link);
      setNotice('Meeting link copied.');
    } catch {
      setError('Clipboard access was denied. Copy the room code instead: ' + meeting.roomId);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#20231d]/40 p-3 backdrop-blur-sm sm:p-5 dark:bg-black/60">
      <section role="dialog" aria-modal="true" aria-labelledby="schedule-meeting-heading" className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-[24px] border border-white bg-[#f8f8f5] text-[#30322c] shadow-2xl dark:border-[#222736] dark:bg-[#12151e] dark:text-[#f3f4f6]">
        <header className="flex items-center justify-between border-b border-[#e8e9e5] bg-white px-4 py-3.5 sm:px-6 dark:border-[#1e2330] dark:bg-[#151923]">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f1f4e9] text-[#718b4f] dark:border-[#203022] dark:bg-[#172318] dark:text-[#9bbc6d]"><CalendarPlus className="h-5 w-5" /></span>
            <div>
              <h2 id="schedule-meeting-heading" className="text-sm font-bold dark:text-[#f3f4f6]">Schedule a meeting</h2>
              <p className="text-[11px] text-[#85877f] dark:text-[#8d93a3]">Choose a time, set an agenda, and share an invite.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close scheduling" className="rounded-xl p-2 text-[#777a72] hover:bg-[#eff0eb] dark:text-[#8d93a3] dark:hover:bg-[#1e2434] dark:hover:text-[#f3f4f6]"><X className="h-4 w-4" /></button>
        </header>

        <div className="grid min-h-0 gap-4 overflow-y-auto p-4 sm:p-6 lg:grid-cols-[1fr_0.9fr]">
          <form onSubmit={handleSchedule} className="space-y-3.5">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold dark:text-[#d1d5db]">Meeting title</span>
              <input required maxLength={150} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Product planning" className="w-full rounded-xl border border-[#e1e3dc] bg-white px-3 py-2.5 text-xs outline-none focus:border-[#9bbc6d] dark:border-[#242b3b] dark:bg-[#1a1f2c] dark:text-[#f3f4f6] dark:placeholder-[#6b7280]" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold dark:text-[#d1d5db]">Template</span>
              <select value={templateId} onChange={(event) => selectTemplate(event.target.value)} className="w-full rounded-xl border border-[#e1e3dc] bg-white px-3 py-2.5 text-xs outline-none focus:border-[#9bbc6d] dark:border-[#242b3b] dark:bg-[#1a1f2c] dark:text-[#f3f4f6]">
                {templates.map((template) => <option key={template.id} value={template.id} className="dark:bg-[#1a1f2c]">{template.title}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold dark:text-[#d1d5db]">Start time (your local time)</span>
                <input required type="datetime-local" min={toLocalDateTime(Date.now() + 60000)} value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="w-full rounded-xl border border-[#e1e3dc] bg-white px-2.5 py-2.5 text-[10px] outline-none focus:border-[#9bbc6d] dark:border-[#242b3b] dark:bg-[#1a1f2c] dark:text-[#f3f4f6]" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold dark:text-[#d1d5db]">Duration</span>
                <select value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} className="w-full rounded-xl border border-[#e1e3dc] bg-white px-3 py-2.5 text-xs outline-none focus:border-[#9bbc6d] dark:border-[#242b3b] dark:bg-[#1a1f2c] dark:text-[#f3f4f6]">
                  {[15, 30, 45, 60, 90, 120].map((minutes) => <option key={minutes} value={minutes} className="dark:bg-[#1a1f2c]">{minutes} minutes</option>)}
                </select>
              </label>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-semibold dark:text-[#d1d5db]">Agenda</span>
                <button type="button" onClick={() => setAgenda((items) => [...items, { id: createAgendaId(), text: '' }])} disabled={agenda.length >= 20} className="text-[10px] font-semibold text-[#718b4f] disabled:opacity-40 dark:text-[#9bbc6d]">Add item</button>
              </div>
              <div className="space-y-1.5">
                {agenda.map((item, index) => (
                  <div key={item.id} className="flex items-center gap-1.5">
                    <input value={item.text} maxLength={300} onChange={(event) => setAgenda((items) => items.map((entry) => entry.id === item.id ? { ...entry, text: event.target.value } : entry))} placeholder={`Agenda item ${index + 1}`} className="min-w-0 flex-1 rounded-lg border border-[#e7e8e3] bg-white px-2.5 py-2 text-[11px] outline-none focus:border-[#9bbc6d] dark:border-[#242b3b] dark:bg-[#1a1f2c] dark:text-[#f3f4f6] dark:placeholder-[#6b7280]" />
                    <button type="button" aria-label={`Remove agenda item ${index + 1}`} onClick={() => setAgenda((items) => items.filter((entry) => entry.id !== item.id))} className="rounded-lg p-2 text-[#92948d] hover:bg-[#f1f2ee] dark:text-[#8d93a3] dark:hover:bg-[#202737]"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
              {hasEmptyAgendaItem && (
                <p className="mt-1.5 text-[10px] text-[#a85f51] dark:text-[#f87171]">Fill in or remove empty agenda items to continue.</p>
              )}
            </div>
            {error && <p role="alert" className="rounded-xl bg-[#fae8e4] px-3 py-2 text-[11px] text-[#a85f51] dark:bg-[#341d1a] dark:text-[#f87171]">{error}</p>}
            {notice && <p role="status" className="rounded-xl bg-[#f1f4e9] px-3 py-2 text-[11px] text-[#607745] dark:bg-[#1f2e1a] dark:text-[#88c580]">{notice}</p>}
            <button type="submit" disabled={saving || loading || !title.trim() || hasEmptyAgendaItem} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#171815] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#363831] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#9bbc6d] dark:text-[#12151e] dark:hover:bg-[#88a95c]">
              {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
              {saving ? 'Scheduling…' : 'Schedule meeting'}
            </button>
          </form>

          <section className="rounded-2xl border border-[#e8e9e3] bg-white p-3.5 dark:border-[#202636] dark:bg-[#161a25]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold dark:text-[#f3f4f6]">Upcoming meetings</h3>
              <span className="text-[10px] text-[#85877f] dark:text-[#8d93a3]">{meetings.length} scheduled</span>
            </div>
            {loading ? <p className="py-6 text-center text-xs text-[#85877f] dark:text-[#8d93a3]">Loading schedule…</p> : meetings.length ? (
              <div className="max-h-[380px] space-y-2 overflow-y-auto">
                {meetings.map((meeting) => (
                  <article key={meeting.roomId} className="rounded-xl border border-[#ecece7] bg-[#fbfbf8] p-3 dark:border-[#242b3b] dark:bg-[#1a1f2c]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="truncate text-xs font-semibold dark:text-[#f3f4f6]">{meeting.title}</h4>
                        <p className="mt-1 flex items-center gap-1 text-[10px] text-[#777a72] dark:text-[#8d93a3]"><Clock3 className="h-3 w-3" />{new Date(meeting.startsAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · {meeting.durationMinutes} min</p>
                        <p className="mt-1 font-mono text-[9px] text-[#92948d] dark:text-[#8d93a3]">{meeting.roomId}</p>
                      </div>
                      <button type="button" aria-label={`Cancel ${meeting.title}`} onClick={() => void handleCancel(meeting.roomId)} className="rounded-lg p-1.5 text-[#a85f51] hover:bg-[#fae8e4] dark:text-[#f87171] dark:hover:bg-[#341d1a]"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => void copyMeetingLink(meeting)} className="inline-flex items-center gap-1 rounded-lg border border-[#e2e4dc] bg-white px-2 py-1.5 text-[9px] font-semibold dark:border-[#242b3b] dark:bg-[#151923] dark:text-[#f3f4f6] dark:hover:bg-[#1f2636]"><Copy className="h-3 w-3" />Copy link</button>
                      <button type="button" onClick={() => downloadCalendarInvite(meeting)} className="inline-flex items-center gap-1 rounded-lg border border-[#e2e4dc] bg-white px-2 py-1.5 text-[9px] font-semibold dark:border-[#242b3b] dark:bg-[#151923] dark:text-[#f3f4f6] dark:hover:bg-[#1f2636]"><Download className="h-3 w-3" />Calendar invite</button>
                      <button type="button" onClick={() => onJoinScheduled({
                        roomId: meeting.roomId,
                        title: meeting.title,
                        agenda: meeting.agenda,
                        templateId: meeting.templateId,
                        isHost: apiService.getRoomAccessToken(meeting.roomId)?.role === 'host',
                      })} className="inline-flex items-center gap-1 rounded-lg bg-[#f1f4e9] px-2 py-1.5 text-[9px] font-semibold text-[#607745] dark:bg-[#1f2e1a] dark:text-[#88c580]"><Users className="h-3 w-3" />Start meeting</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : <p className="py-6 text-center text-xs text-[#85877f] dark:text-[#8d93a3]">No upcoming meetings. Schedule one and share its link.</p>}
          </section>
        </div>
      </section>
    </div>
  );
}
