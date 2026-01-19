import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Plus, Users, ArrowRight, BookOpen, UserPlus, X, Loader2, Trash2, ShieldAlert, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast'; 
import { BASE_URL } from '../config';

const CACHE_KEY = 'dashboard_groups_data';
const CACHE_DURATION = 10 * 60 * 1000; // 5 Minutes

const Dashboard = () => {
  const [groups, setGroups] = useState([]);
  const [isGroupsLoading, setIsGroupsLoading] = useState(true);
  const [newGroupName, setNewGroupName] = useState("");
  
  // Modal State
  const [selectedGroup, setSelectedGroup] = useState(null); 
  const [adminEmail, setAdminEmail] = useState("");
  const [isAdminLoading, setIsAdminLoading] = useState(false);

  const { token, user } = useAuth();
  const API_URL = import.meta.env.VITE_API_URL || `${BASE_URL}/api`;

  const fetchGroups = async (forceRefresh = false) => {
    try {
      // 1. FAST RENDER: Check Cache first
      const cached = sessionStorage.getItem(CACHE_KEY);
      
      if (cached && !forceRefresh) {
        const { data, timestamp } = JSON.parse(cached);
        
        // Render cached data immediately
        setGroups(data);
        setIsGroupsLoading(false);

        // 2. REDUCE API CALLS: If cache is fresh (< 5 mins), stop here.
        if (Date.now() - timestamp < CACHE_DURATION) {
          return; 
        }
      }

      // 3. NETWORK FETCH: If no cache, expired, or forced, fetch from API
      // Note: This endpoint now returns 'studentCount' instead of the full 'students' array
      const res = await axios.get(`${API_URL}/groups`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setGroups(res.data);
      
      // Update Cache
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({
        data: res.data,
        timestamp: Date.now()
      }));
      
      // Update selected group if modal is currently open
      if (selectedGroup) {
        const updatedGroup = res.data.find(g => g._id === selectedGroup._id);
        if (updatedGroup) setSelectedGroup(updatedGroup);
      }

    } catch (err) {
      console.error(err);
      // Only show error toast if we have NO data to show
      if (groups.length === 0) toast.error("Failed to load groups");
    } finally {
      setIsGroupsLoading(false);
    }
  };

  const createGroup = async (e) => {
    e.preventDefault();
    if(!newGroupName) return;
    try {
      await axios.post(`${API_URL}/groups`, { name: newGroupName }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNewGroupName("");
      fetchGroups(true); // FORCE REFRESH: We need to see the new group immediately
      toast.success("Group created!");
    } catch (err) {
      toast.error("Failed to create group");
    }
  };

  const handleAddAdmin = async (e) => {
    e.preventDefault();
    if(!adminEmail) return;
    setIsAdminLoading(true);

    try {
      await axios.post(`${API_URL}/groups/${selectedGroup._id}/admins`, { email: adminEmail }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAdminEmail("");
      fetchGroups(true); // FORCE REFRESH: To update the admin list in UI
      toast.success("Admin added successfully");
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to add admin");
    } finally {
      setIsAdminLoading(false);
    }
  };

  const removeAdminApi = async (adminId) => {
    try {
        await axios.delete(`${API_URL}/groups/${selectedGroup._id}/admins/${adminId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        fetchGroups(true); // FORCE REFRESH: To remove admin from UI
        toast.success("Admin removed");
    } catch (err) {
        toast.error(err.response?.data?.error || "Failed to remove admin");
    }
  };

  // --- CUSTOM TOAST CONFIRMATION ---
  const confirmRemoveAdmin = (adminId) => {
    toast((t) => (
      <div className="flex flex-col gap-3 items-center min-w-[200px]">
        <div className="flex items-center gap-2 text-amber-500 font-bold">
            <AlertTriangle size={20} />
            <span>Remove Admin?</span>
        </div>
        <p className="text-sm text-center text-gray-500">They will lose access immediately.</p>
        <div className="flex gap-2 w-full">
          <button 
            onClick={() => { toast.dismiss(t.id); removeAdminApi(adminId); }}
            className="flex-1 bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-red-700"
          >
            Remove
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

  // Run on mount
  useEffect(() => { 
    fetchGroups(); 
  }, []);

  return (
    <div className="relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Let's</h1>
          <p className="text-gray-500 dark:text-slate-400 mt-1">Manage your classes and students</p>
        </div>
        
        <form onSubmit={createGroup} className="flex w-full md:w-auto gap-2">
          <input className="w-full md:w-64 px-4 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="New class name..." value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} />
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
            <Plus size={20} /> <span className="hidden sm:inline">Create</span>
          </button>
        </form>
      </div>

      {/* --- MAIN CONTENT AREA --- */}
      {isGroupsLoading ? (
        // LOADING STATE
        <div className="flex flex-col items-center justify-center h-64 text-gray-400">
           <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
           <p>Loading your classes...</p>
        </div>
      ) : groups.length === 0 ? (
        // EMPTY STATE
        <div className="flex flex-col items-center justify-center h-64 text-gray-400 border-2 border-dashed border-gray-200 dark:border-slate-800 rounded-2xl">
            <BookOpen size={48} className="mb-4 opacity-20" />
            <p>No classes found. Create one to get started!</p>
        </div>
      ) : (
        // DATA GRID
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {groups.map(g => (
            <div key={g._id} className="group relative bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-6 hover:shadow-lg hover:border-blue-500/30 dark:hover:border-blue-500/30 transition-all duration-300 flex flex-col">
                <Link to={`/group/${g._id}`} className="flex-1">
                    <div className="flex justify-between items-start mb-4">
                    <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-xl"><BookOpen className="text-blue-600 dark:text-blue-400" size={24} /></div>
                    <span className="bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 text-xs px-2 py-1 rounded-full font-medium">Active</span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 group-hover:text-blue-600 transition-colors">{g.name}</h3>
                    
                    {/* UPDATED LINE: Uses studentCount from backend aggregation */}
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400 mb-6">
                        <Users size={16} />
                        <span>{g.studentCount || 0} Students</span>
                        <span className="text-xs text-gray-400">• {g.admins?.length || 1} Admins</span>
                    </div>
                </Link>
                <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-slate-800">
                    <Link to={`/group/${g._id}`} className="flex items-center text-blue-600 dark:text-blue-400 text-sm font-medium gap-1 hover:gap-2 transition-all">View Details <ArrowRight size={16} /></Link>
                    <button onClick={(e) => { e.preventDefault(); setSelectedGroup(g); }} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Manage Admins"><UserPlus size={18} /></button>
                </div>
            </div>
            ))}
        </div>
      )}

      {selectedGroup && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-6 shadow-2xl border border-gray-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">Manage Admins</h3>
                    <button onClick={() => setSelectedGroup(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={24} /></button>
                </div>
                
                <div className="mb-6 space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Current Admins</h4>
                    {selectedGroup.admins?.map(admin => {
                        const isMe = admin._id === user?.id; 
                        return (
                            <div key={admin._id} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-100 dark:border-slate-700">
                                <div className="text-sm">
                                    <div className="font-medium text-slate-900 dark:text-white flex items-center gap-2">{admin.name} {isMe && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 rounded">You</span>}</div>
                                    {/* <div className="text-xs text-gray-500 dark:text-slate-400">{admin.email}</div> */}
                                </div>
                                {isMe ? (
                                    <ShieldAlert size={16} className="text-gray-300" title="You cannot remove yourself" />
                                ) : (
                                    <button onClick={() => confirmRemoveAdmin(admin._id)} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg transition-colors" title="Remove this admin"><Trash2 size={16} /></button>
                                )}
                            </div>
                        );
                    })}
                </div>

                <form onSubmit={handleAddAdmin} className="pt-4 border-t border-gray-100 dark:border-slate-800">
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Add New Admin</label>
                    <div className="flex gap-2">
                        <input type="email" required placeholder="Email" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
                        <button type="submit" disabled={isAdminLoading} className="px-2 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm flex items-center gap-1 disabled:opacity-70">
                            {isAdminLoading ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />} Add
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};
export default Dashboard;
