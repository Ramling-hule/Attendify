import mongoose from 'mongoose';

const GroupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  // Array of admins allows multiple teachers
  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], 
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

export default mongoose.model('Group', GroupSchema);