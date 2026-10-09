import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  title: {
    type: String,
    default: 'Instant Meeting',
    trim: true,
  },
  hostId: {
    type: String,
    required: true,
  },
  hostName: {
    type: String,
    required: true,
  },
  isLocked: {
    type: Boolean,
    default: false,
  },
  admittedParticipantIds: {
    type: [String],
    default: [],
  },
  attendeeIds: {
    type: [String],
    default: [],
  },
  settings: {
    allowScreenShare: { type: Boolean, default: true },
    allowAINotes: { type: Boolean, default: true },
    allowChat: { type: Boolean, default: true },
    allowWhiteboard: { type: Boolean, default: true },
  },
  agenda: [{
    id: String,
    text: { type: String, trim: true, maxlength: 300 },
    isCompleted: { type: Boolean, default: false },
  }],
  participants: [
    {
      userId: String,
      name: String,
      socketId: String,
      joinedAt: { type: Date, default: Date.now },
      isMuted: { type: Boolean, default: false },
      isVideoOff: { type: Boolean, default: false },
    }
  ],
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  endedAt: {
    type: Date,
  },
  archivedAt: {
    type: Date,
  },
});

roomSchema.index({ hostId: 1, isActive: 1, endedAt: -1 });
roomSchema.index({ attendeeIds: 1, isActive: 1, endedAt: -1 });

export const Room = mongoose.model('Room', roomSchema);
