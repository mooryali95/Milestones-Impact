// ══ Auto-generated from shared/js — edit the source there, not this copy. ══
/* ════════════════════════════════════════════════════════════════════
   ░░  HERO CANVAS — Glowing Network Animation  ░░
   ════════════════════════════════════════════════════════════════════
   شبكة نقاط نورانية متحركة في خلفية Hero.
   - متجاوبة مع حجم الشاشة
   - تقلل عدد النقاط على الجوال للأداء
   - تستخدم DPR للجودة على شاشات الـ Retina
   ════════════════════════════════════════════════════════════════════ */

(function initHeroCanvas() {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let width, height, nodes = [];

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = canvas.width = rect.width * dpr;
    height = canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
  }

  function initNodes() {
    nodes = [];
    // Adaptive density — fewer nodes on mobile for performance
    const isMobile = window.innerWidth < 768;
    const divisor = isMobile ? 50000 : 30000;
    const count = Math.floor((width * height) / divisor);

    for (let i = 0; i < count; i++) {
      nodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.4 * dpr,
        vy: (Math.random() - 0.5) * 0.4 * dpr,
        radius: (Math.random() * 1.6 + 0.8) * dpr,
        glow: Math.random() > 0.7,
      });
    }
  }

  function animate() {
    ctx.clearRect(0, 0, width, height);
    const maxDist = 180 * dpr;

    // Update positions
    nodes.forEach(n => {
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < 0 || n.x > width) n.vx *= -1;
      if (n.y < 0 || n.y > height) n.vy *= -1;
    });

    // Draw connecting lines
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx*dx + dy*dy);

        if (dist < maxDist) {
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.strokeStyle = `rgba(200, 164, 92, ${0.18 * (1 - dist/maxDist)})`;
          ctx.lineWidth = 0.8 * dpr;
          ctx.stroke();
        }
      }
    }

    // Draw nodes
    nodes.forEach(n => {
      // Solid dot
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius * 2, 0, Math.PI * 2);
      ctx.fillStyle = n.glow ? '#C8A45C' : 'rgba(200, 164, 92, 0.6)';
      ctx.fill();

      // Glow effect for special nodes
      if (n.glow) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius * 8, 0, Math.PI * 2);
        const gradient = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.radius * 8);
        gradient.addColorStop(0, 'rgba(200, 164, 92, 0.3)');
        gradient.addColorStop(1, 'rgba(200, 164, 92, 0)');
        ctx.fillStyle = gradient;
        ctx.fill();
      }
    });

    requestAnimationFrame(animate);
  }

  // Initialize
  resize();
  initNodes();
  animate();

  // Handle resize (debounced)
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resize();
      initNodes();
    }, 200);
  });
})();
