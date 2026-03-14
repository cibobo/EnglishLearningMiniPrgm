import { create } from 'zustand';
import api from '../lib/api';

interface User { id: string; name: string; username: string; }
interface AuthState {
  user: User | null;
  isLoggedIn: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  init: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoggedIn: !!localStorage.getItem('access_token'),

  init() {
    const raw = localStorage.getItem('teacher_info');
    if (raw) set({ user: JSON.parse(raw), isLoggedIn: true });
  },

  async login(username, password) {
    const { data } = await api.post('/auth/teacher-login', { username, password });
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    localStorage.setItem('teacher_info', JSON.stringify(data.user));
    set({ user: data.user, isLoggedIn: true });
  },

  logout() {
    localStorage.clear();
    set({ user: null, isLoggedIn: false });
    window.location.href = '/login';
  },
}));
