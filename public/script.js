(() => {
  "use strict";

  // ── DOM refs ─────────────────────────────────────────────
  const input         = document.getElementById("data-input");
  const submitBtn     = document.getElementById("submit-btn");
  const exampleBtn    = document.getElementById("example-btn");
  const startBtn      = document.getElementById("start-btn");
  const btnText       = submitBtn.querySelector(".btn-text");
  const btnLoader     = submitBtn.querySelector(".btn-loader");
  const errorToast    = document.getElementById("error-toast");
  const errorMsg      = document.getElementById("error-msg");
  const closeToast    = document.getElementById("toast-close-btn");
  const resultsEl     = document.getElementById("results");
  const hierContainer = document.getElementById("hierarchies-container");
  const badgesRow     = document.getElementById("badges-row");
  const rawJsonPre    = document.getElementById("raw-json");

  // Tree builder DOM refs
  const parentDisplay = document.getElementById("parent-display");
  const childDisplay  = document.getElementById("child-display");
  const addEdgeBtn    = document.getElementById("add-edge-btn");
  const letterGrid    = document.getElementById("letter-grid");
  const numberGrid    = document.getElementById("number-grid");
  const edgeChips     = document.getElementById("edge-chips");
  const edgeChipsEmpty= document.getElementById("edge-chips-empty");
  const edgeCount     = document.getElementById("edge-count");
  const clearAllBtn   = document.getElementById("clear-all-btn");

  // Smart toolbar refs
  const swapBtn       = document.getElementById("swap-btn");
  const chainBtn      = document.getElementById("chain-btn");
  const chainBadge    = document.getElementById("chain-badge");
  const undoBtn       = document.getElementById("undo-btn");
  const undoChipBtn   = document.getElementById("undo-chip-btn");
  const resetSlotBtn  = document.getElementById("reset-slot-btn");
  const usedNodesSection = document.getElementById("used-nodes-section");
  const usedNodesRow  = document.getElementById("used-nodes-row");

  // New feature refs
  const livePreview     = document.getElementById("live-preview");
  const livePreviewCanvas = document.getElementById("live-preview-canvas");
  const livePreviewStats  = document.getElementById("live-preview-stats");
  const shareBtn        = document.getElementById("share-btn");
  const copyJsonBtn     = document.getElementById("copy-json-btn");
  const downloadJsonBtn = document.getElementById("download-json-btn");

  // ── State ────────────────────────────────────────────────
  let selectedParent = null;
  let selectedChild  = null;
  let edges = [];
  let activeSlot = "parent";
  let chainMode = false;
  let allNodeBtns = [];
  let lastApiResponse = null;

  // ── Presets ──────────────────────────────────────────────
  const PRESETS = {
    simple: ["A->B", "A->C", "B->D", "C->E"],
    deep:   ["A->B", "B->C", "C->D", "D->E", "E->F"],
    cycle:  ["X->Y", "Y->Z", "Z->X"],
    full:   ["A->B", "A->C", "B->D", "C->E", "E->F", "X->Y", "Y->Z", "Z->X", "P->Q", "Q->R", "G->H", "G->I"],
  };

  const EXAMPLE = `A->B, A->C, B->D, C->E, E->F, X->Y, Y->Z, Z->X, P->Q, Q->R, G->H, G->H, G->I, hello, 1->2, A->`;

  // ── Initialize node grids ────────────────────────────────
  function buildGrids() {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const numbers = "123456789".split("");

    letters.forEach((ch) => {
      const btn = createNodeBtn(ch);
      letterGrid.appendChild(btn);
      allNodeBtns.push(btn);
    });

    numbers.forEach((ch) => {
      const btn = createNodeBtn(ch);
      numberGrid.appendChild(btn);
      allNodeBtns.push(btn);
    });
  }

  function createNodeBtn(label) {
    const btn = document.createElement("button");
    btn.className = "node-btn";
    btn.type = "button";
    btn.textContent = label;
    btn.dataset.node = label;
    btn.addEventListener("click", () => handleNodeClick(label, btn));
    return btn;
  }

  function handleNodeClick(label) {
    if (activeSlot === "parent") {
      selectedParent = label;
      parentDisplay.textContent = label;
      parentDisplay.classList.add("filled");
      activeSlot = "child";
      highlightActiveSlot();
    } else {
      selectedChild = label;
      childDisplay.textContent = label;
      childDisplay.classList.add("filled");
      autoAddIfReady();
    }
    updateAddBtnState();
    updateNodeHighlights();
  }

  function autoAddIfReady() {
    if (selectedParent && selectedChild) {
      addEdgeBtn.classList.add("ready-pulse");
      setTimeout(() => addEdgeBtn.classList.remove("ready-pulse"), 600);
    }
  }

  function highlightActiveSlot() {
    const parentPicker = document.getElementById("parent-picker");
    const childPicker  = document.getElementById("child-picker");
    parentPicker.classList.toggle("active-slot", activeSlot === "parent");
    childPicker.classList.toggle("active-slot", activeSlot === "child");
  }

  function updateAddBtnState() {
    addEdgeBtn.disabled = !(selectedParent && selectedChild);
  }

  // ── Node Highlighting ───────────────────────────────────
  function updateNodeHighlights() {
    const usedNodes = getUsedNodes();
    allNodeBtns.forEach(btn => {
      const node = btn.dataset.node;
      btn.classList.remove("node-selected-parent", "node-selected-child", "node-used");
      if (node === selectedParent) btn.classList.add("node-selected-parent");
      else if (node === selectedChild) btn.classList.add("node-selected-child");
      else if (usedNodes.has(node)) btn.classList.add("node-used");
    });
  }

  function getUsedNodes() {
    const nodes = new Set();
    edges.forEach(edge => {
      const parts = edge.split("->");
      if (parts[0]) nodes.add(parts[0]);
      if (parts[1]) nodes.add(parts[1]);
    });
    return nodes;
  }

  // ── Used Nodes Quick Access ─────────────────────────────
  function updateUsedNodes() {
    const usedNodes = getUsedNodes();
    usedNodesRow.innerHTML = "";
    if (usedNodes.size === 0) { usedNodesSection.hidden = true; return; }
    usedNodesSection.hidden = false;
    [...usedNodes].sort().forEach(node => {
      const btn = document.createElement("button");
      btn.className = "used-node-btn";
      btn.type = "button";
      btn.textContent = node;
      btn.dataset.node = node;
      const asParent = edges.filter(e => e.startsWith(node + "->")).length;
      const asChild  = edges.filter(e => e.endsWith("->" + node)).length;
      const parts = [];
      if (asParent > 0) parts.push(`parent ×${asParent}`);
      if (asChild > 0)  parts.push(`child ×${asChild}`);
      btn.title = `${node}: ${parts.join(", ")}`;
      if (asParent > 0 && asChild === 0) btn.classList.add("used-root");
      else if (asChild > 0 && asParent === 0) btn.classList.add("used-leaf");
      else btn.classList.add("used-internal");
      btn.addEventListener("click", () => handleNodeClick(node));
      usedNodesRow.appendChild(btn);
    });
  }

  // ── Live Preview ────────────────────────────────────────
  function updateLivePreview() {
    if (edges.length === 0) {
      livePreview.hidden = true;
      return;
    }
    livePreview.hidden = false;

    // Build adjacency from edges
    const adj = {};
    const allNodes = new Set();
    const children = new Set();
    const validEdges = [];

    edges.forEach(e => {
      const parts = e.split("->");
      if (parts.length === 2 && parts[0] && parts[1]) {
        const p = parts[0].trim(), c = parts[1].trim();
        if (!adj[p]) adj[p] = [];
        adj[p].push(c);
        allNodes.add(p);
        allNodes.add(c);
        children.add(c);
        validEdges.push({ parent: p, child: c });
      }
    });

    // Find roots (not children of anyone)
    const roots = [...allNodes].filter(n => !children.has(n)).sort();
    const orphanChildren = [...allNodes].filter(n => children.has(n) && !adj[n] && !roots.includes(n));

    // Stats
    livePreviewStats.textContent = `${allNodes.size} nodes · ${validEdges.length} edges · ${roots.length} root${roots.length !== 1 ? "s" : ""}`;

    // Render mini tree preview
    let html = "";

    function renderMiniTree(node, visited, depth) {
      if (visited.has(node)) return `<div class="lp-node lp-cycle" style="margin-left:${depth * 20}px"><span class="lp-dot lp-dot-cycle"></span>${esc(node)} <small>↻ cycle</small></div>`;
      visited.add(node);
      let out = `<div class="lp-node" style="margin-left:${depth * 20}px"><span class="lp-dot ${depth === 0 ? "lp-dot-root" : adj[node] ? "lp-dot-internal" : "lp-dot-leaf"}"></span>${esc(node)}</div>`;
      if (adj[node]) {
        adj[node].forEach(child => {
          out += renderMiniTree(child, visited, depth + 1);
        });
      }
      return out;
    }

    if (roots.length > 0) {
      roots.forEach(root => {
        html += renderMiniTree(root, new Set(), 0);
      });
    } else {
      // All nodes are in cycles
      [...allNodes].sort().forEach(node => {
        html += `<div class="lp-node"><span class="lp-dot lp-dot-cycle"></span>${esc(node)} <small>↻</small></div>`;
      });
    }

    livePreviewCanvas.innerHTML = html;
  }

  // ── Edge management ──────────────────────────────────────
  function addEdge(edgeStr) {
    if (edges.includes(edgeStr)) return;
    edges.push(edgeStr);
    syncUI();
  }

  function removeEdge(edgeStr) {
    edges = edges.filter((e) => e !== edgeStr);
    syncUI();
  }

  function clearEdges() {
    edges = [];
    syncUI();
  }

  function setEdges(newEdges) {
    edges = [...new Set(newEdges)];
    syncUI();
  }

  function undoLastEdge() {
    if (edges.length === 0) return;
    edges.pop();
    syncUI();
  }

  function syncUI() {
    input.value = edges.join(", ");
    edgeChips.querySelectorAll(".edge-chip").forEach((c) => c.remove());
    edgeChipsEmpty.hidden = edges.length > 0;
    clearAllBtn.hidden = edges.length === 0;
    undoBtn.disabled = edges.length === 0;
    if (undoChipBtn) undoChipBtn.hidden = edges.length === 0;
    edgeCount.textContent = edges.length;

    edges.forEach((edge, idx) => {
      const chip = document.createElement("div");
      chip.className = "edge-chip";
      chip.style.animationDelay = `${idx * 0.03}s`;
      const parts = edge.split("->");
      chip.innerHTML = `
        <span class="chip-parent">${esc(parts[0])}</span>
        <span class="chip-arrow">→</span>
        <span class="chip-child">${esc(parts[1] || "?")}</span>
        <button class="chip-remove" type="button" title="Remove edge">×</button>
      `;
      chip.querySelector(".chip-remove").addEventListener("click", () => removeEdge(edge));
      edgeChips.appendChild(chip);
    });

    edgeCount.classList.remove("bump");
    void edgeCount.offsetHeight;
    edgeCount.classList.add("bump");

    updateUsedNodes();
    updateNodeHighlights();
    updateLivePreview();
    updateShareBtn();
  }

  // ── Add Edge button ──────────────────────────────────────
  addEdgeBtn.addEventListener("click", () => {
    if (!selectedParent || !selectedChild) return;
    addEdge(`${selectedParent}->${selectedChild}`);

    if (chainMode) {
      selectedParent = selectedChild;
      parentDisplay.textContent = selectedParent;
      parentDisplay.classList.add("filled");
    }
    selectedChild = null;
    childDisplay.textContent = "—";
    childDisplay.classList.remove("filled");
    activeSlot = "child";
    highlightActiveSlot();
    updateAddBtnState();
    updateNodeHighlights();

    addEdgeBtn.classList.add("pulse");
    setTimeout(() => addEdgeBtn.classList.remove("pulse"), 300);
  });

  // ── Smart Toolbar: Swap ──────────────────────────────────
  swapBtn.addEventListener("click", () => {
    const tmp = selectedParent;
    selectedParent = selectedChild;
    selectedChild  = tmp;
    parentDisplay.textContent = selectedParent || "—";
    childDisplay.textContent  = selectedChild || "—";
    parentDisplay.classList.toggle("filled", !!selectedParent);
    childDisplay.classList.toggle("filled", !!selectedChild);
    updateAddBtnState();
    updateNodeHighlights();
    swapBtn.classList.add("tool-active");
    setTimeout(() => swapBtn.classList.remove("tool-active"), 300);
  });

  // ── Smart Toolbar: Chain Mode ────────────────────────────
  chainBtn.addEventListener("click", () => {
    chainMode = !chainMode;
    chainBtn.classList.toggle("tool-toggled", chainMode);
    chainBadge.hidden = !chainMode;
    chainBtn.classList.add("tool-active");
    setTimeout(() => chainBtn.classList.remove("tool-active"), 300);
  });

  // ── Smart Toolbar: Undo ──────────────────────────────────
  undoBtn.addEventListener("click", undoLastEdge);
  if (undoChipBtn) undoChipBtn.addEventListener("click", undoLastEdge);

  // ── Smart Toolbar: Reset Selection ───────────────────────
  resetSlotBtn.addEventListener("click", () => {
    selectedParent = null;
    selectedChild  = null;
    parentDisplay.textContent = "—";
    childDisplay.textContent  = "—";
    parentDisplay.classList.remove("filled");
    childDisplay.classList.remove("filled");
    activeSlot = "parent";
    highlightActiveSlot();
    updateAddBtnState();
    updateNodeHighlights();
    resetSlotBtn.classList.add("tool-active");
    setTimeout(() => resetSlotBtn.classList.remove("tool-active"), 300);
  });

  // ── Clear all ────────────────────────────────────────────
  clearAllBtn.addEventListener("click", () => {
    clearEdges();
    selectedParent = null;
    selectedChild = null;
    parentDisplay.textContent = "—";
    childDisplay.textContent = "—";
    parentDisplay.classList.remove("filled");
    childDisplay.classList.remove("filled");
    activeSlot = "parent";
    highlightActiveSlot();
    updateAddBtnState();
    updateNodeHighlights();
  });

  // ── Presets ──────────────────────────────────────────────
  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.preset;
      if (PRESETS[key]) setEdges(PRESETS[key]);
      document.querySelectorAll(".preset-btn").forEach((b) => b.classList.remove("preset-active"));
      btn.classList.add("preset-active");
    });
  });

  // ── Raw textarea sync ────────────────────────────────────
  input.addEventListener("input", () => {
    const raw = input.value.trim();
    if (!raw) { edges = []; syncUI(); return; }
    const parsed = raw.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
    edges = [...new Set(parsed)];
    updateChipsOnly();
  });

  function updateChipsOnly() {
    edgeChips.querySelectorAll(".edge-chip").forEach((c) => c.remove());
    edgeChipsEmpty.hidden = edges.length > 0;
    clearAllBtn.hidden = edges.length === 0;
    undoBtn.disabled = edges.length === 0;
    if (undoChipBtn) undoChipBtn.hidden = edges.length === 0;
    edgeCount.textContent = edges.length;
    edges.forEach((edge) => {
      const chip = document.createElement("div");
      chip.className = "edge-chip";
      const parts = edge.split("->");
      chip.innerHTML = `
        <span class="chip-parent">${esc(parts[0] || "?")}</span>
        <span class="chip-arrow">→</span>
        <span class="chip-child">${esc(parts[1] || "?")}</span>
        <button class="chip-remove" type="button" title="Remove edge">×</button>
      `;
      chip.querySelector(".chip-remove").addEventListener("click", () => removeEdge(edge));
      edgeChips.appendChild(chip);
    });
    updateUsedNodes();
    updateNodeHighlights();
    updateLivePreview();
    updateShareBtn();
  }

  // ── Parent/Child display click ───────────────────────────
  parentDisplay.addEventListener("click", () => { activeSlot = "parent"; highlightActiveSlot(); });
  childDisplay.addEventListener("click", () => { activeSlot = "child"; highlightActiveSlot(); });

  // ── Share Link ───────────────────────────────────────────
  function updateShareBtn() {
    shareBtn.disabled = edges.length === 0;
  }

  shareBtn.addEventListener("click", () => {
    if (edges.length === 0) return;
    const url = new URL(window.location.href.split("?")[0]);
    url.searchParams.set("edges", edges.join(","));
    navigator.clipboard.writeText(url.toString()).then(() => {
      const orig = shareBtn.textContent;
      shareBtn.textContent = "✓ Copied!";
      shareBtn.classList.add("ghost-btn-success");
      setTimeout(() => {
        shareBtn.textContent = orig;
        shareBtn.classList.remove("ghost-btn-success");
      }, 2000);
    }).catch(() => {
      // Fallback: select a prompt
      prompt("Copy this link:", url.toString());
    });
  });

  // Load edges from URL if present
  function loadFromURL() {
    const params = new URLSearchParams(window.location.search);
    const edgesParam = params.get("edges");
    if (edgesParam) {
      const parsed = edgesParam.split(",").map(s => s.trim()).filter(Boolean);
      if (parsed.length > 0) {
        setEdges(parsed);
        // Auto-scroll to input
        setTimeout(() => {
          document.getElementById("input-section").scrollIntoView({ behavior: "smooth" });
        }, 300);
      }
    }
  }

  // ── Copy / Download JSON ─────────────────────────────────
  copyJsonBtn.addEventListener("click", () => {
    if (!lastApiResponse) return;
    const jsonStr = JSON.stringify(lastApiResponse, null, 2);
    navigator.clipboard.writeText(jsonStr).then(() => {
      const orig = copyJsonBtn.textContent;
      copyJsonBtn.textContent = "✓ Copied!";
      copyJsonBtn.classList.add("ghost-btn-success");
      setTimeout(() => {
        copyJsonBtn.textContent = orig;
        copyJsonBtn.classList.remove("ghost-btn-success");
      }, 2000);
    });
  });

  downloadJsonBtn.addEventListener("click", () => {
    if (!lastApiResponse) return;
    const jsonStr = JSON.stringify(lastApiResponse, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bfhl-result-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // ── Keyboard shortcuts ──────────────────────────────────
  document.addEventListener("keydown", (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const key = e.key.toUpperCase();
    if (/^[A-Z0-9]$/.test(key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      handleNodeClick(key);
    }
    if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
      if (selectedParent && selectedChild) { e.preventDefault(); addEdgeBtn.click(); }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      undoLastEdge();
    }
    if (e.key === "Escape") resetSlotBtn.click();
  });

  // ── Start Now smooth scroll ──────────────────────────────
  startBtn.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("input-section").scrollIntoView({ behavior: "smooth" });
    setTimeout(() => parentDisplay.focus(), 400);
  });

  exampleBtn.addEventListener("click", () => { input.value = EXAMPLE; input.focus(); });

  // ── Submit ───────────────────────────────────────────────
  submitBtn.addEventListener("click", handleSubmit);
  input.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSubmit();
  });
  closeToast.addEventListener("click", hideError);

  async function handleSubmit() {
    let data;
    if (edges.length > 0) {
      data = [...edges];
    } else {
      const raw = input.value.trim();
      if (!raw) { showError("Add at least one edge to process."); return; }
      data = raw.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
    }

    setLoading(true);
    hideError();

    try {
      const res = await fetch("/bfhl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      lastApiResponse = json;
      renderResults(json);

      // Trigger 3D visualization
      if (window.render3DGraph) {
        json._edges = data; // pass original edges for cycle reconstruction
        window.render3DGraph(json);
      }
    } catch (err) {
      showError(err.message || "Couldn't reach the API.");
    } finally {
      setLoading(false);
    }
  }

  // ── Render ───────────────────────────────────────────────
  function renderResults(data) {
    resultsEl.hidden = false;
    resultsEl.style.animation = "none";
    void resultsEl.offsetHeight;
    resultsEl.style.animation = "";

    // Summary strip
    setStat("stat-trees", data.summary.total_trees);
    setStat("stat-cycles", data.summary.total_cycles);
    setStat("stat-largest", data.summary.largest_tree_root || "—");

    // Count total nodes and edges
    let totalNodes = new Set();
    let totalEdges = 0;
    (data.hierarchies || []).forEach(h => {
      countTreeNodes(h.tree, totalNodes);
    });
    // Count from valid edges in original data
    if (data.hierarchies) {
      data.hierarchies.forEach(h => {
        totalEdges += countTreeEdges(h.tree);
      });
    }
    setStat("stat-nodes", totalNodes.size);
    setStat("stat-edges", totalEdges);

    // Hierarchies
    hierContainer.innerHTML = "";
    (data.hierarchies || []).forEach((h, i) => {
      const card = document.createElement("div");
      card.className = "hier-card";
      card.style.animationDelay = `${i * 0.07}s`;
      const isCycle = !!h.has_cycle;
      const nodeCount = isCycle ? "—" : countNodes(h.tree);

      card.innerHTML = `
        <div class="hier-head">
          <div class="hier-letter">${h.root}</div>
          <div class="hier-info">
            <span class="pill ${isCycle ? "pill-cycle" : "pill-tree"}">${isCycle ? "cycle" : "tree"}</span>
            ${!isCycle ? `<span class="hier-depth">depth ${h.depth}</span>` : ""}
            ${!isCycle ? `<span class="hier-nodes">${nodeCount} node${nodeCount !== 1 ? "s" : ""}</span>` : ""}
          </div>
        </div>
        <div class="tree-vis">
          ${isCycle
            ? '<span class="cycle-msg">All nodes form a cycle</span>'
            : renderTree(h.tree)}
        </div>
      `;
      hierContainer.appendChild(card);
    });

    // Flags
    badgesRow.innerHTML = "";
    if (data.invalid_entries && data.invalid_entries.length) {
      badgesRow.innerHTML += flagGroup("Invalid Entries", data.invalid_entries, "flag-invalid");
    }
    if (data.duplicate_edges && data.duplicate_edges.length) {
      badgesRow.innerHTML += flagGroup("Duplicate Edges", data.duplicate_edges, "flag-dup");
    }

    rawJsonPre.textContent = JSON.stringify(data, null, 2);
    resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function countNodes(tree) {
    let count = 0;
    for (const key of Object.keys(tree)) {
      count += 1 + countNodes(tree[key]);
    }
    return count;
  }

  function countTreeNodes(tree, nodeSet) {
    for (const key of Object.keys(tree)) {
      nodeSet.add(key);
      countTreeNodes(tree[key], nodeSet);
    }
  }

  function countTreeEdges(tree) {
    let count = 0;
    for (const key of Object.keys(tree)) {
      const childKeys = Object.keys(tree[key]);
      count += childKeys.length;
      count += countTreeEdges(tree[key]);
    }
    return count;
  }

  function renderTree(obj) {
    const keys = Object.keys(obj);
    if (!keys.length) return "";
    let html = "<ul>";
    for (const key of keys) {
      html += `<li><span class="tree-node">${key}</span>${renderTree(obj[key])}</li>`;
    }
    html += "</ul>";
    return html;
  }

  function flagGroup(title, items, cls) {
    return `
      <div class="flag-group">
        <div class="flag-title">${title}</div>
        <div class="flag-list">
          ${items.map((i) => `<span class="flag ${cls}">${esc(i)}</span>`).join("")}
        </div>
      </div>`;
  }

  function setStat(id, val) {
    const el = document.querySelector(`#${id} .ss-num`);
    if (el) el.textContent = val;
  }

  // ── Helpers ──────────────────────────────────────────────
  function setLoading(on) {
    submitBtn.disabled = on;
    btnText.hidden = on;
    btnLoader.hidden = !on;
  }

  let toastTimer;
  function showError(msg) {
    errorMsg.textContent = msg;
    errorToast.hidden = false;
    requestAnimationFrame(() => errorToast.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideError, 5000);
  }

  function hideError() {
    errorToast.classList.remove("show");
    setTimeout(() => { errorToast.hidden = true; }, 300);
  }

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  // ── Init ─────────────────────────────────────────────────
  buildGrids();
  highlightActiveSlot();
  updateShareBtn();
  loadFromURL();

  // ── Feedback Form ───────────────────────────────────────
  const feedbackForm    = document.getElementById("feedback-form");
  const feedbackSuccess = document.getElementById("feedback-success");
  const fbAnotherBtn    = document.getElementById("fb-another-btn");

  if (feedbackForm) {
    feedbackForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const fbBtn = document.getElementById("fb-submit-btn");
      const fbBtnText = fbBtn.querySelector(".btn-text");
      const fbBtnLoader = fbBtn.querySelector(".btn-loader");

      fbBtn.disabled = true;
      fbBtnText.hidden = true;
      fbBtnLoader.hidden = false;

      const name = document.getElementById("fb-name").value.trim();
      const email = document.getElementById("fb-email").value.trim();
      const type = document.getElementById("fb-type").value;
      const message = document.getElementById("fb-message").value.trim();

      try {
        // Send email via Formsubmit.co (free, no signup needed)
        const formData = new FormData();
        formData.append("name", name);
        formData.append("email", email);
        formData.append("_subject", `[Nodetree] ${type} feedback from ${name}`);
        formData.append("message", `Type: ${type}\n\n${message}`);
        formData.append("_captcha", "false");
        formData.append("_template", "table");

        await fetch("https://formsubmit.co/ajax/aadilahsan007@gmail.com", {
          method: "POST",
          headers: { "Accept": "application/json" },
          body: formData,
        });

        // Also save locally
        fetch("/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, type, message }),
        }).catch(() => {});

        feedbackForm.hidden = true;
        feedbackSuccess.hidden = false;
      } catch (err) {
        showError("Failed to send feedback. Please try again.");
      } finally {
        fbBtn.disabled = false;
        fbBtnText.hidden = false;
        fbBtnLoader.hidden = true;
      }
    });
  }

  if (fbAnotherBtn) {
    fbAnotherBtn.addEventListener("click", () => {
      feedbackForm.reset();
      feedbackForm.hidden = false;
      feedbackSuccess.hidden = true;
    });
  }

  // ── Mobile Menu ─────────────────────────────────────────
  const mobileMenuBtn = document.getElementById("mobile-menu-btn");
  const headerNav = document.getElementById("header-nav");
  if (mobileMenuBtn && headerNav) {
    mobileMenuBtn.addEventListener("click", () => {
      headerNav.classList.toggle("nav-open");
      mobileMenuBtn.classList.toggle("menu-open");
    });
  }
})();
