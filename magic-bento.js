/* magic-bento.js
   Vanilla JavaScript port of the MagicBento component from React Bits.
   The cards are authored in the page, and this script adds the cursor light,
   the border glow, the click wave, the responsive columns and the intro.
   No framework, no build step, no dependencies. */

(function () {
  'use strict';

  var MIN_CELL = 160;
  var MIN_PAIR = 200;
  var STAGGER = 70;
  var TILT = 6;
  var MAGNET = 6;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function number(value, fallback) {
    var parsed = parseFloat(value);
    return isNaN(parsed) ? fallback : parsed;
  }

  function parseRgb(value) {
    if (!value) return null;
    var text = String(value).trim();
    var hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
    if (hex) {
      var full = hex[1].length === 3 ? hex[1].replace(/./g, function (digit) { return digit + digit; }) : hex[1];
      return [0, 2, 4].map(function (index) { return parseInt(full.slice(index, index + 2), 16); });
    }
    var numbers = text.match(/[\d.]+/g);
    if (numbers && numbers.length >= 3) {
      return numbers.slice(0, 3).map(function (channel) { return clamp(Math.round(parseFloat(channel)), 0, 255); });
    }
    return null;
  }

  function init(root) {
    if (!root || root.__magicBento) return;

    var cells = Array.prototype.slice.call(root.querySelectorAll('.magic-bento__cell'));
    var cards = cells.map(function (cell) { return cell.querySelector('.magic-bento__card'); });
    if (!cards.some(Boolean)) return;

    var gap = Math.max(0, number(root.dataset.gap, 12));
    var radius = Math.max(0, number(root.dataset.radius, 16));
    var rowHeight = Math.max(80, number(root.dataset.rowHeight, 210));
    var columns = Math.max(1, Math.round(number(root.dataset.columns, 4)));
    var spotSize = Math.max(40, number(root.dataset.spotlightRadius, 300));
    var borderGlow = root.dataset.borderGlow !== 'false';
    var spotlight = root.dataset.spotlight !== 'false';
    var tilt = root.dataset.tilt === 'true';
    var magnetism = root.dataset.magnetism === 'true';
    var clickEffect = root.dataset.click !== 'false';
    var stars = root.dataset.stars === 'true';
    var particleCount = clamp(Math.round(number(root.dataset.particleCount, 24)), 0, 120);
    var intro = root.dataset.intro !== 'false';
    var glow = parseRgb(root.dataset.glow) || [0, 178, 75];

    root.style.setProperty('--mb-radius', radius + 'px');
    root.style.setProperty('--mb-inner-radius', Math.round(clamp(radius * 0.5, 6, 12)) + 'px');
    root.style.setProperty('--mb-pad', Math.round(clamp(radius * 0.85, 14, 20)) + 'px');
    root.style.setProperty('--mb-spot-size', spotSize + 'px');
    root.style.setProperty('--mb-border-size', Math.round(spotSize * 0.75) + 'px');
    root.style.setProperty('--mb-glow-rgb', glow.join(', '));
    root.style.gap = gap + 'px';

    var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var motion = !reduced;
    if (motion) root.setAttribute('data-motion', '');

    var states = cards.map(function () {
      return {
        hot: 0,
        near: 0,
        rx: 0,
        ry: 0,
        tx: 0,
        ty: 0,
        press: 1,
        stars: 0,
        active: false,
        particles: null,
        drawn: false
      };
    });
    var writes = cards.map(function () { return {}; });
    var starCanvases = [];

    cards.forEach(function (card) {
      if (!card) {
        starCanvases.push(null);
        return;
      }

      var light = document.createElement('span');
      light.className = 'magic-bento__light';
      light.setAttribute('aria-hidden', 'true');
      card.appendChild(light);

      if (stars) {
        var canvas = document.createElement('canvas');
        canvas.className = 'magic-bento__stars';
        canvas.setAttribute('aria-hidden', 'true');
        card.appendChild(canvas);
        starCanvases.push(canvas);
      } else {
        starCanvases.push(null);
      }

      var rim = document.createElement('span');
      rim.className = 'magic-bento__rim';
      rim.setAttribute('aria-hidden', 'true');
      card.appendChild(rim);

      if (borderGlow) {
        var border = document.createElement('span');
        border.className = 'magic-bento__border';
        border.setAttribute('aria-hidden', 'true');
        card.appendChild(border);
      }
    });

    var pointer = { x: -1e5, y: -1e5, inside: false, down: -1 };
    var light = { x: -1e5, y: -1e5, near: 0, ready: false };
    var wave = { x: 0, y: 0, t: -1, duration: 1.1, reach: 800 };
    var bounds = null;
    var rects = [];
    var dirty = true;
    var raf = 0;
    var last = 0;
    var visible = true;
    var entered = true;
    var currentColumns = columns;

    function layout() {
      var width = root.clientWidth;
      if (!width) return;
      var count = columns;
      var cell = function (n) { return (width - gap * (n - 1)) / n; };
      if (cell(columns) < MIN_CELL) count = columns >= 2 && cell(2) >= MIN_PAIR ? 2 : 1;
      root.style.gridTemplateColumns = 'repeat(' + count + ', minmax(0, 1fr))';
      root.style.gridAutoRows = count === 1 ? 'minmax(' + rowHeight + 'px, auto)' : rowHeight + 'px';

      cells.forEach(function (cellElement) {
        var colSpan = Math.max(1, Math.round(number(cellElement.dataset.colSpan, 1)));
        var rowSpan = Math.max(1, Math.round(number(cellElement.dataset.rowSpan, 1)));
        cellElement.style.gridColumn = 'span ' + Math.min(count, colSpan);
        cellElement.style.gridRow = 'span ' + rowSpan;
      });

      currentColumns = count;
    }

    function measure() {
      dirty = false;
      bounds = root.getBoundingClientRect();
      rects = cards.map(function (card) {
        if (!card) return null;
        return card.getBoundingClientRect();
      });
      var ratio = Math.min(window.devicePixelRatio || 1, 2);
      starCanvases.forEach(function (canvas, index) {
        var rect = rects[index];
        if (!canvas || !rect) return;
        var width = Math.max(1, Math.round(rect.width * ratio));
        var height = Math.max(1, Math.round(rect.height * ratio));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
      });
    }

    function write(card, index, name, value) {
      var cache = writes[index];
      if (cache[name] === value) return;
      cache[name] = value;
      card.style.setProperty(name, value);
    }

    function seed(index, rect) {
      var state = states[index];
      if (state.particles && state.particles.length === particleCount) return state.particles;
      state.particles = [];
      for (var i = 0; i < particleCount; i++) {
        state.particles.push({
          x: Math.random() * rect.width,
          y: Math.random() * rect.height,
          vx: (Math.random() - 0.5) * 6,
          vy: -4 - Math.random() * 10,
          size: 0.6 + Math.random() * 1.1,
          phase: Math.random() * Math.PI * 2,
          rate: 1.2 + Math.random() * 2.4
        });
      }
      return state.particles;
    }

    function drawStars(index, rect, lx, ly, dt, now) {
      var canvas = starCanvases[index];
      if (!canvas) return;
      var context = canvas.getContext('2d');
      if (!context) return;
      var ratio = canvas.width / Math.max(1, rect.width);
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      var state = states[index];
      if (state.stars < 0.004) return;
      var particles = seed(index, rect);
      var reach = spotSize * 0.75;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      for (var i = 0; i < particles.length; i++) {
        var particle = particles[i];
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        if (particle.y < -4) {
          particle.y = rect.height + 4;
          particle.x = Math.random() * rect.width;
        }
        if (particle.x < -4) particle.x = rect.width + 4;
        if (particle.x > rect.width + 4) particle.x = -4;
        var distance = Math.hypot(particle.x - lx, particle.y - ly) / reach;
        if (distance >= 1) continue;
        var falloff = 1 - distance * distance * (3 - 2 * distance);
        var twinkle = 0.55 + 0.45 * Math.sin(now * 0.001 * particle.rate + particle.phase);
        var alpha = state.stars * falloff * twinkle;
        if (alpha < 0.01) continue;
        context.fillStyle = 'rgba(' + glow[0] + ', ' + glow[1] + ', ' + glow[2] + ', ' + alpha.toFixed(3) + ')';
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        context.fill();
      }
    }

    function startWave(x, y, duration) {
      if (!motion || !bounds) return;
      wave.x = x;
      wave.y = y;
      wave.t = 0;
      wave.duration = duration;
      wave.reach =
        Math.max(
          Math.hypot(x - bounds.left, y - bounds.top),
          Math.hypot(x - bounds.right, y - bounds.top),
          Math.hypot(x - bounds.left, y - bounds.bottom),
          Math.hypot(x - bounds.right, y - bounds.bottom)
        ) + 140;
    }

    function frame(now) {
      raf = 0;
      var dt = last ? clamp((now - last) / 1000, 0.001, 0.05) : 0.016;
      last = now;
      if (dirty) measure();
      var busy = false;

      var margin = spotSize * 0.5;
      var near =
        pointer.inside &&
        bounds &&
        pointer.x > bounds.left - margin &&
        pointer.x < bounds.right + margin &&
        pointer.y > bounds.top - margin &&
        pointer.y < bounds.bottom + margin
          ? 1
          : 0;

      if (!light.ready && near) {
        light.x = pointer.x;
        light.y = pointer.y;
        light.ready = true;
      }
      var follow = 1 - Math.exp(-dt / 0.05);
      light.x += (pointer.x - light.x) * follow;
      light.y += (pointer.y - light.y) * follow;
      var fade = 1 - Math.exp(-dt / (near > light.near ? 0.12 : 0.4));
      light.near += (near - light.near) * fade;
      if (Math.abs(near - light.near) < 0.002) light.near = near;
      else busy = true;
      if (Math.abs(pointer.x - light.x) + Math.abs(pointer.y - light.y) > 0.3) busy = true;

      var waveRadius = 0;
      var waveAlpha = 0;
      if (wave.t >= 0) {
        wave.t += dt;
        var progress = Math.min(1, wave.t / wave.duration);
        waveRadius = wave.reach * (1 - Math.pow(1 - progress, 2.2));
        waveAlpha = Math.pow(1 - progress, 1.3);
        if (progress >= 1) {
          wave.t = -1;
          waveAlpha = 0;
        } else {
          busy = true;
        }
      }

      cards.forEach(function (card, index) {
        var rect = rects[index];
        if (!card || !rect) return;
        var state = states[index];
        var lx = light.x - rect.left;
        var ly = light.y - rect.top;
        var px = pointer.x - rect.left;
        var py = pointer.y - rect.top;
        var inside = pointer.inside && entered && px >= 0 && py >= 0 && px <= rect.width && py <= rect.height;

        if (inside !== state.active) {
          state.active = inside;
          if (inside) card.setAttribute('data-active', '');
          else card.removeAttribute('data-active');
        }

        var hotTarget = inside && spotlight ? 1 : 0;
        state.hot += (hotTarget - state.hot) * (1 - Math.exp(-dt / (hotTarget > state.hot ? 0.14 : 0.32)));
        if (Math.abs(hotTarget - state.hot) < 0.002) state.hot = hotTarget;
        else busy = true;

        var u = clamp(px / Math.max(1, rect.width), 0, 1) - 0.5;
        var v = clamp(py / Math.max(1, rect.height), 0, 1) - 0.5;
        var tiltOn = inside && tilt && motion;
        var magnetOn = inside && magnetism && motion;
        var rxTarget = tiltOn ? -v * 2 * TILT : 0;
        var ryTarget = tiltOn ? u * 2 * TILT : 0;
        var txTarget = magnetOn ? u * 2 * MAGNET : 0;
        var tyTarget = magnetOn ? v * 2 * MAGNET : 0;
        var turn = 1 - Math.exp(-dt / 0.09);
        state.rx += (rxTarget - state.rx) * turn;
        state.ry += (ryTarget - state.ry) * turn;
        state.tx += (txTarget - state.tx) * turn;
        state.ty += (tyTarget - state.ty) * turn;
        if (
          Math.abs(rxTarget - state.rx) > 0.01 ||
          Math.abs(ryTarget - state.ry) > 0.01 ||
          Math.abs(txTarget - state.tx) > 0.01 ||
          Math.abs(tyTarget - state.ty) > 0.01
        ) {
          busy = true;
        } else {
          state.rx = rxTarget;
          state.ry = ryTarget;
          state.tx = txTarget;
          state.ty = tyTarget;
        }

        var pressTarget = pointer.down === index && clickEffect && motion ? 0.985 : 1;
        state.press += (pressTarget - state.press) * (1 - Math.exp(-dt / 0.12));
        if (Math.abs(pressTarget - state.press) < 0.0005) state.press = pressTarget;
        else busy = true;

        write(card, index, '--mb-x', lx.toFixed(1) + 'px');
        write(card, index, '--mb-y', ly.toFixed(1) + 'px');
        write(card, index, '--mb-near', (borderGlow ? light.near : 0).toFixed(3));
        write(card, index, '--mb-hot', state.hot.toFixed(3));
        write(card, index, '--mb-rx', state.rx.toFixed(3) + 'deg');
        write(card, index, '--mb-ry', state.ry.toFixed(3) + 'deg');
        write(card, index, '--mb-tx', state.tx.toFixed(2) + 'px');
        write(card, index, '--mb-ty', state.ty.toFixed(2) + 'px');
        write(card, index, '--mb-press', state.press.toFixed(4));
        write(card, index, '--mb-wx', (wave.x - rect.left).toFixed(1) + 'px');
        write(card, index, '--mb-wy', (wave.y - rect.top).toFixed(1) + 'px');
        write(card, index, '--mb-wr', waveRadius.toFixed(1) + 'px');
        write(card, index, '--mb-wa', waveAlpha.toFixed(3));

        if (stars && starCanvases[index]) {
          var starTarget = inside && motion ? 1 : 0;
          state.stars += (starTarget - state.stars) * (1 - Math.exp(-dt / (starTarget ? 0.3 : 0.5)));
          if (state.stars < 0.004 && !starTarget) state.stars = 0;
          if (state.stars > 0 || starTarget) {
            drawStars(index, rect, lx, ly, dt, now);
            state.drawn = true;
            busy = true;
          } else if (state.drawn) {
            drawStars(index, rect, lx, ly, dt, now);
            state.drawn = false;
          }
        }
      });

      if (busy && visible) raf = requestAnimationFrame(frame);
    }

    function wake() {
      if (raf || !visible) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    }

    function cardIndex(target) {
      if (!(target instanceof Element)) return -1;
      var card = target.closest('.magic-bento__card');
      return card instanceof HTMLElement ? cards.indexOf(card) : -1;
    }

    function onPointerMove(event) {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.inside = true;
      wake();
    }

    function onPointerOut(event) {
      if (event.relatedTarget) return;
      pointer.inside = false;
      pointer.down = -1;
      wake();
    }

    function onPointerDown(event) {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.inside = true;
      pointer.down = cardIndex(event.target);
      wake();
    }

    function release() {
      if (pointer.down < 0) return;
      pointer.down = -1;
      wake();
    }

    function onClick(event) {
      var index = cardIndex(event.target);
      if (index < 0) return;
      if (clickEffect) {
        if (dirty) measure();
        if (event.detail === 0) {
          var card = cards[index];
          var rect = card.getBoundingClientRect();
          startWave(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.1);
        } else {
          startWave(event.clientX, event.clientY, 1.1);
        }
      }
      wake();
    }

    function onScroll() {
      dirty = true;
      wake();
    }

    function enter() {
      entered = true;
      cells.forEach(function (cell, index) {
        cell.style.setProperty('--mb-delay', index * STAGGER + 'ms');
        cell.dataset.state = 'in';
      });
      if (dirty) measure();
      window.setTimeout(function () {
        if (bounds) startWave(bounds.left, bounds.top, 1.7);
        wake();
      }, 260);
      wake();
    }

    layout();

    var gate = null;
    if (intro && motion && typeof IntersectionObserver !== 'undefined') {
      entered = false;
      root.setAttribute('data-intro', '');
      gate = new IntersectionObserver(
        function (entries, observer) {
          if (!entries.some(function (entry) { return entry.isIntersecting; })) return;
          observer.disconnect();
          enter();
        },
        { threshold: 0.15 }
      );
      gate.observe(root);
    } else {
      cells.forEach(function (cell) {
        cell.style.setProperty('--mb-delay', '0ms');
        cell.dataset.state = 'in';
      });
      measure();
    }

    var visibility = new IntersectionObserver(function (entries) {
      visible = entries.some(function (entry) { return entry.isIntersecting; });
      if (visible) {
        dirty = true;
        wake();
      }
    });
    visibility.observe(root);

    var resizeObserver = new ResizeObserver(function () {
      var width = root.clientWidth;
      if (!width) return;
      layout();
      if (currentColumns !== columns) dirty = true;
      dirty = true;
      wake();
    });
    resizeObserver.observe(root);

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', release, { passive: true });
    window.addEventListener('pointercancel', release, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onScroll, { passive: true });
    document.addEventListener('pointerout', onPointerOut);
    root.addEventListener('click', onClick);

    root.__magicBento = { cards: cards, layout: layout };
    measure();
    wake();
  }

  function boot() {
    Array.prototype.forEach.call(document.querySelectorAll('.magic-bento'), init);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.MagicBento = { init: init };
})();
