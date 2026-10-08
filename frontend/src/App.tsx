import {
  createContext,
  type FormEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

import { ApiError, apiFetch } from "./api";
import type {
  CaseDetail,
  CasePage,
  CaseScan,
  CaseStatus,
  CaseSummary,
  UserProfile,
} from "./types";
import { CaseMap } from "./CaseMap";

import {
  FolderSimple,
  Tray,
  User,
  CaretLeft,
  CaretRight,
  SignOut,
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  MapPin,
  CalendarBlank,
  Clock,
  Camera,
  Car,
  ShieldCheck,
  Crosshair,
  Copy,
  Check,
} from "@phosphor-icons/react";

import demoImage1 from "../assets/image_1.png";
import demoImage2 from "../assets/image_2.png";
import demoImage3 from "../assets/image_3.png";
import demoImage4 from "../assets/image_4.png";

const DEMO_CAR_IMAGES = [demoImage1, demoImage2, demoImage3, demoImage4];

function getCaseDemoImage(caseId: number): string {
  return DEMO_CAR_IMAGES[Math.abs(caseId) % DEMO_CAR_IMAGES.length];
}

type AuthStatus = "loading" | "authenticated" | "anonymous";
type AuthContextValue = {
  status: AuthStatus;
  user: UserProfile | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<UserProfile | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      const profile = await apiFetch<UserProfile>("/api/profile", { cache: "no-store" });
      setUser(profile);
      setStatus("authenticated");
    } catch {
      setUser(null);
      setStatus("anonymous");
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const login = useCallback(async (email: string, password: string) => {
    await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    await loadProfile();
  }, [loadProfile]);

  const logout = useCallback(async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
      setStatus("anonymous");
    }
  }, []);

  const value = useMemo(() => ({ status, user, login, logout }), [status, user, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

const ToastContext = createContext<{ showToast: (message: string) => void } | null>(null);

function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const timeout = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timeout.current), []);

  const showToast = useCallback((nextMessage: string) => {
    window.clearTimeout(timeout.current);
    setMessage(nextMessage);
    timeout.current = window.setTimeout(() => setMessage(""), 4200);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className={`toast ${message ? "toast--visible" : ""}`} role="status">
        <span className="toast-mark" aria-hidden="true">✓</span>{message}
      </div>
    </ToastContext.Provider>
  );
}

function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider");
  return value;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={`brand ${compact ? "brand--compact" : ""}`} to="/" aria-label="Discoverify home">
      <span className="brand-mark" aria-hidden="true">DF</span>
      <span className="brand-copy"><strong>Discoverify</strong>{!compact ? <small>Recovery operations</small> : null}</span>
    </Link>
  );
}

function LoadingScreen() {
  return (
    <main className="loading-screen" aria-live="polite" aria-busy="true">
      <span className="loading-mark" aria-hidden="true" /><p>Checking your session</p>
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
  const [copiedField, setCopiedField] = useState<"email" | "password" | null>(null);

  if (status === "loading") return <LoadingScreen />;
  if (user) return <Navigate to="/" replace />;

  const handleCopy = (text: string, field: "email" | "password") => {
    void navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      const destination = (location.state as { from?: string } | null)?.from ?? "/";
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
          <h1>Every sighting.<br />One clear trail.</h1>
          <p>Review field intelligence, claim eligible work, and follow a vehicle’s location history.</p>
        </div>
      </section>
      <main className="login-main">
        <div className="login-panel">
          <header className="login-heading">
            <h2>Sign in to operations</h2>
            <p>Use your operational credentials to access cases and surveillance records.</p>
          </header>
          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <label><span>Email address</span><input type="email" name="email" autoComplete="email" value={email}
              onChange={(event) => setEmail(event.target.value)} placeholder="name@operations.local" required autoFocus /></label>
            <label><span>Password</span><span className="password-field">
              <input type={showPassword ? "text" : "password"} name="password" autoComplete="current-password"
                value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required />
              <button className="password-toggle" type="button" onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button>
            </span></label>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="primary-action" type="submit" disabled={submitting}>
              <span>{submitting ? "Signing in…" : "Sign in"}</span><span aria-hidden="true">→</span>
            </button>
          </form>
          <aside className="credentials-note" aria-label="Access credentials">
            <span className="credentials-label">Access credentials</span>
            <div className="credential-row">
              <code>tenant1.admin@archetype.local</code>
              <button
                type="button"
                className="copy-credential-btn"
                onClick={() => handleCopy("tenant1.admin@archetype.local", "email")}
                title="Copy email"
                aria-label="Copy email"
              >
                {copiedField === "email" ? <Check size={12} weight="bold" /> : <Copy size={12} weight="bold" />}
              </button>
            </div>
            <div className="credential-row">
              <code>ArchetypeDemo!2026</code>
              <button
                type="button"
                className="copy-credential-btn"
                onClick={() => handleCopy("ArchetypeDemo!2026", "password")}
                title="Copy password"
                aria-label="Copy password"
              >
                {copiedField === "password" ? <Check size={12} weight="bold" /> : <Copy size={12} weight="bold" />}
              </button>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function ProtectedShell() {
  const { status, user, logout } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  if (status === "loading") return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace state={{ from: window.location.pathname + window.location.search }} />;

  const handleLogout = async () => {
    setSigningOut(true);
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className={`app-shell ${collapsed ? "app-shell--collapsed" : ""}`}>
      <aside className={`sidebar ${collapsed ? "sidebar--collapsed" : ""}`}>
        <button
          className="sidebar-toggle"
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <CaretRight size={13} weight="bold" /> : <CaretLeft size={13} weight="bold" />}
        </button>
        <div className="sidebar-top">
          <Brand compact={collapsed} />
          <p className={`sidebar-label ${collapsed ? "sidebar-label--hidden" : ""}`}>Case desk</p>
          <nav className="primary-nav" aria-label="Primary navigation">
            {user.role !== "AGENT" ? (
              <NavLink to="/cases" end title="My Cases">
                <FolderSimple size={20} weight="regular" />
                {!collapsed && <strong>My Cases</strong>}
              </NavLink>
            ) : null}
            {user.role === "STAFF" ? (
              <NavLink to="/cases/claimable" title="Claimable Cases">
                <Tray size={20} weight="regular" />
                {!collapsed && <strong>Claimable Cases</strong>}
              </NavLink>
            ) : null}
            {user.role === "AGENT" ? (
              <NavLink to="/profile" title="My Profile">
                <User size={20} weight="regular" />
                {!collapsed && <strong>My Profile</strong>}
              </NavLink>
            ) : null}
          </nav>
        </div>
        <div
          className="sidebar-account"
          title={collapsed ? `${user.firstName} ${user.lastName} (${user.role} · ${user.tenant.name})` : undefined}
        >
          <div className="account-user-info">
            <div className="account-avatar" aria-hidden="true">{user.firstName[0]}{user.lastName[0]}</div>
            {!collapsed && (
              <div className="account-copy">
                <strong>{user.firstName} {user.lastName}</strong>
                <span>{user.role} · {user.tenant.name}</span>
              </div>
            )}
          </div>
          <button
            className="account-signout-btn"
            type="button"
            onClick={() => void handleLogout()}
            disabled={signingOut}
            title="Sign out"
            aria-label="Sign out"
          >
            <SignOut size={16} weight="bold" />
            {!collapsed && <span>{signingOut ? "Signing out…" : "Sign out"}</span>}
          </button>
        </div>
      </aside>
      <main className="workspace"><Outlet /></main>
    </div>
  );
}

function LandingRedirect() {
  const { user } = useAuth();
  return <Navigate to={user?.role === "AGENT" ? "/profile" : "/cases"} replace />;
}

function CaseReaderRoute({ staffOnly = false }: { staffOnly?: boolean }) {
  const { user } = useAuth();
  const allowed = staffOnly ? user?.role === "STAFF" : user?.role === "STAFF" || user?.role === "ADMIN";
  return allowed ? <Outlet /> : <Navigate to="/profile" replace />;
}

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Unknown" : dateTimeFormatter.format(date);
}

function DateText({ value }: { value: string }) {
  const date = new Date(value);
  return <time dateTime={value} title={Number.isNaN(date.valueOf()) ? value : date.toISOString()}>{formatDate(value)}</time>;
}

function StatusBadge({ status }: { status: CaseStatus }) {
  return <span className={`status-badge status-badge--${status.toLowerCase()}`}>{status.replace("_", " ")}</span>;
}

function caseNumber(id: number) {
  return `RC-${String(id).padStart(5, "0")}`;
}

type CollectionState = { data: CasePage | null; loading: boolean; error: string };

function useCaseCollection(path: string, query: URLSearchParams, reloadKey: number) {
  const [state, setState] = useState<CollectionState>({ data: null, loading: true, error: "" });
  const queryString = query.toString();

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: "" }));
    apiFetch<CasePage>(`${path}?${queryString}`, { signal: controller.signal, cache: "no-store" })
      .then((data) => setState({ data, loading: false, error: "" }))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setState((current) => ({
          ...current, loading: false,
          error: reason instanceof Error ? reason.message : "Cases could not be loaded"
        }));
      });
    return () => controller.abort();
  }, [path, queryString, reloadKey]);
  return state;
}

function PageHeader({ eyebrow, title, description, count, compact = false }: {
  eyebrow: string; title: string; description: string; count?: number; compact?: boolean;
}) {
  return (
    <header className={`page-header ${compact ? "page-header--compact" : ""}`}>
      <div className="page-header-main">
        <p className="kicker">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-header-desc">{description}</p>
      </div>
      {count !== undefined ? (
        <div className="record-count" aria-label={`${count} total records`}>
          <strong>{count}</strong>
          <span>Records</span>
        </div>
      ) : null}
    </header>
  );
}

function Pagination({ page, pageCount, limit, onLimit, onPrevious, onNext }: {
  page: number; pageCount: number; limit: number; onLimit: (value: number) => void; onPrevious: () => void; onNext: () => void;
}) {
  return (
    <nav className="pagination" aria-label="Case pages">
      <label>
        Rows
        <select value={limit} onChange={(event) => onLimit(Number(event.target.value))}>
          <option value={25}>25</option>
          <option value={50}>50</option>
        </select>
      </label>
      <span>Page <strong>{page}</strong> of {pageCount}</span>
      <div className="pagination-actions">
        <button className="button button--quiet button--sm" type="button" disabled={page <= 1} onClick={onPrevious}>
          <CaretLeft size={13} weight="bold" /> Previous
        </button>
        <button className="button button--quiet button--sm" type="button" disabled={page >= pageCount} onClick={onNext}>
          Next <CaretRight size={13} weight="bold" />
        </button>
      </div>
    </nav>
  );
}

function CasesPage({ claimable = false }: { claimable?: boolean }) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [draftVin, setDraftVin] = useState("");
  const [draftPlate, setDraftPlate] = useState("");
  const [vin, setVin] = useState("");
  const [plate, setPlate] = useState("");
  const [caseStatus, setCaseStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(25);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedCase, setSelectedCase] = useState<CaseSummary | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState("");

  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (vin) query.set("vin", vin);
  if (plate) query.set("plate", plate);
  if (!claimable && caseStatus) query.set("status", caseStatus);

  const collection = useCaseCollection(claimable ? "/api/v1/cases/claimable" : "/api/v1/cases", query, reloadKey);
  const total = collection.data?.total ?? 0;
  const page = Math.floor(offset / limit) + 1;
  const pageCount = Math.max(1, Math.ceil(total / limit));

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    setVin(draftVin);
    setPlate(draftPlate);
    setOffset(0);
  };

  const clearFilters = () => {
    setDraftVin(""); setDraftPlate(""); setVin(""); setPlate(""); setCaseStatus(""); setOffset(0);
  };

  const claimSelected = async () => {
    if (!selectedCase) return;
    setClaiming(true);
    setClaimError("");
    try {
      const claimed = await apiFetch<CaseSummary>(`/api/v1/cases/${selectedCase.id}/claim`, { method: "POST" });
      setSelectedCase(null);
      showToast(`${caseNumber(claimed.id)} is now assigned to you.`);
      navigate(`/cases/${claimed.id}`);
    } catch (reason) {
      setClaimError(reason instanceof Error ? reason.message : "This case could not be claimed");
      if (reason instanceof ApiError && reason.status === 409) setReloadKey((value) => value + 1);
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="cases-view">
      <PageHeader
        eyebrow={claimable ? "Available for assignment" : "Case register"}
        title={claimable ? "Claimable Cases" : "My Cases"}
        description={claimable ? "Eligible vehicles awaiting ownership. Claiming assigns the case directly to you."
          : "Active and closed vehicle recovery cases."}
        count={collection.data?.total}
        compact
      />

      <form className="filter-bar" onSubmit={applyFilters}>
        {!claimable ? (
          <label>
            <span>Status</span>
            <select value={caseStatus} onChange={(event) => { setCaseStatus(event.target.value); setOffset(0); }}>
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="CLOSED">Closed</option>
            </select>
          </label>
        ) : null}
        <label>
          <span>VIN</span>
          <input value={draftVin} onChange={(event) => setDraftVin(event.target.value)} placeholder="17-character VIN" />
        </label>
        <label>
          <span>Plate</span>
          <input value={draftPlate} onChange={(event) => setDraftPlate(event.target.value)} placeholder="Plate number" />
        </label>
        <div className="filter-actions">
          <button className="button button--dark" type="submit">Apply filters</button>
          <button className="button button--quiet" type="button" onClick={clearFilters}>Clear</button>
        </div>
      </form>

      {collection.error ? (
        <ErrorPanel message={collection.error} onRetry={() => setReloadKey((value) => value + 1)} />
      ) : collection.loading && !collection.data ? (
        <CaseListSkeleton />
      ) : collection.data?.items.length ? (
        <CaseTable
          items={collection.data.items}
          claimable={claimable}
          onClaim={setSelectedCase}
          pagination={
            <Pagination
              page={page}
              pageCount={pageCount}
              limit={limit}
              onLimit={(value) => { setLimit(value); setOffset(0); }}
              onPrevious={() => setOffset(Math.max(0, offset - limit))}
              onNext={() => setOffset(offset + limit)}
            />
          }
        />
      ) : (
        <EmptyState filtered={Boolean(vin || plate || caseStatus)} claimable={claimable} onClear={clearFilters} />
      )}

      <ClaimDialog
        recoveryCase={selectedCase}
        busy={claiming}
        error={claimError}
        onClose={() => { if (!claiming) { setSelectedCase(null); setClaimError(""); } }}
        onConfirm={() => void claimSelected()}
      />
    </div>
  );
}

function CaseTable({ items, claimable, onClaim, pagination }: {
  items: CaseSummary[]; claimable: boolean; onClaim: (item: CaseSummary) => void; pagination?: ReactNode;
}) {
  return (
    <section className="case-register" aria-label="Recovery cases">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Case</th>
              <th>Vehicle</th>
              <th>Status</th>
              {!claimable ? <th>Assignee</th> : null}
              <th>Latest sighting</th>
              <th>{claimable ? "Created" : "Updated"}</th>
              {claimable ? <th><span className="sr-only">Action</span></th> : null}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  {claimable ? (
                    <strong className="case-code">{caseNumber(item.id)}</strong>
                  ) : (
                    <Link className="case-link" to={`/cases/${item.id}`}>
                      {caseNumber(item.id)} <ArrowUpRight size={12} weight="bold" />
                    </Link>
                  )}
                </td>
                <td><VehicleIdentity item={item} /></td>
                <td><StatusBadge status={item.status} /></td>
                {!claimable ? <td>{item.assignee ? `${item.assignee.first_name} ${item.assignee.last_name}` : "Unassigned"}</td> : null}
                <td>
                  {item.latest_sighting ? (
                    <>
                      <DateText value={item.latest_sighting.scanned_at} />
                      <small>{item.latest_sighting.latitude.toFixed(4)}, {item.latest_sighting.longitude.toFixed(4)}</small>
                    </>
                  ) : (
                    <span className="muted">No sightings</span>
                  )}
                </td>
                <td><DateText value={claimable ? item.created_at : item.updated_at} /></td>
                {claimable ? (
                  <td>
                    <button className="button button--claim" type="button" onClick={() => onClaim(item)}>
                      Claim <ArrowRight size={13} weight="bold" />
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="case-cards">
        {items.map((item) => (
          <article className="case-card" key={item.id}>
            <header>
              <span className="case-code">{caseNumber(item.id)}</span>
              <StatusBadge status={item.status} />
            </header>
            <VehicleIdentity item={item} />
            <dl>
              <div>
                <dt>Latest sighting</dt>
                <dd>{item.latest_sighting ? <DateText value={item.latest_sighting.scanned_at} /> : "No sightings"}</dd>
              </div>
              <div>
                <dt>{claimable ? "Created" : "Assignee"}</dt>
                <dd>
                  {claimable ? (
                    <DateText value={item.created_at} />
                  ) : item.assignee ? (
                    `${item.assignee.first_name} ${item.assignee.last_name}`
                  ) : (
                    "Unassigned"
                  )}
                </dd>
              </div>
            </dl>
            {claimable ? (
              <button className="button button--claim" type="button" onClick={() => onClaim(item)}>
                Claim case <ArrowRight size={13} weight="bold" />
              </button>
            ) : (
              <Link className="button button--dark" to={`/cases/${item.id}`}>
                Open case <ArrowRight size={13} weight="bold" />
              </Link>
            )}
          </article>
        ))}
      </div>

      {pagination}
    </section>
  );
}

function VehicleIdentity({ item }: { item: CaseSummary }) {
  return <div className="vehicle-identity"><strong>{item.vehicle.plate}</strong><span>{item.vehicle.make} {item.vehicle.model}</span><code>{item.vehicle.vin}</code></div>;
}

function ClaimDialog({ recoveryCase, busy, error, onClose, onConfirm }: {
  recoveryCase: CaseSummary | null; busy: boolean; error: string; onClose: () => void; onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (recoveryCase && !dialog.open) dialog.showModal();
    if (!recoveryCase && dialog.open) dialog.close();
  }, [recoveryCase]);

  if (!recoveryCase) return <dialog ref={dialogRef} />;
  return (
    <dialog className="claim-dialog" ref={dialogRef} onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="dialog-sheet">
        <p className="kicker">Confirm assignment</p><h2>Claim {caseNumber(recoveryCase.id)}?</h2>
        <p>This marks the case as active and assigns it directly to you.</p>
        <div className="dialog-vehicle"><strong>{recoveryCase.vehicle.plate}</strong><span>{recoveryCase.vehicle.make} {recoveryCase.vehicle.model}</span><code>{recoveryCase.vehicle.vin}</code></div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="dialog-actions"><button className="button button--quiet" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="button button--claim" type="button" onClick={onConfirm} disabled={busy}>{busy ? "Claiming…" : "Confirm claim"}</button></div>
      </div>
    </dialog>
  );
}

function CaseDetailPage() {
  const { caseId } = useParams();
  const [data, setData] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedScanId, setSelectedScanId] = useState<number | null>(null);
  const mapPaneRef = useRef<HTMLDivElement>(null);
  const [mapPaneHeight, setMapPaneHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const el = mapPaneRef.current;
    if (!el) return;
    const update = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h > 0) setMapPaneHeight(h);
    };
    update();
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = Math.round(entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height);
        if (h > 0) setMapPaneHeight(h);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    apiFetch<CaseDetail>(`/api/v1/cases/${caseId}`, { signal: controller.signal, cache: "no-store" })
      .then(setData)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Case details could not be loaded");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [caseId, reloadKey]);

  if (loading && !data) return <div className="page-frame"><DetailSkeleton /></div>;
  if (error || !data) return (
    <div className="page-frame">
      <Link className="back-link" to="/cases">
        <ArrowLeft size={14} weight="bold" />
        <span>Back to My Cases</span>
      </Link>
      <ErrorPanel message={error || "The case was not found"} onRetry={() => setReloadKey((value) => value + 1)} />
    </div>
  );

  const demoImage = getCaseDemoImage(data.id);

  const handleSelectScan = (scanId: number) => {
    setSelectedScanId(scanId);
    const el = document.getElementById(`scan-${scanId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("scan-highlight");
      setTimeout(() => el.classList.remove("scan-highlight"), 1600);
    }
  };

  return (
    <div className="detail-page-container">
      {/* Streamlined Top Section: Back navigation, Plate title & metadata, Compact Stat Pills */}
      <header className="detail-top-section">
        <div className="detail-top-nav">
          <Link className="back-link" to="/cases">
            <ArrowLeft size={14} weight="bold" />
            <span>Back to My Cases</span>
          </Link>
          <div className="detail-case-badge">
            <span className="kicker-label">RECOVERY CASE</span>
            <strong className="kicker-code">{caseNumber(data.id)}</strong>
          </div>
        </div>

        <div className="detail-hero-bar">
          <div className="detail-vehicle-summary">
            <h1 className="vehicle-plate-title">{data.vehicle.plate}</h1>
            <div className="vehicle-sub-info">
              <span className="vehicle-model">{data.vehicle.make} {data.vehicle.model}</span>
              <span className="sep-dot" aria-hidden="true">·</span>
              <code className="vehicle-vin-code">{data.vehicle.vin}</code>
            </div>
          </div>
          <StatusBadge status={data.status} />
        </div>

        {/* Compact stats strip replacing the oversized 4 boxes */}
        <div className="detail-stats-bar">
          <div className="stat-cell">
            <span className="stat-label"><User size={13} weight="bold" /> Assigned to</span>
            <strong className="stat-val">{data.assignee ? `${data.assignee.first_name} ${data.assignee.last_name}` : "Unassigned"}</strong>
          </div>
          <div className="stat-cell">
            <span className="stat-label"><CalendarBlank size={13} weight="bold" /> Case opened</span>
            <strong className="stat-val"><DateText value={data.created_at} /></strong>
          </div>
          <div className="stat-cell">
            <span className="stat-label"><Clock size={13} weight="bold" /> Last updated</span>
            <strong className="stat-val"><DateText value={data.updated_at} /></strong>
          </div>
          <div className="stat-cell">
            <span className="stat-label"><MapPin size={13} weight="bold" /> Sightings</span>
            <strong className="stat-val">{data.scans.length} records</strong>
          </div>
        </div>
      </header>

      {/* 60-40 Split: Left 60% Map, Right 40% Scan History */}
      <div className="detail-split-layout">
        {/* 60% Map Section */}
        <section className="detail-map-pane" ref={mapPaneRef} aria-label="Surveillance map">
          <CaseMap
            scans={data.scans}
            demoImage={demoImage}
            vehiclePlate={data.vehicle.plate}
            onSelectScan={handleSelectScan}
            selectedScanId={selectedScanId}
          />
        </section>

        {/* 40% Scan History Section */}
        <section className="detail-history-pane" aria-labelledby="scan-history-title">
          <div className="scan-history-box" style={{ height: mapPaneHeight ? `${mapPaneHeight}px` : undefined }}>
            <header className="scan-history-header">
              <div>
                <h2 id="scan-history-title">Scan history</h2>
              </div>
              <span className="history-count-badge">Newest first · {data.scans.length}</span>
            </header>
            {data.scans.length ? (
              <ol className="scan-cards-list">
                {data.scans.map((scan, index) => (
                  <ScanEntry
                    scan={scan}
                    index={index}
                    demoImage={demoImage}
                    key={scan.id}
                    onLocateScan={setSelectedScanId}
                  />
                ))}
              </ol>
            ) : (
              <div className="inline-empty">
                <strong>No scan history yet</strong>
                <p>New sightings for this vehicle will appear here.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function mapUrl(latitude: number, longitude: number) {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

function ScanEntry({
  scan,
  index,
  demoImage,
  onLocateScan,
}: {
  scan: CaseScan;
  index: number;
  demoImage: string;
  onLocateScan?: (scanId: number) => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const localSource = Boolean(scan.camera || scan.agency_vehicle || scan.reported_by);
  const imageSource = scan.image_url && !scan.image_url.includes("example.invalid") ? scan.image_url : demoImage;
  const isLatest = index === 0;

  return (
    <li className="scan-entry-card" id={`scan-${scan.id}`}>
      <header className="scan-entry-header">
        <div className="scan-entry-title">
          <span className={`scan-seq-badge ${isLatest ? "scan-seq-badge--latest" : ""}`}>
            #{String(index + 1).padStart(2, "0")}
          </span>
          <strong><DateText value={scan.scanned_at} /></strong>
          <span className="scan-id-tag">Scan #{scan.id}</span>
        </div>
        <div className="scan-entry-actions">
          <button
            type="button"
            className="scan-entry-locate-btn"
            onClick={() => onLocateScan?.(scan.id)}
            title="Locate on surveillance map"
          >
            <Crosshair size={12} weight="bold" />
            <span>Map</span>
          </button>
          <a
            className="scan-entry-map-link"
            href={mapUrl(scan.latitude, scan.longitude)}
            target="_blank"
            rel="noreferrer"
            title="Open in Google Maps"
          >
            <ArrowUpRight size={11} weight="bold" />
          </a>
        </div>
      </header>

      <div className="scan-entry-body">
        <div className="scan-entry-thumb">
          {!imageFailed ? (
            <img
              src={imageSource}
              alt={`Vehicle sighting from ${formatDate(scan.scanned_at)}`}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="image-fallback-compact" role="img" aria-label="Scan image unavailable">
              <span>▧</span>
            </div>
          )}
        </div>

        <div className="scan-entry-meta">
          <div className="scan-meta-cell">
            <span className="scan-meta-key"><MapPin size={11} weight="bold" /> Coordinates</span>
            <code
              className="scan-meta-val"
              title={`${scan.latitude.toFixed(5)}, ${scan.longitude.toFixed(5)}`}
            >
              {scan.latitude.toFixed(5)}, {scan.longitude.toFixed(5)}
            </code>
          </div>
          <div className="scan-meta-cell">
            <span className="scan-meta-key"><Camera size={11} weight="bold" /> Camera serial</span>
            <span
              className="scan-meta-val"
              title={scan.camera?.serial_number ?? "Source protected"}
            >
              {scan.camera?.serial_number ?? "Source protected"}
            </span>
          </div>
          <div className="scan-meta-cell">
            <span className="scan-meta-key"><Car size={11} weight="bold" /> Agency vehicle</span>
            <span
              className="scan-meta-val"
              title={scan.agency_vehicle?.identifier ?? "Source protected"}
            >
              {scan.agency_vehicle?.identifier ?? "Source protected"}
            </span>
          </div>
          <div className="scan-meta-cell">
            <span className="scan-meta-key"><User size={11} weight="bold" /> Reported by</span>
            <span
              className="scan-meta-val"
              title={scan.reported_by ? `${scan.reported_by.first_name} ${scan.reported_by.last_name}` : "Shared network"}
            >
              {scan.reported_by ? `${scan.reported_by.first_name} ${scan.reported_by.last_name}` : "Shared network"}
            </span>
          </div>
        </div>
      </div>

      {!localSource ? (
        <footer className="scan-entry-footer">
          <ShieldCheck size={12} weight="bold" />
          <span>Shared network observation (source details protected)</span>
        </footer>
      ) : null}
    </li>
  );
}

function ProfilePage() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="page-frame profile-page">
      <PageHeader eyebrow="Authenticated profile" title={`Welcome, ${user.firstName}`} description="Your identity and organization credentials are active for this session." />
      <section className="identity-card" aria-labelledby="identity-title"><header><h2 id="identity-title">Current identity</h2></header>
        <dl className="identity-grid"><div><dt>Name</dt><dd>{user.firstName} {user.lastName}</dd></div>
          <div><dt>Email</dt><dd>{user.email}</dd></div><div><dt>Role</dt><dd><span className="role-badge">{user.role}</span></dd></div>
          <div><dt>Organization</dt><dd>{user.tenant.name}</dd></div></dl></section>
      {user.role === "AGENT" ? <aside className="agent-note"><span aria-hidden="true">FIELD ACCESS</span>
        <p>Agent accounts submit field scans only. Case records remain read-only and are managed by staff.</p></aside> : null}
    </div>
  );
}

function EmptyState({ filtered, claimable, onClear }: { filtered: boolean; claimable: boolean; onClear: () => void }) {
  return <section className="empty-state"><span className="empty-index">00</span><h2>{filtered ? "No matching cases" : claimable ? "The shared pool is clear" : "No cases yet"}</h2>
    <p>{filtered ? "Try a different VIN, plate, or status." : claimable ? "New eligible recovery cases will appear here." : "Claimed recovery work will appear here."}</p>
    {filtered ? <button className="button button--dark" type="button" onClick={onClear}>Clear filters</button> : null}</section>;
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <section className="error-panel" role="alert"><div><p className="kicker">Request interrupted</p><h2>We couldn’t load this view</h2><p>{message}</p></div>
    <button className="button button--dark" type="button" onClick={onRetry}>Try again</button></section>;
}

function CaseListSkeleton() {
  return <div className="skeleton-list" aria-label="Loading cases" aria-busy="true">{Array.from({ length: 6 }, (_, index) =>
    <div className="skeleton-row" key={index}><span /><span /><span /><span /></div>)}</div>;
}

function DetailSkeleton() {
  return <div className="detail-skeleton" aria-label="Loading case details" aria-busy="true"><span className="skeleton-title" /><span className="skeleton-heading" />
    <div className="skeleton-facts">{Array.from({ length: 4 }, (_, index) => <span key={index} />)}</div><span className="skeleton-panel" /></div>;
}

function App() {
  return (
    <BrowserRouter><AuthProvider><ToastProvider><Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedShell />}>
        <Route index element={<LandingRedirect />} /><Route path="profile" element={<ProfilePage />} />
        <Route element={<CaseReaderRoute />}><Route path="cases" element={<CasesPage />} /><Route path="cases/:caseId" element={<CaseDetailPage />} /></Route>
        <Route element={<CaseReaderRoute staffOnly />}><Route path="cases/claimable" element={<CasesPage claimable />} /></Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes></ToastProvider></AuthProvider></BrowserRouter>
  );
}

export default App;
