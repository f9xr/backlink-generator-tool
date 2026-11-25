// site.js - shared interactions for the Backlink Generator site.
// No dependencies. Every block exits quietly when its markup is absent.

(function () {
  'use strict';

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The footer reveal and measured spacer only apply when this script runs.
  document.documentElement.classList.add('has-js');

  /* ---------- Back to top ---------- */

  function setupBackToTop() {
    if (document.querySelector('.to-top')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'to-top';
    btn.setAttribute('aria-label', 'Back to top');
    btn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>';
    document.body.appendChild(btn);

    var ticking = false;
    function update() {
      btn.classList.toggle('is-visible', window.scrollY > 640);
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    }, { passive: true });
    update();

    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
      var skip = document.querySelector('.skip-link');
      if (skip) skip.focus({ preventScroll: true });
    });
  }

  /* ---------- Scroll reveal ---------- */

  function setupReveal() {
    var items = document.querySelectorAll('.reveal');
    if (!items.length) return;
    if (reducedMotion || !('IntersectionObserver' in window)) {
      items.forEach(function (node) { node.classList.add('is-visible'); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(function (node) { observer.observe(node); });
  }

  /* ---------- Footer reveal height ---------- */

  function setupFooterReveal() {
    var footer = document.querySelector('.site-footer--wide');
    if (!footer) return;
    var desktop = window.matchMedia('(min-width: 900px)');
    function measure() {
      var height = desktop.matches ? Math.ceil(footer.getBoundingClientRect().height) : 0;
      document.documentElement.style.setProperty('--footer-reveal-h', height + 'px');
    }
    measure();
    if ('ResizeObserver' in window) {
      new ResizeObserver(measure).observe(footer);
    }
    window.addEventListener('resize', measure, { passive: true });
    window.addEventListener('load', measure, { once: true });

    // The footer sits behind the page until the end. If a keyboard or screen
    // reader user reaches it early, scroll it into view instead of leaving
    // focus on an element hidden behind the content.
    footer.addEventListener('focusin', function () {
      var bottom = document.documentElement.scrollHeight;
      if (window.scrollY + window.innerHeight > bottom - footer.offsetHeight - 40) return;
      window.scrollTo({ top: bottom, behavior: reducedMotion ? 'auto' : 'smooth' });
    });
  }

  /* ---------- Interactive how-it-works steps ---------- */

  function setupHowTabs() {
    var tablist = document.querySelector('.how-tabs');
    if (!tablist) return;
    var tabs = Array.prototype.slice.call(tablist.querySelectorAll('[data-step-tab]'));
    var panels = Array.prototype.slice.call(document.querySelectorAll('[data-step-panel]'));
    if (!tabs.length || !panels.length) return;

    function select(index, focus) {
      tabs.forEach(function (tab, i) {
        var active = i === index;
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
        tab.tabIndex = active ? 0 : -1;
      });
      panels.forEach(function (panel, i) {
        panel.hidden = i !== index;
      });
      if (focus && tabs[index]) tabs[index].focus();
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(i, false); });
      tab.addEventListener('keydown', function (event) {
        var next = null;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (i + 1) % tabs.length;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (i - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = tabs.length - 1;
        if (next === null) return;
        event.preventDefault();
        select(next, true);
      });
    });

    select(0, false);
  }

  /* ---------- Latest articles ---------- */

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return 'f9xr.org'; }
  }

  function formatDate(value) {
    var date = new Date(value + 'T00:00:00');
    if (isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function titleFromUrl(url) {
    try {
      var slug = new URL(url).pathname.split('/').pop().replace(/\.html$/, '');
      return slug.split('-').map(function (word) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }).join(' ');
    } catch (e) {
      return 'F9XR article';
    }
  }

  function renderPosts(posts) {
    var grid = document.getElementById('latestPosts');
    if (!grid) return;
    grid.textContent = '';
    posts.slice(0, 6).forEach(function (post) {
      var link = document.createElement('a');
      link.className = 'post-card';
      link.href = post.url;
      link.target = '_blank';
      link.rel = 'noopener';

      var meta = document.createElement('p');
      meta.className = 'post-card__meta';
      meta.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 2v4"/><path d="M16 2v4"/></svg>';
      meta.appendChild(document.createTextNode(formatDate(post.date) + ' \u00B7 ' + hostOf(post.url)));

      var heading = document.createElement('h3');
      heading.textContent = post.title;

      var more = document.createElement('span');
      more.className = 'post-card__more';
      more.innerHTML = 'Read article <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>';

      link.appendChild(meta);
      link.appendChild(heading);
      link.appendChild(more);
      grid.appendChild(link);
    });
  }

  function setupLatestPosts() {
    var grid = document.getElementById('latestPosts');
    if (!grid) return;

    fetch('./latest-posts.json', { cache: 'no-cache' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (posts) { if (Array.isArray(posts) && posts.length) renderPosts(posts); })
      .catch(function () { /* the static markup already lists fallback posts */ });

    // Try the live sitemap; browsers may block it with CORS, so failure is silent
    // and the shipped list stays in place.
    var controller = 'AbortController' in window ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 4000) : null;
    fetch('https://f9xr.org/articles/sitemap.xml', {
      cache: 'no-cache',
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    }).then(function (xml) {
      var doc = new DOMParser().parseFromString(xml, 'text/xml');
      var items = Array.prototype.slice.call(doc.querySelectorAll('url')).map(function (node) {
        var loc = node.querySelector('loc');
        var mod = node.querySelector('lastmod');
        return loc ? { url: loc.textContent.trim(), date: (mod ? mod.textContent : '').slice(0, 10) } : null;
      }).filter(Boolean);
      if (!items.length) return;
      items.sort(function (a, b) { return b.date.localeCompare(a.date); });
      var seen = {};
      items = items.filter(function (post) {
        if (seen[post.url]) return false;
        seen[post.url] = true;
        return true;
      }).slice(0, 6).map(function (post) {
        post.title = titleFromUrl(post.url);
        return post;
      });
      renderPosts(items);
      var status = document.getElementById('latestPostsStatus');
      if (status) status.textContent = 'Latest posts pulled from the F9XR articles sitemap.';
    }).catch(function () {
      /* CORS or offline: the local fallback list is already rendered. */
    }).then(function () {
      if (timer) clearTimeout(timer);
    });
  }

  /* ---------- Download menu (engine owns the file formats) ---------- */

  function setupDownloadMenu() {
    var button = document.getElementById('downloadBtn');
    var menu = document.getElementById('downloadMenu');
    if (!button || !menu) return;

    function close() {
      menu.hidden = true;
      button.setAttribute('aria-expanded', 'false');
    }
    button.addEventListener('click', function (event) {
      event.stopPropagation();
      var open = menu.hidden;
      menu.hidden = !open;
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        var first = menu.querySelector('button');
        if (first) first.focus();
      }
    });
    menu.addEventListener('click', function () { close(); });
    document.addEventListener('click', function (event) {
      if (menu.hidden) return;
      if (!menu.contains(event.target) && event.target !== button) close();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !menu.hidden) {
        close();
        button.focus();
      }
    });
  }

  /* ---------- Report form (opens the visitor's mail app) ---------- */

  function setupReportForm() {
    var form = document.getElementById('reportForm');
    if (!form) return;
    var result = document.getElementById('reportResult');

    function value(id) {
      var node = document.getElementById(id);
      return node && node.value ? node.value.trim() : '';
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var url = value('reportUrl');
      var details = value('reportDetails');

      if (!/^https?:\/\//i.test(url) || details.length < 10) {
        if (result) {
          result.hidden = false;
          result.style.borderColor = 'rgba(255,95,109,.4)';
          result.style.background = 'rgba(255,95,109,.1)';
          result.textContent = 'Add the full page URL starting with https:// and a description of at least 10 characters.';
        }
        var firstInvalid = !/^https?:\/\//i.test(url)
          ? document.getElementById('reportUrl')
          : document.getElementById('reportDetails');
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      var lines = [
        'Page URL: ' + url,
        'Problem: ' + value('reportType'),
        'Delivery mode: ' + value('reportMode'),
        'Browser: ' + (value('reportBrowser') || 'not provided'),
        'Email: ' + (value('reportEmail') || 'not provided'),
        '',
        details
      ];
      var mailto = 'mailto:hello@f9xr.org?subject=' +
        encodeURIComponent('Backlink tool report: ' + value('reportType')) +
        '&body=' + encodeURIComponent(lines.join('\n'));

      window.location.href = mailto;

      if (result) {
        result.hidden = false;
        result.style.borderColor = '';
        result.style.background = '';
        result.textContent = 'Your email app should open with the report filled in. If nothing happens, email hello@f9xr.org directly.';
      }
    });
  }

  /* ---------- Current year / active nav ---------- */

  function setupStaticBits() {
    document.querySelectorAll('[data-year]').forEach(function (node) {
      node.textContent = String(new Date().getFullYear());
    });

    var path = location.pathname.replace(/\/index\.html$/, '/');
    document.querySelectorAll('.top-nav .pill-nav__item[href]').forEach(function (link) {
      var href = link.getAttribute('href');
      if (!href || href.charAt(0) === '#' || /^https?:/i.test(href)) return;
      var clean = href.replace(/^\.\//, '/');
      if (clean !== '/how-it-works.html' && clean !== '/report-problem.html') return;
      if (path === clean) {
        link.setAttribute('aria-current', 'page');
        var sibling = link.closest('.pill-nav__item');
        if (sibling) link.setAttribute('aria-current', 'page');
      }
    });
  }

  function boot() {
    setupBackToTop();
    setupReveal();
    setupFooterReveal();
    setupHowTabs();
    setupLatestPosts();
    setupDownloadMenu();
    setupReportForm();
    setupStaticBits();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
