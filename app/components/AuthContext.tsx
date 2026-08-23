"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import {
  getCurrentUser,
  fetchUserAttributes,
  fetchAuthSession,
  signOut,
} from "aws-amplify/auth";

type AuthUser = {
  email: string;
  userId: string;
  groups: string[];
};

type AuthView =
  | "signIn"
  | "signUp"
  | "confirmSignUp"
  | "forgotPassword"
  | "confirmResetPassword";

type AuthContextType = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isModalOpen: boolean;
  authView: AuthView;
  openAuthModal: (view?: AuthView) => void;
  closeAuthModal: () => void;
  setAuthView: (view: AuthView) => void;
  refreshUser: () => Promise<void>;
  handleSignOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isModalOpen: false,
  authView: "signIn",
  openAuthModal: () => {},
  closeAuthModal: () => {},
  setAuthView: () => {},
  refreshUser: async () => {},
  handleSignOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [authView, setAuthView] = useState<AuthView>("signIn");

  const refreshUser = useCallback(async () => {
    try {
      const currentUser = await getCurrentUser();
      const attributes = await fetchUserAttributes();
      const session = await fetchAuthSession();
      const groups =
        (session.tokens?.idToken?.payload["cognito:groups"] as string[]) ?? [];

      setUser({
        email: attributes.email ?? "",
        userId: currentUser.userId,
        groups,
      });
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setIsLoading(false));
  }, [refreshUser]);

  const handleSignOut = async () => {
    await signOut();
    setUser(null);
  };

  const openAuthModal = (view: AuthView = "signIn") => {
    setAuthView(view);
    setIsModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsModalOpen(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        isModalOpen,
        authView,
        openAuthModal,
        closeAuthModal,
        setAuthView,
        refreshUser,
        handleSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
