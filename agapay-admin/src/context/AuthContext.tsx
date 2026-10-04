import {
  createContext,
  useState,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import type { User } from "../api/authService";

const AUTH_TOKEN_KEY = "authToken";
const REFRESH_TOKEN_KEY = "refreshToken";
const USER_KEY = "user";

// Use sessionStorage instead of localStorage to prevent auto-login in new tabs
// sessionStorage is isolated per tab/window, so each new tab starts fresh
const storage = sessionStorage;

const safelyParseUser = (value: string | null): User | null => {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as User;
  } catch (error) {
    console.warn("Failed to parse stored user", error);
    return null;
  }
};

// Shape of the context's value
interface AuthContextType {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  login: (token: string, userData: User, refreshToken?: string | null) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

// Context initial undefined value
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(() =>
    storage.getItem(AUTH_TOKEN_KEY)
  );
  const [refreshToken, setRefreshToken] = useState<string | null>(() =>
    storage.getItem(REFRESH_TOKEN_KEY)
  );
  const [user, setUser] = useState<User | null>(() =>
    safelyParseUser(storage.getItem(USER_KEY))
  );

  useEffect(() => {
    if (!token) {
      setUser(null);
      setRefreshToken(null);
      return;
    }

    if (!user) {
      setUser(safelyParseUser(storage.getItem(USER_KEY)));
    }

    if (!refreshToken) {
      setRefreshToken(storage.getItem(REFRESH_TOKEN_KEY));
    }
  }, [token, refreshToken, user]);

  const login = (
    newToken: string,
    userData: User,
    newRefreshToken: string | null = null
  ) => {
    storage.setItem(AUTH_TOKEN_KEY, newToken);
    storage.setItem(USER_KEY, JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);

    if (newRefreshToken) {
      storage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);
      setRefreshToken(newRefreshToken);
    }
  };

  const logout = () => {
    storage.removeItem(AUTH_TOKEN_KEY);
    storage.removeItem(REFRESH_TOKEN_KEY);
    storage.removeItem(USER_KEY);
    setToken(null);
    setRefreshToken(null);
    setUser(null);
  };

  const isAuthenticated = useMemo(() => Boolean(token && user), [token, user]);

  return (
    <AuthContext.Provider
      value={{ user, token, refreshToken, login, logout, isAuthenticated }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
