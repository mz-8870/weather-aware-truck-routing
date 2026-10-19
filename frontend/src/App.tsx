import { useEffect, useState } from "react";

export default function App() {
  const [status, setStatus] = useState("checking…");

  useEffect(() => {
    fetch("/api/health")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: { status: string }) => setStatus(body.status))
      .catch(() => setStatus("unreachable"));
  }, []);

  return (
    <main>
      <h1>Weather-Aware Truck Routing</h1>
      <p>Backend: {status}</p>
    </main>
  );
}
