// ══ Auto-generated from shared/js — edit the source there, not this copy. ══
/* ════════════════════════════════════════════════════════════════════
   ░░  HERO CANVAS — Glowing Network Animation  ░░
   ════════════════════════════════════════════════════════════════════
   شبكة نقاط نورانية متحركة في خلفية Hero.
   - متجاوبة مع حجم الشاشة
   - تقلل عدد النقاط على الجوال للأداء
   - تستخدم DPR للجودة على شاشات الـ Retina
   - تتوقف حين تخرج من الشاشة أو يُخفى التبويب، وتسكن لمن يطلب حركة أقل
   ════════════════════════════════════════════════════════════════════ */

(function initHeroCanvas() {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;

  // من طلب حركة أقل يرى رسماً ساكناً واحداً بلا حلقة
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // سقف للنقاط: الرسم يقارن كل زوج، فالكلفة تتضاعف مع مربع العدد
  const MAX_NODES = 90;

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
    // المساحة بالبكسل المنطقي لا الفعلي، وإلا ضاعفت شاشات Retina العدد أربعاً
    const count = Math.min(MAX_NODES, Math.floor((width * height) / (dpr * dpr) / divisor));

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

  let rafId = 0;
  let onScreen = true;

  function frame() {
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

  }

  function loop() {
    frame();
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    if (reduceMotion || rafId || !onScreen || document.hidden) return;
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  // Initialize
  resize();
  initNodes();
  frame();
  start();

  // لا رسم والقسم خارج الشاشة أو التبويب مخفي: يوفر المعالج والبطارية
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      onScreen = entries[0].isIntersecting;
      onScreen ? start() : stop();
    }).observe(canvas);
  }
  document.addEventListener('visibilitychange', () => {
    document.hidden ? stop() : start();
  });

  // Handle resize (debounced)
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resize();
      initNodes();
      frame();
    }, 200);
  });
})();
