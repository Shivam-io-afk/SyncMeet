import { apiService } from './apiService';

const DB_NAME = 'SyncMeetDB';
const DB_VERSION = 1;

class DatabaseService {
  constructor() {
    this.db = null;
    this.initPromise = this.initDB();
  }

  async initDB() {
    if (typeof window === 'undefined' || !window.indexedDB) {
      console.warn('IndexedDB not supported in current environment.');
      return null;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. Rooms Store
        if (!db.objectStoreNames.contains('rooms')) {
          const roomStore = db.createObjectStore('rooms', { keyPath: 'roomId' });
          roomStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // 2. Transcripts Store
        if (!db.objectStoreNames.contains('transcripts')) {
          const transcriptStore = db.createObjectStore('transcripts', { keyPath: 'id' });
          transcriptStore.createIndex('roomId', 'roomId', { unique: false });
          transcriptStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // 3. AI Notes Store
        if (!db.objectStoreNames.contains('ai_notes')) {
          const notesStore = db.createObjectStore('ai_notes', { keyPath: 'id' });
          notesStore.createIndex('roomId', 'roomId', { unique: false });
          notesStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB open failed:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  async getDB() {
    if (!this.db) {
      await this.initPromise;
    }
    return this.db;
  }

  // Save or update a meeting room record
  async saveRoom(roomData) {
    const db = await this.getDB();
    if (!db) return null;

    return new Promise((resolve, reject) => {
      const tx = db.transaction('rooms', 'readwrite');
      const store = tx.objectStore('rooms');

      const existingRequest = store.get(roomData.roomId);
      existingRequest.onsuccess = () => {
        const existingRoom = existingRequest.result;
        const record = {
          ...existingRoom,
          roomId: roomData.roomId,
          title: roomData.title || existingRoom?.title || `Meeting ${roomData.roomId}`,
          hostName: roomData.hostName || existingRoom?.hostName || 'Host',
          createdAt: existingRoom?.createdAt || roomData.createdAt || Date.now(),
          lastActiveAt: Date.now(),
          participantCount: roomData.participantCount || 1,
          agenda: roomData.agenda || existingRoom?.agenda || [],
        };

        const saveRequest = store.put(record);
        saveRequest.onsuccess = () => resolve(record);
        saveRequest.onerror = (e) => reject(e.target.error);
      };
      existingRequest.onerror = (e) => reject(e.target.error);
    });
  }

  // Save a transcript chunk
  async saveTranscript(roomId, transcript) {
    const db = await this.getDB();
    if (!db) return null;

    return new Promise((resolve, reject) => {
      const tx = db.transaction('transcripts', 'readwrite');
      const store = tx.objectStore('transcripts');

      const record = {
        id: transcript.id || `stt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        roomId,
        speaker: transcript.speaker || 'Anonymous',
        text: transcript.text,
        timestamp: transcript.timestamp || new Date().toLocaleTimeString(),
        createdAt: transcript.createdAt || Date.now(),
      };

      const request = store.put(record);
      request.onsuccess = () => resolve(record);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // Save or update AI generated notes
  async saveAINotes(roomId, notesData) {
    // 1. Save or update in cloud backend MongoDB if roomId is provided
    if (roomId) {
      try {
        await apiService.saveMeetingNotes(roomId, notesData);
      } catch (err) {
        console.warn('[DB] Backend notes sync notice:', err.message);
      }
    }

    const db = await this.getDB();
    if (!db) return null;

    return new Promise((resolve, reject) => {
      const tx = db.transaction('ai_notes', 'readwrite');
      const store = tx.objectStore('ai_notes');

      const record = {
        id: `note-${roomId}`,
        roomId,
        summary: notesData.summary || '',
        decisions: notesData.decisions || [],
        actionItems: notesData.actionItems || [],
        openQuestions: notesData.openQuestions || [],
        generationSource: notesData.generationSource,
        updatedAt: Date.now(),
      };

      const request = store.put(record);
      request.onsuccess = () => resolve(record);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async getRoomMeetingData(roomId) {
    let localTranscripts = [];
    let localNotes = null;

    const db = await this.getDB();
    if (db) {
      await new Promise((resolve) => {
        try {
          const tx = db.transaction(['transcripts', 'ai_notes'], 'readonly');
          const transcriptRequest = tx.objectStore('transcripts').index('roomId').getAll(roomId);
          const notesRequest = tx.objectStore('ai_notes').get(`note-${roomId}`);

          transcriptRequest.onsuccess = () => {
            localTranscripts = (transcriptRequest.result || [])
              .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
          };
          notesRequest.onsuccess = () => {
            const savedNotes = notesRequest.result;
            if (savedNotes) {
              localNotes = {
                summary: savedNotes.summary,
                decisions: savedNotes.decisions,
                actionItems: savedNotes.actionItems,
                openQuestions: savedNotes.openQuestions,
                generationSource: savedNotes.generationSource,
              };
            }
          };

          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    }

    // Attempt to load cloud notes if available
    try {
      const cloudRes = await apiService.getMeetingNotes(roomId);
      if (cloudRes?.success && cloudRes?.notes) {
        localNotes = {
          ...localNotes,
          ...cloudRes.notes,
        };
      }
    } catch {
      // Cloud notes are optional
    }

    return { transcripts: localTranscripts, notes: localNotes };
  }

  async clearTranscripts(roomId) {
    const db = await this.getDB();
    if (!db) return false;

    return new Promise((resolve, reject) => {
      const tx = db.transaction('transcripts', 'readwrite');
      const transcriptStore = tx.objectStore('transcripts');
      const request = transcriptStore.index('roomId').getAllKeys(roomId);

      request.onsuccess = () => {
        request.result.forEach((key) => transcriptStore.delete(key));
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  // Helper: Retrieve local meeting history from IndexedDB
  async getLocalMeetingHistory(db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['rooms', 'transcripts', 'ai_notes'], 'readonly');
      const roomStore = tx.objectStore('rooms');
      const roomsRequest = roomStore.getAll();

      roomsRequest.onsuccess = async () => {
        const rooms = roomsRequest.result || [];
        rooms.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        const enhancedRooms = await Promise.all(
          rooms.map(async (room) => {
            return new Promise((resRoom) => {
              const txDetail = db.transaction(['transcripts', 'ai_notes'], 'readonly');
              const tIndex = txDetail.objectStore('transcripts').index('roomId');
              const tReq = tIndex.getAll(room.roomId);
              const nReq = txDetail.objectStore('ai_notes').get(`note-${room.roomId}`);

              txDetail.oncomplete = () => {
                resRoom({
                  ...room,
                  transcriptCount: (tReq.result || []).length,
                  hasNotes: !!nReq.result,
                  notes: nReq.result || null,
                  transcripts: tReq.result || [],
                  source: 'local',
                });
              };
              txDetail.onerror = () => resRoom(room);
            });
          })
        );

        resolve(enhancedRooms);
      };

      roomsRequest.onerror = (e) => reject(e.target.error);
    });
  }

  // Retrieve full meeting history from Backend Database & Local Cache
  async getMeetingHistory() {
    let localRooms = [];
    const db = await this.getDB();
    if (db) {
      try {
        localRooms = await this.getLocalMeetingHistory(db);
      } catch (err) {
        console.warn('[DB] Local history load error:', err.message);
      }
    }

    // If user has active auth token, load from backend MongoDB
    if (apiService.getToken()) {
      try {
        const { meetings = [] } = await apiService.getRecentMeetings();
        const localByRoom = new Map(localRooms.map((room) => [room.roomId, room]));

        const mergedCloudRooms = meetings.map((cloudMeeting) => {
          const local = localByRoom.get(cloudMeeting.roomId);
          return {
            ...local,
            ...cloudMeeting,
            transcriptCount: cloudMeeting.transcriptCount ?? local?.transcriptCount ?? 0,
            hasNotes: Boolean(local?.hasNotes || cloudMeeting.hasNotes),
            notes: local?.notes || cloudMeeting.notes || null,
            transcripts: local?.transcripts || cloudMeeting.transcripts || [],
            source: 'database',
          };
        });

        // Authenticated users must strictly see only their own cloud meetings
        return mergedCloudRooms;
      } catch (err) {
        console.warn('[DB] Backend meeting history load notice:', err.message);
      }
    }

    return localRooms;
  }

  // Clear all local IndexedDB meeting cache across tables
  async clearAllLocalData() {
    const db = await this.getDB();
    if (!db) return true;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(['rooms', 'transcripts', 'ai_notes'], 'readwrite');
        tx.objectStore('rooms').clear();
        tx.objectStore('transcripts').clear();
        tx.objectStore('ai_notes').clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  // Delete a meeting room and its associated data
  async deleteRoom(roomId) {
    // 1. Delete from backend database if user is authenticated
    if (apiService.getToken()) {
      try {
        await apiService.removeRecentMeeting(roomId);
      } catch (err) {
        console.warn('[DB] Backend meeting removal notice:', err.message);
      }
    }

    // 2. Delete from local IndexedDB
    const db = await this.getDB();
    if (!db) return true;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(['rooms', 'transcripts', 'ai_notes'], 'readwrite');
      
      tx.objectStore('rooms').delete(roomId);
      tx.objectStore('ai_notes').delete(`note-${roomId}`);

      const transcriptIndex = tx.objectStore('transcripts').index('roomId');
      const getReq = transcriptIndex.getAllKeys(roomId);

      getReq.onsuccess = () => {
        const keys = getReq.result || [];
        keys.forEach(k => tx.objectStore('transcripts').delete(k));
      };

      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }
}

export const dbService = new DatabaseService();
