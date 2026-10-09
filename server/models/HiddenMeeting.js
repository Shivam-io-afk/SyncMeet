import mongoose from 'mongoose';

const hiddenMeetingSchema = new mongoose.Schema({
  userId: { type: String, required: true, trim: true },
  roomId: { type: String, required: true, trim: true },
  hiddenAt: { type: Date, required: true },
}, { timestamps: true });

hiddenMeetingSchema.index({ userId: 1, roomId: 1 }, { unique: true });

export const HiddenMeeting = mongoose.model('HiddenMeeting', hiddenMeetingSchema);
