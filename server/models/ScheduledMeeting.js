import mongoose from 'mongoose';

const scheduledMeetingSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true, trim: true },
  title: { type: String, required: true, trim: true, maxlength: 150 },
  startsAt: { type: Date, required: true, index: true },
  timeZone: { type: String, required: true, trim: true, maxlength: 100 },
  durationMinutes: { type: Number, required: true, min: 5, max: 480 },
  templateId: { type: String, default: 'general', trim: true },
  agenda: [{
    id: { type: String, required: true },
    text: { type: String, required: true, trim: true, maxlength: 300 },
    isCompleted: { type: Boolean, default: false },
  }],
  invitees: [{ type: String, trim: true, maxlength: 254 }],
  status: { type: String, enum: ['scheduled', 'cancelled', 'ended'], default: 'scheduled' },
  createdBy: { type: String, default: 'guest', index: true },
}, { timestamps: true });

export const ScheduledMeeting = mongoose.model('ScheduledMeeting', scheduledMeetingSchema);
