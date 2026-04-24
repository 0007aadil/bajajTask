const express = require("express");
const cors = require("cors");
const path = require("path");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── Identity (REPLACE with your real details before deploying) ──
const USER_ID = "aadil_05012005";
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

// ── POST /feedback ───────────────────────────────────────────
const feedbackStore = [];

// Gmail transporter — set GMAIL_APP_PASSWORD env var to enable email
const FEEDBACK_EMAIL = "aadilahsan007@gmail.com";
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: FEEDBACK_EMAIL,
    pass: process.env.GMAIL_APP_PASSWORD || "",
  },
});

app.post("/feedback", async (req, res) => {
  try {
    const { name, email, type, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ error: "Name, email, and message are required." });
    }

    const feedback = {
      id: feedbackStore.length + 1,
      name,
      email,
      type: type || "general",
      message,
      timestamp: new Date().toISOString(),
    };

    feedbackStore.push(feedback);
    console.log(`📬 New feedback from ${name} (${email}): [${type}] ${message}`);

    // Send email if app password is configured
    if (process.env.GMAIL_APP_PASSWORD) {
      try {
        await transporter.sendMail({
          from: `"Nodetree Feedback" <${FEEDBACK_EMAIL}>`,
          to: FEEDBACK_EMAIL,
          replyTo: email,
          subject: `[Nodetree] ${type} feedback from ${name}`,
          text: `Name: ${name}\nEmail: ${email}\nType: ${type}\nTime: ${feedback.timestamp}\n\n${message}`,
          html: `
            <div style="font-family:sans-serif;max-width:500px">
              <h2 style="margin:0 0 16px">New Feedback</h2>
              <table style="border-collapse:collapse;width:100%">
                <tr><td style="padding:6px 12px;color:#888;width:80px">From</td><td style="padding:6px 12px"><strong>${name}</strong></td></tr>
                <tr><td style="padding:6px 12px;color:#888">Email</td><td style="padding:6px 12px"><a href="mailto:${email}">${email}</a></td></tr>
                <tr><td style="padding:6px 12px;color:#888">Type</td><td style="padding:6px 12px">${type}</td></tr>
              </table>
              <div style="margin:16px 0;padding:16px;background:#f5f5f5;border-radius:8px;white-space:pre-wrap">${message}</div>
            </div>
          `,
        });
        console.log(`✉️  Email sent to ${FEEDBACK_EMAIL}`);
      } catch (mailErr) {
        console.error("Email failed:", mailErr.message);
      }
    }

    return res.json({ success: true, message: "Feedback received!" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to process feedback." });
  }
});

// GET feedback (for admin review)
app.get("/feedback", (req, res) => {
  res.json({ total: feedbackStore.length, feedback: feedbackStore });
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

// ── Start ────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log(`⚠️  Port ${PORT} is busy, trying ${+PORT + 1}...`);
    app.listen(+PORT + 1, () => {
      console.log(`🚀 Server running on http://localhost:${+PORT + 1}`);
    });
  } else {
    console.error(err);
  }
});

module.exports = app;
