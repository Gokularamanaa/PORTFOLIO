// ============================================================================
// CURSOR LAB - MAIN PLAYGROUND SCRIPT
// ============================================================================

// State Management
const settings = {
  currentDesign: 'vortex', // 'vortex', 'constellation', 'ripple'
  speed: 1.0,
  count: 200,
  color: '#00f2fe'
};

// Three.js Core Variables
let scene, camera, renderer;
let currentObjects = []; // Stores meshes/points of the active design
let raycaster, planeZ, mouse, mouse3D;
let width, height;
let time = 0;

// UI Elements
let interactionTip;
const themeColorVar = '--theme-color';
const themeColorRGBVar = '--theme-color-rgb';

// ============================================================================
// INITIALIZATION
// ============================================================================

function init() {
  const container = document.getElementById('canvas-container');
  width = window.innerWidth;
  height = window.innerHeight;

  // Scene
  scene = new THREE.Scene();

  // Camera
  camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
  camera.position.z = 20;

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  // Interaction Helpers
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2(-10, -10); // Start off-screen
  planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  mouse3D = new THREE.Vector3(0, 0, 0);
  interactionTip = document.querySelector('.interaction-tip');

  // Setup Event Listeners
  window.addEventListener('resize', onWindowResize);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('touchmove', onTouchMove, { passive: true });

  setupUIEventListeners();
  
  // Load initial design
  switchDesign(settings.currentDesign);

  // Start Frame Loop
  animate();
}

// ============================================================================
// MOUSE & INTERACTION TRACKING
// ============================================================================

function onMouseMove(e) {
  updateMouseCoords(e.clientX, e.clientY);
}

function onTouchMove(e) {
  if (e.touches.length > 0) {
    updateMouseCoords(e.touches[0].clientX, e.touches[0].clientY);
  }
}

function updateMouseCoords(clientX, clientY) {
  mouse.x = (clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(clientY / window.innerHeight) * 2 + 1;

  // Raycast to Z=0 plane to get exact 3D mouse coordinates
  raycaster.setFromCamera(mouse, camera);
  raycaster.ray.intersectPlane(planeZ, mouse3D);

  // Fade out instruction tooltip on first user movement
  if (interactionTip) {
    gsap.to(interactionTip, {
      opacity: 0,
      y: -20,
      duration: 0.8,
      onComplete: () => {
        if (interactionTip) {
          interactionTip.remove();
          interactionTip = null;
        }
      }
    });
  }
}

function onWindowResize() {
  width = window.innerWidth;
  height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
}

// ============================================================================
// UI INTERACTION & EVENT LISTENERS
// ============================================================================

function setupUIEventListeners() {
  // Design Buttons
  const buttons = ['vortex', 'constellation', 'ripple'];
  buttons.forEach(id => {
    const btn = document.getElementById(`btn-${id}`);
    if (btn) {
      btn.addEventListener('click', () => {
        if (settings.currentDesign === id) return;
        
        // Update active class
        buttons.forEach(b => document.getElementById(`btn-${b}`).classList.remove('active'));
        btn.classList.add('active');
        
        // Swap design
        switchDesign(id);
      });
    }
  });

  // Settings Sliders
  const speedSlider = document.getElementById('slider-speed');
  const speedValue = document.getElementById('val-speed');
  if (speedSlider && speedValue) {
    speedSlider.addEventListener('input', (e) => {
      settings.speed = parseFloat(e.target.value);
      speedValue.textContent = `${settings.speed.toFixed(1)}x`;
    });
  }

  const countSlider = document.getElementById('slider-count');
  const countValue = document.getElementById('val-count');
  if (countSlider && countValue) {
    countSlider.addEventListener('input', (e) => {
      settings.count = parseInt(e.target.value);
      countValue.textContent = settings.count;
      // Reinitialize current design to update particle count dynamically
      reinitCurrentDesign();
    });
  }

  // Color Dots
  const colorDots = document.querySelectorAll('.color-dot');
  const colorPreview = document.getElementById('color-preview');
  
  // Set initial preview color
  if (colorPreview) colorPreview.style.backgroundColor = settings.color;
  
  colorDots.forEach(dot => {
    dot.addEventListener('click', () => {
      colorDots.forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
      
      const newColor = dot.getAttribute('data-color');
      settings.color = newColor;
      if (colorPreview) colorPreview.style.backgroundColor = newColor;

      // Update CSS Variables for branding glow
      document.documentElement.style.setProperty(themeColorVar, newColor);
      document.documentElement.style.setProperty(themeColorRGBVar, hexToRgb(newColor));

      // Reinitialize to redraw with the new color palette
      reinitCurrentDesign();
    });
  });
}

// ============================================================================
// DESIGN SCENE CONTROLLER / SWITCHER
// ============================================================================

function switchDesign(designName) {
  // Clean up existing elements
  cleanUpCurrent();

  settings.currentDesign = designName;
  
  // Update Info Panel Card
  updateInfoCard(designName);

  // Initialize selected design
  let initData;
  if (designName === 'vortex') {
    initData = initVortexDesign();
  } else if (designName === 'constellation') {
    initData = initConstellationDesign();
  } else if (designName === 'ripple') {
    initData = initRippleDesign();
  }

  if (initData) {
    const { group, updateFn } = initData;
    scene.add(group);
    currentObjects.push({ group, updateFn });

    // Transition effect: animate Scale and Rotation
    group.scale.set(0.2, 0.2, 0.2);
    group.rotation.z = Math.PI / 4;
    gsap.to(group.scale, { x: 1, y: 1, z: 1, duration: 1.2, ease: 'power4.out' });
    gsap.to(group.rotation, { z: 0, duration: 1.2, ease: 'power4.out' });
  }
}

function reinitCurrentDesign() {
  // Silent refresh without zoom-in transition
  const designName = settings.currentDesign;
  cleanUpCurrent();

  let initData;
  if (designName === 'vortex') {
    initData = initVortexDesign();
  } else if (designName === 'constellation') {
    initData = initConstellationDesign();
  } else if (designName === 'ripple') {
    initData = initRippleDesign();
  }

  if (initData) {
    const { group, updateFn } = initData;
    scene.add(group);
    currentObjects.push({ group, updateFn });
  }
}

function cleanUpCurrent() {
  currentObjects.forEach(obj => {
    scene.remove(obj.group);
    // Recursively dispose geometry and materials
    obj.group.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  });
  currentObjects = [];
}

function updateInfoCard(designName) {
  const title = document.getElementById('desc-title');
  const text = document.getElementById('desc-text');
  if (!title || !text) return;

  if (designName === 'vortex') {
    title.textContent = "Gravity Vortex";
    text.textContent = "Particles orbit dynamically around the cursor, accelerating as they fall into its gravity well. Uses Newton's law of gravitation combined with damping friction to generate realistic cosmic orbit simulations.";
  } else if (designName === 'constellation') {
    title.textContent = "Constellation Net";
    text.textContent = "Star nodes float freely, dynamically weaving a neon mesh matrix between themselves and the cursor when they get close. Highlights how visual networks react to magnetic cursor proximity.";
  } else if (designName === 'ripple') {
    title.textContent = "Ripple Grid";
    text.textContent = "A structured grid mesh of spring-attached nodes that deform on mouse-hover, producing simulated 3D ripples and organic recoil waves using harmonic oscillator mathematics.";
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? 
    `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : 
    '0, 242, 254';
}

function createCircleTexture(colorHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.25, colorHex);
  gradient.addColorStop(0.55, `rgba(${hexToRgb(colorHex)}, 0.25)`);
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// ============================================================================
// DESIGN 1: GRAVITY VORTEX
// ============================================================================

function initVortexDesign() {
  const group = new THREE.Group();
  
  // Set up particles
  const particleCount = settings.count * 8; // scale density
  const geometry = new THREE.BufferGeometry();
  
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  
  const particles = [];
  const baseColor = new THREE.Color(settings.color);
  
  for (let i = 0; i < particleCount; i++) {
    // Distribute randomly in space
    const theta = Math.random() * Math.PI * 2;
    const radius = Math.random() * 18 + 2;
    
    // Create swirling galaxy-like disc distribution
    const x = Math.cos(theta) * radius;
    const y = Math.sin(theta) * radius;
    const z = (Math.random() - 0.5) * 3;
    
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    
    // Slight variance in particle color shades
    const colorVar = baseColor.clone().multiplyScalar(0.7 + Math.random() * 0.4);
    colors[i * 3] = colorVar.r;
    colors[i * 3 + 1] = colorVar.g;
    colors[i * 3 + 2] = colorVar.b;
    
    particles.push({
      pos: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 0.5),
      orbitSpeed: (0.01 + Math.random() * 0.02) * (Math.random() > 0.4 ? 1 : -1),
      friction: 0.94 + Math.random() * 0.03,
      gravityWeight: 0.5 + Math.random() * 1.5
    });
  }
  
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  
  const texture = createCircleTexture(settings.color);
  const material = new THREE.PointsMaterial({
    size: 0.4,
    map: texture,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  
  const points = new THREE.Points(geometry, material);
  group.add(points);
  
  // Update Physics Frame Function
  const updateFn = (delta) => {
    const posAttr = geometry.getAttribute('position');
    const timeScale = settings.speed;
    
    for (let i = 0; i < particleCount; i++) {
      const p = particles[i];
      
      // Vector pointing from particle to cursor
      const toMouse = new THREE.Vector3().subVectors(mouse3D, p.pos);
      const dist = toMouse.length();
      
      // Calculate gravity attractor force (capped min distance to avoid infinite velocity)
      const capDist = Math.max(dist, 1.5);
      const forceMag = (25.0 * p.gravityWeight * timeScale) / (capDist * capDist);
      
      toMouse.normalize();
      
      // Perpendicular force in XY plane to create orbits
      const orbitDir = new THREE.Vector3(-toMouse.y, toMouse.x, 0);
      
      // Add velocities
      p.vel.addScaledVector(toMouse, forceMag * 0.05);
      p.vel.addScaledVector(orbitDir, forceMag * p.orbitSpeed * 1.5);
      
      // Return gently to center if flying off screen boundaries
      if (dist > 30) {
        const pullHome = new THREE.Vector3(0, 0, 0).sub(p.pos).normalize();
        p.vel.addScaledVector(pullHome, 0.05);
      }
      
      // Apply friction drag
      p.vel.multiplyScalar(p.friction);
      
      // Move particle position
      p.pos.addScaledVector(p.vel, delta * 60);
      
      // Update buffer attributes
      posAttr.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
    }
    posAttr.needsUpdate = true;
    
    // Spin the entire galaxy group slowly
    group.rotation.z += 0.001 * timeScale;
  };
  
  return { group, updateFn };
}

// ============================================================================
// DESIGN 2: CONSTELLATION NET
// ============================================================================

function initConstellationDesign() {
  const group = new THREE.Group();
  
  // Set up nodes
  const nodeCount = Math.min(settings.count, 220); // capped for pairing loop performance
  const geometryNodes = new THREE.BufferGeometry();
  const nodePositions = new Float32Array(nodeCount * 3);
  
  const nodes = [];
  const areaWidth = 32;
  const areaHeight = 20;
  
  for (let i = 0; i < nodeCount; i++) {
    const x = (Math.random() - 0.5) * areaWidth;
    const y = (Math.random() - 0.5) * areaHeight;
    const z = (Math.random() - 0.5) * 4;
    
    nodePositions[i * 3] = x;
    nodePositions[i * 3 + 1] = y;
    nodePositions[i * 3 + 2] = z;
    
    nodes.push({
      pos: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3((Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.03)
    });
  }
  
  geometryNodes.setAttribute('position', new THREE.BufferAttribute(nodePositions, 3));
  
  const texture = createCircleTexture(settings.color);
  const materialNodes = new THREE.PointsMaterial({
    size: 0.55,
    map: texture,
    color: new THREE.Color(settings.color),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  
  const points = new THREE.Points(geometryNodes, materialNodes);
  group.add(points);
  
  // Set up line connections
  const maxLines = 1000;
  const geometryLines = new THREE.BufferGeometry();
  const linePositions = new Float32Array(maxLines * 2 * 3);
  const lineColors = new Float32Array(maxLines * 2 * 3);
  
  geometryLines.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  geometryLines.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));
  
  const materialLines = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    linewidth: 1.5,
    depthWrite: false
  });
  
  const lineSegments = new THREE.LineSegments(geometryLines, materialLines);
  group.add(lineSegments);
  
  // Physics & connection updater
  const updateFn = (delta) => {
    const timeScale = settings.speed;
    const posAttr = geometryNodes.getAttribute('position');
    
    // 1. Move Nodes
    for (let i = 0; i < nodeCount; i++) {
      const n = nodes[i];
      n.pos.addScaledVector(n.vel, delta * 60 * timeScale);
      
      // Bounding box bouncing
      const boundX = areaWidth / 2;
      const boundY = areaHeight / 2;
      const boundZ = 4;
      
      if (Math.abs(n.pos.x) > boundX) { n.vel.x *= -1; n.pos.x = Math.sign(n.pos.x) * boundX; }
      if (Math.abs(n.pos.y) > boundY) { n.vel.y *= -1; n.pos.y = Math.sign(n.pos.y) * boundY; }
      if (Math.abs(n.pos.z) > boundZ) { n.vel.z *= -1; n.pos.z = Math.sign(n.pos.z) * boundZ; }
      
      // Gentler magnetic attraction to cursor if close
      const toMouse = new THREE.Vector3().subVectors(mouse3D, n.pos);
      const mDist = toMouse.length();
      if (mDist < 7) {
        const pull = (1.0 - mDist / 7) * 0.015 * timeScale;
        n.pos.addScaledVector(toMouse, pull);
      }
      
      posAttr.setXYZ(i, n.pos.x, n.pos.y, n.pos.z);
    }
    posAttr.needsUpdate = true;
    
    // 2. Build lines based on proximity
    const linePosAttr = geometryLines.getAttribute('position');
    const lineColorAttr = geometryLines.getAttribute('color');
    
    let lineIdx = 0;
    const threshold = 4.2;
    const themeColor = new THREE.Color(settings.color);
    
    for (let i = 0; i < nodeCount; i++) {
      const n1 = nodes[i];
      
      // Distance to Mouse line
      const mouseDist = n1.pos.distanceTo(mouse3D);
      if (mouseDist < threshold + 1.5) {
        if (lineIdx < maxLines) {
          const idx = lineIdx * 6;
          
          linePosAttr.setXYZ(lineIdx * 2, n1.pos.x, n1.pos.y, n1.pos.z);
          linePosAttr.setXYZ(lineIdx * 2 + 1, mouse3D.x, mouse3D.y, mouse3D.z);
          
          // Glowing strength scales with proximity
          const opacity = (1.0 - mouseDist / (threshold + 1.5)) * 0.9;
          const cVal = themeColor.clone().multiplyScalar(opacity);
          
          lineColorAttr.setXYZ(lineIdx * 2, cVal.r, cVal.g, cVal.b);
          lineColorAttr.setXYZ(lineIdx * 2 + 1, cVal.r, cVal.g, cVal.b);
          
          lineIdx++;
        }
      }
      
      // Node to node lines
      for (let j = i + 1; j < nodeCount; j++) {
        const n2 = nodes[j];
        const dist = n1.pos.distanceTo(n2.pos);
        
        if (dist < threshold) {
          if (lineIdx < maxLines) {
            linePosAttr.setXYZ(lineIdx * 2, n1.pos.x, n1.pos.y, n1.pos.z);
            linePosAttr.setXYZ(lineIdx * 2 + 1, n2.pos.x, n2.pos.y, n2.pos.z);
            
            const opacity = (1.0 - dist / threshold) * 0.45;
            const cVal = themeColor.clone().multiplyScalar(opacity);
            
            lineColorAttr.setXYZ(lineIdx * 2, cVal.r, cVal.g, cVal.b);
            lineColorAttr.setXYZ(lineIdx * 2 + 1, cVal.r, cVal.g, cVal.b);
            
            lineIdx++;
          }
        }
      }
    }
    
    // Set dynamic limit range to avoid rendering stale array entries
    geometryLines.setDrawRange(0, lineIdx * 2);
    
    linePosAttr.needsUpdate = true;
    lineColorAttr.needsUpdate = true;
  };
  
  return { group, updateFn };
}

// ============================================================================
// DESIGN 3: RIPPLE GRID
// ============================================================================

function initRippleDesign() {
  const group = new THREE.Group();
  
  // Calculate grid layout sizes
  // We use settings.count to determine dimensions, keeping aspect ratio
  const gridPower = Math.sqrt(settings.count * 1.5); 
  const cols = Math.floor(gridPower * 1.3);
  const rows = Math.floor(gridPower * 0.85);
  const nodeCount = cols * rows;
  
  const spacingX = 32 / (cols - 1);
  const spacingY = 20 / (rows - 1);
  const startX = -16;
  const startY = -10;
  
  const geometryNodes = new THREE.BufferGeometry();
  const nodePositions = new Float32Array(nodeCount * 3);
  const gridNodes = [];
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const hx = startX + c * spacingX;
      const hy = startY + r * spacingY;
      const hz = 0;
      
      nodePositions[idx * 3] = hx;
      nodePositions[idx * 3 + 1] = hy;
      nodePositions[idx * 3 + 2] = hz;
      
      gridNodes.push({
        home: new THREE.Vector3(hx, hy, hz),
        pos: new THREE.Vector3(hx, hy, hz),
        vel: new THREE.Vector3(0, 0, 0)
      });
    }
  }
  
  geometryNodes.setAttribute('position', new THREE.BufferAttribute(nodePositions, 3));
  
  const texture = createCircleTexture(settings.color);
  const materialNodes = new THREE.PointsMaterial({
    size: 0.35,
    map: texture,
    color: new THREE.Color(settings.color),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  
  const points = new THREE.Points(geometryNodes, materialNodes);
  group.add(points);
  
  // Create Net Grid Lines (horizontal + vertical lines)
  const lineCount = (cols - 1) * rows + cols * (rows - 1);
  const geometryLines = new THREE.BufferGeometry();
  const linePositions = new Float32Array(lineCount * 2 * 3);
  const lineColors = new Float32Array(lineCount * 2 * 3);
  
  geometryLines.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  geometryLines.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));
  
  const materialLines = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    linewidth: 1,
    opacity: 0.2, // Base overlay opacity
    depthWrite: false
  });
  
  const lineSegments = new THREE.LineSegments(geometryLines, materialLines);
  group.add(lineSegments);
  
  // Harmonic Spring update loop
  const updateFn = (delta) => {
    const posAttr = geometryNodes.getAttribute('position');
    const linePosAttr = geometryLines.getAttribute('position');
    const lineColorAttr = geometryLines.getAttribute('color');
    
    const timeScale = settings.speed;
    
    // Spring physics configuration
    const kSpring = 0.07;
    const damping = 0.84;
    const hoverRadius = 5.5;
    const repelStrength = 0.16;
    
    // 1. Physics update for each node
    for (let i = 0; i < nodeCount; i++) {
      const n = gridNodes[i];
      
      const dx = n.pos.x - mouse3D.x;
      const dy = n.pos.y - mouse3D.y;
      const dist2D = Math.sqrt(dx * dx + dy * dy);
      
      if (dist2D < hoverRadius) {
        // Force fades linearly from mouse center outwards
        const force = (1.0 - dist2D / hoverRadius) * repelStrength * timeScale;
        const angle = Math.atan2(dy, dx);
        
        // Push XY coordinates away
        n.vel.x += Math.cos(angle) * force;
        n.vel.y += Math.sin(angle) * force;
        
        // 3D Ripple waveform on Z-axis using sine waves
        const rippleZ = Math.sin(dist2D * 2.5 - time * 9) * 1.6 * (1.0 - dist2D / hoverRadius);
        n.pos.z += (rippleZ - n.pos.z) * 0.15 * timeScale;
      } else {
        // Return Z coordinate back to baseline
        n.pos.z += (0 - n.pos.z) * 0.12 * timeScale;
      }
      
      // Spring math pulling XY coordinates back to origin home
      const ax = -kSpring * (n.pos.x - n.home.x);
      const ay = -kSpring * (n.pos.y - n.home.y);
      
      n.vel.x += ax;
      n.vel.y += ay;
      
      // Velocity friction
      n.vel.multiplyScalar(damping);
      
      // Translate positioning
      n.pos.x += n.vel.x * delta * 60;
      n.pos.y += n.vel.y * delta * 60;
      
      posAttr.setXYZ(i, n.pos.x, n.pos.y, n.pos.z);
    }
    posAttr.needsUpdate = true;
    
    // 2. Build Grid net lines
    let lineIdx = 0;
    const baseColor = new THREE.Color(settings.color);
    
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const currIdx = r * cols + c;
        const nCurr = gridNodes[currIdx];
        
        // Horizontal connection (r, c) -> (r, c+1)
        if (c < cols - 1) {
          const rightIdx = currIdx + 1;
          const nRight = gridNodes[rightIdx];
          
          linePosAttr.setXYZ(lineIdx * 2, nCurr.pos.x, nCurr.pos.y, nCurr.pos.z);
          linePosAttr.setXYZ(lineIdx * 2 + 1, nRight.pos.x, nRight.pos.y, nRight.pos.z);
          
          // Scale brightness by node Z ripple displacement
          const maxZ = Math.max(Math.abs(nCurr.pos.z), Math.abs(nRight.pos.z));
          const colorBoost = 0.15 + (maxZ / 1.6) * 0.4;
          const lineCol = baseColor.clone().multiplyScalar(colorBoost);
          
          lineColorAttr.setXYZ(lineIdx * 2, lineCol.r, lineCol.g, lineCol.b);
          lineColorAttr.setXYZ(lineIdx * 2 + 1, lineCol.r, lineCol.g, lineCol.b);
          
          lineIdx++;
        }
        
        // Vertical connection (r, c) -> (r+1, c)
        if (r < rows - 1) {
          const bottomIdx = currIdx + cols;
          const nBottom = gridNodes[bottomIdx];
          
          linePosAttr.setXYZ(lineIdx * 2, nCurr.pos.x, nCurr.pos.y, nCurr.pos.z);
          linePosAttr.setXYZ(lineIdx * 2 + 1, nBottom.pos.x, nBottom.pos.y, nBottom.pos.z);
          
          const maxZ = Math.max(Math.abs(nCurr.pos.z), Math.abs(nBottom.pos.z));
          const colorBoost = 0.15 + (maxZ / 1.6) * 0.4;
          const lineCol = baseColor.clone().multiplyScalar(colorBoost);
          
          lineColorAttr.setXYZ(lineIdx * 2, lineCol.r, lineCol.g, lineCol.b);
          lineColorAttr.setXYZ(lineIdx * 2 + 1, lineCol.r, lineCol.g, lineCol.b);
          
          lineIdx++;
        }
      }
    }
    
    linePosAttr.needsUpdate = true;
    lineColorAttr.needsUpdate = true;
  };
  
  return { group, updateFn };
}

// ============================================================================
// ANIMATION FRAME LOOP
// ============================================================================

let lastTime = 0;

function animate(now) {
  requestAnimationFrame(animate);

  if (!now) now = performance.now();
  const delta = Math.min((now - lastTime) / 1000, 0.1); // cap max delta to prevent spikes
  lastTime = now;
  
  time += delta * settings.speed;

  // Run the specific update function of the active design
  currentObjects.forEach(obj => {
    if (typeof obj.updateFn === 'function') {
      obj.updateFn(delta);
    }
  });

  // Render Frame
  renderer.render(scene, camera);
}

// ============================================================================
// INITIALIZE APPLICATION
// ============================================================================

window.onload = init;
