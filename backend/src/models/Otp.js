import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  otpHash: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 }, // Automatic TTL cleanup by MongoDB
  },
  attempts: {
    type: Number,
    default: 0,
    max: 5,
  },
}, { timestamps: true });

export default mongoose.model('Otp', otpSchema);
