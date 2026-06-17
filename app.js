// Cinematic Intro Variables
let isIntroActive = true;
let introTimeline;
let introGroup;
let introUpdateFn;
let audioCtx = null;
let audioGainNode = null;
let isSoundOn = false;

const introParams = {
  vortexStrength: 0,
  collapseProgress: 0,
  explosionProgress: 0,
  ringStrength: 0,
  ambientDrift: 0.25,
  cameraZ: 25,
  particleSize: 0.35,
};

// ==========================================
// 1. Simplex Noise GLSL Chunk
// ==========================================
const SimplexNoiseGLSL = `
  // MATHS
  vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
  vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
  float permute(float x){return floor(mod(((x*34.0)+1.0)*x, 289.0));}

  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
  float taylorInvSqrt(float r){return 1.79284291400159 - 0.85373472095314 * r;}

  // SIMPLEX NOISES
  // Simplex 2D noise
  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
            -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
    + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
      dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  // Simplex 3D Noise
  float snoise(vec3 v){
    const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i  = floor(v + dot(v, C.yyy) );
    vec3 x0 =   v - i + dot(i, C.xxx) ;

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min( g.xyz, l.zxy );
    vec3 i2 = max( g.xyz, l.zxy );

    vec3 x1 = x0 - i1 + 1.0 * C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1. + 3.0 * C.xxx;

    i = mod(i, 289.0 );
    vec4 p = permute( permute( permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

    float n_ = 1.0/7.0; // N=7
    vec3  ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z *ns.z);  //  mod(p,N*N)

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4( x.xy, y.xy );
    vec4 b1 = vec4( x.zw, y.zw );

    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                  dot(p2,x2), dot(p3,x3) ) );
  }
`;

// ==========================================
// 2. Poisson Disk Sampling implementation
// ==========================================
class PoissonDiskSampling {
  constructor(options) {
    this.shape = options.shape || [500, 500];
    this.minDistance = options.minDistance || 4;
    this.maxDistance = options.maxDistance || 10;
    this.tries = options.tries || 20;
    this.width = this.shape[0];
    this.height = this.shape[1];
    
    // We will use a standard fixed-density Poisson Disk Sampling
    this.cellSize = this.minDistance / Math.sqrt(2);
    this.gridWidth = Math.ceil(this.width / this.cellSize);
    this.gridHeight = Math.ceil(this.height / this.cellSize);
    this.grid = new Array(this.gridWidth * this.gridHeight).fill(-1);
    this.points = [];
    this.active = [];
  }

  fill() {
    // Start with a point in the center
    const p0 = [this.width / 2, this.height / 2];
    this.addPoint(p0);

    while (this.active.length > 0) {
      const randIdx = Math.floor(Math.random() * this.active.length);
      const parent = this.active[randIdx];
      let found = false;

      for (let i = 0; i < this.tries; i++) {
        const angle = Math.random() * Math.PI * 2;
        // Distribute distance between minDistance and maxDistance
        const dist = this.minDistance + Math.random() * (this.maxDistance - this.minDistance);
        const child = [
          parent[0] + Math.cos(angle) * dist,
          parent[1] + Math.sin(angle) * dist
        ];

        if (this.isValid(child)) {
          this.addPoint(child);
          found = true;
          break;
        }
      }

      if (!found) {
        this.active.splice(randIdx, 1);
      }
    }
    return this.points;
  }

  addPoint(p) {
    this.points.push(p);
    this.active.push(p);
    const gridX = Math.floor(p[0] / this.cellSize);
    const gridY = Math.floor(p[1] / this.cellSize);
    this.grid[gridX + gridY * this.gridWidth] = this.points.length - 1;
  }

  isValid(p) {
    if (p[0] < 0 || p[0] >= this.width || p[1] < 0 || p[1] >= this.height) {
      return false;
    }

    const gridX = Math.floor(p[0] / this.cellSize);
    const gridY = Math.floor(p[1] / this.cellSize);

    const searchStartCol = Math.max(0, gridX - 2);
    const searchEndCol = Math.min(this.gridWidth - 1, gridX + 2);
    const searchStartRow = Math.max(0, gridY - 2);
    const searchEndRow = Math.min(this.gridHeight - 1, gridY + 2);

    for (let r = searchStartRow; r <= searchEndRow; r++) {
      for (let c = searchStartCol; c <= searchEndCol; c++) {
        const index = this.grid[c + r * this.gridWidth];
        if (index !== -1) {
          const other = this.points[index];
          const distSq = Math.pow(p[0] - other[0], 2) + Math.pow(p[1] - other[1], 2);
          // Check against minDistance
          if (distSq < this.minDistance * this.minDistance) {
            return false;
          }
        }
      }
    }
    return true;
  }
}

// 1D Perlin-like 1D noise for the auto-drifting ring
class PerlinNoise1D {
  constructor() {
    this.MAX_VERTICES = 256;
    this.MAX_VERTICES_MASK = this.MAX_VERTICES - 1;
    this.amplitude = 1;
    this.scale = 1;
    this.r = [];
    for (let e = 0; e < this.MAX_VERTICES; ++e) {
      this.r.push(Math.random());
    }
  }
  
  getVal(e) {
    const t = e * this.scale;
    const i = Math.floor(t);
    const r = t - i;
    const o = r * r * (3 - 2 * r);
    const s = i % this.MAX_VERTICES_MASK;
    const a = (s + 1) % this.MAX_VERTICES_MASK;
    const l = this.lerp(this.r[s], this.r[a], o);
    return l * this.amplitude;
  }
  
  lerp(e, t, i) {
    return e * (1 - i) + t * i;
  }
}

// ==========================================
// 3. FBO Particles System Class
// ==========================================
class AntigravityParticles {
  constructor(sceneWrapper) {
    this.scene = sceneWrapper;
    this.renderer = sceneWrapper.renderer;
    this.gl = sceneWrapper.renderer.getContext();
    this.camera = sceneWrapper.camera;
    this.lastTime = 0;
    this.everRendered = false;
    this.ringPos = new THREE.Vector2(0, 0);
    this.cursorPos = new THREE.Vector2(0, 0);
    
    this.colorScheme = this.scene.theme === "dark" ? 0 : 1;
    this.particleScale = (this.scene.renderer.domElement.width / this.scene.pixelRatio / 2000) * this.scene.particlesScale;
    
    this.createPoints();
    this.init();
  }

  linearMap(value, inMin, inMax, outMin, outMax) {
    return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
  }

  createPoints() {
    const minD = this.linearMap(this.scene.density, 0, 300, 10, 2);
    const maxD = this.linearMap(this.scene.density, 0, 300, 11, 3);
    
    const poisson = new PoissonDiskSampling({
      shape: [500, 500],
      minDistance: minD,
      maxDistance: maxD,
      tries: 20
    });
    
    const pts = poisson.fill();
    this.pointsData = [];
    for (let i = 0; i < pts.length; i++) {
      this.pointsData.push(pts[i][0] - 250, pts[i][1] - 250);
    }
    this.count = this.pointsData.length / 2;
  }

  createDataTexturePosition() {
    const e = new Float32Array(this.length * 4);
    for (let i = 0; i < this.count; i++) {
      let r = i * 4;
      e[r + 0] = this.pointsData[i * 2 + 0] * (1 / 250);
      e[r + 1] = this.pointsData[i * 2 + 1] * (1 / 250);
      e[r + 2] = 0;
      e[r + 3] = 0;
    }
    
    const t = new THREE.DataTexture(
      e,
      this.size,
      this.size,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    t.needsUpdate = true;
    return t;
  }

  createRenderTarget() {
    return new THREE.WebGLRenderTarget(this.size, this.size, {
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
      depthBuffer: false,
      stencilBuffer: false
    });
  }

  init() {
    this.size = 256;
    this.length = this.size * this.size;
    this.posTex = this.createDataTexturePosition();
    
    this.rt1 = this.createRenderTarget();
    this.rt2 = this.createRenderTarget();
    
    // Clear render targets
    this.renderer.setRenderTarget(this.rt1);
    this.renderer.setClearColor(0, 0);
    this.renderer.clear();
    this.renderer.setRenderTarget(this.rt2);
    this.renderer.setClearColor(0, 0);
    this.renderer.clear();
    this.renderer.setRenderTarget(null);
    
    this.noise = new PerlinNoise1D();
    this.simScene = new THREE.Scene();
    this.simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    
    // FBO Simulation Material Shaders
    this.simMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uPosition: { value: this.posTex },
        uPosRefs: { value: this.posTex },
        uRingPos: { value: new THREE.Vector2(0, 0) },
        uRingRadius: { value: 0.2 },
        uDeltaTime: { value: 0 },
        uRingWidth: { value: 0.05 },
        uRingWidth2: { value: 0.015 },
        uRingDisplacement: { value: this.scene.ringDisplacement },
        uTime: { value: 0 }
      },
      vertexShader: `
        void main() {
            gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform sampler2D uPosition;
        uniform sampler2D uPosRefs;
        uniform vec2 uRingPos;
        uniform float uTime;
        uniform float uDeltaTime;
        uniform float uRingRadius;

        uniform float uRingWidth;
        uniform float uRingWidth2;
        uniform float uRingDisplacement;

        ${SimplexNoiseGLSL}

        void main() {
            vec2 simTexCoords = gl_FragCoord.xy / vec2(${this.size.toFixed(1)}, ${this.size.toFixed(1)});
            vec4 pFrame = texture2D(uPosition, simTexCoords);

            float scale = pFrame.z;
            float velocity = pFrame.w;
            vec2 refPos = texture2D(uPosRefs, simTexCoords).xy;

            float time = uTime * .5;
            vec2 curentPos = refPos;

            vec2 pos = pFrame.xy;
            pos *= .8;

            float dist = distance(curentPos.xy, uRingPos);
            float noise0 = snoise(vec3(curentPos.xy * .2 + vec2(18.4924, 72.9744), time * 0.5));
            float dist1 = distance(curentPos.xy + (noise0 * .005), uRingPos);

            float t = smoothstep(uRingRadius - (uRingWidth * 2.), uRingRadius, dist) - smoothstep(uRingRadius, uRingRadius + uRingWidth, dist1);
            float t2 = smoothstep(uRingRadius - (uRingWidth2 * 2.), uRingRadius, dist) - smoothstep(uRingRadius, uRingRadius + uRingWidth2, dist1);
            float t3 = smoothstep(uRingRadius + uRingWidth2, uRingRadius, dist);

            t = pow(t, 2.);
            t2 = pow(t2, 3.);

            t += t2 * 3.;
            t += t3 * .4;
            t += snoise(vec3(curentPos.xy * 30. + vec2(11.4924, 12.9744), time * 0.5)) * t3 * .5;

            float nS = snoise(vec3(curentPos.xy * 2. + vec2(18.4924, 72.9744), time * 0.5));
            t += pow((nS + 1.5) * .5, 2.) * .6;

            float noise1 = snoise(vec3(curentPos.xy * 4. + vec2(88.494, 32.4397), time * 0.35));
            float noise2 = snoise(vec3(curentPos.xy * 4. + vec2(50.904, 120.947), time * 0.35));

            float noise3 = snoise(vec3(curentPos.xy * 20. + vec2(18.4924, 72.9744), time * .5));
            float noise4 = snoise(vec3(curentPos.xy * 20. + vec2(50.904, 120.947), time * .5));

            vec2 disp = vec2(noise1, noise2) * .03;
            disp += vec2(noise3, noise4) * .005;

            disp.x += sin((refPos.x * 20.) + (time * 4.)) * .02 * clamp(dist, 0., 1.);
            disp.y += cos((refPos.y * 20.) + (time * 3.)) * .02 * clamp(dist, 0., 1.);

            pos -= (uRingPos - (curentPos + disp)) * pow(t2, .75) * uRingDisplacement;

            float scaleDiff = t - scale;
            scaleDiff *= .2;
            scale += scaleDiff;

            vec2 finalPos = curentPos + disp + (pos * .25);

            velocity *= .5;
            velocity += scale * .25;

            vec4 frame = vec4(finalPos, scale, velocity);
            gl_FragColor = frame;
        }
      `
    });

    const screenQuadGeometry = new THREE.PlaneGeometry(2, 2);
    const screenQuad = new THREE.Mesh(screenQuadGeometry, this.simMaterial);
    this.simScene.add(screenQuad);
    
    // Points Render Material & Geometry
    const ptsGeometry = new THREE.BufferGeometry();
    const uvs = new Float32Array(this.count * 2);
    const positions = new Float32Array(this.count * 3);
    const seeds = new Float32Array(this.count * 4);
    
    for (let s = 0; s < this.count; s++) {
      let u = s % this.size;
      let v = Math.floor(s / this.size);
      uvs[s * 2] = u / this.size;
      uvs[s * 2 + 1] = v / this.size;
      
      seeds[s * 4] = Math.random();
      seeds[s * 4 + 1] = Math.random();
      seeds[s * 4 + 2] = Math.random();
      seeds[s * 4 + 3] = Math.random();
    }
    
    ptsGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    ptsGeometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    ptsGeometry.setAttribute("seeds", new THREE.BufferAttribute(seeds, 4));
    
    this.renderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uPosition: { value: this.posTex },
        uTime: { value: 0 },
        uColor1: { value: new THREE.Color(this.scene.colorControls.color1) },
        uColor2: { value: new THREE.Color(this.scene.colorControls.color2) },
        uColor3: { value: new THREE.Color(this.scene.colorControls.color3) },
        uAlpha: { value: 1 },
        uRingPos: { value: new THREE.Vector2(0, 0) },
        uRez: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uParticleScale: { value: this.particleScale },
        uPixelRatio: { value: this.scene.pixelRatio },
        uColorScheme: { value: this.colorScheme }
      },
      vertexShader: `
        precision highp float;
        attribute vec4 seeds;

        uniform sampler2D uPosition;
        uniform float uTime;
        uniform float uParticleScale;
        uniform float uPixelRatio;
        uniform int uColorScheme;

        varying vec4 vSeeds;
        varying float vVelocity;
        varying vec2 vLocalPos;
        varying vec2 vScreenPos;
        varying float vScale;

        void main() {
            vec4 pos = texture2D(uPosition, uv);
            vSeeds = seeds;

            vVelocity = pos.w;
            vScale = pos.z;
            vLocalPos = pos.xy;
            vec4 viewSpace  = modelViewMatrix * vec4(vec3(pos.xy, 0.), 1.0);

            gl_Position = projectionMatrix * viewSpace;
            vScreenPos = gl_Position.xy;

            gl_PointSize = ((vScale * 8.) * (uPixelRatio * 0.5) * uParticleScale);
        }
      `,
      fragmentShader: `
        precision highp float;

        varying vec4 vSeeds;
        varying vec2 vScreenPos;
        varying vec2 vLocalPos;
        varying float vScale;
        varying float vVelocity;

        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform vec3 uColor3;

        uniform vec2 uRingPos;
        uniform vec2 uRez;

        uniform float uAlpha;
        uniform float uTime;

        uniform int uColorScheme;

        ${SimplexNoiseGLSL}

        #define PI 3.1415926535897932384626433832795

        float sdRoundBox( in vec2 p, in vec2 b, in vec4 r )
        {
            r.xy = (p.x>0.0)?r.xy : r.zw;
            r.x  = (p.y>0.0)?r.x  : r.y;
            vec2 q = abs(p)-b+r.x;
            return min(max(q.x,q.y),0.0) + length(max(q,0.0)) - r.x;
        }

        vec2 rotate(vec2 v, float a) {
            float s = sin(a);
            float c = cos(a);
            mat2 m = mat2(c, s, -s, c);
            return m * v;
        }

        void main() {
            float uBorderSize = 0.2;
            float ratio = uRez.x / uRez.y;

            float noiseAngle = snoise(vec3(vLocalPos * 10. + vec2(18.4924, 72.9744), uTime * .85));
            float noiseColor = snoise(vec3(vLocalPos * 2. + vec2(74.664, 91.556), uTime * .5));
            noiseColor = (noiseColor + 1.) * .5;

            float angle = atan(vLocalPos.y - uRingPos.y, vLocalPos.x - uRingPos.x);

            vec2 uv = gl_PointCoord.xy;
            uv -= vec2(0.5);
            uv.y *= -1.;
            uv = rotate(uv, -angle + (noiseAngle * .5));

            float h = 0.8;
            float progress = smoothstep(0., .75, pow(noiseColor, 2.));
            vec3 col = mix(mix(uColor1, uColor2, progress/h), mix(uColor2, uColor3, (progress - h)/(1.0 - h)), step(h, progress));
            vec3 color = col;

            float dist = sqrt(dot(uv, uv));

            float dr = 0.5;
            float t = smoothstep(dr+(uBorderSize + .0001), dr-uBorderSize, dist);
            t = clamp(t, 0., 1.);

            float rounded = sdRoundBox(uv, vec2(0.5, 0.2), vec4(.25));
            rounded = smoothstep(.1, 0., rounded);

            float a = uAlpha * rounded * smoothstep(0.1, 0.2, vScale);

            if(a < 0.01){
                discard;
            }

            color = clamp(color, 0., 1.);
            color = mix(color, color * clamp(vVelocity, 0., 1.), float(uColorScheme));

            gl_FragColor = vec4(color, clamp(a, 0., 1.));
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });

    this.mesh = new THREE.Points(ptsGeometry, this.renderMaterial);
    this.mesh.position.set(0, 0, 0);
    this.mesh.scale.set(5, 5, 5); // Match component scaling
    this.scene.scene.add(this.mesh);
  }

  resize() {
    this.renderMaterial.uniforms.uRez.value.set(
      this.scene.renderer.domElement.width,
      this.scene.renderer.domElement.height
    );
    this.renderMaterial.uniforms.uPixelRatio.value = this.scene.pixelRatio;
    this.renderMaterial.needsUpdate = true;
  }

  update() {
    const elapsed = this.scene.clock.getElapsedTime() - this.lastTime;
    this.lastTime = this.scene.clock.getElapsedTime();
    
    // Auto-drift noise coordinates if mouse is not moving/over
    const t = (this.noise.getVal(this.scene.time * 0.66 + 94.234) - 0.5) * 2;
    const i = (this.noise.getVal(this.scene.time * 0.75 + 21.028) - 0.5) * 2;
    
    if (this.scene.isIntersecting && this.scene.mouseIsOver) {
      this.cursorPos.set(
        this.scene.intersectionPoint.x * 0.175 + t * 0.1,
        this.scene.intersectionPoint.y * 0.175 + i * 0.1
      );
      this.ringPos.set(
        this.ringPos.x + (this.cursorPos.x - this.ringPos.x) * 0.04,
        this.ringPos.y + (this.cursorPos.y - this.ringPos.y) * 0.04
      );
    } else {
      this.cursorPos.set(t * 0.2, i * 0.1);
      this.ringPos.set(
        this.ringPos.x + (this.cursorPos.x - this.ringPos.x) * 0.02,
        this.ringPos.y + (this.cursorPos.y - this.ringPos.y) * 0.02
      );
    }
    
    this.particleScale = (this.scene.renderer.domElement.width / this.scene.pixelRatio / 2000) * this.scene.particlesScale;
    
    // Update simulation uniforms
    this.simMaterial.uniforms.uPosition.value = this.everRendered ? this.rt1.texture : this.posTex;
    this.simMaterial.uniforms.uTime.value = this.scene.clock.getElapsedTime();
    this.simMaterial.uniforms.uDeltaTime.value = elapsed;
    this.simMaterial.uniforms.uRingRadius.value = 0.175 + Math.sin(this.scene.time * 1.0) * 0.03 + Math.cos(this.scene.time * 3.0) * 0.02;
    this.simMaterial.uniforms.uRingPos.value.copy(this.ringPos);
    this.simMaterial.uniforms.uRingWidth.value = this.scene.ringWidth;
    this.simMaterial.uniforms.uRingWidth2.value = this.scene.ringWidth2;
    this.simMaterial.uniforms.uRingDisplacement.value = this.scene.ringDisplacement;
    
    // Ping-pong render simulation
    this.renderer.setRenderTarget(this.rt2);
    this.renderer.render(this.simScene, this.simCamera);
    this.renderer.setRenderTarget(null);
    
    // Update render uniforms
    this.renderMaterial.uniforms.uPosition.value = this.everRendered ? this.rt2.texture : this.posTex;
    this.renderMaterial.uniforms.uTime.value = this.scene.clock.getElapsedTime();
    this.renderMaterial.uniforms.uRingPos.value.copy(this.ringPos);
    this.renderMaterial.uniforms.uParticleScale.value = this.particleScale;
  }

  postRender() {
    const temp = this.rt1;
    this.rt1 = this.rt2;
    this.rt2 = temp;
    this.everRendered = true;
  }

  kill() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.rt1.dispose();
    this.rt2.dispose();
    this.posTex.dispose();
    this.simMaterial.dispose();
    this.renderMaterial.dispose();
  }
}

// ==========================================
// 4. Global Scene Orchestrator Class
// ==========================================
class AntigravityScene {
  constructor(options) {
    this.loaded = false;
    this.options = options;
    this.theme = options.theme || "dark";
    this.interactive = options.interactive !== undefined ? options.interactive : true;
    
    // Colors
    this.colorControls = {
      color1: this.theme === "dark" ? "#7189ff" : "#2c64ed",
      color2: this.theme === "dark" ? "#3074f9" : "#f84242",
      color3: this.theme === "dark" ? "#000000" : "#ffcf03"
    };
    
    this.pixelRatio = options.pixelRatio || window.devicePixelRatio;
    this.particlesScale = options.particlesScale || 0.65;
    this.density = options.density || 220;
    
    // Physics parameters from component
    this.ringWidth = options.ringWidth || 0.107;
    this.ringWidth2 = options.ringWidth2 || 0.05;
    this.ringDisplacement = options.ringDisplacement || 0.23;
    
    this.scene = new THREE.Scene();
    this.scene.background = this.theme === "dark" ? new THREE.Color(0x0b0c10) : new THREE.Color(0xffffff);
    
    this.canvas = document.createElement("canvas");
    this.options.container.appendChild(this.canvas);
    this.canvas.width = this.options.container.offsetWidth;
    this.canvas.height = this.options.container.offsetHeight;
    
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
      stencil: false,
      precision: "highp"
    });
    this.renderer.setSize(this.canvas.width, this.canvas.height);
    this.renderer.setPixelRatio(this.pixelRatio);
    
    this.clock = new THREE.Clock();
    this.time = 0;
    this.lastTime = 0;
    this.dt = 0;
    this.skipFrame = false;
    this.isPaused = false;
    
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.intersectionPoint = new THREE.Vector3();
    this.isIntersecting = false;
    this.mouseIsOver = false;
    
    // Invisible Raycast Plane
    this.raycastPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(12.5, 12.5),
      new THREE.MeshBasicMaterial({ color: 0xff0000, visible: false, side: THREE.DoubleSide })
    );
    this.scene.add(this.raycastPlane);
    
    // Mouse Event Binding
    this.cursor = new THREE.Vector2(0, 0);
    this.screenWidth = window.innerWidth;
    this.screenHeight = window.innerHeight;
    
    this.initEvents();
    this.initCamera();
    this.initParticles();
    
    this.loaded = true;
  }

  initEvents() {
    window.addEventListener("resize", () => this.onWindowResize());
    window.addEventListener("mousemove", (e) => this.onMouseMove(e));
    
    // Track mouse enter/leave on the page
    document.addEventListener("mouseenter", () => { this.mouseIsOver = true; });
    document.addEventListener("mouseleave", () => { this.mouseIsOver = false; this.isIntersecting = false; });
  }

  onMouseMove(e) {
    this.cursor.x = e.clientX;
    this.cursor.y = e.clientY;
    this.mouseIsOver = true;
  }

  onWindowResize() {
    this.screenWidth = window.innerWidth;
    this.screenHeight = window.innerHeight;
    
    this.canvas.width = this.options.container.offsetWidth;
    this.canvas.height = this.options.container.offsetHeight;
    this.renderer.setSize(this.canvas.width, this.canvas.height);
    this.camera.aspect = this.canvas.width / this.canvas.height;
    this.camera.updateProjectionMatrix();
    if (this.particles) this.particles.resize();
  }

  initCamera() {
    this.camera = new THREE.PerspectiveCamera(
      40,
      this.canvas.width / this.canvas.height,
      0.1,
      1000
    );
    this.camera.position.z = 3.1;
  }

  initParticles() {
    if (isIntroActive) return;
    this.particles = new AntigravityParticles(this);
  }

  resume() {
    this.isPaused = false;
    this.clock.start();
  }

  stop() {
    this.isPaused = true;
    this.clock.stop();
  }

  preRender() {
    this.dt = this.clock.getDelta();
    this.time += this.dt;
    
    if (isIntroActive) {
      if (typeof introUpdateFn === 'function') {
        introUpdateFn(this.dt);
      }
      return;
    }
    
    if (this.particles) this.particles.update();
    
    if (this.interactive && !this.skipFrame) {
      const rect = this.canvas.getBoundingClientRect();
      
      // Calculate Normalized Device Coordinates (NDC)
      this.mouse.x = (this.cursor.x - rect.left) * (this.screenWidth / rect.width);
      this.mouse.y = (this.cursor.y - rect.top) * (this.screenHeight / rect.height);
      this.mouse.x = (this.mouse.x / this.screenWidth) * 2 - 1;
      this.mouse.y = -(this.mouse.y / this.screenHeight) * 2 + 1;
      
      if (this.mouse.x < -1 || this.mouse.x > 1 || this.mouse.y < -1 || this.mouse.y > 1) {
        this.mouseIsOver = false;
      } else {
        this.mouseIsOver = true;
      }
    }
    
    this.skipFrame = !this.skipFrame;
    if (this.skipFrame) return;
    
    // Intersect cursor with invisible raycast plane
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObject(this.raycastPlane);
    if (intersects.length > 0 && this.mouseIsOver) {
      this.intersectionPoint.copy(intersects[0].point);
      this.isIntersecting = true;
    } else {
      this.isIntersecting = false;
    }
  }

  render() {
    if (!this.loaded || this.isPaused) return;
    
    this.preRender();
    this.renderer.setRenderTarget(null);
    this.renderer.autoClear = false;
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.postRender();
  }

  postRender() {
    if (isIntroActive) return;
    if (this.particles) this.particles.postRender();
  }

  kill() {
    this.stop();
    window.removeEventListener("resize", () => this.onWindowResize());
    window.removeEventListener("mousemove", (e) => this.onMouseMove(e));
    if (this.raycastPlane) {
      this.scene.remove(this.raycastPlane);
      this.raycastPlane.geometry.dispose();
      this.raycastPlane.material.dispose();
    }
    if (this.particles) this.particles.kill();
    this.renderer.dispose();
    if (this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
  }
}

// ==========================================
// CINEMATIC BGM AUDIO SYNTHESIZER
// ==========================================

let activeAudioSources = [];

function stopAllAudioSources(fadeOutDuration = 0.2) {
  if (audioGainNode && audioCtx) {
    try {
      audioGainNode.gain.setValueAtTime(audioGainNode.gain.value, audioCtx.currentTime);
      audioGainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + fadeOutDuration);
    } catch (e) {
      console.warn("Failed to fade out master gain node:", e);
    }
  }
  
  // Schedule stopping of all active sources
  const stopTime = audioCtx ? audioCtx.currentTime + fadeOutDuration + 0.05 : 0;
  activeAudioSources.forEach(source => {
    try {
      source.stop(stopTime);
    } catch (e) {
      // Source might not have stop, or already stopped
    }
  });
  activeAudioSources = [];
}

// Helper to play heartbeat (Lub-dub ticking)
function playHeartbeat(time, volume = 0.5) {
  if (!audioCtx || !audioGainNode) return;
  try {
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    const gain2 = audioCtx.createGain();
    
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(55, time);
    osc1.frequency.exponentialRampToValueAtTime(25, time + 0.15);
    
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(55, time + 0.15);
    osc2.frequency.exponentialRampToValueAtTime(25, time + 0.3);
    
    gain1.gain.setValueAtTime(0.001, time);
    gain1.gain.linearRampToValueAtTime(volume * 0.4, time + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    
    gain2.gain.setValueAtTime(0.001, time + 0.15);
    gain2.gain.linearRampToValueAtTime(volume * 0.5, time + 0.17);
    gain2.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    
    osc1.connect(gain1);
    gain1.connect(audioGainNode);
    osc2.connect(gain2);
    gain2.connect(audioGainNode);
    
    osc1.start(time);
    osc1.stop(time + 0.25);
    osc2.start(time + 0.15);
    osc2.stop(time + 0.4);
    
    activeAudioSources.push(osc1, osc2);
  } catch (e) {}
}

// Helper to play deep drone/tension sweep
function playDrone(startTime) {
  if (!audioCtx || !audioGainNode) return;
  try {
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(45, startTime);
    osc1.frequency.linearRampToValueAtTime(45, startTime + 1.5);
    osc1.frequency.exponentialRampToValueAtTime(110, startTime + 3.5);
    osc1.frequency.exponentialRampToValueAtTime(150, startTime + 4.3);
    
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(45.5, startTime);
    osc2.frequency.linearRampToValueAtTime(45.5, startTime + 1.5);
    osc2.frequency.exponentialRampToValueAtTime(110.8, startTime + 3.5);
    osc2.frequency.exponentialRampToValueAtTime(151, startTime + 4.3);
    
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(95, startTime);
    filter.frequency.linearRampToValueAtTime(95, startTime + 1.5);
    filter.frequency.exponentialRampToValueAtTime(350, startTime + 3.5);
    filter.frequency.exponentialRampToValueAtTime(650, startTime + 4.3);
    filter.Q.setValueAtTime(4.0, startTime);
    
    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(0.35, startTime + 1.5);
    gain.gain.linearRampToValueAtTime(0.55, startTime + 3.5);
    gain.gain.exponentialRampToValueAtTime(0.75, startTime + 4.3);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 4.4); // tension collapse cut-off
    
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(audioGainNode);
    
    osc1.start(startTime);
    osc2.start(startTime);
    
    osc1.stop(startTime + 4.45);
    osc2.stop(startTime + 4.45);
    
    activeAudioSources.push(osc1, osc2);
  } catch (e) {}
}

// Helper to play white-noise vortex sweep
function playVortexWhoosh(startTime) {
  if (!audioCtx || !audioGainNode) return;
  try {
    const bufferSize = audioCtx.sampleRate * 4.5;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    
    const noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = noiseBuffer;
    
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(4.5, startTime);
    
    filter.frequency.setValueAtTime(130, startTime + 1.5);
    // Orbit sweeps
    filter.frequency.exponentialRampToValueAtTime(750, startTime + 2.2);
    filter.frequency.exponentialRampToValueAtTime(260, startTime + 2.7);
    filter.frequency.exponentialRampToValueAtTime(1500, startTime + 3.3);
    filter.frequency.exponentialRampToValueAtTime(450, startTime + 3.7);
    filter.frequency.exponentialRampToValueAtTime(3500, startTime + 4.3);
    
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(0.001, startTime + 1.5);
    gain.gain.exponentialRampToValueAtTime(0.35, startTime + 3.0);
    gain.gain.linearRampToValueAtTime(0.65, startTime + 4.3);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 4.4); // collapse cut-off
    
    noiseNode.connect(filter);
    filter.connect(gain);
    gain.connect(audioGainNode);
    
    noiseNode.start(startTime + 1.5);
    noiseNode.stop(startTime + 4.45);
    
    activeAudioSources.push(noiseNode);
  } catch (e) {}
}

// Helper to play explosion boom & crash
function playExplosion(startTime) {
  if (!audioCtx || !audioGainNode) return;
  try {
    // 1. Sub Bass Drop (The Boom)
    const subOsc = audioCtx.createOscillator();
    const subGain = audioCtx.createGain();
    
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(160, startTime);
    subOsc.frequency.exponentialRampToValueAtTime(28, startTime + 1.8);
    
    subGain.gain.setValueAtTime(0.001, startTime);
    subGain.gain.linearRampToValueAtTime(1.0, startTime + 0.04);
    subGain.gain.exponentialRampToValueAtTime(0.01, startTime + 2.0);
    subGain.gain.exponentialRampToValueAtTime(0.001, startTime + 2.5);
    
    subOsc.connect(subGain);
    subGain.connect(audioGainNode);
    subOsc.start(startTime);
    subOsc.stop(startTime + 2.6);
    
    // 2. High Frequency White Noise Blast (The Crash)
    const bufferSize = audioCtx.sampleRate * 3.0;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    
    const noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = noiseBuffer;
    
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(7500, startTime);
    filter.frequency.exponentialRampToValueAtTime(160, startTime + 2.2);
    
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(0.75, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.08, startTime + 1.0);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 3.0);
    
    noiseNode.connect(filter);
    filter.connect(gain);
    gain.connect(audioGainNode);
    
    noiseNode.start(startTime);
    noiseNode.stop(startTime + 3.1);
    
    activeAudioSources.push(subOsc, noiseNode);
  } catch (e) {}
}

// Helper to play epic brass synth chords (South Indian Cinematic Style)
function playBrassChord(freqs, startTime, duration, volume = 0.22) {
  if (!audioCtx || !audioGainNode) return;
  try {
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();
    
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(260, startTime);
    filter.frequency.exponentialRampToValueAtTime(2100, startTime + 0.06); // brass opening sweep
    filter.frequency.exponentialRampToValueAtTime(850, startTime + 0.35); // warm sustain
    filter.frequency.exponentialRampToValueAtTime(140, startTime + duration); // release fade
    filter.Q.setValueAtTime(5.0, startTime);
    
    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.04); // punchy attack
    gain.gain.exponentialRampToValueAtTime(volume * 0.75, startTime + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    
    freqs.forEach(freq => {
      // Detuned sawtooth waves for fatness
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(freq, startTime);
      
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(freq * 1.004, startTime); // detune
      
      osc1.connect(filter);
      osc2.connect(filter);
      
      osc1.start(startTime);
      osc2.start(startTime);
      
      osc1.stop(startTime + duration + 0.1);
      osc2.stop(startTime + duration + 0.1);
      
      activeAudioSources.push(osc1, osc2);
    });
    
    filter.connect(gain);
    gain.connect(audioGainNode);
  } catch (e) {}
}

// Helper to play cinematic drum hits (Taiko/Kick)
function playEpicDrumHit(startTime, volume = 0.6) {
  if (!audioCtx || !audioGainNode) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, startTime);
    osc.frequency.exponentialRampToValueAtTime(45, startTime + 0.14);
    
    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.6);
    
    osc.connect(gain);
    gain.connect(audioGainNode);
    
    osc.start(startTime);
    osc.stop(startTime + 0.7);
    
    activeAudioSources.push(osc);
  } catch (e) {}
}

// Helper to play short bassline notes
function playBassNote(freq, startTime, duration = 0.12, volume = 0.15) {
  if (!audioCtx || !audioGainNode) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, startTime);
    
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(140, startTime);
    
    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioGainNode);
    
    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
    
    activeAudioSources.push(osc);
  } catch (e) {}
}

function playCinematicBGM() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    // Resume if suspended
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    
    // Stop and clean up any currently playing sounds
    stopAllAudioSources(0.1);
    
    // Create new master volume controller
    audioGainNode = audioCtx.createGain();
    audioGainNode.gain.setValueAtTime(1.0, audioCtx.currentTime);
    audioGainNode.connect(audioCtx.destination);
    
    const now = audioCtx.currentTime;
    
    // 1. Play drone starting immediately
    playDrone(now);
    
    // 2. Play white noise vortex sweep starting at 1.5s
    playVortexWhoosh(now);
    
    // 3. Play accelerating heartbeat sequence
    const heartbeatTimes = [
      0.2, 1.0, 1.6, 2.2, 2.6, 2.9, 3.2, 3.4, 3.6, 3.8, 4.0, 4.2
    ];
    heartbeatTimes.forEach((time, index) => {
      const vol = 0.2 + (index / heartbeatTimes.length) * 0.65;
      playHeartbeat(now + time, vol);
    });
    
    // 4. Trigger massive explosion drop at 4.5s
    playExplosion(now + 4.5);
    
    // 5. Play the Epic D-Minor Heroic Brass Theme (Motif) & Drum beats
    // Motif beats:
    // Hit 1: 4.5s (D minor: D3, A3, D4, F4)
    // Hit 2: 5.2s (Bb major: Bb2, F3, Bb3, D4)
    // Hit 3: 5.9s (C major: C3, G3, C4, E4)
    // Hit 4: 6.6s (A major: A2, E3, A3, C#4)
    // Hit 5: 7.3s (D minor: D3, A3, D4, F4 - final long chord)
    
    const duration = 0.65;
    
    playBrassChord([146.83, 220.00, 293.66, 349.23], now + 4.5, duration, 0.24);
    playEpicDrumHit(now + 4.5, 0.75);
    
    playBrassChord([116.54, 174.61, 233.08, 293.66], now + 5.2, duration, 0.24);
    playEpicDrumHit(now + 5.2, 0.75);
    
    playBrassChord([130.81, 195.99, 261.63, 329.63], now + 5.9, duration, 0.24);
    playEpicDrumHit(now + 5.9, 0.75);
    
    playBrassChord([110.00, 164.81, 220.00, 277.18], now + 6.6, duration, 0.24);
    playEpicDrumHit(now + 6.6, 0.75);
    
    // Final long sustained resolve chord
    playBrassChord([146.83, 220.00, 293.66, 349.23], now + 7.3, 1.8, 0.28);
    playEpicDrumHit(now + 7.3, 0.85);
    
    // Rhythmic double drum-hits between beats (e.g. 4.85s, 5.0s, etc.)
    const fillTimes = [
      4.85, 5.0, 5.55, 5.7, 6.25, 6.4, 6.95, 7.1
    ];
    fillTimes.forEach(time => {
      playEpicDrumHit(now + time, 0.45);
    });
    
    // Pulsing synth bassline
    // D2 = 73.42, Bb1 = 58.27, C2 = 65.41, A1 = 55.00
    const bassline = [
      // 4.5s block (D)
      { freq: 73.42, time: 4.5 }, { freq: 73.42, time: 4.675 }, { freq: 73.42, time: 4.85 }, { freq: 73.42, time: 5.025 },
      // 5.2s block (Bb)
      { freq: 58.27, time: 5.2 }, { freq: 58.27, time: 5.375 }, { freq: 58.27, time: 5.55 }, { freq: 58.27, time: 5.725 },
      // 5.9s block (C)
      { freq: 65.41, time: 5.9 }, { freq: 65.41, time: 6.075 }, { freq: 65.41, time: 6.25 }, { freq: 65.41, time: 6.425 },
      // 6.6s block (A)
      { freq: 55.00, time: 6.6 }, { freq: 55.00, time: 6.775 }, { freq: 55.00, time: 6.95 }, { freq: 55.00, time: 7.125 },
      // 7.3s block (Resolve D)
      { freq: 73.42, time: 7.3 }, { freq: 73.42, time: 7.475 }, { freq: 73.42, time: 7.65 }, { freq: 73.42, time: 7.825 }
    ];
    
    bassline.forEach(note => {
      const vol = note.time >= 7.3 ? 0.22 : 0.16;
      playBassNote(note.freq, now + note.time, 0.12, vol);
    });
    
  } catch (err) {
    console.warn("Web Audio API failed or blocked: ", err);
  }
}

function toggleSound(sceneWrapper) {
  const btn = document.getElementById('audio-toggle-btn');
  if (!btn) return;
  
  if (!isSoundOn) {
    isSoundOn = true;
    btn.classList.add('active');
    btn.innerHTML = '<i class="fa-solid fa-volume-high"></i> Sound On';
    
    // Restart animation timeline to sync visual drop with BGM drop!
    if (introTimeline) {
      introTimeline.restart();
    }
    playCinematicBGM();
  } else {
    isSoundOn = false;
    btn.classList.remove('active');
    btn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i> Sound Off';
    
    // Fade out volume gain and stop all sources
    stopAllAudioSources(0.3);
  }
}

// ==========================================
// CINEMATIC NAME REVEAL INTRO
// ==========================================

function startIntro(sceneWrapper) {
  isIntroActive = true;
  document.body.classList.add('intro-active');
  
  const introData = initIntroDesign(sceneWrapper);
  sceneWrapper.scene.add(introData.group);
  introGroup = introData.group;
  introUpdateFn = introData.updateFn;
  
  introTimeline = gsap.timeline({
    onComplete: () => endIntro(sceneWrapper)
  });
  
  // Set initial state
  sceneWrapper.camera.position.z = introParams.cameraZ;
  
  // 1. Atmosphere (0s - 1.5s): Quiet drifting particles.
  
  // 2. Vortex formation (1.5s - 3.5s): Swirl forms, pulls inward, camera zoom
  introTimeline.to(introParams, {
    vortexStrength: 1.2,
    cameraZ: 18,
    ambientDrift: 0.05,
    duration: 2.0,
    ease: 'power2.inOut'
  }, 1.5);
  
  // 3. Collapse (3.5s - 4.5s): High-speed collapse to a single glowing center core
  introTimeline.to(introParams, {
    collapseProgress: 1.0,
    cameraZ: 14,
    particleSize: 0.55,
    duration: 1.0,
    ease: 'power4.in'
  }, 3.5);
  
  // 4. Explosion (4.5s): Particles explode outward in slow motion
  introTimeline.to(introParams, {
    explosionProgress: 1.0,
    ringStrength: 1.0,
    particleSize: 0.30,
    duration: 3.5,
    ease: 'power3.out'
  }, 4.5);
  
  // Name reveals synced with explosion:
  const nameGokula = document.getElementById('name-gokula');
  const nameRamanaa = document.getElementById('name-ramanaa');
  const introSubtitle = document.getElementById('intro-subtitle');
  
  // GOKULA appears at 4.5s (duration 1.5s)
  introTimeline.to(nameGokula, {
    opacity: 1,
    filter: 'blur(0px)',
    scale: 1,
    textShadow: '0 0 15px rgba(244, 180, 58, 0.4), 0 0 35px rgba(244, 180, 58, 0.7), 0 0 55px rgba(244, 180, 58, 0.9)',
    duration: 1.5,
    ease: 'power3.out'
  }, 4.5);
  
  // RAMANAA appears a fraction of a second later at 4.9s
  introTimeline.to(nameRamanaa, {
    opacity: 1,
    filter: 'blur(0px)',
    scale: 1,
    textShadow: '0 0 15px rgba(244, 180, 58, 0.4), 0 0 35px rgba(244, 180, 58, 0.7), 0 0 55px rgba(244, 180, 58, 0.9)',
    duration: 1.5,
    ease: 'power3.out'
  }, 4.9);
  
  // Subtitle fades in at 5.8s
  introTimeline.to(introSubtitle, {
    opacity: 1,
    filter: 'blur(0px)',
    y: 0,
    duration: 1.2,
    ease: 'power2.out'
  }, 5.8);
  
  // Camera zooms back out slightly during hold
  introTimeline.to(introParams, {
    cameraZ: 17,
    duration: 1.0,
    ease: 'power1.inOut'
  }, 6.0);
  
  // Transition to main dashboard experience (7.0s - 8.2s)
  const introOverlay = document.getElementById('intro-overlay');
  introTimeline.to(introOverlay, {
    opacity: 0,
    duration: 1.2,
    ease: 'power2.inOut',
    onComplete: () => {
      if (introOverlay) {
        introOverlay.style.display = 'none';
      }
    }
  }, 7.0);
}

function endIntro(sceneWrapper) {
  if (!isIntroActive) return;
  isIntroActive = false;
  
  // Fade out audio on end and stop all sound sources
  stopAllAudioSources(1.2);
  
  // Hide overlay
  const introOverlay = document.getElementById('intro-overlay');
  if (introOverlay) {
    introOverlay.style.display = 'none';
  }
  
  // Remove body class to show portfolio content and navigation
  document.body.classList.remove('intro-active');
  
  // Kill GSAP timeline
  if (introTimeline) {
    introTimeline.kill();
    introTimeline = null;
  }
  
  // Clean up intro canvas objects
  if (introGroup) {
    sceneWrapper.scene.remove(introGroup);
    introGroup.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    introGroup = null;
  }
  introUpdateFn = null;
  
  // Reset camera to default for portfolio
  sceneWrapper.camera.position.set(0, 0, 3.1);
  sceneWrapper.camera.lookAt(0, 0, 0);
  
  // Instantiate FBO particles
  sceneWrapper.initParticles();
}

function initIntroDesign(sceneWrapper) {
  const group = new THREE.Group();
  
  const particleCount = 1500;
  const geometry = new THREE.BufferGeometry();
  
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  
  const particles = [];
  const baseColor = new THREE.Color('#F4B43A'); // matches the golden accent style
  
  for (let i = 0; i < particleCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const baseRadius = Math.random() * 14 + 2;
    
    const x = Math.cos(theta) * baseRadius;
    const y = Math.sin(theta) * baseRadius;
    const z = (Math.random() - 0.5) * 2.5;
    
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    
    const isRingParticle = i < (particleCount * 0.3);
    
    const explodeAngle = theta + (Math.random() - 0.5) * 0.5;
    const explodeDir = new THREE.Vector3(
      Math.cos(explodeAngle),
      Math.sin(explodeAngle),
      (Math.random() - 0.5) * 0.4
    ).normalize();
    
    const driftDir = new THREE.Vector3(
      (Math.random() - 0.5),
      (Math.random() - 0.5),
      (Math.random() - 0.5)
    ).normalize();
    
    const colorVar = baseColor.clone().multiplyScalar(0.75 + Math.random() * 0.35);
    colors[i * 3] = colorVar.r;
    colors[i * 3 + 1] = colorVar.g;
    colors[i * 3 + 2] = colorVar.b;
    
    particles.push({
      angle: theta,
      baseRadius: baseRadius,
      baseZ: z,
      orbitSpeed: 0.015 + Math.random() * 0.02,
      isRingParticle: isRingParticle,
      explodeDir: explodeDir,
      driftDir: driftDir,
      explodeSpeed: 0.5 + Math.random() * 1.2
    });
  }
  
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  
  // Custom texture generation
  const canvasTex = document.createElement('canvas');
  canvasTex.width = 64;
  canvasTex.height = 64;
  const ctx = canvasTex.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.25, '#F4B43A');
  gradient.addColorStop(0.55, 'rgba(244, 180, 58, 0.25)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvasTex);
  
  const material = new THREE.PointsMaterial({
    size: 0.35,
    map: texture,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  
  const points = new THREE.Points(geometry, material);
  group.add(points);
  
  const updateFn = (delta) => {
    const posAttr = geometry.getAttribute('position');
    const colorsAttr = geometry.getAttribute('color');
    
    for (let i = 0; i < particleCount; i++) {
      const p = particles[i];
      
      const speedMultiplier = 1.0 + introParams.vortexStrength * 4.0;
      p.angle += p.orbitSpeed * delta * 60 * speedMultiplier;
      
      let x, y, z;
      
      if (introParams.explosionProgress === 0) {
        const currentRadius = p.baseRadius * (1.0 - introParams.vortexStrength * 0.35);
        const orbitX = Math.cos(p.angle) * currentRadius;
        const orbitY = Math.sin(p.angle) * currentRadius;
        const orbitZ = p.baseZ + Math.sin(p.angle * 2.0 + sceneWrapper.time) * 0.3 * introParams.vortexStrength;
        
        const collapseFactor = 1.0 - introParams.collapseProgress;
        x = orbitX * collapseFactor;
        y = orbitY * collapseFactor;
        z = orbitZ * collapseFactor;
        
        x += Math.sin(p.angle * 3.0 + sceneWrapper.time) * introParams.ambientDrift * 1.5;
        y += Math.cos(p.angle * 2.0 + sceneWrapper.time) * introParams.ambientDrift * 1.5;
        z += Math.sin(sceneWrapper.time + i) * introParams.ambientDrift * 0.8;
      } else {
        if (p.isRingParticle) {
          const ringRadius = 7.8 + Math.sin(p.angle * 4.0 + sceneWrapper.time * 3.0) * 0.35;
          const radius = ringRadius * introParams.explosionProgress;
          const ringAngle = p.angle + sceneWrapper.time * 0.7 * introParams.ringStrength;
          
          x = Math.cos(ringAngle) * radius;
          y = Math.sin(ringAngle) * radius;
          z = p.baseZ * 0.15 * (1.0 - introParams.ringStrength);
          
          z += Math.sin(ringAngle * 3.0 + sceneWrapper.time * 2.5) * 0.12 * introParams.ringStrength;
        } else {
          const dist = p.explodeSpeed * introParams.explosionProgress * 26.0;
          x = p.explodeDir.x * dist;
          y = p.explodeDir.y * dist;
          z = p.explodeDir.z * dist;
          
          x += p.driftDir.x * (introParams.explosionProgress - 0.1) * 3.5;
          y += p.driftDir.y * (introParams.explosionProgress - 0.1) * 3.5;
          z += p.driftDir.z * (introParams.explosionProgress - 0.1) * 1.8;
        }
      }
      
      posAttr.setXYZ(i, x, y, z);
      
      if (introParams.collapseProgress > 0 && introParams.explosionProgress === 0) {
        const glowFactor = introParams.collapseProgress * 0.85;
        colorsAttr.setXYZ(i, 
          baseColor.r * (1.0 - glowFactor) + glowFactor,
          baseColor.g * (1.0 - glowFactor) + glowFactor,
          baseColor.b * (1.0 - glowFactor) + glowFactor
        );
      } else if (introParams.explosionProgress > 0) {
        if (!p.isRingParticle) {
          const fadeFactor = Math.max(0.0, 1.0 - introParams.explosionProgress * 0.92);
          colorsAttr.setXYZ(i, 
            baseColor.r * fadeFactor,
            baseColor.g * fadeFactor,
            baseColor.b * fadeFactor
          );
        } else {
          const pulse = 0.85 + Math.sin(p.angle * 4.0 + sceneWrapper.time * 3.5) * 0.15;
          colorsAttr.setXYZ(i, 
            baseColor.r * pulse,
            baseColor.g * pulse,
            baseColor.b * pulse
          );
        }
      } else {
        colorsAttr.setXYZ(i, baseColor.r, baseColor.g, baseColor.b);
      }
    }
    
    posAttr.needsUpdate = true;
    colorsAttr.needsUpdate = true;
    material.size = introParams.particleSize;
  };
  
  return { group, updateFn };
}

// ==========================================
// 5. Initialize Page Script
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  // Initialize the particle system background
  const container = document.getElementById("particle-canvas-container");
  const antigravity = new AntigravityScene({
    container: container,
    theme: "dark",
    particlesScale: 0.62,
    density: 220,
    ringWidth: 0.015,
    ringWidth2: 0.107,
    ringDisplacement: 0.53
  });

  // Setup Skip Button
  const skipBtn = document.getElementById('skip-intro-btn');
  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      endIntro(antigravity);
    });
  }

  // Setup Audio Toggle Button
  const audioBtn = document.getElementById('audio-toggle-btn');
  if (audioBtn) {
    audioBtn.addEventListener('click', () => {
      toggleSound(antigravity);
    });
  }

  // Load initial design or start intro sequence
  if (isIntroActive) {
    startIntro(antigravity);
  } else {
    antigravity.initParticles();
  }

  // Render loop
  function tick() {
    antigravity.render();
    requestAnimationFrame(tick);
  }
  tick();

  // Scroll Animations using GSAP & ScrollTrigger
  gsap.registerPlugin(ScrollTrigger);

  // Fade-in sections dynamically
  const fadeSections = document.querySelectorAll("section");
  fadeSections.forEach((section) => {
    gsap.fromTo(
      section.querySelector(".section-container") || section.children[0],
      {
        opacity: 0,
        y: 40
      },
      {
        opacity: 1,
        y: 0,
        duration: 1.2,
        ease: "power3.out",
        scrollTrigger: {
          trigger: section,
          start: "top 80%",
          toggleActions: "play none none none"
        }
      }
    );
  });

  // Active navigation highlight on scroll
  const navLinks = document.querySelectorAll(".nav-links a");
  window.addEventListener("scroll", () => {
    let current = "";
    fadeSections.forEach((section) => {
      const sectionTop = section.offsetTop;
      const sectionHeight = section.clientHeight;
      if (pageYOffset >= sectionTop - 150) {
        current = section.getAttribute("id");
      }
    });

    navLinks.forEach((link) => {
      link.classList.remove("active");
      if (link.getAttribute("href").substring(1) === current) {
        link.classList.add("active");
      }
    });
  });

  // Subtle scroll parallax for the profile card
  gsap.to(".profile-card", {
    yPercent: -15,
    ease: "none",
    scrollTrigger: {
      trigger: "#hero",
      start: "top top",
      end: "bottom top",
      scrub: true
    }
  });

  // 3D Card Tilt Effect for the profile photo
  const card = document.querySelector(".profile-card");
  if (card) {
    card.addEventListener("mousemove", (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const width = rect.width;
      const height = rect.height;
      
      // Calculate rotation angles (-15 to 15 degrees)
      const rotateX = ((y / height) - 0.5) * -15;
      const rotateY = ((x / width) - 0.5) * 15;
      
      // Calculate translate displacement for parallax depth
      const glowX = ((x / width) - 0.5) * 35;
      const glowY = ((y / height) - 0.5) * 35;
      
      gsap.to(card, {
        rotateX: rotateX,
        rotateY: rotateY,
        ease: "power2.out",
        duration: 0.4
      });
      
      gsap.to(card.querySelector(".profile-glow"), {
        x: glowX,
        y: glowY,
        ease: "power2.out",
        duration: 0.4
      });
    });
    
    card.addEventListener("mouseleave", () => {
      gsap.to(card, {
        rotateX: 0,
        rotateY: 0,
        ease: "power3.out",
        duration: 0.8
      });
      
      gsap.to(card.querySelector(".profile-glow"), {
        x: 0,
        y: 0,
        ease: "power3.out",
        duration: 0.8
      });
    });
  }
});
