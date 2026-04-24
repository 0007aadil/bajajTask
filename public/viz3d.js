import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

(() => {
  let scene, camera, renderer, controls, animId;
  let nodeObjects = [], edgeObjects = [], labelSprites = [];
  const container = document.getElementById("viz3d-canvas-wrap");
  const section = document.getElementById("viz3d-section");
  const resetBtn = document.getElementById("viz3d-reset");
  const toggleBtn = document.getElementById("viz3d-toggle");

  if (!container) return;

  const COLORS = {
    root: 0xc4161c,
    internal: 0x2a2a2a,
    leaf: 0xaaaaaa,
    cycle: 0xe8a317,
    edge: 0x444444,
    cycleEdge: 0xe8a317,
    bg: 0xf7f5f2,
  };

  function init() {
    const w = container.clientWidth;
    const h = 420;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.bg);
    scene.fog = new THREE.FogExp2(COLORS.bg, 0.008);

    camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000);
    camera.position.set(0, 30, 80);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 20;
    controls.maxDistance = 200;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.8;

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(30, 50, 40);
    scene.add(dirLight);
    const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
    backLight.position.set(-20, 20, -30);
    scene.add(backLight);

    // Grid
    const grid = new THREE.GridHelper(120, 20, 0xdddddd, 0xeeeeee);
    grid.position.y = -15;
    scene.add(grid);

    animate();
    handleResize();
  }

  function animate() {
    animId = requestAnimationFrame(animate);
    controls.update();

    // Gentle float animation
    nodeObjects.forEach((obj, i) => {
      obj.position.y += Math.sin(Date.now() * 0.001 + i * 0.7) * 0.01;
    });

    // Labels face camera
    labelSprites.forEach(s => s.lookAt(camera.position));

    renderer.render(scene, camera);
  }

  function handleResize() {
    window.addEventListener("resize", () => {
      if (!renderer || !container.clientWidth) return;
      const w = container.clientWidth;
      const h = 420;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
  }

  function clearScene() {
    nodeObjects.forEach(o => scene.remove(o));
    edgeObjects.forEach(o => scene.remove(o));
    labelSprites.forEach(o => scene.remove(o));
    nodeObjects = [];
    edgeObjects = [];
    labelSprites = [];
  }

  function buildGraph(apiData) {
    clearScene();

    const nodes = new Map();
    const edges = [];
    const cycleNodes = new Set();

    (apiData.hierarchies || []).forEach(h => {
      if (h.has_cycle) {
        // For cycles, extract nodes from root
        const keys = Object.keys(h.tree).length > 0 ? Object.keys(h.tree) : [h.root];
        keys.forEach(k => cycleNodes.add(k));
      }
      collectNodes(h.tree, null, nodes, edges, h.has_cycle ? cycleNodes : null);
      if (h.has_cycle && !nodes.has(h.root)) {
        nodes.set(h.root, { type: "cycle" });
      }
    });

    // Rebuild edges for cycles from original data
    if (apiData._edges) {
      apiData._edges.forEach(e => {
        const parts = e.split("->");
        if (parts.length === 2 && cycleNodes.has(parts[0]) && cycleNodes.has(parts[1])) {
          if (!nodes.has(parts[0])) nodes.set(parts[0], { type: "cycle" });
          if (!nodes.has(parts[1])) nodes.set(parts[1], { type: "cycle" });
          edges.push({ from: parts[0], to: parts[1], cycle: true });
        }
      });
    }

    // Layout: arrange in 3D space
    const positions = layoutNodes(nodes, edges);

    // Create node meshes
    nodes.forEach((info, label) => {
      const pos = positions.get(label);
      if (!pos) return;

      const isCycle = info.type === "cycle";
      const isRoot = info.type === "root";
      const isLeaf = info.type === "leaf";

      const radius = isRoot ? 2.5 : 1.8;
      const geo = new THREE.SphereGeometry(radius, 32, 32);
      const color = isCycle ? COLORS.cycle : isRoot ? COLORS.root : isLeaf ? COLORS.leaf : COLORS.internal;
      const mat = new THREE.MeshPhongMaterial({
        color,
        shininess: 80,
        specular: 0x444444,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      scene.add(mesh);
      nodeObjects.push(mesh);

      // Glow ring for roots
      if (isRoot) {
        const ringGeo = new THREE.TorusGeometry(3.5, 0.15, 16, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.copy(pos);
        ring.rotation.x = Math.PI / 2;
        scene.add(ring);
        nodeObjects.push(ring);
      }

      // Label
      const sprite = makeLabel(label, color);
      sprite.position.set(pos.x, pos.y + radius + 1.5, pos.z);
      scene.add(sprite);
      labelSprites.push(sprite);
    });

    // Create edges
    edges.forEach(({ from, to, cycle }) => {
      const p1 = positions.get(from);
      const p2 = positions.get(to);
      if (!p1 || !p2) return;

      const curve = new THREE.QuadraticBezierCurve3(
        p1.clone(),
        new THREE.Vector3((p1.x + p2.x) / 2, (p1.y + p2.y) / 2 + 3, (p1.z + p2.z) / 2),
        p2.clone()
      );
      const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.2, 8, false);
      const tubeMat = new THREE.MeshPhongMaterial({
        color: cycle ? COLORS.cycleEdge : COLORS.edge,
        transparent: true,
        opacity: cycle ? 0.7 : 0.5,
      });
      const tube = new THREE.Mesh(tubeGeo, tubeMat);
      scene.add(tube);
      edgeObjects.push(tube);

      // Arrow at midpoint
      const mid = curve.getPoint(0.7);
      const dir = curve.getTangent(0.7).normalize();
      const arrowGeo = new THREE.ConeGeometry(0.5, 1.5, 8);
      const arrowMat = new THREE.MeshPhongMaterial({ color: cycle ? COLORS.cycleEdge : COLORS.edge });
      const arrow = new THREE.Mesh(arrowGeo, arrowMat);
      arrow.position.copy(mid);
      arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      scene.add(arrow);
      edgeObjects.push(arrow);
    });

    // Center camera
    const center = new THREE.Vector3();
    nodeObjects.forEach(o => center.add(o.position));
    if (nodeObjects.length) center.divideScalar(nodeObjects.length);
    controls.target.copy(center);
    camera.position.set(center.x + 30, center.y + 30, center.z + 60);
  }

  function collectNodes(tree, parent, nodes, edges, cycleNodeSet) {
    Object.keys(tree).forEach(key => {
      const children = Object.keys(tree[key]);
      const isCycle = cycleNodeSet && cycleNodeSet.has(key);
      const type = isCycle ? "cycle" : (!parent ? "root" : children.length === 0 ? "leaf" : "internal");
      nodes.set(key, { type });

      if (parent) {
        edges.push({ from: parent, to: key, cycle: isCycle });
      }
      collectNodes(tree[key], key, nodes, edges, cycleNodeSet);
    });
  }

  function layoutNodes(nodes, edges) {
    const positions = new Map();
    const nodeList = [...nodes.keys()];
    const n = nodeList.length;

    if (n === 0) return positions;

    // Find connected components
    const adj = {};
    nodeList.forEach(n => { adj[n] = new Set(); });
    edges.forEach(({ from, to }) => {
      if (adj[from]) adj[from].add(to);
      if (adj[to]) adj[to].add(from);
    });

    const visited = new Set();
    const components = [];
    nodeList.forEach(node => {
      if (visited.has(node)) return;
      const comp = [];
      const queue = [node];
      visited.add(node);
      while (queue.length) {
        const curr = queue.shift();
        comp.push(curr);
        (adj[curr] || []).forEach(nb => {
          if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
        });
      }
      components.push(comp);
    });

    // Layout each component in its own region
    const spacing = 35;
    components.forEach((comp, ci) => {
      const offsetX = (ci - (components.length - 1) / 2) * spacing;

      // Build tree levels via BFS
      const roots = comp.filter(n => nodes.get(n)?.type === "root" || nodes.get(n)?.type === "cycle");
      const root = roots[0] || comp[0];
      const levels = [];
      const lvlVisited = new Set([root]);
      let currentLevel = [root];

      while (currentLevel.length) {
        levels.push(currentLevel);
        const next = [];
        currentLevel.forEach(node => {
          (adj[node] || []).forEach(nb => {
            if (!lvlVisited.has(nb)) { lvlVisited.add(nb); next.push(nb); }
          });
        });
        currentLevel = next;
      }

      // Position nodes by level
      levels.forEach((level, li) => {
        const y = -li * 12;
        const width = (level.length - 1) * 10;
        level.forEach((node, ni) => {
          const x = offsetX + (ni - (level.length - 1) / 2) * 10;
          const z = (Math.random() - 0.5) * 6;
          positions.set(node, new THREE.Vector3(x, y, z));
        });
      });
    });

    return positions;
  }

  function makeLabel(text, color) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.font = "bold 40px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#" + new THREE.Color(color).getHexString();
    ctx.fillText(text, 64, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(4, 2, 1);
    return sprite;
  }

  // Expose for script.js to call
  window.render3DGraph = function (apiData) {
    section.hidden = false;
    if (!renderer) init();
    buildGraph(apiData);
  };

  // Reset camera
  resetBtn?.addEventListener("click", () => {
    if (!controls) return;
    camera.position.set(0, 30, 80);
    controls.target.set(0, 0, 0);
    controls.update();
  });

  // Toggle
  let visible = true;
  toggleBtn?.addEventListener("click", () => {
    visible = !visible;
    container.hidden = !visible;
    document.querySelector(".viz3d-hint").hidden = !visible;
    toggleBtn.textContent = visible ? "Hide 3D" : "Show 3D";
    if (visible && !renderer) init();
  });
})();
