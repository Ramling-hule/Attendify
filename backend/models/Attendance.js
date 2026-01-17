import mongoose from 'mongoose';

const AttendanceSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  date: { type: Date, required: true },
  records: [{
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['Present', 'Absent'], default: 'Present' }
  }]
}, { timestamps: true });

// Ensure we don't have duplicate sheets for the same day
AttendanceSchema.index({ group: 1, date: 1 }, { unique: true });

export default mongoose.model('Attendance', AttendanceSchema);