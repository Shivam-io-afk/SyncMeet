import mongoose from 'mongoose';

const authSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  refreshTokenHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  revokedAt: { type: Date, default: null },
  replacedByHash: { type: String, default: null, select: false },
}, { timestamps: true });

authSessionSchema.index({ userId: 1, sessionId: 1, revokedAt: 1 });

export const AuthSession = mongoose.model('AuthSession', authSessionSchema);
