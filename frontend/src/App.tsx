import {
  createContext,
  type FormEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";

type UserProfile = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: "ADMIN" | "STAFF" | "AGENT";
  tenant: { id: number; name: string };
};

type AuthStatus = "loading" | "authenticated" | "anonymous";

type AuthContextValue = {
  status: AuthStatus;
  user: UserProfile | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string };
    return body.detail ?? fallback;
  } catch {
    return fallback;
  }
}

function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<UserProfile | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      const response = await fetch("/api/profile", {
        credentials: "same-origin",
        cache: "no-store",
      });

      if (!response.ok) {
        setUser(null);
        setStatus("anonymous");
        return;
      }

      setUser((await response.json()) as UserProfile);
      setStatus("authenticated");
    } catch {
      setUser(null);
      setStatus("anonymous");
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        throw new Error(await readError(response, "Unable to sign in"));
      }

      await loadProfile();
    },
    [loadProfile],
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } finally {
      setUser(null);
      setStatus("anonymous");
    }
  }, []);

  const value = useMemo(
    () => ({ status, user, login, logout }),
    [status, user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return value;
}

function Brand() {
  return (
    <a className="brand" href="/" aria-label="Archetype home">
      <span className="brand-mark" aria-hidden="true">A</span>
      <span>Archetype</span>
    </a>
  );
}

function LoadingScreen() {
  return (
    <main className="loading-screen" aria-live="polite" aria-busy="true">
      <span className="loading-mark" aria-hidden="true" />
      <p>Checking your session</p>
    </main>
  );
}

function LoginPage() {
  const { status, user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (status === "loading") {
    return <LoadingScreen />;
  }
  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await login(email, password);
      const destination =
        (location.state as { from?: string } | null)?.from ?? "/";
      navigate(destination, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-layout">
      <section className="login-context" aria-label="Product context">
        <Brand />
        <div className="context-copy">
          <p className="kicker">Vehicle recovery network</p>
          <h1>One identity.<br />The right territory.</h1>
          <p>
            Secure access for recovery teams operating across a shared,
            tenant-aware network.
          </p>
        </div>
        <p className="context-footnote">Local demonstration environment</p>
      </section>

      <main className="login-main">
        <div className="login-panel">
          <header className="login-heading">
            <span className="step-label">Access / 01</span>
            <h2>Sign in to your workspace</h2>
            <p>Use the credentials assigned to your tenant.</p>
          </header>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <label>
              <span>Email address</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@archetype.local"
                required
                autoFocus
              />
            </label>

            <label>
              <span>Password</span>
              <span className="password-field">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  required
                />
                <button
                  className="password-toggle"
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </span>
            </label>

            {error ? <p className="form-error" role="alert">{error}</p> : null}

            <button className="primary-action" type="submit" disabled={submitting}>
              <span>{submitting ? "Signing in…" : "Sign in"}</span>
              <span aria-hidden="true">→</span>
            </button>
          </form>

          <aside className="demo-note" aria-label="Demo credentials">
            <span>Demo access</span>
            <code>tenant1.admin@archetype.local</code>
            <code>ArchetypeDemo!2026</code>
          </aside>
        </div>
      </main>
    </div>
  );
}

function HomePage() {
  const { status, user, logout } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  if (status === "loading") {
    return <LoadingScreen />;
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: "/" }} />;
  }

  const handleLogout = async () => {
    setSigningOut(true);
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="home-layout">
      <header className="home-topbar">
        <Brand />
        <button
          className="sign-out"
          type="button"
          onClick={() => void handleLogout()}
          disabled={signingOut}
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </header>

      <main className="profile-main">
        <section className="profile-intro">
          <p className="kicker">Authenticated profile</p>
          <h1>Welcome, <em>{user.firstName}</em></h1>
          <p>Your identity and tenant context are active for this session.</p>
        </section>

        <section className="identity-card" aria-labelledby="identity-title">
          <header>
            <h2 id="identity-title">Current identity</h2>
          </header>

          <dl className="identity-grid">
            <div><dt>Name</dt><dd>{user.firstName} {user.lastName}</dd></div>
            <div><dt>Email</dt><dd>{user.email}</dd></div>
            <div><dt>Role</dt><dd><span className="role-badge">{user.role}</span></dd></div>
            <div><dt>Tenant</dt><dd>{user.tenant.name}</dd></div>
          </dl>
        </section>
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<HomePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
