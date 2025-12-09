import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UserRole = 'ADMIN' | 'EXPERT' | 'TRP' | 'ENGINEER';

export interface User {
  id: string;
  login: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  logout: () => void;
  
  // Role checks
  isAdmin: () => boolean;
  isExpert: () => boolean;
  isTrp: () => boolean;
  isEngineer: () => boolean;
  canPlan: () => boolean;  // ADMIN or EXPERT
  canCreateWorks: () => boolean;  // ADMIN, EXPERT, TRP
  canManageUsers: () => boolean;  // ADMIN only
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      
      setUser: (user) => set({ 
        user, 
        isAuthenticated: !!user,
        isLoading: false,
        error: null,
      }),
      
      setLoading: (isLoading) => set({ isLoading }),
      
      setError: (error) => set({ error, isLoading: false }),
      
      logout: () => set({ 
        user: null, 
        isAuthenticated: false, 
        isLoading: false,
        error: null,
      }),
      
      // Role checks
      isAdmin: () => get().user?.role === 'ADMIN',
      isExpert: () => get().user?.role === 'EXPERT',
      isTrp: () => get().user?.role === 'TRP',
      isEngineer: () => get().user?.role === 'ENGINEER',
      
      canPlan: () => {
        const role = get().user?.role;
        return role === 'ADMIN' || role === 'EXPERT';
      },
      
      canCreateWorks: () => {
        const role = get().user?.role;
        return role === 'ADMIN' || role === 'EXPERT' || role === 'TRP';
      },
      
      canManageUsers: () => get().user?.role === 'ADMIN',
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ 
        // Не сохраняем user в localStorage - получаем с сервера
        // Сохраняем только флаг что был залогинен
        isAuthenticated: state.isAuthenticated 
      }),
    }
  )
);

// Роли для отображения
export const roleLabels: Record<UserRole, string> = {
  ADMIN: 'Администратор',
  EXPERT: 'Эксперт',
  TRP: 'Заказчик (ТРП)',
  ENGINEER: 'Инженер',
};

export const roleColors: Record<UserRole, string> = {
  ADMIN: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  EXPERT: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  TRP: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  ENGINEER: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
};
