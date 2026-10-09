import mongoose from 'mongoose';

const transcriptSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    index: true,
  },
  speaker: {
    type: String,
    required: true,
  },
  text: {
    type: String,
    required: true,
  },
  timestamp: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export const Transcript = mongoose.model('Transcript', transcriptSchema);
