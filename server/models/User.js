import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true,
  },
  password: {
    type: String,
    required: true,
    select: false,
  },
  avatar: {
    type: String,
    default: '',
  },
  title: {
    type: String,
    default: '',
    trim: true,
  },
  avatarColor: {
    type: String,
    default: '',
    trim: true,
  },
  role: {
    type: String,
    enum: ['host', 'participant', 'admin'],
    default: 'participant',
  },
  preferences: {
    theme: { type: String, default: 'emerald' },
    defaultMicMuted: { type: Boolean, default: false },
    defaultCameraOff: { type: Boolean, default: false },
    enableCaptions: { type: Boolean, default: true },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Hash password before saving
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare entered password with hashed password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

export const User = mongoose.model('User', userSchema);
