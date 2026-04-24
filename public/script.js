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

  // ── State ────────────────────────────────────────────────
  let selectedParent = null;
  let selectedChild  = null;
  let edges = []; // array of strings like "A->B"
  let activeSlot = "parent"; // which slot is being filled next

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
      letterGrid.appendChild(createNodeBtn(ch));
    });

    numbers.forEach((ch) => {
      numberGrid.appendChild(createNodeBtn(ch));
    });
  }

  function createNodeBtn(label) {
    const btn = document.createElement("button");
    btn.className = "node-btn";
    btn.type = "button";
    btn.textContent = label;
    btn.dataset.node = label;
    btn.addEventListener("click", () => handleNodeClick(label));
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
      activeSlot = "parent";
      highlightActiveSlot();
    }
    updateAddBtnState();
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

  function syncUI() {
    // Update textarea
    input.value = edges.join(", ");

    // Update chips
    edgeChips.querySelectorAll(".edge-chip").forEach((c) => c.remove());
    edgeChipsEmpty.hidden = edges.length > 0;
    clearAllBtn.hidden = edges.length === 0;
    edgeCount.textContent = edges.length;

    edges.forEach((edge) => {
      const chip = document.createElement("div");
      chip.className = "edge-chip";

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

    // Animate the count
    edgeCount.classList.remove("bump");
    void edgeCount.offsetHeight;
    edgeCount.classList.add("bump");
  }

  // ── Add Edge button ──────────────────────────────────────
  addEdgeBtn.addEventListener("click", () => {
    if (!selectedParent || !selectedChild) return;
    const edgeStr = `${selectedParent}->${selectedChild}`;
    addEdge(edgeStr);

    // Reset for next edge — keep parent as the same for faster chaining
    selectedChild = null;
    childDisplay.textContent = "—";
    childDisplay.classList.remove("filled");
    activeSlot = "child";
    highlightActiveSlot();
    updateAddBtnState();

    // Subtle pulse on the add button
    addEdgeBtn.classList.add("pulse");
    setTimeout(() => addEdgeBtn.classList.remove("pulse"), 300);
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
  });

  // ── Presets ──────────────────────────────────────────────
  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.preset;
      if (PRESETS[key]) {
        setEdges(PRESETS[key]);
      }

      // Highlight active preset
      document.querySelectorAll(".preset-btn").forEach((b) => b.classList.remove("preset-active"));
      btn.classList.add("preset-active");
    });
  });

  // ── Raw textarea sync back to chips ──────────────────────
  input.addEventListener("input", () => {
    const raw = input.value.trim();
    if (!raw) {
      edges = [];
      updateChipsOnly();
      return;
    }
    const parsed = raw.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
    edges = [...new Set(parsed)];
    updateChipsOnly();
  });

  function updateChipsOnly() {
    edgeChips.querySelectorAll(".edge-chip").forEach((c) => c.remove());
    edgeChipsEmpty.hidden = edges.length > 0;
    clearAllBtn.hidden = edges.length === 0;
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
  }

  // ── Parent/Child display click to switch active slot ─────
  parentDisplay.addEventListener("click", () => {
    activeSlot = "parent";
    highlightActiveSlot();
  });

  childDisplay.addEventListener("click", () => {
    activeSlot = "child";
    highlightActiveSlot();
  });

  // ── Keyboard shortcuts ──────────────────────────────────
  document.addEventListener("keydown", (e) => {
    // Only when not typing in textarea
    if (document.activeElement === input) return;

    // Letters A-Z, numbers 1-9 → handle as node click
    const key = e.key.toUpperCase();
    if (/^[A-Z0-9]$/.test(key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      handleNodeClick(key);
    }

    // Enter → add edge
    if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
      if (selectedParent && selectedChild) {
        e.preventDefault();
        addEdgeBtn.click();
      }
    }
  });

  // ── Start Now smooth scroll ──────────────────────────────
  startBtn.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("input-section").scrollIntoView({ behavior: "smooth" });
    setTimeout(() => parentDisplay.focus(), 400);
  });

  // ── Example button (kept hidden, but still wired) ────────
  exampleBtn.addEventListener("click", () => {
    input.value = EXAMPLE;
    input.focus();
  });

  // ── Submit ───────────────────────────────────────────────
  submitBtn.addEventListener("click", handleSubmit);
  input.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSubmit();
  });

  closeToast.addEventListener("click", hideError);

  async function handleSubmit() {
    // Prefer edges array, fallback to textarea
    let data;
    if (edges.length > 0) {
      data = [...edges];
    } else {
      const raw = input.value.trim();
      if (!raw) {
        showError("Add at least one edge to process. Click nodes above or type in the text box.");
        return;
      }
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
      renderResults(json);
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

    // summary strip
    setStat("stat-trees", data.summary.total_trees);
    setStat("stat-cycles", data.summary.total_cycles);
    setStat("stat-largest", data.summary.largest_tree_root || "—");

    // hierarchies
    hierContainer.innerHTML = "";
    (data.hierarchies || []).forEach((h, i) => {
      const card = document.createElement("div");
      card.className = "hier-card";
      card.style.animationDelay = `${i * 0.07}s`;

      const isCycle = !!h.has_cycle;

      card.innerHTML = `
        <div class="hier-head">
          <div class="hier-letter">${h.root}</div>
          <div class="hier-info">
            <span class="pill ${isCycle ? "pill-cycle" : "pill-tree"}">${isCycle ? "cycle" : "tree"}</span>
            ${!isCycle ? `<span class="hier-depth">depth ${h.depth}</span>` : ""}
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

    // flags
    badgesRow.innerHTML = "";
    if (data.invalid_entries && data.invalid_entries.length) {
      badgesRow.innerHTML += flagGroup("Invalid Entries", data.invalid_entries, "flag-invalid");
    }
    if (data.duplicate_edges && data.duplicate_edges.length) {
      badgesRow.innerHTML += flagGroup("Duplicate Edges", data.duplicate_edges, "flag-dup");
    }

    // raw json
    rawJsonPre.textContent = JSON.stringify(data, null, 2);

    // scroll to results
    resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
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
    document.querySelector(`#${id} .ss-num`).textContent = val;
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
})();
