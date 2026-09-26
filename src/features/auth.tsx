import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { ArrowRight, ShieldCheck, MessageSquare } from "lucide-react";
import { supabase, api } from "../lib/api";
import { ErrorBox } from "../components/ui";
export function AuthPage() {
  const path = useLocation().pathname;
  const signup = path === "/signup";
  const forgot = path === "/forgot-password";
  const reset = path === "/reset-password";
  const [error, setError] = useState<unknown>();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email"));
    const password = String(f.get("password"));
    try {
      const result = signup
        ? await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: location.origin },
          })
        : forgot
          ? await supabase.auth.resetPasswordForEmail(email, {
              redirectTo: location.origin + "/reset-password",
            })
          : reset
            ? await supabase.auth.updateUser({ password })
            : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (signup || forgot)
        setNotice(
          signup
            ? "Check your email to verify your account, then sign in."
            : "Check your email for your password reset link.",
        );
      else nav("/");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <div className="auth-brand">
        <div className="brand">
          <span className="brand-mark">
            <MessageSquare />
          </span>
          <span>
            gramvista <b>SMS</b>
          </span>
        </div>
        <div>
          <span className="eyebrow">BUSINESS MESSAGING INFRASTRUCTURE</span>
          <h1>
            Every message.
            <br />A stronger connection.
          </h1>
          <p>
            Send, manage and track business messaging through one reliable
            Gramvista platform.
          </p>
          <div className="auth-trust">
            <ShieldCheck /> Your business. Your customers. One connected
            platform.
          </div>
        </div>
        <small>
          © {new Date().getFullYear()} GRAMVISTA EMPIRE GROUP LIMITED
        </small>
      </div>
      <div className="auth-content">
        <form className="auth-form" onSubmit={submit}>
          <span className="eyebrow">WELCOME TO GRAMVISTA SMS</span>
          <h1>
            {signup
              ? "Create your account"
              : forgot
                ? "Reset your password"
                : reset
                  ? "Set a new password"
                  : "Welcome back"}
          </h1>
          <p>Business messaging starts here.</p>
          <ErrorBox error={error} />
          {notice && <div className="notice">{notice}</div>}
          {!reset && (
            <label>
              Email address
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
              />
            </label>
          )}
          {!forgot && (
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete={
                  signup || reset ? "new-password" : "current-password"
                }
                placeholder="At least 8 characters"
              />
            </label>
          )}
          <button className="button" disabled={busy || !supabase}>
            {busy
              ? "Please wait…"
              : signup
                ? "Create account"
                : forgot
                  ? "Send reset link"
                  : reset
                    ? "Update password"
                    : "Sign in"}
            <ArrowRight size={17} />
          </button>
          {!supabase && (
            <div className="notice">
              Supabase is not configured.{" "}
              <Link to="/">Open the local mock workspace</Link>.
            </div>
          )}
          <div className="auth-links">
            <Link to={signup ? "/login" : "/signup"}>
              {signup ? "Already have an account? Sign in" : "Create account"}
            </Link>
            <Link to="/forgot-password">Forgot password?</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
export function Onboarding() {
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const client = useQueryClient();
  return (
    <div className="onboarding">
      <div className="brand dark">
        <span className="brand-mark">
          <MessageSquare />
        </span>
        <span>
          gramvista <b>SMS</b>
        </span>
      </div>
      <form
        className="panel onboarding-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api("onboard", {
              method: "POST",
              body: Object.fromEntries(new FormData(e.currentTarget)),
            });
            await client.invalidateQueries();
          } catch (err) {
            setError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        <span className="eyebrow">LET’S GET CONNECTED</span>
        <h1>Your business, on Gramvista.</h1>
        <p>
          Create your organization to manage messaging, contacts and SMS credits
          in one place.
        </p>
        {!supabase && (
          <div className="notice">
            Local demo · Messages are simulated. Your new wallet starts at 0
            SMS.
          </div>
        )}
        <ErrorBox error={error} />
        <div className="form-grid">
          <label>
            Business name
            <input
              name="name"
              required
              minLength={2}
              placeholder="Your business"
            />
          </label>
          <label>
            Legal name
            <input
              name="legal_name"
              required
              minLength={2}
              placeholder="Registered business name"
            />
          </label>
          <label>
            Business email
            <input
              name="email"
              type="email"
              required
              placeholder="hello@company.com"
            />
          </label>
          <label>
            Phone
            <input name="phone" required placeholder="+255712345678" />
          </label>
          <label>
            Country
            <select name="country">
              <option value="TZ">Tanzania</option>
              <option value="KE">Kenya</option>
              <option value="UG">Uganda</option>
              <option value="RW">Rwanda</option>
            </select>
          </label>
          <label>
            Business type
            <select name="business_type">
              <option>Retail & commerce</option>
              <option>Education</option>
              <option>Financial services</option>
              <option>Technology</option>
              <option>Other</option>
            </select>
          </label>
        </div>
        <button className="button" disabled={busy}>
          {busy ? "Creating…" : "Create workspace"}
          <ArrowRight size={17} />
        </button>
      </form>
      {!supabase && (
        <Link to="/platform">Open local platform administration</Link>
      )}
    </div>
  );
}
