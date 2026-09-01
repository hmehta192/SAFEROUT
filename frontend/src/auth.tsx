import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { storage } from "@/src/utils/storage";
import { api, TOKEN_KEY } from "@/src/api";

type User = {
  id: string;
  role: "admin" | "driver" | "parent";
  name: string;
  phone: string;
  vehicle_number?: string;
  vehicle_label?: string;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  verifyOtp: (phone: string, otp: string) => Promise<User>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({} as AuthState);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const bootstrap = useCallback(async () => {
    try {
      const token = await storage.secureGet(TOKEN_KEY, "");
      if (token) {
        const me = await api.me();
        setUser(me);
      }
    } catch {
      await storage.secureRemove(TOKEN_KEY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const verifyOtp = useCallback(async (phone: string, otp: string) => {
    const res = await api.verifyOtp(phone, otp);
    await storage.secureSet(TOKEN_KEY, res.token);
    setUser(res.user);
    return res.user as User;
  }, []);

  const logout = useCallback(async () => {
    await storage.secureRemove(TOKEN_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, verifyOtp, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
