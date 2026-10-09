import React, { useCallback, useEffect, useState } from 'react';
import { DoorOpen, LoaderCircle, Users, X } from 'lucide-react';
import { apiService } from '../../services/apiService';
import { socketService } from '../../services/socketService';

export function BreakoutRoomsPanel({ session, participants = [], currentUser, isHost = false }) {
  const [breakout, setBreakout] = useState(null);
  const [roomCount, setRoomCount] = useState(2);
  const [durationMinutes, setDurationMinutes] = useState(10);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const parentRoomId = session.parentRoomId || session.roomId;

  const loadActiveBreakout = useCallback(async () => {
    try {
      const result = await apiService.getBreakoutSession(parentRoomId);
      setBreakout(result.breakout || null);
    } catch (requestError) {
      setError(requestError.message || 'Could not load breakout session.');
    } finally {
      setLoading(false);
    }
  }, [parentRoomId]);

  useEffect(() => {
    setLoading(true);
    void loadActiveBreakout();
    const handleUpdate = ({ breakout: nextBreakout }) => setBreakout(nextBreakout?.status === 'ended' ? null : nextBreakout);
    socketService.on('breakout-updated', handleUpdate);
    return () => socketService.off('breakout-updated', handleUpdate);
  }, [loadActiveBreakout]);

  const startBreakout = async () => {
    if (participants.length < 2) {
      setError('At least two other participants are needed to start breakout rooms.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const groupCount = Math.min(roomCount, participants.length);
      const groups = Array.from({ length: Math.max(2, groupCount) }, (_, index) => ({
        id: `group-${index + 1}`,
        name: `Room ${index + 1}`,
        participantIds: [],
      }));
      participants.forEach((participant, index) => {
        const participantId = participant.user?.id || participant.user?._id || participant.socketId;
        groups[index % groups.length].participantIds.push(String(participantId));
      });
      const endsAt = new Date(Date.now() + durationMinutes * 60000).toISOString();
      const response = await apiService.createBreakoutSession(parentRoomId, {
        groups,
        endsAt,
        createdBy: currentUser?.id || 'guest',
      });
      setBreakout(response.breakout);
      socketService.startBreakout(response.breakout);
    } catch (requestError) {
      setError(requestError.message || 'Could not start breakout rooms.');
    } finally {
      setSaving(false);
    }
  };

  const endBreakout = async () => {
    if (!breakout) return;
    setSaving(true);
    setError('');
    try {
      const result = await apiService.endBreakoutSession(parentRoomId, breakout.id || breakout._id);
      setBreakout(result.breakout);
      socketService.endBreakout(breakout.id || breakout._id);
    } catch (requestError) {
      setError(requestError.message || 'Could not end breakout rooms.');
    } finally {
      setSaving(false);
    }
  };

  const returnToMainRoom = () => socketService.returnFromBreakout();
  const isInBreakout = Boolean(session.parentRoomId && session.roomId !== session.parentRoomId);

  return (
    <section className="flex h-full flex-col overflow-hidden bg-[#fbfbf8]">
      <header className="flex items-center justify-between border-b border-[#ecece7] bg-white px-4 py-3">
        <div className="flex items-center gap-2"><Users className="h-4 w-4 text-[#8aa767]" /><h2 className="text-xs font-bold text-[#32342e]">Breakout rooms</h2></div>
        {breakout?.status === 'active' && <span className="rounded-full bg-[#f1f4e9] px-2 py-1 text-[9px] font-semibold text-[#607745]">Live</span>}
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {error && <p role="alert" className="rounded-xl bg-[#fae8e4] px-3 py-2 text-[10px] text-[#a85f51]">{error}</p>}
        {loading ? <div className="flex justify-center py-8"><LoaderCircle className="h-5 w-5 animate-spin text-[#8aa767]" /></div> : null}
        {!loading && isInBreakout && (
          <div className="rounded-2xl border border-[#dce7cb] bg-[#f1f4e9] p-4">
            <p className="text-xs font-semibold text-[#536a37]">You’re in {session.groupName || 'a breakout room'}</p>
            <p className="mt-1 text-[10px] leading-relaxed text-[#6b765b]">Your microphone and camera are shared only with this small group. Return to the main meeting whenever you’re ready.</p>
            <button type="button" onClick={returnToMainRoom} className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[10px] font-semibold text-[#536a37] shadow-sm"><DoorOpen className="h-3.5 w-3.5" />Return to main meeting</button>
          </div>
        )}
        {!loading && !isInBreakout && breakout?.status === 'active' && (
          <div className="rounded-2xl border border-[#e8e9e3] bg-white p-4">
            <p className="text-xs font-semibold text-[#3b3d36]">Small groups are in progress</p>
            <p className="mt-1 text-[10px] text-[#85877f]">{breakout.groups?.length || 0} rooms · {breakout.endsAt ? `until ${new Date(breakout.endsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'no timer'}</p>
            <div className="mt-3 space-y-1.5">
              {breakout.groups?.map((group) => <div key={group.id} className="flex justify-between rounded-lg bg-[#f8f9f5] px-2.5 py-2 text-[10px]"><span className="font-medium text-[#50534b]">{group.name}</span><span className="text-[#85877f]">{group.participantIds?.length || 0} participants</span></div>)}
            </div>
            {isHost && <button type="button" onClick={() => void endBreakout()} disabled={saving} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#171815] px-3 py-2.5 text-[10px] font-semibold text-white disabled:opacity-50">{saving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}End rooms and bring everyone back</button>}
          </div>
        )}
        {!loading && !isInBreakout && (!breakout || breakout.status !== 'active') && (
          <div className="rounded-2xl border border-[#e8e9e3] bg-white p-4">
            <h3 className="text-xs font-semibold text-[#3b3d36]">Split into small groups</h3>
            <p className="mt-1 text-[10px] leading-relaxed text-[#85877f]">Participants move into separate video rooms. The meeting host stays here and can bring everyone back at any time.</p>
            {isHost ? (
              <>
                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  <label className="text-[10px] font-medium text-[#686b63]">Rooms
                    <select value={roomCount} onChange={(event) => setRoomCount(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-[#e8e9e3] bg-[#fbfbf8] px-2 py-2 text-xs">
                      {[2, 3, 4, 5, 6, 7, 8].map((count) => <option key={count} value={count}>{count}</option>)}
                    </select>
                  </label>
                  <label className="text-[10px] font-medium text-[#686b63]">Time limit
                    <select value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-[#e8e9e3] bg-[#fbfbf8] px-2 py-2 text-xs">
                      {[5, 10, 15, 20, 30].map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}
                    </select>
                  </label>
                </div>
                <p className="mt-2 text-[9px] text-[#92948d]">{participants.length} other participants available · assignments are balanced automatically</p>
                <button type="button" onClick={() => void startBreakout()} disabled={saving || participants.length < 2} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#171815] px-3 py-2.5 text-[10px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{saving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}Start breakout rooms</button>
              </>
            ) : <p className="mt-3 rounded-lg bg-[#f8f9f5] px-3 py-2 text-[10px] text-[#85877f]">The host can start breakout rooms once there are at least three people in the meeting.</p>}
          </div>
        )}
      </div>
    </section>
  );
}
