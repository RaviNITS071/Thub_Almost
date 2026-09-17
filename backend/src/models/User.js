import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true, 
    trim: true,
    index: true 
  },
  passwordHash: { 
    type: String, 
    required: false 
  },
  name: { 
    type: String, 
    trim: true 
  },
  firstName: { 
    type: String, 
    trim: true 
  },
  lastName: { 
    type: String, 
    trim: true 
  },
  picture: { 
    type: String 
  },
  googleId: { 
    type: String, 
    sparse: true, 
    index: true 
  },
  providers: {
    google: { type: Boolean, default: false },
    emailOtp: { type: Boolean, default: false },
    password: { type: Boolean, default: false },
  },
  role: { 
    type: String, 
    enum: ['user', 'contractor', 'admin', 'owner'], 
    default: 'contractor' 
  },
  emailVerified: { 
    type: Boolean, 
    default: false 
  },
  lastLoginAt: { 
    type: Date 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  }
}, { timestamps: true });

// Auto-derive firstName and lastName if only name is supplied
userSchema.pre('save', function () {
  if (this.name && (!this.firstName || !this.lastName)) {
    const parts = this.name.trim().split(/\s+/);
    if (!this.firstName) this.firstName = parts[0] || '';
    if (!this.lastName) this.lastName = parts.slice(1).join(' ') || '';
  }
});

export default mongoose.model('User', userSchema);