import mongoose from 'mongoose';

const meetingPollSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  roomId: { type: String, required: true, index: true },
  question: { type: String, required: true, trim: true, maxlength: 300 },
  options: [{
    id: { type: String, required: true },
    text: { type: String, required: true, trim: true, maxlength: 120 },
    voters: [{ type: String }],
  }],
  allowMultiple: { type: Boolean, default: false },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  createdBy: { type: String, default: 'guest' },
}, { timestamps: true });

export const MeetingPoll = mongoose.model('MeetingPoll', meetingPollSchema);
