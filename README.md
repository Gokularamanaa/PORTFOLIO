# Interactive WebGL Portfolio

A premium, highly aesthetic portfolio website for Gokula Ramanaa featuring a 2D FBO particle gravity simulation, custom GLSL shaders, responsive glassmorphic interfaces, and smooth scroll animations.

## Key Features

- **Interactive 2D FBO Particles**: Particles respond dynamically to mouse movement using pointer vectors and ring-field displacement, simulated directly on the GPU.
- **3D Card Parallax**: The profile photo card dynamically tilts in 3D space tracking mouse movements with parallax neon glows.
- **Custom Shaders**: Includes GLSL Simplex Noise generators for realistic particle drifting when the page is inactive.
- **Smooth Animations**: Responsive scroll triggers using GSAP and ScrollTrigger.
- **Modern Tech Stack**: Three.js, GSAP, HTML5 Canvas, and Custom CSS.

## File Structure

- `index.html` - Page markup and asset links
- `style.css` - Custom glassmorphic styles and keyframe animations
- `app.js` - Three.js scene orchestrator, FBO simulation materials, and scroll triggers
- `person.png` - Centered profile photo asset
