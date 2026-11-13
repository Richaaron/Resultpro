import React, { useState } from "react";
import AsterLogoMark from "./AsterLogo.jsx";
import { pendingSchoolNameKey } from "./auth.js";

function AuthIllustration() {
  return (
    <aside className="auth-showcase" aria-label="Aster school results illustration">
      <a className="brand auth-showcase-brand" href="/" aria-label="Aster home">
        <AsterLogoMark /><span className="brand-name">aster<span>.</span></span>
      </a>
      <div className="auth-showcase-copy">
        <span className="auth-kicker">A CLEARER VIEW OF EVERY TERM</span>
        <h2>Every learner’s progress, thoughtfully in sync.</h2>
        <p>One calm place for school leaders, teachers, and students to move forward together.</p>
      </div>
      <div className="auth-art" aria-hidden="true">
        <div className="auth-art-glow" />
        <svg className="auth-art-image" viewBox="0 0 560 390" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M92 302C76 209 139 120 231 102C316 85 404 130 457 209C489 257 487 307 459 337H122C106 329 97 317 92 302Z" fill="#163D2C" />
          <circle cx="414" cy="93" r="44" fill="#D9B66E" fillOpacity=".15" />
          <circle cx="414" cy="93" r="27" fill="#D9B66E" fillOpacity=".2" />
          <path d="M58 321C70 288 74 266 68 239M66 281C48 272 38 257 36 238M69 269C83 257 89 241 88 224" stroke="#83B98B" strokeWidth="4" strokeLinecap="round" />
          <path d="M53 264C40 259 34 250 35 239C47 241 55 249 58 260M70 252C70 240 76 231 87 226C91 238 86 248 74 257" fill="#83B98B" />
          <rect x="142" y="106" width="270" height="191" rx="18" fill="#F6FAF4" />
          <rect x="142.75" y="106.75" width="268.5" height="189.5" rx="17.25" stroke="#DCE8DC" strokeWidth="1.5" />
          <rect x="166" y="127" width="34" height="34" rx="10" fill="#E4F0E4" />
          <path d="M177 144L182 149L191 138" stroke="#398158" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="211" y="131" width="103" height="8" rx="4" fill="#294533" />
          <rect x="211" y="146" width="69" height="6" rx="3" fill="#B2C4B3" />
          <rect x="166" y="177" width="222" height="1" fill="#E2EAE1" />
          <rect x="166" y="194" width="88" height="70" rx="11" fill="#EDF5EC" />
          <path d="M183 243L197 230L211 235L231 207" stroke="#43835A" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="231" cy="207" r="4" fill="#43835A" />
          <rect x="270" y="194" width="118" height="70" rx="11" fill="#F0F3EB" />
          <rect x="283" y="207" width="40" height="5" rx="2.5" fill="#96A997" />
          <rect x="283" y="222" width="83" height="5" rx="2.5" fill="#D3DDD1" />
          <rect x="283" y="237" width="66" height="5" rx="2.5" fill="#D3DDD1" />
          <rect x="320" y="205" width="47" height="38" rx="8" fill="#DCEBDD" />
          <path d="M331 231L339 222L347 226L357 214" stroke="#43835A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="191" y="286" width="158" height="13" rx="6.5" fill="#D9B66E" />
          <rect x="207" y="303" width="158" height="13" rx="6.5" fill="#6F9D76" />
          <rect x="223" y="320" width="158" height="13" rx="6.5" fill="#315E40" />
          <circle cx="430" cy="285" r="24" fill="#D9B66E" fillOpacity=".18" />
          <path d="M423 285L428 290L438 278" stroke="#E3C985" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M448 122L454 134L467 136L457 145L459 158L448 152L437 158L439 145L429 136L442 134L448 122Z" fill="#D9B66E" fillOpacity=".8" />
          <g className="auth-art-student-card">
            <rect x="55" y="188" width="132" height="91" rx="14" fill="#10251A" stroke="#477253" strokeWidth="1.5" />
            <circle cx="82" cy="220" r="15" fill="#D9A780" />
            <path d="M67 218C67 207 73 201 82 201C91 201 97 208 97 218C93 214 88 212 82 212C76 212 71 214 67 218Z" fill="#34251D" />
            <path d="M62 258C64 242 71 235 82 235C93 235 100 242 102 258" fill="#76A783" />
            <rect x="108" y="207" width="52" height="6" rx="3" fill="#DCEBDD" />
            <rect x="108" y="220" width="38" height="5" rx="2.5" fill="#8BA995" />
            <rect x="108" y="237" width="48" height="20" rx="7" fill="#244B33" />
            <text x="132" y="251" fill="#C5E7C8" fontFamily="Arial, sans-serif" fontSize="10" fontWeight="700" textAnchor="middle">A GRADE</text>
          </g>
          <g className="auth-art-term-card">
            <rect x="374" y="66" width="119" height="58" rx="13" fill="#10251A" stroke="#477253" strokeWidth="1.5" />
            <circle cx="394" cy="95" r="11" fill="#234B31" />
            <path d="M389 95L393 99L400 90" stroke="#A8D9AC" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <text x="412" y="91" fill="#DDECE0" fontFamily="Arial, sans-serif" fontSize="9" fontWeight="700">TERM RESULTS</text>
            <rect x="412" y="99" width="62" height="4" rx="2" fill="#294533" />
            <rect className="auth-art-progress" x="412" y="99" width="48" height="4" rx="2" fill="#83C78D" />
          </g>
        </svg>
        <div className="auth-art-caption"><span className="auth-art-status" /> Progress you can feel good about</div>
      </div>
      <div className="auth-showcase-footer">Made for the people who make school matter.</div>
    </aside>
  );
}

export default function AuthScreen({ authClient, notice, initialEmail = "", verificationRequired = false, onAuthenticated }) {
  const [mode, setMode] = useState("sign-in");
  const [name, setName] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [pendingSchoolSetup, setPendingSchoolSetup] = useState(false);
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
    const registeringSchool = mode === "sign-up" && !hasInvitation;
    if (registeringSchool && schoolName.trim().length < 2) {
      setError("Enter your school name to continue.");
      return;
    }
    setPending(true);
    setError("");
    setMessage("");
    try {
      let schoolNameSaved = true;
      const result = mode === "sign-up"
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
        : await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) throw new Error(result.error.message || "Authentication failed.");

      if (registeringSchool) setPendingSchoolSetup(true);
      if (registeringSchool && schoolName.trim()) {
        try {
          window.sessionStorage.setItem(pendingSchoolNameKey, schoolName.trim());
        } catch {
          schoolNameSaved = false;
        }
      }

      if (mode === "sign-up" && result.data?.user?.emailVerified !== true) {
        setVerifyingEmail(true);
        setMessage(`Enter the verification code sent to your email before continuing.${registeringSchool && !schoolNameSaved ? " Keep this page open so we can carry your school name into setup." : ""}`);
        return;
      }
      await onAuthenticated({ schoolName: pendingSchoolSetup || registeringSchool ? schoolName.trim() : "" });
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
        await onAuthenticated({ schoolName: pendingSchoolSetup && !hasInvitation ? schoolName.trim() : "" });
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
        <AuthIllustration />
        <section className="auth-card">
          <a className="brand auth-brand" href="/" aria-label="Aster home"><AsterLogoMark /><span className="brand-name">aster<span>.</span></span></a>
          <h1>Authentication setup needed</h1>
          <p className="auth-description">Set VITE_NEON_AUTH_URL to your Neon Auth Base URL to continue.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <AuthIllustration />
      <section className="auth-card">
        <a className="brand auth-brand" href="/" aria-label="Aster home"><AsterLogoMark /><span className="brand-name">aster<span>.</span></span></a>
        {hasInvitation && <p className="auth-invitation">You’ve been invited to a school. Use the email address that received the invitation.</p>}
        <p className="auth-kicker">YOUR SCHOOL, IN FOCUS</p>
        <h1>{verifyingEmail ? "Verify your email" : mode === "sign-up" ? "Create your Aster account" : "Welcome back"}</h1>
        <p className="auth-description">
          {verifyingEmail
            ? `Enter the verification code sent to ${email}.`
            : mode === "sign-up"
              ? hasInvitation
                ? "Create your account to accept your school invitation."
                : "Create your account and start setting up your school."
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
            {mode === "sign-up" && !hasInvitation && <>
              <label className="field-label" htmlFor="authSchoolName">School name</label>
              <input className="text-input" id="authSchoolName" autoComplete="organization" required minLength={2} maxLength={120} value={schoolName} onChange={(event) => setSchoolName(event.target.value)} placeholder="e.g. Harborview Academy" />
            </>}
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
