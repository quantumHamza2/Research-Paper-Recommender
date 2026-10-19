import { API_BASE } from "./api.js";
import { useState, useEffect } from "react";
import "./App.css";
import ResearchGraph from "./ResearchGraph.jsx";
import ResearchMap from "./ResearchMap.jsx";

function App() {
  const [view, setView] = useState("map");
  const [activeTab, setActiveTab] = useState("search"); // search, bookmarks, history
  const [query, setQuery] = useState("");
  const [searchHistory, setSearchHistory] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState("");

  // Bookmarks & Categories states
  const [bookmarks, setBookmarks] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("bookmarks") || "[]");
    } catch {
      return [];
    }
  });
  const [selectedCategories, setSelectedCategories] = useState([]);

  // Selection states
  const [selectedPaperId, setSelectedPaperId] = useState(null);
  const [selectedPaperDetails, setSelectedPaperDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Synthesis states
  const [checkedSynthesisIds, setCheckedSynthesisIds] = useState([]);
  const [synthesisLoading, setSynthesisLoading] = useState(false);
  const [synthesisText, setSynthesisText] = useState("");
  const [showSynthesisModal, setShowSynthesisModal] = useState(false);
  const [useOllama, setUseOllama] = useState(false);
  const [ollamaModels, setOllamaModels] = useState([]);
  const [ollamaModel, setOllamaModel] = useState("");
  const [synthesisMode, setSynthesisMode] = useState("extractive");
  const [synthesisWarning, setSynthesisWarning] = useState("");
  const [synthesisSources, setSynthesisSources] = useState([]);

  useEffect(() => {
    fetch(`${API_BASE}/synthesis-status`)
      .then(res => res.json())
      .then(data => { setOllamaModels(data.models || []); setOllamaModel(data.default_model || ""); })
      .catch(() => {});
  }, []);

  const [systemStatus, setSystemStatus] = useState({
    status: "initializing",
    message: "Initializing backend components...",
    papers_count: 0,
    indexing_progress: 0.0
  });

  const categoriesList = [
    { code: "cs.AI", name: "AI" },
    { code: "cs.LG", name: "Machine Learning" },
    { code: "cs.CL", name: "NLP / Language" },
    { code: "cs.CV", name: "Computer Vision" },
    { code: "cs.IR", name: "Info Retrieval" }
  ];

  // Pull backend status periodically
  useEffect(() => {
    const fetchStatus = () => {
      fetch(`${API_BASE}/`)
        .then(res => res.json())
        .then(data => {
          setSystemStatus(data);
        })
        .catch(() => {
          setSystemStatus(prev => ({
            ...prev,
            status: "error",
            message: "Cannot connect to server. Ensure Python backend is running."
          }));
        });
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  // Fetch paper details when selectedPaperId changes
  useEffect(() => {
    if (selectedPaperId === null) {
      setSelectedPaperDetails(null);
      return;
    }

    setDetailsLoading(true);
    fetch(`${API_BASE}/paper/${selectedPaperId}`)
      .then(res => {
        if (!res.ok) throw new Error("Paper details fetch failed");
        return res.json();
      })
      .then(data => {
        setSelectedPaperDetails(data);
      })
      .catch(err => {
        console.error(err);
        setSelectedPaperDetails(null);
      })
      .finally(() => setDetailsLoading(false));
  }, [selectedPaperId]);

  // Execute Search
  const handleSearch = (searchQuery) => {
    if (!searchQuery.trim()) return;

    // Add to history
    setSearchHistory(prev => {
      const filtered = prev.filter(h => h !== searchQuery);
      const updated = [searchQuery, ...filtered].slice(0, 8);
      return updated;
    });

    setSearchError("");
    fetch(`${API_BASE}/search?query=${encodeURIComponent(searchQuery)}`)
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Search unavailable. Please wait for the dataset to load.");
        return data;
      })
      .then(data => {
        setSearchResults(data.results || []);
        setActiveTab("search");
      })
      .catch(err => { setSearchResults([]); setSearchError(err.message); });
  };

  // Rebuild Index trigger
  const handleRebuildIndex = () => {
    fetch(`${API_BASE}/rebuild_index`, { method: "POST" })
      .then(res => res.json())
      .then(() => {
        alert("Full database indexing started in the background. Progress bar will update dynamically!");
      })
      .catch(err => alert("Failed to start indexing: " + err));
  };

  // Bookmark Toggle
  const toggleBookmark = (paper) => {
    setBookmarks(prev => {
      const exists = prev.some(b => b.id === paper.id);
      let updated;
      if (exists) {
        updated = prev.filter(b => b.id !== paper.id);
      } else {
        updated = [...prev, {
          id: paper.id,
          title: paper.title,
          authors: paper.authors,
          year: paper.year,
          pdf_url: paper.pdf_url
        }];
      }
      localStorage.setItem("bookmarks", JSON.stringify(updated));
      return updated;
    });
  };

  // Checkbox toggle for synthesis selection
  const toggleSynthesisCheck = (id) => {
    setCheckedSynthesisIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Trigger synthesis request
  const handleSynthesize = (requestedLLM = useOllama) => {
    if (checkedSynthesisIds.length === 0) {
      alert("Please select at least one paper using the checkboxes in bookmarks or search results.");
      return;
    }

    setSynthesisLoading(true);
    setSynthesisText("");
    setSynthesisWarning("");
    setSynthesisSources([]);
    setSynthesisMode(requestedLLM ? "llm" : "extractive");
    setShowSynthesisModal(true);

    fetch(`${API_BASE}/synthesize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paper_ids: checkedSynthesisIds,
        use_ollama: requestedLLM,
        ollama_model: ollamaModel || "qwen2.5:1.5b"
      })
    })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Unable to compare these papers.");
        return data;
      })
      .then(data => {
        setSynthesisMode(data.mode || "extractive");
        setSynthesisWarning(data.warning || "");
        setSynthesisText(data.synthesis);
        setSynthesisSources(data.sources || []);
      })
      .catch(err => {
        setSynthesisText("Error compiling synthesis report: " + err);
      })
      .finally(() => setSynthesisLoading(false));
  };

  // BibTeX download
  const handleExportBibTeX = () => {
    if (bookmarks.length === 0) {
      alert("Add papers to your bookmarks to export BibTeX citations!");
      return;
    }
    const bibtex = bookmarks.map(p => {
      const authorPart = p.authors && p.authors !== "nan"
        ? p.authors.split(',')[0].replace(/[^a-zA-Z]/g, "").toLowerCase()
        : "unknown";
      const yearPart = p.year || "2026";
      const titlePart = p.title.split(' ')[0].replace(/[^a-zA-Z]/g, "").toLowerCase();
      const citeKey = `${authorPart}${yearPart}${titlePart}`;

      return `@article{${citeKey},
  title={${p.title}},
  author={${p.authors}},
  year={${p.year}},
  journal={arXiv preprint},
  url={${p.pdf_url}}
}`;
    }).join("\n\n");

    const blob = new Blob([bibtex], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "citations.bib";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCategoryToggle = (code) => {
    setSelectedCategories(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const isBookmarked = selectedPaperDetails && bookmarks.some(b => b.id === selectedPaperDetails.id);

  // Helper to render basic Markdown features (bold & bullet points)
  const renderFormattedText = (text) => {
    return text.split("\n").map((line, idx) => {
      line = line.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, "");
      let formatted = line.replace(/^[*\-]\s+/, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      // Bold **text**
      formatted = formatted.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
      formatted = formatted.replace(/\*([^*]+)\*/g, "<em>$1</em>");

      if (line.trim().startsWith("* ") || line.trim().startsWith("- ")) {
        return (
          <li key={idx} style={{ marginBottom: "6px", marginLeft: "14px" }}
              dangerouslySetInnerHTML={{ __html: formatted.replace(/^[\*\-]\s+/, "") }} />
        );
      }
      if (line.trim().startsWith("### ")) {
        return (
          <h4 key={idx} style={{ fontSize: "14px", color: "#d2d2d2", marginTop: "14px", marginBottom: "6px" }}
              dangerouslySetInnerHTML={{ __html: formatted.replace(/^###\s+/, "") }} />
        );
      }
      return (
        <p key={idx} style={{ margin: "0 0 10px 0", minHeight: line.trim() ? "auto" : "8px" }}
           dangerouslySetInnerHTML={{ __html: formatted }} />
      );
    });
  };

  return (
    <div className="research-app" style={{
      background: "#090909",
      minHeight: "100vh",
      color: "#f4f4f4",
      fontFamily: "var(--sans)",
      display: "flex",
      flexDirection: "column",
      boxSizing: "border-box",
      overflow: "hidden"
    }}>
      {/* HEADER NAVBAR */}
      <header className="app-header" style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 24px",
        background: "rgba(27, 27, 27, 0.7)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
        zIndex: 100,
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.4)"
      }}>
        <div className="brand" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span className="brand-mark" aria-hidden="true">RE</span>

          <div>
            <h1 style={{
              fontSize: "19px",
              fontWeight: "700",
              margin: 0,
              letterSpacing: "0.5px",
              background: "linear-gradient(90deg, #d2d2d2, #d2d2d2)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent"
            }}>
              Research Explorer
            </h1>
            <p style={{ fontSize: "11px", color: "#d2d2d2", margin: 0 }}>
              A workspace for discovery & deeper reading
            </p>
          </div>
        </div>

        {/* STATUS INFOBAR */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{
            fontSize: "12px",
            background: "rgba(43, 43, 43, 0.6)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            padding: "6px 14px",
            borderRadius: "999px",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}>
            <span style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: systemStatus.status === "ready" ? "#d2d2d2"
                        : systemStatus.status === "sample_mode" ? "#d2d2d2"
                        : systemStatus.status === "indexing" ? "#d2d2d2" : "#d2d2d2",
              display: "inline-block"
            }} />
            <span style={{ color: "#d2d2d2", fontWeight: "500" }}>
              {systemStatus.status === "ready" ? `Database Ready (${systemStatus.papers_count.toLocaleString()} papers)`
                : systemStatus.status === "sample_mode" ? `Sample Mode (${systemStatus.papers_count} papers)`
                : systemStatus.status === "indexing" ? `Building Index (${Math.round(systemStatus.indexing_progress * 100)}%)`
                : systemStatus.status === "initializing" ? "Preparing dataset…"
                : "Backend Offline"}
            </span>
          </div>

          {systemStatus.status === "sample_mode" && systemStatus.rebuild_enabled && (
            <button
              onClick={handleRebuildIndex}
              className="glow-button"
              style={{
                padding: "6px 14px",
                borderRadius: "999px",
                border: "none",
                background: "linear-gradient(90deg, #d2d2d2, #d2d2d2)",
                color: "white",
                fontSize: "11px",
                fontWeight: "600",
                cursor: "pointer",
                boxShadow: "0 4px 10px rgba(220, 220, 220, 0.4)",
                transition: "transform 0.2s"
              }}
            >
               Build Full Index
            </button>
          )}

          {systemStatus.status === "indexing" && (
            <div style={{ width: "80px", height: "4px", background: "#2b2b2b", borderRadius: "2px", overflow: "hidden" }}>
              <div style={{
                height: "100%",
                background: "#333333",
                width: `${systemStatus.indexing_progress * 100}%`,
                transition: "width 0.3s"
              }} />
            </div>
          )}
        </div>
      </header>

      {/* DASHBOARD LAYOUT */}
      <main className="app-layout" style={{
        flex: 1,
        display: "flex",
        overflow: "hidden",
        height: "calc(100vh - 72px)"
      }}>
        {/* LEFT COLUMN: CONTROL & SEARCH PANEL */}
        <section className="sidebar" aria-label="Search and paper details" style={{
          width: "420px",
          minWidth: "420px",
          flexShrink: 0,
          background: "linear-gradient(180deg, #1b1b1b, #0a0a0a)",
          borderRight: "1px solid rgba(255, 255, 255, 0.06)",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
          padding: "20px",
          overflowY: "auto",
          boxSizing: "border-box"
        }}>
          {/* TABS SELECTOR */}
          <div style={{
            display: "flex",
            background: "rgba(27, 27, 27, 0.6)",
            padding: "4px",
            borderRadius: "10px",
            border: "1px solid rgba(255, 255, 255, 0.06)"
          }}>
            {["search", "bookmarks", "history"].map(tab => (
              <button
                key={tab}
                aria-pressed={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: "8px",
                  border: "none",
                  borderRadius: "8px",
                  background: activeTab === tab ? "rgba(43, 43, 43, 0.85)" : "none",
                  color: activeTab === tab ? "#fafafa" : "#d2d2d2",
                  fontSize: "12px",
                  fontWeight: "600",
                  textTransform: "capitalize",
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
              >
                {tab === "bookmarks" ? `Bookmarks (${bookmarks.length})` : tab}
              </button>
            ))}
          </div>

          {/* TAB CONTENTS */}
          {activeTab === "search" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* SEARCH INPUT */}
              <div className="card search-card" style={{
                background: "rgba(43, 43, 43, 0.4)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                padding: "16px",
                borderRadius: "16px"
              }}>
                <h2 style={{ fontSize: "14px", fontWeight: "600", color: "#d2d2d2", margin: "0 0 12px 0", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                   Semantic Search
                </h2>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch(query)}
                    aria-label="Research topic"
                    placeholder="What are you researching?"
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      background: "rgba(27, 27, 27, 0.8)",
                      color: "white",
                      fontSize: "13px",
                      outline: "none"
                    }}
                  />
                  <button
                    className="primary-button"
                    onClick={() => handleSearch(query)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: "8px",
                      border: "none",
                      background: "#333333",
                      color: "white",
                      cursor: "pointer",
                      fontSize: "12.5px",
                      fontWeight: "600"
                    }}
                  >
                    Search
                  </button>
                </div>
              </div>

              {searchError && <p role="alert" style={{color: "#d2d2d2"}}>{searchError}</p>}
              {/* SEARCH RESULTS LIST */}
              {searchResults.length > 0 ? (
                <div className="card" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "11px", color: "#d2d2d2", fontWeight: "bold", textTransform: "uppercase" }}>
                      Search Results
                    </span>
                    <button onClick={() => setSearchResults([])} style={{ background: "none", border: "none", color: "#d2d2d2", fontSize: "11px", cursor: "pointer" }}>
                      Clear
                    </button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "300px", overflowY: "auto" }}>
                    {searchResults.map((r, i) => (
                      <div
                        key={i}
                        className="result-card"
                        style={{
                          padding: "10px",
                          borderRadius: "10px",
                          background: selectedPaperId === r.id ? "rgba(220, 220, 220, 0.15)" : "rgba(27, 27, 27, 0.4)",
                          border: `1px solid ${selectedPaperId === r.id ? "#d2d2d2" : "rgba(255, 255, 255, 0.04)"}`,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "10px"
                        }}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Compare ${r.title}`}
                          checked={checkedSynthesisIds.includes(r.id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleSynthesisCheck(r.id);
                          }}
                          style={{ marginTop: "3px", cursor: "pointer" }}
                        />
                        <button className="paper-title" style={{ flex: 1 }} onClick={() => setSelectedPaperId(r.id)}>
                          <div style={{ fontSize: "12px", fontWeight: "600", color: selectedPaperId === r.id ? "#d2d2d2" : "#d6d6d6" }}>
                            {r.title}
                          </div>
                          <div style={{ fontSize: "10px", color: "#d2d2d2", marginTop: "4px" }}>{r.year}</div>
                        </button>
                      </div>
                    ))}
                  </div>
                  {checkedSynthesisIds.length > 0 && (
                    <button
                      className="primary-button"
                      onClick={() => handleSynthesize()}
                      style={{
                        padding: "10px",
                        background: "#333333",
                        border: "none",
                        borderRadius: "8px",
                        color: "white",
                        fontSize: "12px",
                        fontWeight: "600",
                        cursor: "pointer",
                        marginTop: "4px"
                      }}
                    >
                       Compare selected ({checkedSynthesisIds.length})
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: "12.5px", color: "#d2d2d2", textAlign: "center", padding: "40px 10px" }}>
                  Start with a question or a research topic. Your reading list begins here.
                </div>
              )}
            </div>
          )}

          {activeTab === "bookmarks" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={handleExportBibTeX}
                  disabled={bookmarks.length === 0}
                  style={{
                    flex: 1,
                    padding: "8px",
                    background: bookmarks.length > 0 ? "rgba(220, 220, 220, 0.2)" : "rgba(43, 43, 43, 0.3)",
                    border: "1px solid rgba(220, 220, 220, 0.4)",
                    borderRadius: "8px",
                    color: bookmarks.length > 0 ? "#d2d2d2" : "#d2d2d2",
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: bookmarks.length > 0 ? "pointer" : "default"
                  }}
                >
                   Export BibTeX
                </button>
                <button
                  className="primary-button"
                      onClick={() => handleSynthesize()}
                  disabled={checkedSynthesisIds.length === 0}
                  style={{
                    flex: 1,
                    padding: "8px",
                    background: checkedSynthesisIds.length > 0 ? "#d2d2d2" : "rgba(43, 43, 43, 0.3)",
                    border: "none",
                    borderRadius: "8px",
                    color: "white",
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: checkedSynthesisIds.length > 0 ? "pointer" : "default"
                  }}
                >
                   Compare ({checkedSynthesisIds.length})
                </button>
              </div>

              {/* BOOKMARKS LIST */}
              {bookmarks.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "400px", overflowY: "auto" }}>
                  {bookmarks.map((b) => (
                    <div
                      key={b.id}
                      style={{
                        padding: "10px",
                        borderRadius: "10px",
                        background: selectedPaperId === b.id ? "rgba(220, 220, 220, 0.15)" : "rgba(27, 27, 27, 0.4)",
                        border: `1px solid ${selectedPaperId === b.id ? "#d2d2d2" : "rgba(255, 255, 255, 0.04)"}`,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "10px"
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checkedSynthesisIds.includes(b.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleSynthesisCheck(b.id);
                        }}
                        style={{ marginTop: "3px", cursor: "pointer" }}
                      />
                      <div style={{ flex: 1 }} onClick={() => setSelectedPaperId(b.id)}>
                        <div style={{ fontSize: "12px", fontWeight: "600", color: selectedPaperId === b.id ? "#d2d2d2" : "#d6d6d6" }}>
                          {b.title}
                        </div>
                        <div style={{ fontSize: "10px", color: "#d2d2d2", marginTop: "4px" }}>
                          {b.authors.split(',')[0]} • {b.year}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: "12.5px", color: "#d2d2d2", textAlign: "center", padding: "40px 10px" }}>
                  Your Reading List is empty. Bookmark papers to save them here!
                </div>
              )}
            </div>
          )}

          {activeTab === "history" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {searchHistory.length > 0 ? (
                searchHistory.map((h, i) => (
                  <div
                    key={i}
                    onClick={() => {
                      setQuery(h);
                      handleSearch(h);
                    }}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "8px",
                      background: "rgba(27, 27, 27, 0.4)",
                      border: "1px solid rgba(255, 255, 255, 0.03)",
                      fontSize: "12px",
                      color: "#d6d6d6",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}
                  >
                    <span>{h}</span>

                  </div>
                ))
              ) : (
                <div style={{ fontSize: "12.5px", color: "#d2d2d2", textAlign: "center", padding: "40px 10px" }}>
                  No recent searches.
                </div>
              )}
            </div>
          )}

          {/* DYNAMIC METADATA DETAIL CARD */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            {detailsLoading ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", color: "#d2d2d2" }}>
                <div className="spinner" style={{ marginBottom: "12px" }} />
                <span>Fetching paper metadata...</span>
              </div>
            ) : selectedPaperDetails ? (
              <div className="card" style={{
                background: "rgba(27, 27, 27, 0.65)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                padding: "18px",
                borderRadius: "18px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                flex: 1
              }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <span style={{
                      background: `hsl(0, 0%, ${55 + (Math.abs(selectedPaperDetails.cluster) % 5) * 9}%)`,
                      color: "#090909",
                      padding: "2px 8px",
                      borderRadius: "6px",
                      fontSize: "11px",
                      fontWeight: "700"
                    }}>
                      Cluster {selectedPaperDetails.cluster}
                    </span>
                    <span style={{ fontSize: "12px", color: "#d2d2d2" }}>{selectedPaperDetails.year}</span>
                  </div>
                  <h2 style={{ fontSize: "15px", fontWeight: "600", color: "white", margin: 0, lineHeight: "1.4" }}>
                    {selectedPaperDetails.title}
                  </h2>
                </div>

                {/* Bookmark Toggle Button */}
                <button
                  onClick={() => toggleBookmark(selectedPaperDetails)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    background: isBookmarked ? "rgba(220, 220, 220, 0.2)" : "rgba(43, 43, 43, 0.6)",
                    color: isBookmarked ? "#d2d2d2" : "#d6d6d6",
                    cursor: "pointer",
                    fontWeight: "600",
                    fontSize: "12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    transition: "all 0.2s"
                  }}
                >
                  {isBookmarked ? " Bookmarked" : " Bookmark Paper"}
                </button>

                <div style={{ fontSize: "11.5px", color: "#d2d2d2" }}>
                  <strong style={{ color: "#d6d6d6" }}>Authors: </strong>
                  {selectedPaperDetails.authors}
                </div>

                {selectedPaperDetails.categories && selectedPaperDetails.categories.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                    {selectedPaperDetails.categories.map((c, idx) => (
                      <span key={idx} style={{ fontSize: "10px", background: "rgba(220, 220, 220, 0.15)", color: "#d2d2d2", padding: "1px 6px", borderRadius: "4px" }}>
                        {c}
                      </span>
                    ))}
                  </div>
                )}

                <div style={{
                  flex: 1,
                  background: "rgba(9, 9, 9, 0.4)",
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                  borderRadius: "10px",
                  padding: "10px",
                  overflowY: "auto",
                  fontSize: "12px",
                  color: "#d6d6d6",
                  lineHeight: "1.5"
                }}>
                  {selectedPaperDetails.abstract}
                </div>

                <a href={selectedPaperDetails.pdf_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                  <button style={{
                    width: "100%",
                    padding: "9px",
                    borderRadius: "8px",
                    background: "#333333",
                    border: "none",
                    color: "white",
                    fontWeight: "600",
                    fontSize: "12.5px",
                    cursor: "pointer"
                  }}>
                     Open PDF on ArXiv
                  </button>
                </a>

                {/* RELATED PAPERS */}
                {selectedPaperDetails.related && selectedPaperDetails.related.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: "11px", color: "#d2d2d2", textTransform: "uppercase", margin: "0 0 6px 0" }}>
                       Related Research
                    </h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                      {selectedPaperDetails.related.map((p, i) => (
                        <div
                          key={i}
                          onClick={() => setSelectedPaperId(p.id)}
                          style={{
                            fontSize: "11px",
                            color: "#d2d2d2",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis"
                          }}
                        >
                          • {p.title}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                color: "#d2d2d2",
                border: "1px dashed rgba(255, 255, 255, 0.08)",
                borderRadius: "20px",
                padding: "20px",
                textAlign: "center"
              }}>

                <span style={{ fontSize: "13px", color: "#d2d2d2", fontWeight: "600" }}>Select a paper</span>
                <p style={{ fontSize: "11.5px", marginTop: "4px" }}>
                  Hover over or click nodes in the Map landscape, or click graph nodes to display full metadata.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* RIGHT COLUMN: WORKSPACE CONTAINER */}
        <section className="workspace" aria-label="Research visualization" style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "20px",
          gap: "16px",
          boxSizing: "border-box"
        }}>
          {/* HEADER OPTIONS PANEL */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(27, 27, 27, 0.4)",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            padding: "8px 16px",
            borderRadius: "12px",
            flexWrap: "wrap",
            gap: "10px"
          }}>
            {/* View toggles */}
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                aria-pressed={view === "map"}
                onClick={() => setView("map")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "8px",
                  border: "none",
                  background: view === "map" ? "#d2d2d2" : "rgba(43, 43, 43, 0.5)",
                  color: "white",
                  fontWeight: "600",
                  fontSize: "12px",
                  cursor: "pointer"
                }}
              >
                 Landscape Map
              </button>
              <button
                aria-pressed={view === "graph"}
                onClick={() => setView("graph")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "8px",
                  border: "none",
                  background: view === "graph" ? "#d2d2d2" : "rgba(43, 43, 43, 0.5)",
                  color: "white",
                  fontWeight: "600",
                  fontSize: "12px",
                  cursor: "pointer"
                }}
              >
                 Similarity Graph
              </button>
            </div>

            {/* CATEGORY TAG PILLS */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "11px", color: "#d2d2d2", fontWeight: "600", textTransform: "uppercase" }}>
                Filter Categories:
              </span>
              {categoriesList.map(cat => {
                const isActive = selectedCategories.includes(cat.code);
                return (
                  <button
                    key={cat.code}
                    onClick={() => handleCategoryToggle(cat.code)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "6px",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      background: isActive ? "#d2d2d2" : "rgba(43, 43, 43, 0.4)",
                      color: isActive ? "#090909" : "#d2d2d2",
                      fontSize: "11px",
                      fontWeight: "600",
                      cursor: "pointer",
                      transition: "all 0.2s"
                    }}
                  >
                    {cat.name}
                  </button>
                );
              })}
              {selectedCategories.length > 0 && (
                <button
                  onClick={() => setSelectedCategories([])}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#d2d2d2",
                    fontSize: "11px",
                    cursor: "pointer"
                  }}
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          {/* WORKSPACE GRAPH OR CANVAS */}
          <div style={{ flex: 1, position: "relative" }}>
            {!["ready", "sample_mode"].includes(systemStatus.status) ? (
              <p role="status" style={{padding: "24px", color: "#d6d6d6"}}>{systemStatus.message}</p>
            ) : view === "map" ? (
              <ResearchMap
                onSelectPaper={setSelectedPaperId}
                selectedPaperId={selectedPaperId}
                searchQuery={query}
                selectedCategories={selectedCategories}
              />
            ) : (
              <ResearchGraph
                query={query}
                onSelectPaper={setSelectedPaperId}
                selectedPaperId={selectedPaperId}
              />
            )}
          </div>
        </section>
      </main>

      {/* SYNTHESIS LITERATURE REVIEW MODAL */}
      {showSynthesisModal && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(9, 9, 9, 0.8)",
          backdropFilter: "blur(10px)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 1000,
          animation: "fadeIn 0.2s ease-out"
        }}>
          <div className="comparison-dialog" role="dialog" aria-modal="true" aria-labelledby="comparison-title" style={{
            width: "700px",
            maxWidth: "90%",
            height: "550px",
            background: "linear-gradient(135deg, #1b1b1b, #0a0a0a)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: "20px",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 10px 40px rgba(0, 0, 0, 0.8)",
            overflow: "hidden"
          }}>
            {/* Modal Header */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "16px 24px",
              borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
              background: "rgba(27, 27, 27, 0.4)"
            }}>
              <div>
                <h3 id="comparison-title" style={{ fontSize: "16px", fontWeight: "700", margin: 0, color: "#d2d2d2" }}>
                   Abstract Comparison
                </h3>
                <p style={{ fontSize: "11px", color: "#d2d2d2", margin: 0 }}>
                  {synthesisMode === "llm" ? "Local LLM draft · verify claims against the abstracts" : "Extractive comparison · keywords and sentences, no LLM"}
                </p>
              </div>

              {/* Ollama Switcher */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <label style={{ fontSize: "11.5px", color: "#d6d6d6", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                  <input
                    type="checkbox"
                    checked={useOllama}
                    disabled={synthesisLoading || ollamaModels.length === 0}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setUseOllama(enabled);
                      handleSynthesize(enabled);
                    }}
                    style={{ cursor: "pointer" }}
                  />
                  {ollamaModels.length ? "Use local LLM" : "Local LLM unavailable — restart it and refresh"}
                </label>
                {ollamaModels.length > 0 && <select aria-label="Local model" value={ollamaModel}
                  disabled={synthesisLoading || useOllama} onChange={e => setOllamaModel(e.target.value)}>
                  {ollamaModels.map(name => <option key={name} value={name}>{name}</option>)}
                </select>}
              </div>
            </div>
            {synthesisWarning && <p role="alert" style={{padding: "0 24px", color: "#d2d2d2"}}>{synthesisWarning}</p>}

            {/* Modal Content */}
            <div style={{
              flex: 1,
              padding: "24px",
              overflowY: "auto",
              fontSize: "13px",
              color: "#e9e9e9",
              lineHeight: "1.6",
              background: "rgba(9, 9, 9, 0.2)"
            }}>
              {synthesisLoading ? (
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100%", gap: "12px" }}>
                  <div className="spinner" />
                  <span style={{ color: "#d2d2d2", fontWeight: "600" }}>{synthesisMode === "llm" ? "Generating locally — this may take up to two minutes..." : "Extracting keywords and sentences..."}</span>
                </div>
              ) : (
                <div style={{ animation: "fadeIn 0.2s ease-out" }}>
                  {renderFormattedText(synthesisText)}
                  {synthesisSources.length > 0 && <section aria-label="Source abstracts">
                    <h3>Source abstracts</h3>
                    <ul>{synthesisSources.map(source => <li key={source.label}>
                      [{source.label}] {source.url.startsWith("https://")
                        ? <a href={source.url} target="_blank" rel="noreferrer" style={{color: "#d2d2d2"}}>{source.title}</a>
                        : source.title}
                    </li>)}</ul>
                  </section>}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: "16px 24px",
              borderTop: "1px solid rgba(255, 255, 255, 0.06)",
              display: "flex",
              justifyContent: "flex-end",
              background: "rgba(27, 27, 27, 0.4)"
            }}>
              <button
                onClick={() => setShowSynthesisModal(false)}
                style={{
                  padding: "8px 18px",
                  background: "#2b2b2b",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "8px",
                  color: "#d6d6d6",
                  cursor: "pointer",
                  fontWeight: "600",
                  fontSize: "12.5px"
                }}
              >
                Close comparison
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
