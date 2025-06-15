import React from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { useStore } from "nanostores/react";
import {
  emailAtom,
  passwordAtom,
  confirmPasswordAtom,
  agreedAtom,
  captchaTokenAtom,
  errorAtom,
  successAtom,
  loadingAtom,
} from "./registerstate";

// Import your Supabase client
// import { supabase } from "../../../supabaseClient"; // Adjust path as needed

const HCAPTCHA_SITE_KEY = "your-hcaptcha-site-key"; // TODO: Replace with your real site key

export const Register = () => {
  const email = useStore(emailAtom);
  const password = useStore(passwordAtom);
  const confirmPassword = useStore(confirmPasswordAtom);
  const agreed = useStore(agreedAtom);
  const captchaToken = useStore(captchaTokenAtom);
  const error = useStore(errorAtom);
  const success = useStore(successAtom);
  const loading = useStore(loadingAtom);

  const setEmail = (v: string) => emailAtom.set(v);
  const setPassword = (v: string) => passwordAtom.set(v);
  const setConfirmPassword = (v: string) => confirmPasswordAtom.set(v);
  const setAgreed = (v: boolean) => agreedAtom.set(v);
  const setCaptchaToken = (v: string | null) => captchaTokenAtom.set(v);
  const setError = (v: string) => errorAtom.set(v);
  const setSuccess = (v: string) => successAtom.set(v);
  const setLoading = (v: boolean) => loadingAtom.set(v);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!email || !password || !confirmPassword) {
      setError("All fields are required.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!agreed) {
      setError("You must agree to the legal terms.");
      return;
    }
    if (!captchaToken) {
      setError("Please complete the hCaptcha challenge.");
      return;
    }
    setLoading(true);
    try {
      // TODO: Replace with your Supabase sign-up logic
      // const { error: signUpError } = await supabase.auth.signUp({
      //   email,
      //   password,
      //   options: { captchaToken },
      // });
      // if (signUpError) throw signUpError;
      setSuccess("Registration successful! Please check your email to verify your account.");
    } catch (err: any) {
      setError(err.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="register-form" style={{ maxWidth: 400, margin: "0 auto" }}>
      <h2>Register</h2>
      {error && <div style={{ color: "red" }}>{error}</div>}
      {success && <div style={{ color: "green" }}>{success}</div>}
      <div>
        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
      </div>
      <div>
        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
      </div>
      <div>
        <label>Confirm Password</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          required
        />
      </div>
      <div style={{ margin: "10px 0" }}>
        <input
          type="checkbox"
          checked={agreed}
          onChange={e => setAgreed(e.target.checked)}
          id="legal-agree"
        />
        <label htmlFor="legal-agree">
          {" I agree to the "}
          <a href="https://kbve.com/legal/" target="_blank" rel="noopener noreferrer">legal terms</a>
        </label>
      </div>
      <div style={{ margin: "10px 0" }}>
        <HCaptcha
          sitekey={HCAPTCHA_SITE_KEY}
          onVerify={token => setCaptchaToken(token)}
          onExpire={() => setCaptchaToken(null)}
        />
      </div>
      <button type="submit" disabled={loading} style={{ width: "100%" }}>
        {loading ? "Registering..." : "Register"}
      </button>
    </form>
  );
};
