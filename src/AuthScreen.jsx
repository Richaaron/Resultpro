import React, { useState } from "react";

export default function AuthScreen({ authClient, notice, initialEmail = "", verificationRequired = false, onAuthenticated }) {
  const [mode, setMode] = useState("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [verifyingEmail, setVerifyingEmail] = useState(verificationRequired);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const hasInvitation = new URLSearchParams(window.location.hash.slice(1)).has("invite");

  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");
    try {
      const result = mode === "sign-up"
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
        : await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) throw new Error(result.error.message || "Authentication failed.");

      if (mode === "sign-up" && result.data?.user?.emailVerified !== true) {
        setVerifyingEmail(true);
        setMessage("Enter the verification code sent to your email before continuing.");
        return;
      }
      await onAuthenticated();
    } catch (requestError) {
      setError(requestError.message || "We couldn’t complete that request. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function verifyEmail(event) {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");
    try {
      const result = await authClient.emailOtp.verifyEmail({ email: email.trim(), otp: code.trim() });
      if (result.error) throw new Error(result.error.message || "That verification code could not be accepted.");
      const session = await authClient.getSession();
      if (session.data?.session?.user?.emailVerified) {
        await onAuthenticated();
      } else {
        setVerifyingEmail(false);
        setMode("sign-in");
        setPassword("");
        setMessage("Your email is verified. Sign in to continue.");
      }
    } catch (requestError) {
      setError(requestError.message || "We couldn’t verify that code. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function resendCode() {
    setPending(true);
    setError("");
    setMessage("");
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: email.trim(),
        type: "email-verification",
      });
      if (result.error) throw new Error(result.error.message || "Could not resend the verification code.");
      setMessage("A new verification code has been sent.");
    } catch (requestError) {
      setError(requestError.message || "Could not resend the verification code.");
    } finally {
      setPending(false);
    }
  }

  if (!authClient) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <a className="brand auth-brand" href="/" aria-label="Aster home"><span className="brand-mark">✳</span><span className="brand-name">aster<span>.</span></span></a>
          <h1>Authentication setup needed</h1>
          <p className="auth-description">Set VITE_NEON_AUTH_URL to your Neon Auth Base URL to continue.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <a className="brand auth-brand" href="/" aria-label="Aster home"><span className="brand-mark">✳</span><span className="brand-name">aster<span>.</span></span></a>
        {hasInvitation && <p className="auth-invitation">You’ve been invited to a school. Use the email address that received the invitation.</p>}
        <p className="auth-kicker">YOUR SCHOOL, IN FOCUS</p>
        <h1>{verifyingEmail ? "Verify your email" : mode === "sign-up" ? "Create your Aster account" : "Welcome back"}</h1>
        <p className="auth-description">
          {verifyingEmail
            ? `Enter the verification code sent to ${email}.`
            : mode === "sign-up"
              ? "Create your account to set up a school or accept an invitation."
              : "Sign in to continue to your school workspace."}
        </p>
        {notice && <p className="auth-message" role="status">{notice}</p>}
        {verifyingEmail ? (
          <form className="auth-form" onSubmit={verifyEmail}>
            <label className="field-label" htmlFor="verificationCode">Email verification code</label>
            <input className="text-input" id="verificationCode" autoComplete="one-time-code" inputMode="numeric" required value={code} onChange={(event) => setCode(event.target.value)} />
            <button className="button button-primary auth-submit" type="submit" disabled={pending}>{pending ? "Verifying…" : "Verify email"}</button>
            <button className="auth-text-button" type="button" onClick={resendCode} disabled={pending}>Resend code</button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            {mode === "sign-up" && <>
              <label className="field-label" htmlFor="authName">Your name</label>
              <input className="text-input" id="authName" autoComplete="name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
            </>}
            <label className="field-label" htmlFor="authEmail">Email address</label>
            <input className="text-input" id="authEmail" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            <label className="field-label" htmlFor="authPassword">Password</label>
            <input className="text-input" id="authPassword" type="password" autoComplete={mode === "sign-up" ? "new-password" : "current-password"} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
            <button className="button button-primary auth-submit" type="submit" disabled={pending}>{pending ? "Please wait…" : mode === "sign-up" ? "Create account" : "Sign in"}</button>
            <button className="auth-text-button" type="button" onClick={() => { setMode(mode === "sign-up" ? "sign-in" : "sign-up"); setError(""); setMessage(""); }}>{mode === "sign-up" ? "Already have an account? Sign in" : "New to Aster? Create an account"}</button>
          </form>
        )}
        {message && <p className="auth-message" role="status">{message}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <p className="privacy-note">Your school data is private to your verified account.</p>
      </section>
    </main>
  );
}
