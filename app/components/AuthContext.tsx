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
import { Hub } from "aws-amplify/utils";
import {
  AUTH_CHECK_UNAVAILABLE_CLAIM,
  MFA_SETUP_CLAIM,
  policyErrorMessage,
  signInMethodFor,
  type SignInMethod,
} from "@/lib/auth-policy";

type AuthUser = {
  email: string;
  userId: string;
  groups: string[];
  /** The organization requires two-step sign-in and this user has not set
   *  it up: the token carries no groups until they do (see
   *  amplify/auth/pre-token-generation). */
  mfaSetupRequired: boolean;
  /** The trigger could not read the sign-in policy, so this token carries
   *  no groups; a token refresh checks again. */
  authCheckUnavailable: boolean;
  /** "password", "google", "microsoft", ... (lib/auth-policy). */
  signInMethod: SignInMethod;
};

type AuthView =
  | "signIn"
  | "confirmTotp"
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
  /** Re-read the session; `forceRefresh` fetches new tokens (e.g. after a
   *  server-side group change) instead of using cached ones. */
  refreshUser: (opts?: { forceRefresh?: boolean }) => Promise<void>;
  handleSignOut: () => Promise<void>;
  /** Why the last Google / Microsoft sign-in failed, for the modal. */
  redirectError: string | null;
  clearRedirectError: () => void;
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
  redirectError: null,
  clearRedirectError: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [authView, setAuthView] = useState<AuthView>("signIn");
  const [redirectError, setRedirectError] = useState<string | null>(null);

  const refreshUser = useCallback(async (opts?: { forceRefresh?: boolean }) => {
    try {
      const currentUser = await getCurrentUser();
      const attributes = await fetchUserAttributes();
      const session = await fetchAuthSession({
        forceRefresh: opts?.forceRefresh ?? false,
      });
      const idPayload = session.tokens?.idToken?.payload;
      const groups = (idPayload?.["cognito:groups"] as string[]) ?? [];

      setUser({
        email: attributes.email ?? "",
        userId: currentUser.userId,
        groups,
        mfaSetupRequired: idPayload?.[MFA_SETUP_CLAIM] === "true",
        authCheckUnavailable: idPayload?.[AUTH_CHECK_UNAVAILABLE_CLAIM] === "true",
        signInMethod: signInMethodFor(
          currentUser.username,
          idPayload?.identities ? JSON.stringify(idPayload.identities) : null
        ),
      });
    } catch {
      setUser(null);
    }
  }, []);

  // Initial session load. The state writes happen after the Amplify calls
  // resolve, never synchronously inside the effect, and a stale result is
  // dropped if the provider unmounts first.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refreshUser();
      if (!cancelled) setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshUser]);

  // Federated sign-in finishes after a redirect back to the app: load the
  // user when it succeeds, and show the reason in the sign-in modal when the
  // provider or the organization's policy refused it.
  useEffect(() => {
    return Hub.listen("auth", ({ payload }) => {
      if (payload.event === "signInWithRedirect") {
        void refreshUser();
      } else if (payload.event === "signInWithRedirect_failure") {
        const raw = (payload.data as { error?: { message?: string } } | undefined)?.error?.message;
        let decoded = raw ?? "";
        try {
          decoded = decodeURIComponent(decoded);
        } catch {
          // keep the raw text
        }
        setRedirectError(
          policyErrorMessage(decoded) ?? "That sign-in did not complete. Try again or use another method."
        );
        setAuthView("signIn");
        setIsModalOpen(true);
      }
    });
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
        redirectError,
        clearRedirectError: () => setRedirectError(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
