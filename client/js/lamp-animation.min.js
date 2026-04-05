requestAnimationFrame(function() {
  setTimeout(function() {
    (function() {
      // ============================================
      // LAMP STATE + ANIMATION LOCK
      // ============================================
      let lampOn = false;
      let isAnimating = false;  // ← NEW: Animation lock to prevent rapid toggles

      window.toggleLamp = function() {
        // Guard: if animation in progress, ignore this toggle
        if (isAnimating) {
          return;
        }

        // Set lock
        isAnimating = true;

        // Toggle state
        lampOn = !lampOn;
        apply();

        // Release lock after longest animation completes (900ms = .appear duration)
        setTimeout(() => {
          isAnimating = false;
        }, 950);  // 50ms buffer beyond animation
      };

      const svg = document.getElementById('lamp-svg');
      if (svg) {
        svg.addEventListener('click', window.toggleLamp);
        svg.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            window.toggleLamp();
          }
        });
      }

      function apply() {
        const shade = document.getElementById('shade-body');
        const rim = document.getElementById('shade-rim');
        const inner = document.getElementById('inner-light');
        const eyeL = document.getElementById('eye-l');
        const eyeR = document.getElementById('eye-r');
        const mouth = document.getElementById('mouth');
        const cone = document.getElementById('light-cone');
        const glow = document.getElementById('floor-glow');
        const card = document.getElementById('login-card');

        if (!shade || !rim || !inner || !eyeL || !eyeR || !mouth || !cone || !glow || !card) return;

        if (lampOn) {
          // Turn ON
          shade.setAttribute('fill', 'url(#shadeOn)');
          rim.setAttribute('fill', '#7a5820');
          inner.setAttribute('opacity', '1');
          svg && svg.classList.remove('off');

          eyeL.setAttribute('rx', '5.5');
          eyeL.setAttribute('ry', '5.5');
          eyeR.setAttribute('rx', '5.5');
          eyeR.setAttribute('ry', '5.5');
          eyeL.setAttribute('fill', '#1a0e00');
          eyeR.setAttribute('fill', '#1a0e00');
          mouth.setAttribute('d', 'M 76 97 Q 85 108 94 97');

          cone.classList.remove('off');
          glow.classList.remove('off');
          card.classList.remove('off');
          card.classList.add('appear');
        } else {
          // Turn OFF
          shade.setAttribute('fill', 'url(#shadeOff)');
          rim.setAttribute('fill', '#1a1510');
          inner.setAttribute('opacity', '0');
          svg && svg.classList.add('off');

          eyeL.setAttribute('rx', '5.5');
          eyeL.setAttribute('ry', '1.5');
          eyeR.setAttribute('rx', '5.5');
          eyeR.setAttribute('ry', '1.5');
          eyeL.setAttribute('fill', '#444');
          eyeR.setAttribute('fill', '#444');
          mouth.setAttribute('d', 'M 76 100 Q 85 95 94 100');

          cone.classList.add('off');
          glow.classList.add('off');
          card.classList.remove('appear');
          card.classList.add('off');
        }
      }

      // ============================================
      // BLINK ANIMATION
      // ============================================
      (function blink() {
        const timeout = Math.random() * 4500 + 2000;
        setTimeout(function() {
          if (lampOn) {
            const eyeL = document.getElementById('eye-l');
            const eyeR = document.getElementById('eye-r');
            if (eyeL && eyeR) {
              eyeL.setAttribute('ry', '1');
              eyeR.setAttribute('ry', '1');

              setTimeout(() => {
                if (lampOn) {
                  eyeL.setAttribute('ry', '5.5');
                  eyeR.setAttribute('ry', '5.5');
                }
              }, 130);
            }
          }
          blink();
        }, timeout);
      })();

      // ============================================
      // ROPE PHYSICS + CANVAS
      // ============================================
      const canvas = document.getElementById('rope-canvas');
      if (!canvas) return;

      try {
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          return;
        }
      } catch (e) {}

      const ctx = canvas.getContext('2d');
      const W = canvas.width;
      const H = canvas.height;
      const SEGMENTS = 12;
      const GRAVITY = 0.4;
      const DAMPING = 0.98;
      const ITERATIONS = 14;

      const points = [];
      for (let i = 0; i <= SEGMENTS; i++) {
        const y = i * (H / SEGMENTS);
        points.push({
          x: W / 2,
          y: y,
          ox: W / 2,
          oy: y,
          pin: i === 0
        });
      }

      const restDist = H / SEGMENTS;
      let dragIdx = -1;
      let pullDistance = 0;
      let cachedRect = null;
      let rectDirty = true;

      const markDirty = () => {
        rectDirty = true;
      };

      const getRect = () => {
        if (rectDirty || !cachedRect) {
          cachedRect = canvas.getBoundingClientRect();
          rectDirty = false;
        }
        return cachedRect;
      };

      const getCoords = (evt) => {
        const touch = evt.touches ? evt.touches[0] : evt;
        const rect = getRect();
        const scaleX = rect.width ? canvas.width / rect.width : 1;
        const scaleY = rect.height ? canvas.height / rect.height : 1;
        return {
          x: (touch.clientX - rect.left) * scaleX,
          y: (touch.clientY - rect.top) * scaleY
        };
      };

      const findNearestPoint = (mx, my) => {
        let bestIdx = -1;
        let bestDist = 40;
        points.forEach((p, i) => {
          if (p.pin) return;
          const d = Math.hypot(p.x - mx, p.y - my);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
          }
        });
        return bestIdx;
      };

      if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(markDirty).observe(canvas);
      } else {
        window.addEventListener('resize', markDirty, { passive: true });
      }

      window.addEventListener('scroll', markDirty, { passive: true, capture: true });

      // Mouse
      canvas.addEventListener('mousedown', (evt) => {
        const coords = getCoords(evt);
        dragIdx = findNearestPoint(coords.x, coords.y);
        if (dragIdx >= 0) pullDistance = 0;
      });

      canvas.addEventListener('mousemove', (evt) => {
        if (dragIdx < 0) return;
        const coords = getCoords(evt);
        points[dragIdx].x = Math.max(4, Math.min(W - 4, coords.x));
        points[dragIdx].y = Math.max(2, Math.min(H - 4, coords.y));
        points[dragIdx].ox = points[dragIdx].x;
        points[dragIdx].oy = points[dragIdx].y;
        pullDistance++;
      });

      canvas.addEventListener('mouseup', () => {
        if (dragIdx >= 0 && pullDistance > 4) {
          checkRopePull();
        }
        dragIdx = -1;
        pullDistance = 0;
      });

      canvas.addEventListener('mouseleave', () => {
        dragIdx = -1;
      });

      // Touch
      canvas.addEventListener('touchstart', (evt) => {
        if (evt.cancelable) evt.preventDefault();
        const coords = getCoords(evt);
        dragIdx = findNearestPoint(coords.x, coords.y);
        if (dragIdx >= 0) pullDistance = 0;
      }, { passive: false });

      canvas.addEventListener('touchmove', (evt) => {
        if (evt.cancelable) evt.preventDefault();
        if (dragIdx < 0) return;
        const coords = getCoords(evt);
        points[dragIdx].x = Math.max(4, Math.min(W - 4, coords.x));
        points[dragIdx].y = Math.max(2, Math.min(H - 4, coords.y));
        points[dragIdx].ox = points[dragIdx].x;
        points[dragIdx].oy = points[dragIdx].y;
        pullDistance++;
      }, { passive: false });

      canvas.addEventListener('touchend', () => {
        if (dragIdx >= 0 && pullDistance > 3) {
          checkRopePull();
        }
        dragIdx = -1;
        pullDistance = 0;
      });

      function checkRopePull() {
        if (dragIdx >= points.length - 4) {
          toggleLamp();
        }
      }

      function updatePhysics() {
        for (const p of points) {
          if (p.pin) continue;
          const vx = (p.x - p.ox) * DAMPING;
          const vy = (p.y - p.oy) * DAMPING;
          p.ox = p.x;
          p.oy = p.y;
          p.x += vx;
          p.y += vy + GRAVITY;

          if (p.x < 4) {
            p.x = 4;
            p.ox = p.x;
          }
          if (p.x > W - 4) {
            p.x = W - 4;
            p.ox = p.x;
          }
          if (p.y > H - 4) {
            p.y = H - 4;
            p.oy = p.y;
          }
          if (p.y < 2) {
            p.y = 2;
            p.oy = p.y;
          }
        }

        for (let iter = 0; iter < ITERATIONS; iter++) {
          for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy) || 0.001;
            const diff = (dist - restDist) / dist * 0.5;

            if (!a.pin) {
              a.x += dx * diff;
              a.y += dy * diff;
            }
            if (!b.pin) {
              b.x -= dx * diff;
              b.y -= dy * diff;
            }
          }
          points[0].x = W / 2;
          points[0].y = 0;
        }
      }

      function drawRope() {
        ctx.clearRect(0, 0, W, H);

        // Shadow
        ctx.beginPath();
        ctx.moveTo(points[0].x + 1.5, points[0].y + 1.5);
        for (let i = 1; i < points.length - 1; i++) {
          const mx = (points[i].x + points[i + 1].x) / 2 + 1.5;
          const my = (points[i].y + points[i + 1].y) / 2 + 1.5;
          ctx.quadraticCurveTo(points[i].x + 1.5, points[i].y + 1.5, mx, my);
        }
        ctx.lineTo(points[points.length - 1].x + 1.5, points[points.length - 1].y + 1.5);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Rope main
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length - 1; i++) {
          const mx = (points[i].x + points[i + 1].x) / 2;
          const my = (points[i].y + points[i + 1].y) / 2;
          ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
        }
        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);

        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#8a6d3b');
        g.addColorStop(0.5, '#c9962a');
        g.addColorStop(1, '#8a6d3b');
        ctx.strokeStyle = g;
        ctx.lineWidth = 2.8;
        ctx.shadowColor = 'rgba(201,150,42,0.4)';
        ctx.shadowBlur = 4;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Weight (knot)
        const point = points[points.length - 1];
        const rg = ctx.createRadialGradient(point.x - 2, point.y - 2, 1, point.x, point.y, 8);
        rg.addColorStop(0, '#fff8e0');
        rg.addColorStop(0.5, '#e8b84b');
        rg.addColorStop(1, '#7a5010');

        ctx.beginPath();
        ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = rg;
        ctx.strokeStyle = '#5a3a08';
        ctx.lineWidth = 1.2;
        ctx.shadowColor = 'rgba(201,150,42,0.6)';
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Pulley
        ctx.beginPath();
        ctx.arc(W / 2, 0, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#8a6d3b';
        ctx.strokeStyle = '#c9962a';
        ctx.lineWidth = 1;
        ctx.fill();
        ctx.stroke();
      }

      // Animation loop
      (function loop() {
        updatePhysics();
        drawRope();
        requestAnimationFrame(loop);
      })();

    })();
  }, 0);
});
