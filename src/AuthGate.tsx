import { FormEvent, ReactElement, useEffect, useState } from "react";
import { getSignedInUsername, isAuthConfigured, signInWithPassword, signOutCurrentUser, signInWithPasskey, isPasskeySupported } from "./auth";

type AuthGateProps = {
  children: (session: { username: string; signOut: () => Promise<void> }) => ReactElement;
};

export default function AuthGate({ children }: AuthGateProps) {
  const [username, setUsername] = useState<string | null>(isAuthConfigured ? null : "local");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("ログイン状態を確認しています。");

  useEffect(() => {
    if (!isAuthConfigured) return;

    getSignedInUsername()
      .then((currentUsername) => {
        setUsername(currentUsername);
        setMessage("");
      })
      .catch(() => {
        setUsername(null);
        setMessage("");
      });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("ログインしています。");

    try {
      await signInWithPassword(loginId, password);
      setUsername(await getSignedInUsername());
      setPassword("");
      setMessage("");
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "ログインに失敗しました。";
      if (errMsg.includes("PasskeyAuthenticationRequired") || errMsg.includes("パスキー")) {
        setMessage("このアカウントにはパスキーが登録されています。パスキーでログインしてください。");
      } else {
        setMessage(errMsg);
      }
    }
  }

  async function handlePasskeySignIn() {
    if (!loginId.trim()) {
      setMessage("パスキーでログインするにはユーザー名を入力してください。");
      return;
    }
    setMessage("パスキーでサインインしています...");
    try {
      await signInWithPasskey(loginId.trim());
      setUsername(await getSignedInUsername());
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "パスキーログインに失敗しました。");
    }
  }

  async function handleSignOut() {
    await signOutCurrentUser();
    setUsername(null);
    setMessage("");
  }

  if (username) {
    return children({ username, signOut: handleSignOut });
  }

  return (
    <main className="app-shell auth-shell">
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <h1>筋トレ記録</h1>
        <p>個人専用の記録にログイン</p>
      </header>

      <section className="panel auth-panel" aria-labelledby="login-title">
        <div className="section-title">
          <span className="title-icon">→</span>
          <h2 id="login-title">ログイン</h2>
        </div>

        <form className="workout-form" onSubmit={handleSubmit}>
          <label>
            ユーザー名
            <input
              name="username"
              value={loginId}
              autoComplete="username"
              onChange={(event) => setLoginId(event.target.value)}
            />
          </label>
          <label>
            パスワード
            <input
              name="password"
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <div style={{ display: "grid", gap: "10px" }}>
            <button type="submit" className="primary-button">
              ログイン (パスワード)
            </button>
            {isPasskeySupported() && (
              <button
                type="button"
                className="primary-button"
                style={{ background: "rgba(255, 255, 255, 0.08)", border: "1px solid var(--line)" }}
                onClick={handlePasskeySignIn}
              >
                🔑 パスキーでログイン
              </button>
            )}
          </div>
          {message && <p className="status-message">{message}</p>}
        </form>
      </section>
    </main>
  );
}
