import mongoose from 'mongoose';

const aiNoteSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  summary: {
    type: String,
    required: true,
  },
  decisions: [
    {
      type: String,
    }
  ],
  actionItems: [
    {
      id: String,
      task: String,
      assignee: String,
      priority: {
        type: String,
        enum: ['High', 'Medium', 'Low'],
        default: 'Medium',
      },
      isCompleted: {
        type: Boolean,
        default: false,
      },
    }
  ],
  openQuestions: [
    {
      type: String,
    }
  ],
  generatedAt: {
    type: Date,
    default: Date.now,
  },
});

export const AINote = mongoose.model('AINote', aiNoteSchema);
