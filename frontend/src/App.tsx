import { useCallback, useEffect, useState } from "react";

type Availability = "available" | "unavailable" | "unknown";

type HealthResponse = {
  status: "healthy" | "unhealthy";
  services: {
    backend: "available";
    database: "available" | "unavailable";
  };
};

type HealthState = {
  backend: Availability;
  database: Availability;
  latency: number | null;
  checkedAt: Date | null;
  loading: boolean;
};

const initialState: HealthState = {
  backend: "unknown",
  database: "unknown",
  latency: null,
  checkedAt: null,
  loading: true,
};

function StatusCard({
  label,
  status,
}: {
  label: string;
  status: Availability;
}) {
  return (
    <article className="status-card">
      <div className={`status-indicator status-indicator--${status}`} aria-hidden="true" />
      <div>
        <p className="status-label">{label}</p>
        <p className="status-value">{status}</p>
      </div>
    </article>
  );
}

function App() {
  const [health, setHealth] = useState<HealthState>(initialState);

  const checkHealth = useCallback(async () => {
    const startedAt = performance.now();
    setHealth((current) => ({ ...current, loading: true }));

    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      const data = (await response.json()) as HealthResponse;

      setHealth({
        backend: data.services.backend,
        database: data.services.database,
        latency: Math.round(performance.now() - startedAt),
        checkedAt: new Date(),
        loading: false,
      });
    } catch {
      setHealth({
        backend: "unavailable",
        database: "unknown",
        latency: null,
        checkedAt: new Date(),
        loading: false,
      });
    }
  }, []);

  useEffect(() => {
    void checkHealth();
    const interval = window.setInterval(() => void checkHealth(), 30_000);
    return () => window.clearInterval(interval);
  }, [checkHealth]);

  const isHealthy =
    health.backend === "available" && health.database === "available";

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Archetype home">
          <span className="brand-mark" aria-hidden="true">A</span>
          Archetype
        </a>
        <span className="environment">Local environment</span>
      </header>

      <main>
        <section className="status-panel" aria-live="polite">
          <div className="panel-header">
            <div>
              <p className="eyebrow">System health</p>
              <h1>{isHealthy ? "All systems operational" : "Service attention needed"}</h1>
              <p className="intro">
                Live availability for the application and its PostgreSQL connection.
              </p>
            </div>
            <button type="button" onClick={() => void checkHealth()} disabled={health.loading}>
              {health.loading ? "Checking…" : "Refresh status"}
            </button>
          </div>

          <div className="status-grid">
            <StatusCard label="Backend API" status={health.backend} />
            <StatusCard label="PostgreSQL" status={health.database} />
          </div>

          <footer className="status-meta">
            <span>
              Last checked: {health.checkedAt ? health.checkedAt.toLocaleTimeString() : "Not yet checked"}
            </span>
            <span>Response time: {health.latency === null ? "—" : `${health.latency} ms`}</span>
            <span>Refreshes every 30 seconds</span>
          </footer>
        </section>
      </main>
    </div>
  );
}

export default App;

