import { useState, useEffect } from "react";
import ResearchGraph from "./ResearchGraph.jsx";
import ResearchMap from "./ResearchMap.jsx";

function App() {
  const [view, setView] = useState("map");
  const [activeTab, setActiveTab] = useState("search"); // search, bookmarks, history
  const [query, setQuery] = useState("");
  const [searchHistory, setSearchHistory] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  
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
      fetch("http://127.0.0.1:8000/")
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
    fetch(`http://127.0.0.1:8000/paper/${selectedPaperId}`)
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

    fetch(`http://127.0.0.1:8000/search?query=${encodeURIComponent(searchQuery)}`)
      .then(res => res.json())
      .then(data => {
        setSearchResults(data.results);
        setActiveTab("search");
      })
      .catch(err => console.error("Search failed:", err));
  };

  // Rebuild Index trigger
  const handleRebuildIndex = () => {
    fetch("http://127.0.0.1:8000/rebuild_index", { method: "POST" })
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
  const handleSynthesize = () => {
    if (checkedSynthesisIds.length === 0) {
      alert("Please select at least one paper using the checkboxes in bookmarks or search results.");
      return;
    }

    setSynthesisLoading(true);
    setSynthesisText("Summarizing content and running TF-IDF alignments...");
    setShowSynthesisModal(true);

    fetch("http://127.0.0.1:8000/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paper_ids: checkedSynthesisIds,
        use_ollama: useOllama,
        ollama_model: "llama3"
      })
    })
      .then(res => res.json())
      .then(data => {
        setSynthesisText(data.synthesis);
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
      let formatted = line;
      // Bold **text**
      formatted = formatted.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
      
      if (line.trim().startsWith("* ") || line.trim().startsWith("- ")) {
        return (
          <li key={idx} style={{ marginBottom: "6px", marginLeft: "14px" }}
              dangerouslySetInnerHTML={{ __html: formatted.replace(/^[\*\-]\s+/, "") }} />
        );
      }
      if (line.trim().startsWith("### ")) {
        return (
          <h4 key={idx} style={{ fontSize: "14px", color: "#38bdf8", marginTop: "14px", marginBottom: "6px" }}
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
    <div style={{
      background: "#030712",
      minHeight: "100vh",
      color: "#f3f4f6",
      fontFamily: "var(--sans)",
      display: "flex",
      flexDirection: "column",
      boxSizing: "border-box",
      overflow: "hidden"
    }}>
      {/* HEADER NAVBAR */}
      <header style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 24px",
        background: "rgba(17, 24, 39, 0.7)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
        zIndex: 100,
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.4)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "28px" }}>📚</span>
          <div>
            <h1 style={{
              fontSize: "19px",
              fontWeight: "700",
              margin: 0,
              letterSpacing: "0.5px",
              background: "linear-gradient(90deg, #38bdf8, #a78bfa)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent"
            }}>
              AI Research Explorer
            </h1>
            <p style={{ fontSize: "11px", color: "#64748b", margin: 0 }}>
              Vector Semantic Search & Clustering Recommender
            </p>
          </div>
        </div>

        {/* STATUS INFOBAR */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{
            fontSize: "12px",
            background: "rgba(30, 41, 59, 0.6)",
            border: "1px solid rgba(255,255,255,0.08)",
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
              background: systemStatus.status === "ready" ? "#10b981" 
                        : systemStatus.status === "sample_mode" ? "#f59e0b" 
                        : systemStatus.status === "indexing" ? "#3b82f6" : "#ef4444",
              display: "inline-block"
            }} />
            <span style={{ color: "#94a3b8", fontWeight: "500" }}>
              {systemStatus.status === "ready" ? `Database Ready (${systemStatus.papers_count.toLocaleString()} papers)`
                : systemStatus.status === "sample_mode" ? `Sample Mode (${systemStatus.papers_count} papers)`
                : systemStatus.status === "indexing" ? `Building Index (${Math.round(systemStatus.indexing_progress * 100)}%)`
                : "Backend Offline"}
            </span>
          </div>

          {systemStatus.status === "sample_mode" && (
            <button
              onClick={handleRebuildIndex}
              className="glow-button"
              style={{
                padding: "6px 14px",
                borderRadius: "999px",
                border: "none",
                background: "linear-gradient(90deg, #2563eb, #7c3aed)",
                color: "white",
                fontSize: "11px",
                fontWeight: "600",
                cursor: "pointer",
                boxShadow: "0 4px 10px rgba(99, 102, 241, 0.4)",
                transition: "transform 0.2s"
              }}
            >
              ⚡ Build Full Index
            </button>
          )}

          {systemStatus.status === "indexing" && (
            <div style={{ width: "80px", height: "4px", background: "#1e293b", borderRadius: "2px", overflow: "hidden" }}>
              <div style={{
                height: "100%",
                background: "#3b82f6",
                width: `${systemStatus.indexing_progress * 100}%`,
                transition: "width 0.3s"
              }} />
            </div>
          )}
        </div>
      </header>

      {/* DASHBOARD LAYOUT */}
      <main style={{
        flex: 1,
        display: "flex",
        overflow: "hidden",
        height: "calc(100vh - 72px)"
      }}>
        {/* LEFT COLUMN: CONTROL & SEARCH PANEL */}
        <section style={{
          width: "420px",
          minWidth: "420px",
          flexShrink: 0,
          background: "linear-gradient(180deg, #0f172a, #020617)",
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
            background: "rgba(15, 23, 42, 0.6)",
            padding: "4px",
            borderRadius: "10px",
            border: "1px solid rgba(255,255,255,0.06)"
          }}>
            {["search", "bookmarks", "history"].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: "8px",
                  border: "none",
                  borderRadius: "8px",
                  background: activeTab === tab ? "rgba(30, 41, 59, 0.85)" : "none",
                  color: activeTab === tab ? "#f8fafc" : "#64748b",
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
              <div className="card" style={{
                background: "rgba(30, 41, 59, 0.4)",
                border: "1px solid rgba(255,255,255,0.06)",
                padding: "16px",
                borderRadius: "16px"
              }}>
                <h2 style={{ fontSize: "14px", fontWeight: "600", color: "#38bdf8", margin: "0 0 12px 0", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  🔍 Semantic Search
                </h2>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch(query)}
                    placeholder="Enter research topics..."
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      background: "rgba(15, 23, 42, 0.8)",
                      color: "white",
                      fontSize: "13px",
                      outline: "none"
                    }}
                  />
                  <button
                    onClick={() => handleSearch(query)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: "8px",
                      border: "none",
                      background: "#3b82f6",
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

              {/* SEARCH RESULTS LIST */}
              {searchResults.length > 0 ? (
                <div className="card" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold", textTransform: "uppercase" }}>
                      Search Results
                    </span>
                    <button onClick={() => setSearchResults([])} style={{ background: "none", border: "none", color: "#f43f5e", fontSize: "11px", cursor: "pointer" }}>
                      Clear
                    </button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "300px", overflowY: "auto" }}>
                    {searchResults.map((r, i) => (
                      <div
                        key={i}
                        style={{
                          padding: "10px",
                          borderRadius: "10px",
                          background: selectedPaperId === r.id ? "rgba(59, 130, 246, 0.15)" : "rgba(15, 23, 42, 0.4)",
                          border: `1px solid ${selectedPaperId === r.id ? "#3b82f6" : "rgba(255,255,255,0.04)"}`,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "10px"
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checkedSynthesisIds.includes(r.id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleSynthesisCheck(r.id);
                          }}
                          style={{ marginTop: "3px", cursor: "pointer" }}
                        />
                        <div style={{ flex: 1 }} onClick={() => setSelectedPaperId(r.id)}>
                          <div style={{ fontSize: "12px", fontWeight: "600", color: selectedPaperId === r.id ? "#93c5fd" : "#cbd5e1" }}>
                            {r.title}
                          </div>
                          <div style={{ fontSize: "10px", color: "#64748b", marginTop: "4px" }}>{r.year}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {checkedSynthesisIds.length > 0 && (
                    <button
                      onClick={handleSynthesize}
                      style={{
                        padding: "10px",
                        background: "#8b5cf6",
                        border: "none",
                        borderRadius: "8px",
                        color: "white",
                        fontSize: "12px",
                        fontWeight: "600",
                        cursor: "pointer",
                        marginTop: "4px"
                      }}
                    >
                      🧪 Synthesize Selection ({checkedSynthesisIds.length})
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: "12.5px", color: "#64748b", textAlign: "center", padding: "40px 10px" }}>
                  Search for topics to display query results.
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
                    background: bookmarks.length > 0 ? "rgba(59, 130, 246, 0.2)" : "rgba(30,41,59,0.3)",
                    border: "1px solid rgba(59, 130, 246, 0.4)",
                    borderRadius: "8px",
                    color: bookmarks.length > 0 ? "#60a5fa" : "#64748b",
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: bookmarks.length > 0 ? "pointer" : "default"
                  }}
                >
                  📥 Export BibTeX
                </button>
                <button
                  onClick={handleSynthesize}
                  disabled={checkedSynthesisIds.length === 0}
                  style={{
                    flex: 1,
                    padding: "8px",
                    background: checkedSynthesisIds.length > 0 ? "#8b5cf6" : "rgba(30,41,59,0.3)",
                    border: "none",
                    borderRadius: "8px",
                    color: "white",
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: checkedSynthesisIds.length > 0 ? "pointer" : "default"
                  }}
                >
                  🧪 Synthesize ({checkedSynthesisIds.length})
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
                        background: selectedPaperId === b.id ? "rgba(59, 130, 246, 0.15)" : "rgba(15, 23, 42, 0.4)",
                        border: `1px solid ${selectedPaperId === b.id ? "#3b82f6" : "rgba(255,255,255,0.04)"}`,
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
                        <div style={{ fontSize: "12px", fontWeight: "600", color: selectedPaperId === b.id ? "#93c5fd" : "#cbd5e1" }}>
                          {b.title}
                        </div>
                        <div style={{ fontSize: "10px", color: "#64748b", marginTop: "4px" }}>
                          {b.authors.split(',')[0]} • {b.year}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: "12.5px", color: "#64748b", textAlign: "center", padding: "40px 10px" }}>
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
                      background: "rgba(15, 23, 42, 0.4)",
                      border: "1px solid rgba(255,255,255,0.03)",
                      fontSize: "12px",
                      color: "#cbd5e1",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}
                  >
                    <span>{h}</span>
                    <span style={{ fontSize: "10px", color: "#64748b" }}>🔍</span>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: "12.5px", color: "#64748b", textAlign: "center", padding: "40px 10px" }}>
                  No recent searches.
                </div>
              )}
            </div>
          )}

          {/* DYNAMIC METADATA DETAIL CARD */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            {detailsLoading ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", color: "#64748b" }}>
                <div className="spinner" style={{ marginBottom: "12px" }} />
                <span>Fetching paper metadata...</span>
              </div>
            ) : selectedPaperDetails ? (
              <div className="card" style={{
                background: "rgba(15, 23, 42, 0.65)",
                border: "1px solid rgba(255,255,255,0.08)",
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
                      background: `hsl(${selectedPaperDetails.cluster * 32}, 85%, 65%)`,
                      color: "#030712",
                      padding: "2px 8px",
                      borderRadius: "6px",
                      fontSize: "11px",
                      fontWeight: "700"
                    }}>
                      Cluster {selectedPaperDetails.cluster}
                    </span>
                    <span style={{ fontSize: "12px", color: "#94a3b8" }}>{selectedPaperDetails.year}</span>
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
                    background: isBookmarked ? "rgba(245, 158, 11, 0.2)" : "rgba(30, 41, 59, 0.6)",
                    color: isBookmarked ? "#fbbf24" : "#cbd5e1",
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
                  {isBookmarked ? "★ Bookmarked" : "☆ Bookmark Paper"}
                </button>

                <div style={{ fontSize: "11.5px", color: "#94a3b8" }}>
                  <strong style={{ color: "#cbd5e1" }}>Authors: </strong>
                  {selectedPaperDetails.authors}
                </div>

                {selectedPaperDetails.categories && selectedPaperDetails.categories.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                    {selectedPaperDetails.categories.map((c, idx) => (
                      <span key={idx} style={{ fontSize: "10px", background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", padding: "1px 6px", borderRadius: "4px" }}>
                        {c}
                      </span>
                    ))}
                  </div>
                )}

                <div style={{
                  flex: 1,
                  background: "rgba(3, 7, 18, 0.4)",
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                  borderRadius: "10px",
                  padding: "10px",
                  overflowY: "auto",
                  fontSize: "12px",
                  color: "#cbd5e1",
                  lineHeight: "1.5"
                }}>
                  {selectedPaperDetails.abstract}
                </div>

                <a href={selectedPaperDetails.pdf_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                  <button style={{
                    width: "100%",
                    padding: "9px",
                    borderRadius: "8px",
                    background: "#10b981",
                    border: "none",
                    color: "white",
                    fontWeight: "600",
                    fontSize: "12.5px",
                    cursor: "pointer"
                  }}>
                    📄 Open PDF on ArXiv
                  </button>
                </a>

                {/* RELATED PAPERS */}
                {selectedPaperDetails.related && selectedPaperDetails.related.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", margin: "0 0 6px 0" }}>
                      🔗 Related Research
                    </h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                      {selectedPaperDetails.related.map((p, i) => (
                        <div
                          key={i}
                          onClick={() => setSelectedPaperId(p.id)}
                          style={{
                            fontSize: "11px",
                            color: "#60a5fa",
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
                color: "#64748b",
                border: "1px dashed rgba(255,255,255,0.08)",
                borderRadius: "20px",
                padding: "20px",
                textAlign: "center"
              }}>
                <span style={{ fontSize: "32px", marginBottom: "10px" }}>🔍</span>
                <span style={{ fontSize: "13px", color: "#94a3b8", fontWeight: "600" }}>No Selection</span>
                <p style={{ fontSize: "11.5px", marginTop: "4px" }}>
                  Hover over or click nodes in the Map landscape, or click graph nodes to display full metadata.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* RIGHT COLUMN: WORKSPACE CONTAINER */}
        <section style={{
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
            background: "rgba(17, 24, 39, 0.4)",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            padding: "8px 16px",
            borderRadius: "12px",
            flexWrap: "wrap",
            gap: "10px"
          }}>
            {/* View toggles */}
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                onClick={() => setView("map")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "8px",
                  border: "none",
                  background: view === "map" ? "#3b82f6" : "rgba(30, 41, 59, 0.5)",
                  color: "white",
                  fontWeight: "600",
                  fontSize: "12px",
                  cursor: "pointer"
                }}
              >
                🗺️ Landscape Map
              </button>
              <button
                onClick={() => setView("graph")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "8px",
                  border: "none",
                  background: view === "graph" ? "#3b82f6" : "rgba(30, 41, 59, 0.5)",
                  color: "white",
                  fontWeight: "600",
                  fontSize: "12px",
                  cursor: "pointer"
                }}
              >
                🕸️ Similarity Graph
              </button>
            </div>

            {/* CATEGORY TAG PILLS */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "600", textTransform: "uppercase" }}>
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
                      background: isActive ? "#38bdf8" : "rgba(30, 41, 59, 0.4)",
                      color: isActive ? "#030712" : "#94a3b8",
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
                    color: "#f43f5e",
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
            {view === "map" ? (
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
          background: "rgba(3, 7, 18, 0.8)",
          backdropFilter: "blur(10px)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 1000,
          animation: "fadeIn 0.2s ease-out"
        }}>
          <div style={{
            width: "700px",
            maxWidth: "90%",
            height: "550px",
            background: "linear-gradient(135deg, #0f172a, #020617)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "20px",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 10px 40px rgba(0,0,0,0.8)",
            overflow: "hidden"
          }}>
            {/* Modal Header */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "16px 24px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(17, 24, 39, 0.4)"
            }}>
              <div>
                <h3 style={{ fontSize: "16px", fontWeight: "700", margin: 0, color: "#a78bfa" }}>
                  🧪 Auto Literature Synthesizer
                </h3>
                <p style={{ fontSize: "11px", color: "#64748b", margin: 0 }}>
                  Synthesizing abstracts via Semantic Alignment
                </p>
              </div>

              {/* Ollama Switcher */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <label style={{ fontSize: "11.5px", color: "#cbd5e1", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                  <input
                    type="checkbox"
                    checked={useOllama}
                    onChange={(e) => {
                      setUseOllama(e.target.checked);
                      // Trigger rebuild if checked status changes
                      setTimeout(handleSynthesize, 100);
                    }}
                    style={{ cursor: "pointer" }}
                  />
                  Use Local Ollama LLM
                </label>
              </div>
            </div>

            {/* Modal Content */}
            <div style={{
              flex: 1,
              padding: "24px",
              overflowY: "auto",
              fontSize: "13px",
              color: "#e2e8f0",
              lineHeight: "1.6",
              background: "rgba(3, 7, 18, 0.2)"
            }}>
              {synthesisLoading ? (
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100%", gap: "12px" }}>
                  <div className="spinner" />
                  <span style={{ color: "#a78bfa", fontWeight: "600" }}>Running TF-IDF extraction...</span>
                </div>
              ) : (
                <div style={{ animation: "fadeIn 0.2s ease-out" }}>
                  {renderFormattedText(synthesisText)}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: "16px 24px",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              display: "flex",
              justifyContent: "flex-end",
              background: "rgba(17, 24, 39, 0.4)"
            }}>
              <button
                onClick={() => setShowSynthesisModal(false)}
                style={{
                  padding: "8px 18px",
                  background: "#1e293b",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "8px",
                  color: "#cbd5e1",
                  cursor: "pointer",
                  fontWeight: "600",
                  fontSize: "12.5px"
                }}
              >
                Close Synthesis
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;