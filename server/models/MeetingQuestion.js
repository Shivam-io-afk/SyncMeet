import mongoose from 'mongoose';

const meetingQuestionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  roomId: { type: String, required: true, index: true },
  text: { type: String, required: true, trim: true, maxlength: 1000 },
  authorId: { type: String, required: true, maxlength: 120 },
  authorName: { type: String, required: true, maxlength: 120 },
  upvoterIds: [{ type: String, maxlength: 120 }],
  status: { type: String, enum: ['open', 'answered'], default: 'open' },
}, { timestamps: true });

export const MeetingQuestion = mongoose.model('MeetingQuestion', meetingQuestionSchema);
