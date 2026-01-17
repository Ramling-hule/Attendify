import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { UserPlus, Check, X, Shield, Edit2, Save, Loader2, RefreshCw, Trash2, ArrowLeft, AlertTriangle } from 'lucide-react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast'; // IMPORT TOAST
import { BASE_URL } from '../config';

const GroupDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  
  // ... (State variables remain the same)
  const [group, setGroup] = useState(null);
  const [students, setStudents] = useState([]);
  const [history, setHistory] = useState([]); 
  const [dates, setDates] = useState([]); 
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newStudentName, setNewStudentName] = useState("");
  const [error, setError] = useState(null);
  const [pendingChanges, setPendingChanges] = useState([]); 
  const [isRealtimeUpdate, setIsRealtimeUpdate] = useState(false);
  
  const API_URL = import.meta.env.VITE_API_URL || `${BASE_URL}/api`;
  const SOCKET_URL = `${BASE_URL}`;

  // 1. FETCH DATA (Same as before)
  const fetchData = useCallback(async (isBackground = false) => {
    try {
      if(!isBackground) setError(null);
      const headers = { Authorization: `Bearer ${token}` };
      const [groupRes, historyRes] = await Promise.all([
        axios.get(`${API_URL}/groups/${id}`, { headers }),
        axios.get(`${API_URL}/attendance/${id}/history`, { headers })
      ]);
      setGroup(groupRes.data.group);
      setStudents(groupRes.data.students);
      setHistory(historyRes.data);
      
      if(isBackground) {
          setIsRealtimeUpdate(true);
          setTimeout(() => setIsRealtimeUpdate(false), 2000);
      }
    } catch (err) {
      console.error(err);
      if(!isBackground) setError("Failed to load class data.");
    }
  }, [id, token, API_URL]);

  // 2. SOCKET CONNECTION (Same as before)
  useEffect(() => {
    fetchData(); 
    const socket = io(SOCKET_URL);
    socket.emit('join_group', id);
    socket.on('attendance_updated', () => { 
        if (!isSaving) fetchData(true); 
    });
    return () => socket.disconnect();
  }, [id, fetchData, isSaving]);

  // 3. DATE GENERATION (Same as before)
  useEffect(() => {
    if (!group) return;
    const dateArray = [];
    const startDate = group.createdAt ? new Date(group.createdAt) : new Date();
    if (!group.createdAt) startDate.setDate(startDate.getDate() - 30);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 1); 

    const current = new Date(startDate);
    while (current <= endDate) {
        const dateString = current.toLocaleDateString('en-CA'); 
        if (!dateArray.includes(dateString)) dateArray.push(dateString);
        current.setDate(current.getDate() + 1);
    }
    setDates(dateArray); 
  }, [group]);

  // 4. STATS (Same as before)
  const getStudentStats = (studentId) => {
    let present = 0;
    let totalMarked = 0;
    history.forEach(sheet => {
        const record = sheet.records.find(r => r.student === studentId);
        if (record && (record.status === 'Present' || record.status === 'Absent')) {
            totalMarked++;
            if (record.status === 'Present') present++;
        }
    });
    const percentage = totalMarked === 0 ? 0 : Math.round((present / totalMarked) * 100);
    return { percentage };
  };

  const handleLocalChange = (studentId, date, statusValue) => {
    const change = { date, studentId, status: statusValue };
    setPendingChanges(prev => [
        ...prev.filter(c => !(c.date === date && c.studentId === studentId)), 
        change
    ]);
  };

  const saveChanges = async () => {
    if (pendingChanges.length === 0) { setIsEditing(false); return; }
    setIsSaving(true);
    try {
        await axios.post(`${API_URL}/attendance/bulk`, {
            groupId: id,
            updates: pendingChanges
        }, { headers: { Authorization: `Bearer ${token}` } });
        
        setPendingChanges([]); 
        await fetchData(); 
        setIsEditing(false);
        toast.success("Attendance saved successfully!"); // <-- TOAST SUCCESS
    } catch (err) {
        toast.error("Failed to save changes"); // <-- TOAST ERROR
    } finally {
        setIsSaving(false);
    }
  };

  const cancelEdit = () => { setPendingChanges([]); setIsEditing(false); };

  const addStudent = async (e) => {
    e.preventDefault();
    if (!newStudentName.trim()) return;
    try {
        await axios.post(`${API_URL}/groups/${id}/add`, { name: newStudentName }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        setNewStudentName(""); 
        toast.success("Student added"); // <-- TOAST SUCCESS
    } catch (err) { 
        toast.error(err.response?.data?.error || "Failed to add student"); // <-- TOAST ERROR
    }
  }

  // --- REPLACED CONFIRM WITH CUSTOM TOAST ---
  const confirmDeleteStudent = (studentId) => {
    toast((t) => (
      <div className="flex flex-col gap-3 items-center min-w-[200px]">
        <div className="flex items-center gap-2 text-amber-500 font-bold">
            <AlertTriangle size={20} />
            <span>Remove Student?</span>
        </div>
        <p className="text-sm text-center text-gray-500">All attendance data will be lost.</p>
        <div className="flex gap-2 w-full">
          <button 
            onClick={() => { toast.dismiss(t.id); deleteStudentApi(studentId); }}
            className="flex-1 bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-red-700"
          >
            Delete
          </button>
          <button 
            onClick={() => toast.dismiss(t.id)}
            className="flex-1 bg-gray-200 dark:bg-slate-700 text-gray-800 dark:text-white px-3 py-1.5 rounded-lg text-sm font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    ), { duration: 5000, position: 'bottom-center' });
  };

  const deleteStudentApi = async (studentId) => {
    try {
        await axios.delete(`${API_URL}/groups/${id}/students/${studentId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        setStudents(prev => prev.filter(s => s._id !== studentId));
        toast.success("Student removed");
    } catch (err) {
        toast.error("Failed to remove student");
    }
  };

  const getStatus = (studentId, date) => {
    const pending = pendingChanges.find(c => c.date === date && c.studentId === studentId);
    if (pending) return pending.status;
    const sheet = history.find(h => h.date.split('T')[0] === date);
    const record = sheet?.records.find(r => r.student === studentId);
    return record ? record.status : null;
  };

  const getTodayString = () => new Date().toLocaleDateString('en-CA');
  const isToday = (dateString) => dateString === getTodayString();
  const isFuture = (dateString) => dateString > getTodayString();

  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;
  if (!group) return <div className="p-8 text-center dark:text-white">Loading...</div>;

  return (
    <div className="h-[calc(100vh-7rem)] flex flex-col gap-4">
       {/* Realtime Toast uses 'react-hot-toast' logic now, or we can keep this custom one */}
       {isRealtimeUpdate && (
         <div className="fixed top-20 right-8 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-in fade-in slide-in-from-top-2 flex items-center gap-2 pointer-events-none">
            <RefreshCw className="animate-spin" size={16} /> syncing...
         </div>
       )}

       {/* HEADER */}
       <div className="flex-none bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm relative">
         <div className="mb-4">
            <button onClick={() => navigate('/')} className="flex items-center gap-2 text-gray-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors text-sm font-medium">
                <ArrowLeft size={16} /> Back to Dashboard
            </button>
         </div>

         <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center">
            <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                    {group.name}
                    <span className="text-xs font-normal px-2 py-1 bg-blue-100 text-blue-700 rounded-full">{students.length} Students</span>
                </h1>
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-green-400 mt-2">
                    <Shield size={14} /> <span>Admins: {group.admins.map(a=>a.name).join(', ')}</span>
                </div>
            </div>

            <div className="flex gap-3 w-full md:w-auto items-center">
                {isEditing ? (
                    <>
                        <span className="text-sm text-gray-500 hidden md:inline animate-in fade-in">{pendingChanges.length} unsaved</span>
                        <button onClick={cancelEdit} className="text-gray-500 hover:text-gray-700 font-medium px-4">Cancel</button>
                        <button onClick={saveChanges} disabled={isSaving} className="flex items-center gap-2 px-6 py-2 rounded-lg font-medium bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-500/30 transition-all disabled:opacity-70">
                            {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} Save
                        </button>
                    </>
                ) : (
                    <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 px-6 py-2 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30 transition-all">
                        <Edit2 size={18} /> Edit Attendance
                    </button>
                )}
            </div>
         </div>
         
         {!isEditing && (
             <div className="mt-6 pt-6 border-t border-gray-100 dark:border-slate-800 flex justify-end">
                <form onSubmit={addStudent} className="flex gap-2 w-full md:w-auto">
                    <input type="text" placeholder="New Student Name..." className="pl-4 pr-4 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-white w-full md:w-64" value={newStudentName} onChange={e=>setNewStudentName(e.target.value)} />
                    <button className="bg-blue-700 dark:bg-blue-700 hover:bg-black text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
                        <UserPlus size={16} /> <span>Add</span>
                    </button>
                </form>
             </div>
         )}
       </div>
       
       {/* TABLE */}
       <div className="flex-1 overflow-hidden bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm flex flex-col">
         {isEditing && <div className="bg-amber-50 text-amber-800 text-xs p-2 text-center font-medium border-b border-amber-100 flex-none">Editing Mode Enabled</div>}
         
         <div className="flex-1 overflow-auto custom-scrollbar">
            <table className="w-full text-left border-collapse table-fixed">
                <thead className="sticky top-0 z-30">
                    <tr className="bg-gray-50/95 dark:bg-slate-800/95 border-b border-gray-200 dark:border-slate-700 backdrop-blur-sm shadow-sm">
                        <th className="p-3 font-semibold text-sm text-gray-600 dark:text-slate-300 w-[160px] min-w-[160px] sticky left-0 bg-gray-50 dark:bg-slate-800 z-40 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Student</th>
                        <th className="p-3 font-semibold text-sm text-gray-600 dark:text-slate-300 text-center w-[80px] min-w-[80px] sticky left-[160px] bg-gray-50 dark:bg-slate-800 z-40 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] border-r border-gray-200 dark:border-slate-700">%</th>
                        {dates.map((d) => (
                            <th key={d} className={`p-2 text-center w-[65px] min-w-[65px] border-l border-gray-200 dark:border-slate-700 ${isToday(d) ? "bg-blue-100/50 dark:bg-blue-900/30" : ""}`}>
                                <div className={`flex flex-col items-center ${isFuture(d) ? "opacity-30" : ""}`}>
                                    <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold whitespace-nowrap overflow-hidden">
                                        {isToday(d) ? "TODAY" : d.split('-').slice(1).join('/')}
                                    </span>
                                </div>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                    {students.map(s => {
                        const stats = getStudentStats(s._id);
                        return (
                        <tr key={s._id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors group h-12">
                            <td className="p-3 sticky left-0 bg-white dark:bg-slate-900 group-hover:bg-gray-50 dark:group-hover:bg-slate-800/50 z-20 border-r border-transparent group-hover:border-gray-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                <div className="flex justify-between items-center gap-2">
                                    <div className="truncate min-w-0"><div className="font-medium text-slate-900 dark:text-white text-sm truncate" title={s.name}>{s.name}</div></div>
                                    <button onClick={() => confirmDeleteStudent(s._id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-1 rounded transition-all" title="Remove Student">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </td>
                            <td className="p-3 sticky left-[160px] bg-white dark:bg-slate-900 group-hover:bg-gray-50 dark:group-hover:bg-slate-800/50 z-20 text-center shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] border-r border-gray-100 dark:border-slate-800">
                                <span className={`text-xs font-bold ${stats.percentage >= 75 ? 'text-emerald-600' : stats.percentage >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>{stats.percentage}%</span>
                            </td>
                            {dates.map(date => {
                                const status = getStatus(s._id, date); 
                                const isF = isFuture(date);
                                const isPending = pendingChanges.some(c => c.date === date && c.studentId === s._id);
                                return (
                                    <td key={date} className={`p-1 text-center border-l border-gray-200 dark:border-slate-700 w-[65px] ${isPending ? "bg-amber-50 dark:bg-amber-900/10" : ""}`}>
                                        {isF ? ( <div className="h-6 w-full bg-gray-50 dark:bg-slate-800/50 rounded-sm opacity-30"></div> ) : (
                                            <div className="flex justify-center items-center h-full">
                                                {!isEditing ? (
                                                    (status === 'Present' || status === 'Absent') ? (
                                                        <div className={`w-8 h-8 rounded-lg text-[10px] font-black flex items-center justify-center animate-in zoom-in duration-200 ${status === 'Present' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400'}`}>
                                                            {status === 'Present' ? 'P' : 'A'}
                                                        </div>
                                                    ) : <div className="w-8 h-8"></div> 
                                                ) : (
                                                    <div className="flex gap-0.5">
                                                        <button onClick={() => handleLocalChange(s._id, date, "Present")} className={`w-7 h-7 rounded flex items-center justify-center transition-all ${status === 'Present' ? 'bg-emerald-600 text-white shadow-sm scale-110' : 'bg-gray-100 dark:bg-slate-800 text-gray-300 hover:bg-emerald-100 hover:text-emerald-600'}`}><Check size={14} strokeWidth={3} /></button>
                                                        <button onClick={() => handleLocalChange(s._id, date, "Absent")} className={`w-7 h-7 rounded flex items-center justify-center transition-all ${status === 'Absent' ? 'bg-rose-600 text-white shadow-sm scale-110' : 'bg-gray-100 dark:bg-slate-800 text-gray-300 hover:bg-rose-100 hover:text-rose-600'}`}><X size={14} strokeWidth={3} /></button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                );
                            })}
                        </tr>
                    )})}
                </tbody>
            </table>
         </div>
       </div>
    </div>
  );
};
export default GroupDetails;