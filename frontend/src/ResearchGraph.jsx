import { useState, useEffect, useRef } from "react";
import ForceGraph2D from "react-force-graph-2d";

function ResearchGraph({ query }) {
  const [hoverNode, setHoverNode] = useState(null);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [loading, setLoading] = useState(false);
  const fgRef = useRef();

  // ✅ FETCH GRAPH WHEN QUERY CHANGES
  useEffect(() => {
    if (!query) return;

    setLoading(true);
    setSelectedPaper(null);

    fetch(`http://localhost:8000/graph?query=${encodeURIComponent(query)}`)
      .then(res => res.json())
      .then(data => {
        setGraphData({
          nodes: data.nodes,
          links: data.edges
        });
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));

  }, [query]);

  return (
    <div style={{ position: "relative" }}>

      {/* LOADING */}
      {loading && (
        <div style={{
          textAlign: "center",
          marginTop: "10px",
          fontSize: "16px",
          opacity: 0.8
        }}>
          🔍 Searching...
        </div>
      )}

      {/* GRAPH */}
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        nodeLabel="title"
        nodeRelSize={4}
        nodeAutoColorBy="year"

        onNodeHover={(node) => {
          setHoverNode(node || null);
        }}

        onNodeClick={(node) => {
          setSelectedPaper(node);

          const neighbors = new Set();

          graphData.links.forEach(link => {
            const source = typeof link.source === "object" ? link.source.id : link.source;
            const target = typeof link.target === "object" ? link.target.id : link.target;

            if (source === node.id) neighbors.add(target);
            if (target === node.id) neighbors.add(source);
          });

          node.neighbors = neighbors;

          setGraphData({ ...graphData });

          // ZOOM
          fgRef.current.centerAt(node.x, node.y, 800);
          fgRef.current.zoom(2.5, 800);

          const related = graphData.nodes
            .filter(n => n.id !== node.id)
            .slice(0, 5)
            .map(n => n.id);

          graphData.links.forEach(link => {
            const source = typeof link.source === "object" ? link.source.id : link.source;
            const target = typeof link.target === "object" ? link.target.id : link.target;

            if (source === node.id) related.push(target);
            if (target === node.id) related.push(source);
          });

          node.related = [...new Set(related)].slice(0, 5);
        }}

        nodeCanvasObject={(node, ctx) => {
          const isSelected = selectedPaper && node.id === selectedPaper.id;
          const isNeighbor =
            selectedPaper && selectedPaper.neighbors?.has(node.id);

          if (!selectedPaper) {
            ctx.fillStyle = "#60a5fa";
          } else if (isSelected) {
            ctx.fillStyle = "#facc15";
          } else if (isNeighbor) {
            ctx.fillStyle = "#22c55e";
          } else {
            ctx.fillStyle = "#1e293b";
          }

          ctx.beginPath();
          ctx.arc(node.x, node.y, 4, 0, 2 * Math.PI);
          ctx.fill();
        }}

        linkWidth={(link) => {
          if (!selectedPaper) return 0.5;

          const source = typeof link.source === "object" ? link.source.id : link.source;
          const target = typeof link.target === "object" ? link.target.id : link.target;

          return source === selectedPaper.id || target === selectedPaper.id
            ? 2
            : 0.3;
        }}

        linkColor={(link) => {
          if (!selectedPaper) return "#334155";

          const source = typeof link.source === "object" ? link.source.id : link.source;
          const target = typeof link.target === "object" ? link.target.id : link.target;

          return source === selectedPaper.id || target === selectedPaper.id
            ? "#22c55e"
            : "#1e293b";
        }}

        width={window.innerWidth}
        height={window.innerHeight - 140}
      />

      {/* HOVER CARD */}
      {hoverNode && (
        <div style={{
          position: "absolute",
          left: "20px",
          bottom: "20px",
          width: "300px",
          background: "rgba(15, 23, 42, 0.95)",
          padding: "12px",
          borderRadius: "10px",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0px 5px 15px rgba(0,0,0,0.5)"
        }}>
          <div style={{
            fontSize: "13px",
            fontWeight: "bold",
            marginBottom: "6px",
            color: "#e2e8f0"
          }}>
            {hoverNode.title}
          </div>

          <div style={{
            fontSize: "12px",
            color: "#94a3b8"
          }}>
            {hoverNode.abstract
              ? hoverNode.abstract.slice(0, 120) + "..."
              : "No abstract available"}
          </div>
        </div>
      )}

      {/* SIDE PANEL */}
      {selectedPaper && (
        <div style={{
          position: "absolute",
          right: "20px",
          top: "90px",
          width: "380px",
          background: "linear-gradient(135deg, #1e293b, #0f172a)",
          padding: "20px",
          borderRadius: "14px",
          boxShadow: "0px 10px 25px rgba(0,0,0,0.6)"
        }}>
          <h2 style={{ fontSize: "17px" }}>{selectedPaper.title}</h2>

          <div style={{ marginBottom: "10px" }}>
            {selectedPaper.year}
          </div>

          <a href={selectedPaper.pdf_url} target="_blank" rel="noopener noreferrer">
            <button style={{
              width: "100%",
              padding: "12px",
              background: "#22c55e",
              border: "none",
              borderRadius: "10px",
              color: "white"
            }}>
              📄 Open Paper
            </button>
          </a>

          <button
            onClick={() => setSelectedPaper(null)}
            style={{
              marginTop: "10px",
              width: "100%",
              padding: "8px",
              background: "#334155",
              border: "none",
              borderRadius: "6px",
              color: "white"
            }}
          >
            ✖ Close
          </button>
        </div>
      )}
    </div>
  );
}

export default ResearchGraph;