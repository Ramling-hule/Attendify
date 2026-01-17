import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { requireAuth } from './middleware/auth.js';
import { register, login } from './controllers/authController.js';
import Group from './models/Group.js';
import Attendance from './models/Attendance.js';
import User from './models/User.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- SOCKET ---
io.on('connection', (socket) => {
  socket.on('join_group', (groupId) => {
    socket.join(groupId);
  });
});

// --- AUTH ---
app.post('/api/auth/register', register);
app.post('/api/auth/login', login);

// --- GROUPS ---
app.post('/api/groups', requireAuth, async (req, res) => {
  try {
    const group = await Group.create({
      name: req.body.name,
      admins: [req.user.id],
      students: []
    });
    res.json(group);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/groups', requireAuth, async (req, res) => {
  try {
    const groups = await Group.find({
      $or: [{ admins: req.user.id }, { students: req.user.id }]
    }).populate('admins', 'name email');
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET GROUP & STATS (UPDATED FOR STRING STATUS)
app.get('/api/groups/:id', requireAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid Group ID" });

    const group = await Group.findById(req.params.id)
      .populate('students', 'name email')
      .populate('admins', 'name');

    if (!group) return res.status(404).json({ error: "Group not found" });

    const allAttendance = await Attendance.find({ group: group._id });
    
    const statsMap = {};
    allAttendance.forEach(sheet => {
        sheet.records.forEach(record => {
            if (!statsMap[record.student]) statsMap[record.student] = { present: 0, total: 0 };
            
            // CHECK FOR STRING 'Present' / 'Absent'
            if (record.status === 'Present' || record.status === 'Absent') {
                statsMap[record.student].total += 1;
                if (record.status === 'Present') {
                    statsMap[record.student].present += 1;
                }
            }
        });
    });

    const studentsWithStats = group.students.map(student => {
      const stat = statsMap[student._id.toString()] || { present: 0, total: 0 };
      const percentage = stat.total === 0 ? 0 : Math.round((stat.present / stat.total) * 100);
      return { ...student.toObject(), percentage };
    });

    res.json({ group, students: studentsWithStats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ADD STUDENT
app.post('/api/groups/:id/add', requireAuth, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: "Name is required" });

        const tempEmail = `student_${Date.now()}_${Math.floor(Math.random() * 10000)}@placeholder.com`;
        const newStudent = await User.create({ name, email: tempEmail, password: "placeholder_pass_123" });

        await Group.findByIdAndUpdate(req.params.id, { $addToSet: { students: newStudent._id } });
        
        io.to(req.params.id).emit('attendance_updated');
        res.json({ message: "Student added", student: newStudent });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- ATTENDANCE ---

app.get('/api/attendance/:groupId/history', requireAuth, async (req, res) => {
    const sheets = await Attendance.find({ group: req.params.groupId }).sort({ date: -1 });
    res.json(sheets);
});

// BULK SAVE (UPDATED FOR STRING STATUS & TIMEZONE FIX)
app.post('/api/attendance/bulk', requireAuth, async (req, res) => {
  const { groupId, updates } = req.body; 

  try {
    const updatesByDate = {};
    
    // Group by Date String (YYYY-MM-DD)
    updates.forEach(update => {
        const dateKey = update.date.split('T')[0]; 
        if (!updatesByDate[dateKey]) updatesByDate[dateKey] = [];
        updatesByDate[dateKey].push(update);
    });

    for (const [dateKey, dayUpdates] of Object.entries(updatesByDate)) {
        // Create Date from string (Forces UTC Midnight)
        const normalizedDate = new Date(dateKey);

        let sheet = await Attendance.findOne({ group: groupId, date: normalizedDate });
        
        if (!sheet) {
            sheet = new Attendance({ 
                group: groupId, 
                date: normalizedDate, 
                records: [] 
            });
        }

        dayUpdates.forEach(({ studentId, status }) => {
            // Ensure we save Strings 'Present' or 'Absent'
            // Handle cases where frontend might accidentally send 1/0 or booleans
            let statusStr = 'Absent';
            if (status === 'Present' || status === 1 || status === true) statusStr = 'Present';
            
            const idx = sheet.records.findIndex(r => r.student.toString() === studentId);
            
            if (idx > -1) {
                sheet.records[idx].status = statusStr;
            } else {
                sheet.records.push({ student: studentId, status: statusStr });
            }
        });

        sheet.markModified('records');
        await sheet.save();
    }

    io.to(groupId).emit('attendance_updated');
    res.json({ message: "Attendance saved" });
  } catch (error) {
    console.error("Bulk Save Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// server/index.js

// ... existing routes ...

// REMOVE ADMIN FROM GROUP
app.delete('/api/groups/:id/admins/:userId', requireAuth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ error: "Group not found" });

    // Security: Only existing admins can remove other admins
    if (!group.admins.includes(req.user.id)) {
      return res.status(403).json({ error: "Not authorized to remove admins" });
    }

    // Prevent removing the last admin (optional safety check)
    if (group.admins.length <= 1) {
        return res.status(400).json({ error: "Cannot remove the last admin" });
    }

    await Group.findByIdAndUpdate(req.params.id, { 
      $pull: { admins: req.params.userId } 
    });

    res.json({ message: "Admin removed successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// REMOVE STUDENT FROM GROUP
app.delete('/api/groups/:id/students/:studentId', requireAuth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ error: "Group not found" });

    if (!group.admins.includes(req.user.id)) {
      return res.status(403).json({ error: "Not authorized to remove students" });
    }

    // Remove student from the group array
    await Group.findByIdAndUpdate(req.params.id, { 
      $pull: { students: req.params.studentId } 
    });

    // Optional: Delete their attendance records for this group?
    // Usually better to keep history, but if you want a clean wipe:
    // await Attendance.updateMany({ group: req.params.id }, { $pull: { records: { student: req.params.studentId } } });

    // Emit socket event so UI updates for everyone
    io.to(req.params.id).emit('attendance_updated');

    res.json({ message: "Student removed successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ... app.listen ...

// ADD ADMIN
app.post('/api/groups/:id/admins', requireAuth, async (req, res) => {
  try {
    const { email } = req.body;
    const group = await Group.findById(req.params.id);
    if (!group.admins.includes(req.user.id)) return res.status(403).json({ error: "Not authorized" });
    const userToAdd = await User.findOne({ email });
    if (!userToAdd) return res.status(404).json({ error: "User not found" });
    await Group.findByIdAndUpdate(req.params.id, { $addToSet: { admins: userToAdd._id } });
    res.json({ message: "Admin added" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGO_URI)
  .then(() => httpServer.listen(PORT, () => console.log(`Server running on ${PORT}`)))
  .catch(err => console.log(err));