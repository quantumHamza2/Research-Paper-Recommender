import { useState } from "react";
import ResearchGraph from "./ResearchGraph.jsx";
import ResearchMap from "./ResearchMap.jsx";

function App() {
  const [view, setView] = useState("graph");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);

  return (
    <div style={{
      background: "#020617",
      minHeight: "100vh",
      color: "white",
      fontFamily: "sans-serif",
      display: "flex",
      flexDirection: "column"
    }}>

      {/* HEADER */}
      <div style={{
        textAlign: "center",
        paddingTop: "30px",
        paddingBottom: "20px",
        borderBottom: "1px solid rgba(255,255,255,0.05)"
      }}>
        <h1 style={{
          fontSize: "32px",
          marginBottom: "15px",
          fontWeight: "600",
          letterSpacing: "0.5px"
        }}>
          AI Research Explorer
        </h1>

        {/* TOGGLE BUTTONS */}
        <div style={{
          display: "flex",
          justifyContent: "center",
          gap: "10px",
          marginBottom: "15px"
        }}>
          <button
            onClick={() => setView("graph")}
            style={{
              padding: "8px 18px",
              borderRadius: "10px",
              border: "none",
              background: view === "graph" ? "#3b82f6" : "#1e293b",
              color: "white",
              cursor: "pointer"
            }}
          >
            Graph
          </button>

          <button
            onClick={() => setView("map")}
            style={{
              padding: "8px 18px",
              borderRadius: "10px",
              border: "none",
              background: view === "map" ? "#3b82f6" : "#1e293b",
              color: "white",
              cursor: "pointer"
            }}
          >
            Map
          </button>
        </div>

        {/* SEARCH BAR */}
        <div style={{
          display: "flex",
          justifyContent: "center",
          gap: "10px"
        }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search research papers..."
            style={{
              padding: "10px",
              borderRadius: "8px",
              border: "none",
              width: "300px",
              background: "#1e293b",
              color: "white"
            }}
          />

          <button
            onClick={() => {
              fetch(`http://127.0.0.1:8000/search?query=${query}`)
                .then(res => res.json())
                .then(data => setResults(data.results));
            }}
            style={{
              padding: "10px 15px",
              borderRadius: "8px",
              border: "none",
              background: "#3b82f6",
              color: "white",
              cursor: "pointer"
            }}
          >
            Search
          </button>
        </div>

        {/* RESULTS */}
        {results.length > 0 && (
          <div style={{
            marginTop: "15px",
            maxWidth: "600px",
            marginInline: "auto",
            background: "#020617",
            borderRadius: "10px",
            padding: "10px",
            border: "1px solid rgba(255,255,255,0.05)"
          }}>
            {results.map((r, i) => (
              <div key={i} style={{
                padding: "10px",
                borderBottom: "1px solid #1e293b",
                color: "#cbd5e1"
              }}>
                {r.title}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* GRAPH / MAP */}
      <div style={{
        flex: 1,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "20px"
      }}>
        <div style={{
          width: "100%",
          maxWidth: "1400px",
          height: "100%"
        }}>
          {view === "graph"
            ? <ResearchGraph query={query} />
            : <ResearchMap />}
        </div>
      </div>

    </div>
  );
}

export default App;