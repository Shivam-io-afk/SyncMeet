/**
 * HTTP REST Client for Backend API Integration
 * Manages JWT Auth Tokens, Room creation, AI Summarization, and History
 */

import { getApiBaseUrl } from './apiBaseUrl';

const TOKEN_KEY = 'syncmeet_jwt_token';
const ROOM_ACCESS_KEY = 'syncmeet_room_access_tokens_v1';
const ACTIVE_ROOM_KEY = 'syncmeet_active_room_id_v1';

class ApiService {
  constructor() {
    this.refreshPromise = null;
  }

  getToken() {
    try {
      return sessionStorage.getItem(TOKEN_KEY) || '';
    } catch {
      return '';
    }
  }

  setToken(token) {
    try {
      if (token) {
        sessionStorage.setItem(TOKEN_KEY, token);
      } else {
        sessionStorage.removeItem(TOKEN_KEY);
      }
    } catch (err) {
      console.warn('[API] Could not update session token storage:', err);
    }
  }

  getHeaders(customHeaders = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...customHeaders,
    };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    try {
      const roomId = sessionStorage.getItem(ACTIVE_ROOM_KEY);
      const roomAccessToken = roomId ? this.getRoomAccessToken(roomId)?.token : '';
      if (roomAccessToken && !headers['X-Room-Access-Token']) {
        headers['X-Room-Access-Token'] = roomAccessToken;
      }
    } catch {
      // Ignore sessionStorage access errors
    }
    return headers;
  }

  getRoomAccessToken(roomId) {
    try {
      const roomTokens = JSON.parse(sessionStorage.getItem(ROOM_ACCESS_KEY) || '{}');
      return roomTokens[roomId] || null;
    } catch {
      return null;
    }
  }

  setRoomAccessToken(roomId, access) {
    try {
      const roomTokens = JSON.parse(sessionStorage.getItem(ROOM_ACCESS_KEY) || '{}');
      roomTokens[roomId] = access;
      sessionStorage.setItem(ROOM_ACCESS_KEY, JSON.stringify(roomTokens));
    } catch (err) {
      console.warn('[API] Could not update room access tokens:', err);
    }
  }

  setActiveRoomAccess(roomId, access) {
    if (access) this.setRoomAccessToken(roomId, access);
    try {
      sessionStorage.setItem(ACTIVE_ROOM_KEY, roomId);
    } catch (err) {
      console.warn('[API] Could not set active room key:', err);
    }
  }

  clearActiveRoomAccess() {
    try {
      sessionStorage.removeItem(ACTIVE_ROOM_KEY);
    } catch (err) {
      console.warn('[API] Could not clear active room key:', err);
    }
  }

  async request(endpoint, options = {}) {
    const url = `${getApiBaseUrl()}${endpoint}`;
    const canRefresh = Boolean(this.getToken())
      && !['/api/auth/login', '/api/auth/register', '/api/auth/refresh'].includes(endpoint);

    try {
      const sendRequest = () => fetch(url, {
        ...options,
        credentials: 'include',
        headers: this.getHeaders(options.headers),
      });
      let response = await sendRequest();
      if (response.status === 401 && canRefresh && await this.refreshAccessToken()) {
        response = await sendRequest();
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || `Request failed with status ${response.status}`);
      }
      return data;
    } catch (error) {
      console.warn(`[API] Request to ${endpoint} failed:`, error.message);
      throw error;
    }
  }

  async refreshAccessToken() {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) {
          this.setToken('');
          return false;
        }
        const data = await response.json();
        if (!data.token) {
          this.setToken('');
          return false;
        }
        this.setToken(data.token);
        return true;
      } catch (error) {
        console.warn('[API] Could not refresh authentication:', error.message);
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();
    return this.refreshPromise;
  }

  // --- Auth API ---
  async login(email, password) {
    const data = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  }

  async loginWithGithub(githubProfile) {
    const data = await this.request('/api/auth/github', {
      method: 'POST',
      body: JSON.stringify(githubProfile),
    });
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  }

  async loginWithMicrosoft(microsoftProfile) {
    const data = await this.request('/api/auth/microsoft', {
      method: 'POST',
      body: JSON.stringify(microsoftProfile),
    });
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  }

  async sendOtp(email) {
    return await this.request('/api/auth/otp/send', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async verifyOtp(email, code) {
    const data = await this.request('/api/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    });
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  }

  async register(name, email, password) {
    const data = await this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  }

  async getCurrentUser() {
    const token = this.getToken();
    if (!token) return null;
    return await this.request('/api/auth/me', { method: 'GET' });
  }

  async updateProfile(updates) {
    return await this.request('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async getHealth() {
    return await this.request('/api/health', { method: 'GET' });
  }

  logout() {
    const logoutUrl = `${getApiBaseUrl()}/api/auth/logout`;
    this.setToken('');
    fetch(logoutUrl, { method: 'POST', credentials: 'include' })
      .then((response) => {
        if (!response.ok) throw new Error(`Logout failed with status ${response.status}`);
      })
      .catch((error) => console.warn('[API] Server logout could not be completed:', error.message));
  }

  // --- Rooms API ---
  async createRoom(roomData) {
    return await this.request('/api/rooms/create', {
      method: 'POST',
      body: JSON.stringify(roomData),
    });
  }

  async createGuestRoom({ title, hostName }) {
    const result = await this.request('/api/rooms/guest', {
      method: 'POST',
      body: JSON.stringify({ title, hostName }),
    });
    const access = { token: result.accessToken, role: 'host', participantId: result.room.hostId };
    this.setActiveRoomAccess(result.room.roomId, access);
    return { ...result, access };
  }

  async joinMeetingRoom(roomId, name) {
    const result = await this.request(`/api/rooms/${encodeURIComponent(roomId)}/join`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    const access = { token: result.accessToken, role: 'participant', participantId: result.participant.id };
    this.setActiveRoomAccess(roomId, access);
    return { ...result, access };
  }

  async getRoom(roomId) {
    return await this.request(`/api/rooms/${roomId}`, { method: 'GET' });
  }

  // --- AI API ---
  async summarizeTranscripts(roomId, transcripts) {
    if (!roomId) throw new Error('A room ID is required to summarize meeting transcripts');
    const roomAccessToken = this.getRoomAccessToken(roomId)?.token;
    if (!roomAccessToken) throw new Error('A room access token is required to summarize meeting transcripts');
    return await this.request(`/api/ai/rooms/${encodeURIComponent(roomId)}/summarize`, {
      method: 'POST',
      headers: { 'X-Room-Access-Token': roomAccessToken },
      body: JSON.stringify({ transcripts }),
    });
  }

  async askAssistant(roomId, transcripts, notes, question) {
    if (!roomId) throw new Error('A room ID is required to ask the meeting assistant');
    const roomAccessToken = this.getRoomAccessToken(roomId)?.token;
    if (!roomAccessToken) throw new Error('A room access token is required to ask the meeting assistant');
    return await this.request(`/api/ai/rooms/${encodeURIComponent(roomId)}/ask`, {
      method: 'POST',
      headers: { 'X-Room-Access-Token': roomAccessToken },
      body: JSON.stringify({ transcripts, notes, question }),
    });
  }

  // --- History API ---
  async getRecentMeetings() {
    return await this.request('/api/history/recent', { method: 'GET' });
  }

  async removeRecentMeeting(roomId) {
    return await this.request(`/api/history/recent/${encodeURIComponent(roomId)}`, { method: 'DELETE' });
  }

  async saveMeeting(meetingData) {
    const roomId = encodeURIComponent(meetingData.roomId);
    const roomAccessToken = this.getRoomAccessToken(meetingData.roomId)?.token;
    return await this.request(`/api/history/${roomId}/save`, {
      method: 'POST',
      headers: roomAccessToken ? { 'X-Room-Access-Token': roomAccessToken } : {},
      body: JSON.stringify(meetingData),
    });
  }

  async getHistory(roomId) {
    if (!roomId) throw new Error('A room ID is required to access a meeting archive');
    const roomAccessToken = this.getRoomAccessToken(roomId)?.token;
    return await this.request(`/api/history/${encodeURIComponent(roomId)}`, {
      method: 'GET',
      headers: roomAccessToken ? { 'X-Room-Access-Token': roomAccessToken } : {},
    });
  }

  async getAccountHistory(roomId) {
    if (!roomId) throw new Error('A room ID is required to access a meeting archive');
    return await this.request(`/api/history/account/${encodeURIComponent(roomId)}`, { method: 'GET' });
  }

  // --- Meeting features API ---
  async getMeetingTemplates() {
    return await this.request('/api/features/templates', { method: 'GET' });
  }

  async getScheduledMeetings() {
    return await this.request('/api/features/schedules', { method: 'GET' });
  }

  async getScheduledMeeting(roomId) {
    return await this.request(`/api/features/schedules/${encodeURIComponent(roomId)}`, { method: 'GET' });
  }

  async createScheduledMeeting(meeting) {
    const result = await this.request('/api/features/schedules', {
      method: 'POST',
      body: JSON.stringify(meeting),
    });
    const access = { token: result.accessToken, role: 'host', participantId: result.meeting.createdBy };
    this.setActiveRoomAccess(result.meeting.roomId, access);
    return { ...result, access };
  }

  async cancelScheduledMeeting(roomId) {
    return await this.request(`/api/features/schedules/${encodeURIComponent(roomId)}`, {
      method: 'DELETE',
      headers: {
        'X-Room-Access-Token': this.getRoomAccessToken(roomId)?.token || '',
      },
    });
  }

  async getMeetingNotes(roomId) {
    return await this.request(`/api/features/rooms/${encodeURIComponent(roomId)}/notes`, { method: 'GET' });
  }

  async getMeetingAgenda(roomId) {
    return await this.request(`/api/features/rooms/${encodeURIComponent(roomId)}/agenda`, { method: 'GET' });
  }

  async saveMeetingAgenda(roomId, agenda) {
    return await this.request(`/api/features/rooms/${encodeURIComponent(roomId)}/agenda`, {
      method: 'PUT',
      body: JSON.stringify({ agenda }),
    });
  }

  async saveMeetingNotes(roomId, notes) {
    return await this.request(`/api/features/rooms/${encodeURIComponent(roomId)}/notes`, {
      method: 'PUT',
      body: JSON.stringify(notes),
    });
  }

  async getMeetingPolls(roomId) {
    return await this.request(`/api/features/rooms/${encodeURIComponent(roomId)}/polls`, { method: 'GET' });
  }

  async createMeetingPoll(roomId, poll) {
    return await this.request(`/api/features/rooms/${encodeURIComponent(roomId)}/polls`, {
      method: 'POST',
      body: JSON.stringify(poll),
    });
  }

  async voteMeetingPoll(roomId, pollId, vote) {
    return await this.request(`/api/features/rooms/${encodeURIComponent(roomId)}/polls/${encodeURIComponent(pollId)}/votes`, {
      method: 'POST',
      body: JSON.stringify(vote),
    });
  }

  async closeMeetingPoll(roomId, pollId) {
    return await this.request(`/api/features/rooms/${encodeURIComponent(roomId)}/polls/${encodeURIComponent(pollId)}/close`, {
      method: 'PATCH',
    });
  }

  async getMeetingQuestions(roomId) {
    return await this.request(`/api/features/rooms/${encodeURIComponent(roomId)}/questions`, { method: 'GET' });
  }

  async createMeetingQuestion(roomId, question) {
    return await this.request(`/api/features/rooms/${encodeURIComponent(roomId)}/questions`, {
      method: 'POST',
      body: JSON.stringify(question),
    });
  }

  async upvoteMeetingQuestion(roomId, questionId, voterId) {
    return await this.request(`/api/features/rooms/${encodeURIComponent(roomId)}/questions/${encodeURIComponent(questionId)}/upvote`, {
      method: 'POST',
      body: JSON.stringify({ voterId }),
    });
  }

  async setMeetingQuestionAnswered(roomId, questionId) {
    return await this.request(`/api/features/rooms/${encodeURIComponent(roomId)}/questions/${encodeURIComponent(questionId)}/answer`, {
      method: 'PATCH',
    });
  }

  async getBreakoutSession(roomId) {
    return await this.request(`/api/features/rooms/${encodeURIComponent(roomId)}/breakouts`, { method: 'GET' });
  }

  async createBreakoutSession(roomId, breakout) {
    return await this.request(`/api/features/rooms/${encodeURIComponent(roomId)}/breakouts`, {
      method: 'POST',
      body: JSON.stringify(breakout),
    });
  }

  async endBreakoutSession(roomId, breakoutId) {
    return await this.request(`/api/features/rooms/${encodeURIComponent(roomId)}/breakouts/${encodeURIComponent(breakoutId)}/end`, {
      method: 'PATCH',
    });
  }
}

export const apiService = new ApiService();
