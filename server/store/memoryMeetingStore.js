export const inMemoryRooms = new Map();
export const scheduledMeetings = new Map();
export const inMemoryHistory = new Map();
export const inMemoryMeetingAttendance = new Map();
export const inMemoryAuthSessions = new Map();
export const roomPolls = new Map();
export const roomQuestions = new Map();
export const roomAgendas = new Map();
export const breakoutSessions = new Map();

// Pre-seeded verified accounts
export const verifiedAccounts = new Map([
  [
    'sarah@syncmeet.ai',
    {
      _id: 'usr_sarah_01',
      id: 'usr_sarah_01',
      name: 'Sarah Jenkins',
      email: 'sarah@syncmeet.ai',
      passwordHash: '$2b$10$Gm1gmNdu.2Cf.pBCA3tDfOi1yUNGQ0hgpIF/iR4nwxbZil.eaOiB2',
      role: 'host',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
      title: 'Meeting Host',
      avatarColor: 'from-[#ff8586] to-[#d85e77]',
      createdAt: new Date(),
    }
  ],
  [
    'alex@syncmeet.ai',
    {
      _id: 'usr_alex_02',
      id: 'usr_alex_02',
      name: 'Alex Chen',
      email: 'alex@syncmeet.ai',
      passwordHash: '$2b$10$Gm1gmNdu.2Cf.pBCA3tDfOi1yUNGQ0hgpIF/iR4nwxbZil.eaOiB2',
      role: 'participant',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
      title: 'Product Engineer',
      avatarColor: 'from-emerald-600 to-teal-500',
      createdAt: new Date(),
    }
  ],
  [
    'elena@syncmeet.ai',
    {
      _id: 'usr_elena_03',
      id: 'usr_elena_03',
      name: 'Elena Rostova',
      email: 'elena@syncmeet.ai',
      passwordHash: '$2a$10$wN31V8kE6M7tZq2y1lP7A.d1iH2J3K4L5M6N7O8P9Q0R1S2T3U4V',
      role: 'participant',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      title: 'UX Researcher',
      avatarColor: 'from-purple-600 to-pink-500',
      createdAt: new Date(),
    }
  ],
  [
    'david@syncmeet.ai',
    {
      _id: 'usr_david_04',
      id: 'usr_david_04',
      name: 'David Kim',
      email: 'david@syncmeet.ai',
      passwordHash: '$2a$10$wN31V8kE6M7tZq2y1lP7A.d1iH2J3K4L5M6N7O8P9Q0R1S2T3U4V',
      role: 'admin',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
      title: 'Engineering Lead',
      avatarColor: 'from-blue-600 to-indigo-500',
      createdAt: new Date(),
    }
  ]
]);

