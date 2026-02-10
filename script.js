// ============================================
// INTERNET MAP — Living network visualization
// Force-directed graph with real physics
// ============================================

const canvas = document.getElementById('network');
const ctx = canvas.getContext('2d');

let W, H;
function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

// ---- MOUSE ----
const mouse = { x: -9999, y: -9999, active: false };
document.addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
});
document.addEventListener('mouseleave', () => { mouse.active = false; });

// ---- SAFE ZONE ----
function inSafe(x, y, p) {
    const pad = p || 0;
    const cx = W * 0.5, cy = H * 0.5;
    const hw = W * 0.2 + pad, hh = H * 0.28 + pad;
    return x > cx - hw && x < cx + hw && y > cy - hh && y < cy + hh;
}

// ---- COLORS (muted, weighted toward blue) ----
const GROUPS = [
    { r: 50, g: 100, b: 190 },
    { r: 50, g: 100, b: 190 },
    { r: 50, g: 100, b: 190 },
    { r: 170, g: 55, b: 55 },
    { r: 50, g: 145, b: 80 },
    { r: 155, g: 120, b: 40 },
    { r: 120, g: 60, b: 155 },
    { r: 50, g: 140, b: 160 },
    { r: 175, g: 90, b: 45 },
    { r: 155, g: 50, b: 110 },
];

// ---- CLUSTERS ----
const CLUSTER_COUNT = 20;
const clusters = [];
for (let i = 0; i < CLUSTER_COUNT; i++) {
    let cx, cy;
    do {
        cx = 100 + Math.random() * (W - 200);
        cy = 100 + Math.random() * (H - 200);
    } while (inSafe(cx, cy, 90));
    clusters.push({
        x: cx, y: cy,
        group: GROUPS[Math.floor(Math.random() * GROUPS.length)],
        spread: 40 + Math.random() * 110,
    });
}

// ---- NODES ----
const NODE_COUNT = 600;
const nodes = [];

for (let i = 0; i < NODE_COUNT; i++) {
    const isClustered = Math.random() < 0.7;
    let x, y, group;

    if (isClustered) {
        const c = clusters[Math.floor(Math.random() * clusters.length)];
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * c.spread;
        x = c.x + Math.cos(a) * d;
        y = c.y + Math.sin(a) * d;
        group = c.group;
    } else {
        do { x = Math.random() * W; y = Math.random() * H; } while (inSafe(x, y, 50));
        group = GROUPS[Math.floor(Math.random() * GROUPS.length)];
    }

    const roll = Math.random();
    let radius;
    if (roll > 0.995) radius = 16 + Math.random() * 12;
    else if (roll > 0.97) radius = 8 + Math.random() * 8;
    else if (roll > 0.85) radius = 3.5 + Math.random() * 4.5;
    else if (roll > 0.5) radius = 1.5 + Math.random() * 2;
    else radius = 0.4 + Math.random() * 1.1;

    const rv = (Math.random() - 0.5) * 30;
    const gv = (Math.random() - 0.5) * 30;
    const bv = (Math.random() - 0.5) * 30;

    nodes.push({
        x, y,
        vx: 0, vy: 0,
        radius,
        mass: radius * radius, // bigger nodes are heavier
        r: Math.round(Math.max(0, Math.min(255, group.r + rv))),
        g: Math.round(Math.max(0, Math.min(255, group.g + gv))),
        b: Math.round(Math.max(0, Math.min(255, group.b + bv))),
        alpha: radius > 8 ? 0.65 + Math.random() * 0.3 :
            radius > 3 ? 0.35 + Math.random() * 0.3 :
                0.12 + Math.random() * 0.2,
    });
}

// ---- EDGES ----
const edges = [];
for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    const maxConn = a.radius > 8 ? 6 : a.radius > 3 ? 3 : 1;
    let conn = 0;

    // Find nearest nodes to connect to
    const dists = [];
    for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const dx = a.x - nodes[j].x;
        const dy = a.y - nodes[j].y;
        dists.push({ j, d: Math.sqrt(dx * dx + dy * dy) });
    }
    dists.sort((a, b) => a.d - b.d);

    for (let k = 0; k < Math.min(maxConn, dists.length); k++) {
        if (dists[k].d < 120 + a.radius * 3) {
            const exists = edges.some(e =>
                (e.a === i && e.b === dists[k].j) || (e.a === dists[k].j && e.b === i)
            );
            if (!exists) {
                edges.push({
                    a: i,
                    b: dists[k].j,
                    restLen: dists[k].d * (0.8 + Math.random() * 0.4),
                    strength: 0.0002 + Math.random() * 0.0003,
                });
                conn++;
            }
        }
    }
}

// ---- SPATIAL HASH for efficient repulsion ----
const CELL_SIZE = 80;
let grid = {};

function hashKey(x, y) {
    return `${Math.floor(x / CELL_SIZE)},${Math.floor(y / CELL_SIZE)}`;
}

function buildGrid() {
    grid = {};
    for (let i = 0; i < nodes.length; i++) {
        const key = hashKey(nodes[i].x, nodes[i].y);
        if (!grid[key]) grid[key] = [];
        grid[key].push(i);
    }
}

function getNeighborIndices(x, y) {
    const result = [];
    const cx = Math.floor(x / CELL_SIZE);
    const cy = Math.floor(y / CELL_SIZE);
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            const cell = grid[`${cx + dx},${cy + dy}`];
            if (cell) result.push(...cell);
        }
    }
    return result;
}

// ---- AMBIENT FLOW FIELD ----
// Creates gentle currents that drift nodes around organically
function flowForce(x, y, time) {
    const scale = 0.003;
    const t = time * 0.0004;
    // Cheap "noise" using sine waves
    const fx = Math.sin(x * scale + t) * Math.cos(y * scale * 0.7 + t * 1.3) * 0.012;
    const fy = Math.cos(x * scale * 0.8 + t * 0.9) * Math.sin(y * scale + t * 1.1) * 0.012;
    return { fx, fy };
}

// ---- RENDER ----
let frame = 0;

function render() {
    frame++;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = '#050508';
    ctx.fillRect(0, 0, W, H);

    const safeCx = W * 0.5;
    const safeCy = H * 0.5;
    const mouseR = 160;

    // Build spatial hash
    buildGrid();

    // ---- PHYSICS ----
    // 1. Edge spring forces (attraction along connections)
    for (const e of edges) {
        const na = nodes[e.a];
        const nb = nodes[e.b];
        const dx = nb.x - na.x;
        const dy = nb.y - na.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
        const diff = dist - e.restLen;
        const force = diff * e.strength;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        na.vx += fx / (1 + na.mass * 0.01);
        na.vy += fy / (1 + na.mass * 0.01);
        nb.vx -= fx / (1 + nb.mass * 0.01);
        nb.vy -= fy / (1 + nb.mass * 0.01);
    }

    // 2. Node repulsion + flow + mouse + safezone
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];

        // Repulsion from nearby nodes (via spatial hash)
        const neighbors = getNeighborIndices(n.x, n.y);
        for (const j of neighbors) {
            if (j <= i) continue;
            const other = nodes[j];
            const dx = n.x - other.x;
            const dy = n.y - other.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 0.5;
            const minDist = (n.radius + other.radius) * 1.8 + 8;

            if (dist < minDist) {
                const force = ((minDist - dist) / minDist) * 0.15;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                n.vx += fx;
                n.vy += fy;
                other.vx -= fx;
                other.vy -= fy;
            }
        }

        // Flow field — ambient drift currents
        const flow = flowForce(n.x, n.y, frame);
        n.vx += flow.fx;
        n.vy += flow.fy;

        // Mouse repulsion
        if (mouse.active) {
            const dx = n.x - mouse.x;
            const dy = n.y - mouse.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < mouseR && d > 0.5) {
                const f = (1 - d / mouseR) * 0.6;
                n.vx += (dx / d) * f;
                n.vy += (dy / d) * f;
            }
        }

        // Safe zone push
        if (inSafe(n.x, n.y, 25)) {
            const dx = n.x - safeCx;
            const dy = n.y - safeCy;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            n.vx += (dx / d) * 0.2;
            n.vy += (dy / d) * 0.2;
        }

        // Gentle pull toward screen center (prevents everything drifting off)
        const pullX = (W / 2 - n.x) * 0.00003;
        const pullY = (H / 2 - n.y) * 0.00003;
        n.vx += pullX;
        n.vy += pullY;

        // Damping
        n.vx *= 0.95;
        n.vy *= 0.95;
        n.x += n.vx;
        n.y += n.vy;

        // Soft boundary
        const margin = 40;
        if (n.x < -margin) n.x += W + margin * 2;
        if (n.x > W + margin) n.x -= W + margin * 2;
        if (n.y < -margin) n.y += H + margin * 2;
        if (n.y > H + margin) n.y -= H + margin * 2;
    }

    // ---- DRAW EDGES ----
    ctx.lineCap = 'round';
    for (const e of edges) {
        const a = nodes[e.a];
        const b = nodes[e.b];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 250) continue;

        const sizeW = (a.radius + b.radius) * 0.004;
        const distFade = Math.max(0, 1 - dist / 220);
        const alpha = distFade * (0.035 + sizeW);
        if (alpha < 0.003) continue;

        const mr = (a.r + b.r) >> 1;
        const mg = (a.g + b.g) >> 1;
        const mb = (a.b + b.b) >> 1;

        ctx.strokeStyle = `rgba(${mr},${mg},${mb},${alpha.toFixed(3)})`;
        ctx.lineWidth = 0.3 + sizeW * 5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
    }

    // ---- DRAW NODES ----
    for (const n of nodes) {
        const { x, y, radius, r, g, b, alpha } = n;

        // Velocity-based brightness (moving nodes glow a bit more)
        const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
        const motionBoost = Math.min(0.15, speed * 0.1);

        let mouseBoost = 0;
        if (mouse.active) {
            const dx = x - mouse.x;
            const dy = y - mouse.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < mouseR) mouseBoost = (1 - d / mouseR) * 0.25;
        }

        const a = Math.min(1, alpha + motionBoost + mouseBoost);

        // Glow for larger nodes
        if (radius > 5) {
            const glowR = radius * 2.2;
            const grad = ctx.createRadialGradient(x, y, radius * 0.4, x, y, glowR);
            grad.addColorStop(0, `rgba(${r},${g},${b},${(a * 0.1).toFixed(3)})`);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, glowR, 0, Math.PI * 2);
            ctx.fill();
        }

        // Body
        ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Center highlight on big nodes
        if (radius > 10) {
            ctx.fillStyle = `rgba(${Math.min(255, r + 50)},${Math.min(255, g + 50)},${Math.min(255, b + 50)},${(a * 0.25).toFixed(2)})`;
            ctx.beginPath();
            ctx.arc(x, y, radius * 0.35, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    requestAnimationFrame(render);
}

render();
