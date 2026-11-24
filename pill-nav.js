/* pill-nav.js
   Vanilla JavaScript port of the PillNav component from React Bits.
   Progressive enhancement: the nav links are authored in the page, and this
   script adds the rolling hover fill, the active pill or dot, the automatic
   collapse menu and the intro. No framework, no build step. */

(function () {
  'use strict';

  var EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
  var menuId = 0;

  function prefersReduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function cssVar(el, name, fallback) {
    var value = parseFloat(window.getComputedStyle(el).getPropertyValue(name));
    return isNaN(value) ? fallback : value;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function setFlag(el, name, on) {
    if (on) el.setAttribute(name, '');
    else el.removeAttribute(name);
  }

  function PillNav(root) {
    this.root = root;
    this.bar = root.querySelector('.pill-nav__bar');
    this.track = root.querySelector('.pill-nav__track');
    this.list = root.querySelector('.pill-nav__list');
    this.logo = root.querySelector('.pill-nav__logo');

    if (!this.bar || !this.track || !this.list) return;

    this.slots = [];
    this.items = [];
    this.menuRows = [];
    this.menuToggle = null;
    this.panel = null;
    this.rects = null;
    this.dot = null;
    this.dotX = 0;
    this.dotV = 0;
    this.dotRaf = 0;
    this.dotReady = false;
    this.collapsed = false;
    this.open = false;
    this.selected = 0;
    this.hoverEffect = root.getAttribute('data-hover') || 'fill';
    this.indicator = root.getAttribute('data-indicator') || 'pill';
    this.collapseMode = root.getAttribute('data-collapse') || 'auto';
    this.bounce = clamp(parseFloat(root.getAttribute('data-bounce')) || 0.3, 0, 1);
    this.withIntro = root.getAttribute('data-intro') !== 'false';

    this.enhance();
    this.buildMeasure();
    this.buildDot();
    this.bind();
    this.syncActive();
    this.evaluate();
    this.measure();
    this.moveDot(true);
    this.watch();
    this.playIntro();

    root.__pillNav = this;
  }

  PillNav.prototype.enhance = function () {
    var self = this;

    Array.prototype.forEach.call(this.list.children, function (slot) {
      if (!slot.classList || !slot.classList.contains('pill-nav__slot')) return;
      var item = slot.querySelector('.pill-nav__item');
      if (!item) return;

      var label = item.textContent.replace(/\s+/g, ' ').trim();
      var icon = item.querySelector('svg');
      var current = item.getAttribute('aria-current') === 'page';

      var face = document.createElement('span');
      face.className = 'pill-nav__face';
      while (item.firstChild) face.appendChild(item.firstChild);

      var alt = document.createElement('span');
      alt.className = 'pill-nav__face-alt';
      alt.setAttribute('aria-hidden', 'true');
      Array.prototype.forEach.call(face.childNodes, function (node) {
        alt.appendChild(node.cloneNode(true));
      });

      if (self.hoverEffect === 'fill') {
        var fill = document.createElement('span');
        fill.className = 'pill-nav__fill';
        fill.setAttribute('aria-hidden', 'true');
        item.appendChild(fill);
      }
      item.appendChild(face);
      item.appendChild(alt);

      self.slots.push(slot);
      if (current) self.selected = self.items.length;
      self.items.push({
        label: label,
        href: item.getAttribute('href'),
        icon: icon ? icon.cloneNode(true) : null
      });
    });
  };

  PillNav.prototype.buildMeasure = function () {
    var measure = document.createElement('div');
    measure.className = 'pill-nav__measure';
    measure.setAttribute('aria-hidden', 'true');

    this.items.forEach(function (item) {
      var cell = document.createElement('span');
      cell.className = 'pill-nav__measure-item';
      if (item.icon) cell.appendChild(item.icon.cloneNode(true));
      var text = document.createElement('span');
      text.textContent = item.label;
      cell.appendChild(text);
      measure.appendChild(cell);
    });

    this.measureEl = measure;
    this.root.appendChild(measure);
  };

  PillNav.prototype.buildDot = function () {
    if (this.indicator !== 'dot') return;
    var dot = document.createElement('span');
    dot.className = 'pill-nav__dot';
    dot.setAttribute('aria-hidden', 'true');
    this.track.appendChild(dot);
    this.dot = dot;
  };

  PillNav.prototype.bind = function () {
    var self = this;

    this.slots.forEach(function (slot, index) {
      var item = slot.querySelector('.pill-nav__item');
      if (!item) return;

      slot.addEventListener('pointerenter', function (event) {
        if (event.pointerType === 'touch') return;
        setFlag(slot, 'data-lit', true);
        setFlag(slot, 'data-hover', self.hoverEffect === 'fill');
      });
      slot.addEventListener('pointerleave', function () {
        setFlag(slot, 'data-lit', false);
        setFlag(slot, 'data-hover', false);
      });
      slot.addEventListener('focusin', function () {
        setFlag(slot, 'data-lit', true);
        setFlag(slot, 'data-hover', self.hoverEffect === 'fill');
      });
      slot.addEventListener('focusout', function () {
        setFlag(slot, 'data-lit', false);
        setFlag(slot, 'data-hover', false);
      });
      item.addEventListener('click', function () {
        self.select(index);
      });
    });

    this.onDocPointer = function (event) {
      if (self.root.contains(event.target)) return;
      self.closeMenu();
    };
    this.onDocKey = function (event) {
      if (event.key !== 'Escape') return;
      self.closeMenu();
      if (self.menuToggle) self.menuToggle.focus();
    };
  };

  PillNav.prototype.syncActive = function () {
    var self = this;

    this.slots.forEach(function (slot, index) {
      var item = slot.querySelector('.pill-nav__item');
      if (!item) return;
      var current = index === self.selected;
      if (current) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
      setFlag(slot, 'data-on', self.hoverEffect === 'fill' && self.indicator === 'pill' && current);
    });

    this.menuRows.forEach(function (row, index) {
      if (index === self.selected) row.setAttribute('aria-current', 'page');
      else row.removeAttribute('aria-current');
    });
  };

  PillNav.prototype.select = function (index) {
    if (index === this.selected) {
      this.moveDot();
      return;
    }
    this.selected = index;
    this.syncActive();
    this.moveDot();
  };

  PillNav.prototype.measure = function () {
    if (this.collapsed || !this.slots.length) return;
    var rects = [];
    this.trackWidth = this.track.offsetWidth;
    this.trackHeight = this.track.offsetHeight;

    this.slots.forEach(function (slot) {
      var reach = Math.ceil(2 * Math.sqrt(Math.pow(slot.offsetWidth / 2, 2) + Math.pow(slot.offsetHeight, 2))) + 2;
      slot.style.setProperty('--pn-fill', reach + 'px');
      rects.push({ left: slot.offsetLeft, width: slot.offsetWidth });
    });

    this.rects = rects;
  };

  PillNav.prototype.paintDot = function () {
    if (!this.dot) return;
    var stretch = 1 + clamp(Math.abs(this.dotV) / 700, 0, 2.2);
    this.dot.style.transform = 'translate3d(' + this.dotX + 'px, 0, 0) scaleX(' + stretch + ')';
    this.dot.style.opacity = '1';
  };

  PillNav.prototype.moveDot = function (snap) {
    if (!this.dot) return;
    var rect = this.rects && this.rects[this.selected];
    if (!rect) {
      this.dot.style.opacity = '0';
      return;
    }

    var target = rect.left + rect.width / 2;
    if (snap || !this.dotReady || prefersReduced()) {
      this.dotX = target;
      this.dotV = 0;
      this.dotReady = true;
      this.paintDot();
      return;
    }
    if (this.dotRaf) return;

    var self = this;
    var last = 0;
    var k = 360;
    var zeta = 1 - 0.5 * this.bounce;

    var tick = function (now) {
      self.dotRaf = 0;
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      var current = self.rects && self.rects[self.selected];
      if (!current) return;
      var center = current.left + current.width / 2;
      var steps = Math.ceil(dt / (1 / 240));
      var h = dt / steps;
      for (var i = 0; i < steps; i++) {
        self.dotV += (-k * (self.dotX - center) - 2 * zeta * Math.sqrt(k) * self.dotV) * h;
        self.dotX += self.dotV * h;
      }
      self.paintDot();
      if (Math.abs(self.dotX - center) > 0.05 || Math.abs(self.dotV) > 0.5) {
        self.dotRaf = requestAnimationFrame(tick);
      }
    };
    this.dotRaf = requestAnimationFrame(tick);
  };

  PillNav.prototype.evaluate = function () {
    var parent = this.root.parentElement;
    if (!parent) return;

    var next;
    if (this.collapseMode === 'always') {
      next = true;
    } else if (this.collapseMode === 'never') {
      next = false;
    } else {
      var styles = window.getComputedStyle(parent);
      var gap = parseFloat(styles.columnGap || styles.gap) || 0;
      var used = 0;
      var siblings = 0;
      Array.prototype.forEach.call(parent.children, function (el) {
        if (el === this.root) return;
        used += el.offsetWidth;
        siblings++;
      }, this);
      var pad = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
      var available = parent.clientWidth - pad - used - gap * siblings;
      var need = this.measureEl.scrollWidth + cssVar(this.root, '--pn-pad', 4) * 2 + 2;
      if (this.logo) need += this.logo.offsetWidth + cssVar(this.root, '--pn-gap', 8);
      next = need > available;
    }
    this.setCollapsed(next);
  };

  PillNav.prototype.setCollapsed = function (next) {
    if (next === this.collapsed) return;
    this.collapsed = next;
    setFlag(this.root, 'data-collapsed', next);
    if (next) this.buildMenu();
    this.closeMenu(true);
    if (!next) {
      this.measure();
      this.moveDot(true);
    }
  };

  PillNav.prototype.buildMenu = function () {
    if (this.menuToggle) return;

    var self = this;
    menuId++;
    var id = 'pill-nav-menu-' + menuId;

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'pill-nav__toggle pill-nav__surface';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', id);
    toggle.setAttribute('aria-label', 'Open menu');

    var burger = document.createElement('span');
    burger.className = 'pill-nav__burger';
    burger.setAttribute('aria-hidden', 'true');
    var lineTop = document.createElement('span');
    lineTop.className = 'pill-nav__line pill-nav__line--top';
    var lineBottom = document.createElement('span');
    lineBottom.className = 'pill-nav__line pill-nav__line--bottom';
    burger.appendChild(lineTop);
    burger.appendChild(lineBottom);

    var toggleRim = document.createElement('span');
    toggleRim.className = 'pill-nav__rim';
    toggle.appendChild(burger);
    toggle.appendChild(toggleRim);
    toggle.addEventListener('click', function () {
      if (self.open) self.closeMenu();
      else self.openMenu();
    });

    var panel = document.createElement('div');
    panel.id = id;
    panel.className = 'pill-nav__panel pill-nav__surface';
    panel.hidden = true;

    var list = document.createElement('ul');
    list.className = 'pill-nav__menu';

    this.items.forEach(function (item, index) {
      var cell = document.createElement('li');
      var row = document.createElement(item.href ? 'a' : 'button');
      row.className = 'pill-nav__row';
      if (item.href) row.setAttribute('href', item.href);
      else row.setAttribute('type', 'button');
      if (item.icon) row.appendChild(item.icon.cloneNode(true));
      var text = document.createElement('span');
      text.textContent = item.label;
      row.appendChild(text);
      row.addEventListener('click', function () {
        self.select(index);
        self.closeMenu();
      });
      cell.appendChild(row);
      list.appendChild(cell);
      self.menuRows.push(row);
    });

    panel.appendChild(list);
    var panelRim = document.createElement('span');
    panelRim.className = 'pill-nav__rim';
    panel.appendChild(panelRim);

    this.menuToggle = toggle;
    this.panel = panel;
    this.root.appendChild(toggle);
    this.root.appendChild(panel);
    this.syncActive();
  };

  PillNav.prototype.positionPanel = function () {
    if (!this.panel) return;
    this.panel.style.right = '0px';
    var box = this.panel.getBoundingClientRect();
    var margin = 12;
    var shift = 0;
    if (box.left < margin) shift = margin - box.left;
    else if (box.right > window.innerWidth - margin) shift = window.innerWidth - margin - box.right;
    if (shift) this.panel.style.right = -shift + 'px';
  };

  PillNav.prototype.openMenu = function () {
    if (!this.panel || !this.collapsed) return;
    this.open = true;
    this.panel.hidden = false;
    this.positionPanel();
    setFlag(this.root, 'data-open', true);
    this.menuToggle.setAttribute('aria-expanded', 'true');
    this.menuToggle.setAttribute('aria-label', 'Close menu');
    this.menuRows.forEach(function (row) {
      row.removeAttribute('tabindex');
    });

    if (!prefersReduced() && this.panel.animate) {
      this.panel.animate(
        [
          { opacity: 0, transform: 'translateY(-6px) scale(.98)' },
          { opacity: 1, transform: 'translateY(0) scale(1)' }
        ],
        { duration: 200, easing: EASE }
      );
    }

    document.addEventListener('pointerdown', this.onDocPointer, true);
    document.addEventListener('keydown', this.onDocKey);
  };

  PillNav.prototype.closeMenu = function (instant) {
    if (!this.panel) return;
    this.open = false;
    setFlag(this.root, 'data-open', false);
    if (this.menuToggle) {
      this.menuToggle.setAttribute('aria-expanded', 'false');
      this.menuToggle.setAttribute('aria-label', 'Open menu');
    }
    this.menuRows.forEach(function (row) {
      row.setAttribute('tabindex', '-1');
    });

    document.removeEventListener('pointerdown', this.onDocPointer, true);
    document.removeEventListener('keydown', this.onDocKey);

    if (instant || prefersReduced() || !this.panel.animate) {
      this.panel.hidden = true;
      this.panel.style.right = '0px';
      return;
    }

    var panel = this.panel;
    var animation = panel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: 'ease' });
    animation.onfinish = function () {
      panel.hidden = true;
    };
  };

  PillNav.prototype.watch = function () {
    var self = this;
    var refresh = function () {
      self.evaluate();
      self.measure();
      self.moveDot(true);
      if (self.open) self.positionPanel();
    };

    if (window.ResizeObserver) {
      this.observer = new ResizeObserver(refresh);
      if (this.root.parentElement) this.observer.observe(this.root.parentElement);
      this.observer.observe(this.measureEl);
    }

    this.onResize = function () {
      if (self.resizeRaf) cancelAnimationFrame(self.resizeRaf);
      self.resizeRaf = requestAnimationFrame(function () {
        self.resizeRaf = 0;
        refresh();
      });
    };
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(refresh).catch(function () {});
    }
  };

  PillNav.prototype.playIntro = function () {
    if (!this.withIntro || prefersReduced() || !this.root.animate) return;

    var pop = function (element, delay, duration) {
      if (!element) return;
      element.animate(
        [
          { opacity: 0, transform: 'scale(.6)' },
          { opacity: 1, transform: 'scale(1)' }
        ],
        { duration: duration, delay: delay, easing: 'cubic-bezier(.34, 1.56, .64, 1)', fill: 'backwards' }
      );
    };

    pop(this.logo, 0, 700);

    if (this.collapsed) {
      pop(this.menuToggle, 120, 500);
      return;
    }

    var width = this.bar.offsetWidth;
    var height = this.bar.offsetHeight;
    if (width && height) {
      this.bar.animate(
        [
          { clipPath: 'inset(0 ' + Math.max(0, width - height) + 'px 0 0 round ' + height / 2 + 'px)' },
          { clipPath: 'inset(0 0 0 0 round ' + height / 2 + 'px)' }
        ],
        { duration: 760, delay: 90, easing: EASE, fill: 'backwards' }
      );
    }

    this.slots.forEach(function (slot, index) {
      slot.animate(
        [
          { opacity: 0, transform: 'translateX(-10px)' },
          { opacity: 1, transform: 'translateX(0)' }
        ],
        { duration: 560, delay: 200 + index * 50, easing: EASE, fill: 'backwards' }
      );
    });
  };

  function boot() {
    Array.prototype.forEach.call(document.querySelectorAll('.pill-nav'), function (node) {
      if (node.__pillNav) return;
      new PillNav(node);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.PillNav = PillNav;
})();
