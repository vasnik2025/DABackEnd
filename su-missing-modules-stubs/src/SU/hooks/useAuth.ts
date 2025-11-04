import { createContext, useContext } from 'react';

type AuthUser = {
  id: number | string;
  username?: string;
  email?: string;
} | null;

const AuthContext = createContext<{ user: AuthUser } | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    return { user: null };
  }
  return ctx;
}
