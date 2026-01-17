import { useEffect } from 'react';
import { useUser, useAuth } from '@clerk/clerk-react';
import axios from 'axios';

const AuthSync = () => {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const API_URL = import.meta.env.VITE_API_URL || `${process.env.BASE_URL}/api`;

  useEffect(() => {
    const sync = async () => {
      if (isLoaded && user) {
        try {
          const token = await getToken();
          await axios.post(`${API_URL}/users/sync`, {
            name: user.fullName,
            email: user.primaryEmailAddress?.emailAddress,
            clerkId: user.id,
            image: user.imageUrl
          }, {
            headers: { Authorization: `Bearer ${token}` }
          });
        } catch (error) {
          console.error("Sync failed:", error);
        }
      }
    };
    sync();
  }, [isLoaded, user]);

  return null;
};
export default AuthSync;