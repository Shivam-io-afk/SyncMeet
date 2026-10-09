import mongoose from 'mongoose';

const meetingAgendaSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true, trim: true },
  agenda: [{
    id: { type: String, required: true },
    text: { type: String, required: true, trim: true, maxlength: 300 },
    isCompleted: { type: Boolean, default: false },
  }],
}, { timestamps: true });

export const MeetingAgenda = mongoose.model('MeetingAgenda', meetingAgendaSchema);
