import mongoose from 'mongoose';

const meetingAttendanceSchema = new mongoose.Schema({
  roomId: { type: String, required: true, trim: true },
  userId: { type: String, required: true, trim: true },
  socketId: { type: String, required: true, trim: true },
  title: { type: String, default: 'Instant Meeting', trim: true },
  hostName: { type: String, default: 'Meeting Host', trim: true },
  role: { type: String, enum: ['host', 'participant'], required: true },
  joinedAt: { type: Date, required: true },
  leftAt: { type: Date, default: null },
}, { timestamps: true });

meetingAttendanceSchema.index({ roomId: 1, userId: 1, socketId: 1 }, { unique: true });
meetingAttendanceSchema.index({ userId: 1, leftAt: -1 });

export const MeetingAttendance = mongoose.model('MeetingAttendance', meetingAttendanceSchema);
