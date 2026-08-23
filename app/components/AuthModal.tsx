"use client";

import { useState, FormEvent, useEffect } from "react";
import {
  signIn,
  signUp,
  confirmSignUp,
  resetPassword,
  confirmResetPassword,
  resendSignUpCode,
} from "aws-amplify/auth";
import { useAuth } from "./AuthContext";
import { siteConfig } from "@/config/site";

function getAuthErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    switch (error.name) {
      case "UserAlreadyAuthenticatedException":
        return "You're already signed in.";
      case "UserNotFoundException":
      case "NotAuthorizedException":
        return "Incorrect email or password.";
      case "UsernameExistsException":
        return "An account with this email already exists.";
      case "InvalidPasswordException":
        return "Password must be at least 8 characters with uppercase, lowercase, number, and symbol.";
      case "CodeMismatchException":
        return "Invalid verification code. Please try again.";
      case "ExpiredCodeException":
        return "Verification code has expired. Please request a new one.";
      case "LimitExceededException":
        return "Too many attempts. Please try again later.";
      case "InvalidParameterException":
        return "Please check your input and try again.";
      default:
        return error.message || "Something went wrong. Please try again.";
    }
  }
  return "Something went wrong. Please try again.";
}

export default function AuthModal() {
  const {
    isModalOpen,
    authView,
    closeAuthModal,
    setAuthView,
    refreshUser,
  } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isModalOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isModalOpen) handleClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen]);

  if (!isModalOpen) return null;

  function resetForm() {
    setEmail("");
    setPassword("");
    setConfirmPw("");
    setCode("");
    setShowPassword(false);
    setStatus("idle");
    setErrorMsg("");
    setSuccessMsg("");
  }

  function handleClose() {
    closeAuthModal();
    setTimeout(resetForm, 200);
  }

  function switchView(view: typeof authView) {
    setStatus("idle");
    setErrorMsg("");
    setSuccessMsg("");
    setPassword("");
    setConfirmPw("");
    setCode("");
    setShowPassword(false);
    setAuthView(view);
  }

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");

    try {
      const result = await signIn({ username: email, password });

      if (result.nextStep.signInStep === "CONFIRM_SIGN_UP") {
        await resendSignUpCode({ username: email });
        switchView("confirmSignUp");
        return;
      }

      await refreshUser();
      handleClose();
    } catch (err) {
      setStatus("error");
      setErrorMsg(getAuthErrorMessage(err));
    }
  }

  async function handleSignUp(e: FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    if (password !== confirmPw) {
      setStatus("error");
      setErrorMsg("Passwords do not match.");
      return;
    }

    setStatus("submitting");

    try {
      await signUp({
        username: email,
        password,
        options: { userAttributes: { email } },
      });
      setStatus("idle");
      setAuthView("confirmSignUp");
    } catch (err) {
      setStatus("error");
      setErrorMsg(getAuthErrorMessage(err));
    }
  }

  async function handleConfirmSignUp(e: FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");

    try {
      await confirmSignUp({ username: email, confirmationCode: code });

      // Auto sign-in after confirmation
      await signIn({ username: email, password });
      await refreshUser();
      handleClose();
    } catch (err) {
      setStatus("error");
      setErrorMsg(getAuthErrorMessage(err));
    }
  }

  async function handleResendCode() {
    setErrorMsg("");
    try {
      await resendSignUpCode({ username: email });
      setSuccessMsg("Verification code resent. Check your email.");
    } catch (err) {
      setErrorMsg(getAuthErrorMessage(err));
    }
  }

  async function handleForgotPassword(e: FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");

    try {
      await resetPassword({ username: email });
      setStatus("idle");
      setAuthView("confirmResetPassword");
    } catch (err) {
      setStatus("error");
      setErrorMsg(getAuthErrorMessage(err));
    }
  }

  async function handleConfirmResetPassword(e: FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    if (password !== confirmPw) {
      setStatus("error");
      setErrorMsg("Passwords do not match.");
      return;
    }

    setStatus("submitting");

    try {
      await confirmResetPassword({
        username: email,
        confirmationCode: code,
        newPassword: password,
      });
      setPassword("");
      setConfirmPw("");
      setCode("");
      setStatus("idle");
      setSuccessMsg("Password reset! Sign in with your new password.");
      setAuthView("signIn");
    } catch (err) {
      setStatus("error");
      setErrorMsg(getAuthErrorMessage(err));
    }
  }

  const inputClass =
    "mt-1 w-full rounded-lg border border-foreground/15 px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring";

  const submitBtnClass =
    "w-full rounded-lg bg-primary px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-brand-dark/60 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="relative mx-4 w-full max-w-md rounded-2xl bg-background p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 text-foreground/40 transition-colors hover:text-foreground"
          aria-label="Close"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M15 5L5 15M5 5l10 10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {/* Sign In */}
        {authView === "signIn" && (
          <>
            <h3 className="font-serif text-2xl font-bold text-foreground">
              Sign in to {siteConfig.product.name}
            </h3>
            <p className="mt-1 text-sm text-foreground/60">
              Enter your email and password.
            </p>

            {successMsg && (
              <p className="mt-4 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
                {successMsg}
              </p>
            )}

            <form onSubmit={handleSignIn} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="auth-email"
                  className="block text-sm font-medium text-foreground/70"
                >
                  Email
                </label>
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="you@company.com"
                />
              </div>

              <div>
                <label
                  htmlFor="auth-password"
                  className="block text-sm font-medium text-foreground/70"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="auth-password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-foreground/40 hover:text-foreground/70"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              {status === "error" && (
                <p className="text-sm text-destructive">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={status === "submitting"}
                className={submitBtnClass}
              >
                {status === "submitting" ? "Signing in..." : "Sign in"}
              </button>

              <div className="space-y-2 text-center text-sm">
                <p className="text-foreground/50">
                  Don&apos;t have an account?{" "}
                  <button
                    type="button"
                    onClick={() => switchView("signUp")}
                    className="font-semibold text-primary hover:underline"
                  >
                    Sign up
                  </button>
                </p>
                <p>
                  <button
                    type="button"
                    onClick={() => switchView("forgotPassword")}
                    className="text-foreground/50 hover:text-foreground"
                  >
                    Forgot your password?
                  </button>
                </p>
              </div>
            </form>
          </>
        )}

        {/* Sign Up */}
        {authView === "signUp" && (
          <>
            <h3 className="font-serif text-2xl font-bold text-foreground">
              Create your account
            </h3>
            <p className="mt-1 text-sm text-foreground/60">
              Get started in a couple of minutes.
            </p>

            <form onSubmit={handleSignUp} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="signup-email"
                  className="block text-sm font-medium text-foreground/70"
                >
                  Email
                </label>
                <input
                  id="signup-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="you@company.com"
                />
              </div>

              <div>
                <label
                  htmlFor="signup-password"
                  className="block text-sm font-medium text-foreground/70"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="signup-password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-foreground/40 hover:text-foreground/70"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-foreground/50">
                  8+ characters with uppercase, lowercase, number, and symbol
                </p>
              </div>

              <div>
                <label
                  htmlFor="signup-confirm"
                  className="block text-sm font-medium text-foreground/70"
                >
                  Confirm password
                </label>
                <input
                  id="signup-confirm"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  className={inputClass}
                  placeholder="••••••••"
                />
              </div>

              {status === "error" && (
                <p className="text-sm text-destructive">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={status === "submitting"}
                className={submitBtnClass}
              >
                {status === "submitting"
                  ? "Creating account..."
                  : "Create account"}
              </button>

              <p className="text-center text-sm text-foreground/50">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchView("signIn")}
                  className="font-semibold text-primary hover:underline"
                >
                  Sign in
                </button>
              </p>
            </form>
          </>
        )}

        {/* Confirm Sign Up */}
        {authView === "confirmSignUp" && (
          <>
            <h3 className="font-serif text-2xl font-bold text-foreground">
              Check your email
            </h3>
            <p className="mt-1 text-sm text-foreground/60">
              We sent a verification code to{" "}
              <span className="font-medium text-foreground">{email}</span>
            </p>

            {successMsg && (
              <p className="mt-4 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
                {successMsg}
              </p>
            )}

            <form onSubmit={handleConfirmSignUp} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="confirm-code"
                  className="block text-sm font-medium text-foreground/70"
                >
                  Verification code
                </label>
                <input
                  id="confirm-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className={inputClass}
                  placeholder="123456"
                />
              </div>

              {status === "error" && (
                <p className="text-sm text-destructive">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={status === "submitting"}
                className={submitBtnClass}
              >
                {status === "submitting" ? "Verifying..." : "Verify email"}
              </button>

              <p className="text-center text-sm text-foreground/50">
                Didn&apos;t get a code?{" "}
                <button
                  type="button"
                  onClick={handleResendCode}
                  className="font-semibold text-primary hover:underline"
                >
                  Resend code
                </button>
              </p>
            </form>
          </>
        )}

        {/* Forgot Password */}
        {authView === "forgotPassword" && (
          <>
            <h3 className="font-serif text-2xl font-bold text-foreground">
              Reset your password
            </h3>
            <p className="mt-1 text-sm text-foreground/60">
              Enter your email and we&apos;ll send a reset code.
            </p>

            <form onSubmit={handleForgotPassword} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="forgot-email"
                  className="block text-sm font-medium text-foreground/70"
                >
                  Email
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="you@company.com"
                />
              </div>

              {status === "error" && (
                <p className="text-sm text-destructive">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={status === "submitting"}
                className={submitBtnClass}
              >
                {status === "submitting" ? "Sending..." : "Send reset code"}
              </button>

              <p className="text-center text-sm text-foreground/50">
                Back to{" "}
                <button
                  type="button"
                  onClick={() => switchView("signIn")}
                  className="font-semibold text-primary hover:underline"
                >
                  sign in
                </button>
              </p>
            </form>
          </>
        )}

        {/* Confirm Reset Password */}
        {authView === "confirmResetPassword" && (
          <>
            <h3 className="font-serif text-2xl font-bold text-foreground">
              Enter new password
            </h3>
            <p className="mt-1 text-sm text-foreground/60">
              We sent a reset code to{" "}
              <span className="font-medium text-foreground">{email}</span>
            </p>

            <form
              onSubmit={handleConfirmResetPassword}
              className="mt-6 space-y-4"
            >
              <div>
                <label
                  htmlFor="reset-code"
                  className="block text-sm font-medium text-foreground/70"
                >
                  Reset code
                </label>
                <input
                  id="reset-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className={inputClass}
                  placeholder="123456"
                />
              </div>

              <div>
                <label
                  htmlFor="reset-password"
                  className="block text-sm font-medium text-foreground/70"
                >
                  New password
                </label>
                <div className="relative">
                  <input
                    id="reset-password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-foreground/40 hover:text-foreground/70"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-foreground/50">
                  8+ characters with uppercase, lowercase, number, and symbol
                </p>
              </div>

              <div>
                <label
                  htmlFor="reset-confirm"
                  className="block text-sm font-medium text-foreground/70"
                >
                  Confirm new password
                </label>
                <input
                  id="reset-confirm"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  className={inputClass}
                  placeholder="••••••••"
                />
              </div>

              {status === "error" && (
                <p className="text-sm text-destructive">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={status === "submitting"}
                className={submitBtnClass}
              >
                {status === "submitting"
                  ? "Resetting..."
                  : "Reset password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
