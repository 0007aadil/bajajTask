const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── Identity (REPLACE with your real details before deploying) ──
const USER_ID = "aadil05012005";
const EMAIL_ID = "aa5356@srmist.edu.in";
const COLLEGE_ROLL = "RA2311029010009";

// ── POST /bfhl ───────────────────────────────────────────────
app.post("/bfhl", (req, res) => {
  try {
    const { data } = req.body;

    if (!Array.isArray(data)) {
      return res.status(400).json({ error: "\"data\" must be an array of strings." });
    }

    const result = processData(data);

    return res.json({
      user_id: USER_ID,
      email_id: EMAIL_ID,
      college_roll_number: COLLEGE_ROLL,
      ...result,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

// ── Processing Logic ─────────────────────────────────────────

function processData(data) {
  const VALID_EDGE = /^([A-Z])->([A-Z])$/;

  const invalidEntries = [];
  const duplicateEdgesSet = new Set();
  const seenEdges = new Set();

  // Edges that survive validation + dedup
  const validEdges = []; // { parent, child }

  // ── Step 1 & 2: Validate & deduplicate ──
  for (const raw of data) {
    const trimmed = (typeof raw === "string" ? raw : String(raw)).trim();

    const match = trimmed.match(VALID_EDGE);
    if (!match) {
      invalidEntries.push(trimmed);
      continue;
    }

    const parent = match[1];
    const child = match[2];

    // Self-loop → invalid
    if (parent === child) {
      invalidEntries.push(trimmed);
      continue;
    }

    const edgeKey = `${parent}->${child}`;

    if (seenEdges.has(edgeKey)) {
      duplicateEdgesSet.add(edgeKey);
      continue;
    }

    seenEdges.add(edgeKey);
    validEdges.push({ parent, child });
  }

  // ── Step 3: Multi-parent resolution ──
  // A child may only have ONE parent. First-encountered parent edge wins.
  const childToParent = new Map(); // child → parent
  const effectiveEdges = [];

  for (const { parent, child } of validEdges) {
    if (childToParent.has(child)) {
      // Silently discard — child already has a parent
      continue;
    }
    childToParent.set(child, parent);
    effectiveEdges.push({ parent, child });
  }

  // ── Step 4: Build adjacency list & find connected components ──
  const adj = new Map(); // parent → [child, …]
  const allNodes = new Set();

  for (const { parent, child } of effectiveEdges) {
    if (!adj.has(parent)) adj.set(parent, []);
    adj.get(parent).push(child);
    allNodes.add(parent);
    allNodes.add(child);
  }

  // Find connected components (undirected)
  const visited = new Set();
  const components = []; // array of Sets

  function bfsComponent(start) {
    const comp = new Set();
    const queue = [start];
    visited.add(start);
    while (queue.length) {
      const node = queue.shift();
      comp.add(node);
      // undirected neighbours
      for (const { parent, child } of effectiveEdges) {
        if (parent === node && !visited.has(child)) {
          visited.add(child);
          queue.push(child);
        }
        if (child === node && !visited.has(parent)) {
          visited.add(parent);
          queue.push(parent);
        }
      }
    }
    return comp;
  }

  for (const node of allNodes) {
    if (!visited.has(node)) {
      components.push(bfsComponent(node));
    }
  }

  // ── Step 5 & 6: Per-component cycle detection, root finding, tree building ──
  const hierarchies = [];

  for (const comp of components) {
    // Children set within this component
    const childrenInComp = new Set();
    const edgesInComp = [];

    for (const { parent, child } of effectiveEdges) {
      if (comp.has(parent) && comp.has(child)) {
        edgesInComp.push({ parent, child });
        childrenInComp.add(child);
      }
    }

    // Root candidates: nodes that are NOT children
    const roots = [...comp].filter((n) => !childrenInComp.has(n)).sort();
    const hasCycle = detectCycle(comp, edgesInComp);

    if (hasCycle) {
      // Pure cycle or cycle within component
      const root = roots.length > 0 ? roots[0] : [...comp].sort()[0];
      hierarchies.push({ root, tree: {}, has_cycle: true });
    } else {
      // Valid tree(s) — there should be exactly one root per component if acyclic
      const root = roots[0];
      const tree = buildTree(root, adj);
      const depth = computeDepth(tree);
      hierarchies.push({ root, tree, depth });
    }
  }

  // Sort hierarchies: non-cyclic first (by root lex), then cyclic (by root lex)
  // Actually spec doesn't require sorting — keep insertion order matching example
  // Example order: A (tree), X (cycle), P (tree), G (tree) — appears to be input order.
  // We'll keep component discovery order which follows node appearance.

  // ── Step 7: Summary ──
  const trees = hierarchies.filter((h) => !h.has_cycle);
  const cycles = hierarchies.filter((h) => h.has_cycle);

  let largestTreeRoot = "";
  let maxDepth = -1;
  for (const t of trees) {
    if (
      t.depth > maxDepth ||
      (t.depth === maxDepth && t.root < largestTreeRoot)
    ) {
      maxDepth = t.depth;
      largestTreeRoot = t.root;
    }
  }

  return {
    hierarchies,
    invalid_entries: invalidEntries,
    duplicate_edges: [...duplicateEdgesSet],
    summary: {
      total_trees: trees.length,
      total_cycles: cycles.length,
      largest_tree_root: largestTreeRoot,
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Detect cycle using DFS colouring (0 = white, 1 = grey, 2 = black).
 */
function detectCycle(comp, edges) {
  const adjLocal = new Map();
  for (const { parent, child } of edges) {
    if (!adjLocal.has(parent)) adjLocal.set(parent, []);
    adjLocal.get(parent).push(child);
  }

  const color = new Map(); // 0 white, 1 grey, 2 black
  for (const n of comp) color.set(n, 0);

  function dfs(node) {
    color.set(node, 1);
    for (const nb of adjLocal.get(node) || []) {
      if (color.get(nb) === 1) return true; // back edge → cycle
      if (color.get(nb) === 0 && dfs(nb)) return true;
    }
    color.set(node, 2);
    return false;
  }

  for (const n of comp) {
    if (color.get(n) === 0 && dfs(n)) return true;
  }
  return false;
}

/**
 * Build nested tree object from root using adjacency list.
 */
function buildTree(root, adj) {
  const obj = {};
  const children = adj.get(root) || [];
  const childObj = {};
  // Sort children lexicographically so output is deterministic
  for (const child of children.sort()) {
    Object.assign(childObj, buildTree(child, adj));
  }
  obj[root] = childObj;
  return obj;
}

/**
 * Compute depth (# nodes on longest root-to-leaf path) of a nested tree object.
 */
function computeDepth(tree) {
  function helper(obj) {
    const keys = Object.keys(obj);
    if (keys.length === 0) return 0;
    // Each key is a node; its value is its subtree
    let maxChildDepth = 0;
    for (const key of keys) {
      const childDepth = helper(obj[key]);
      maxChildDepth = Math.max(maxChildDepth, childDepth);
    }
    return 1 + maxChildDepth;
  }
  return helper(tree);
}

// ── Start (local dev only — Vercel uses the export) ─────────
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
