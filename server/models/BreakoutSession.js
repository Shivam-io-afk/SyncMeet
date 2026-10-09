import mongoose from 'mongoose';

const breakoutSessionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  roomId: { type: String, required: true, index: true },
  status: { type: String, enum: ['active', 'ended'], default: 'active' },
  groups: [{
    id: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    participantIds: [{ type: String }],
  }],
  endsAt: { type: Date },
  createdBy: { type: String, default: 'guest' },
}, { timestamps: true });

export const BreakoutSession = mongoose.model('BreakoutSession', breakoutSessionSchema);
