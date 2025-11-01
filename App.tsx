
import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { HashRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { ToastMessage } from './types';

import { PublicHomePage, AlbumDetailPage } from './pages/Public';
import { AdminLoginPage, AdminDashboardPage, AdminAlbumEditorPage } from './pages/Admin';
import { ToastContainer } from './components/ui';

// --- AUTH CONTEXT ---
interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
}
const AuthContext = createContext<AuthContextType>({ session: null, user: null, loading: true });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const value = { session, user, loading };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);

// --- TOAST CONTEXT ---
type ToastContextType = (message: string, type?: 'success' | 'error' | 'info') => void;
const ToastContext = createContext<ToastContextType>(() => {});

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now();
    setToasts(prevToasts => [...prevToasts, { id, message, type }]);
    setTimeout(() => {
      setToasts(currentToasts => currentToasts.filter(toast => toast.id !== id));
    }, 5000);
  }, []);
  
  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <ToastContainer toasts={toasts} />
    </ToastContext.Provider>
  );
};
export const useToast = () => useContext(ToastContext);


// --- PROTECTED ROUTE ---
const ProtectedRoute = () => {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-brand-blue-600"></div>
      </div>
    );
  }
  return session ? <Outlet /> : <Navigate to="/admin/login" />;
};


// --- APP COMPONENT ---
function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <HashRouter>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<PublicHomePage />} />
            <Route path="/gallery/:albumId" element={<AlbumDetailPage />} />
            
            {/* Admin Routes */}
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/admin" element={<AdminDashboardPage />} />
              <Route path="/admin/album/new" element={<AdminAlbumEditorPage />} />
              <Route path="/admin/album/:albumId" element={<AdminAlbumEditorPage />} />
            </Route>

            {/* Redirect any other path to home */}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </HashRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
