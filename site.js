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

  /* ---------- Share this tool ---------- */

  function setupShare() {
    var row = document.querySelector('.share-row');
    if (!row) return;
    var status = document.getElementById('shareStatus');
    var url = location.origin + location.pathname;
    var title = document.title;
    var blurb = 'Free backlink generator: one page URL to 4,500+ backlink, ping and archive endpoints.';
    var timer = null;

    function say(message) {
      if (!status) return;
      status.textContent = message;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { status.textContent = ''; }, 5000);
    }

    function copy(value) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).then(function () {
          say('Link copied.');
        }, function () {
          say('Copy blocked. Select the address bar and copy it there.');
        });
        return;
      }
      var field = document.createElement('textarea');
      field.value = value;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.left = '-9999px';
      document.body.appendChild(field);
      field.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(field);
      say(ok ? 'Link copied.' : 'Copy blocked. Select the address bar and copy it there.');
    }

    var networks = {
      x: 'https://twitter.com/intent/tweet?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(blurb),
      linkedin: 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(url),
      facebook: 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url),
      whatsapp: 'https://wa.me/?text=' + encodeURIComponent(blurb + ' ' + url),
      email: 'mailto:?subject=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(blurb + '\n\n' + url)
    };

    var native = row.querySelector('[data-share="native"]');
    if (native && navigator.share) native.hidden = false;

    row.addEventListener('click', function (event) {
      var button = event.target.closest('[data-share]');
      if (!button) return;
      var network = button.getAttribute('data-share');

      if (network === 'copy') { copy(url); return; }
      if (network === 'native') {
        navigator.share({ title: title, text: blurb, url: url }).then(function () {
          say('Shared.');
        }, function () { /* dismissed by the visitor */ });
        return;
      }
      if (network === 'email') { window.location.href = networks.email; return; }
      var target = networks[network];
      if (!target) return;
      window.open(target, '_blank', 'noopener,width=680,height=560');
      say('Opened the share window.');
    });
  }

  /* ---------- Translate this page ---------- */

  // Google opens first because visitors expect it, but Google's website proxy
  // refuses this domain, so the Google route is its text view: the page text
  // travels in the URL instead of being fetched. Yandex can fetch the page, so
  // it stays as the visible full-page fallback.
  function yandexTranslatedPageUrl(target, lang) {
    var code = lang === 'zh-CN' ? 'zh' : lang;
    return 'https://translate.yandex.com/translate?url=' + encodeURIComponent(target) +
      '&lang=en-' + encodeURIComponent(code);
  }

  function pageTextForTranslation() {
    var nodes = (document.getElementById('main') || document.body)
      .querySelectorAll('h1, h2, h3, p, li');
    var text = '';
    for (var i = 0; i < nodes.length && text.length < 2200; i++) {
      if (nodes[i].closest('#controls, #shareControls, #advancedPanel, .footer-links, noscript')) continue;
      var part = (nodes[i].textContent || '').replace(/\s+/g, ' ').trim();
      if (part.length > 1) text += part + '\n';
    }
    return text.slice(0, 2200);
  }

  function googleTranslateTextUrl(lang) {
    return 'https://translate.google.com/?sl=auto&tl=' + encodeURIComponent(lang) +
      '&text=' + encodeURIComponent(pageTextForTranslation()) + '&op=translate';
  }

  function setupTranslate() {
    var select = document.getElementById('translateSelect');
    if (!select) return;
    var status = document.getElementById('translateStatus');
    var fallback = document.getElementById('translateFallback');
    var target = location.origin + location.pathname + location.search;

    function say(message) {
      if (status) status.textContent = message;
    }

    select.addEventListener('change', function () {
      var lang = select.value;
      if (!lang) return;

      if (fallback) {
        fallback.href = yandexTranslatedPageUrl(target, lang);
        fallback.hidden = false;
      }

      var win = window.open(googleTranslateTextUrl(lang), '_blank');
      if (win) win.opener = null;

      say(win
        ? 'Opened Google Translate with the page text.'
        : 'Pop-up blocked. Use the Yandex link below.');
      select.value = '';
    });

    if (fallback) {
      fallback.addEventListener('click', function () {
        say('Opened Yandex with the full page.');
      });
    }
  }

  /* ---------- WebMCP: expose the generator to browser agents ---------- */

  function setupWebMcp() {
    var context = (typeof document !== 'undefined' && document.modelContext) ||
      (typeof navigator !== 'undefined' && navigator.modelContext);
    if (!context || typeof context.registerTool !== 'function') return;

    function run(input) {
      var field = document.getElementById('urlInput');
      var button = document.getElementById('startBtn');
      if (!field || !button) return { ok: false, error: 'The generator is not on this page.' };
      var value = String((input && input.url) || '').trim();
      if (!value) return { ok: false, error: 'A page URL is required.' };
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      button.click();
      return { ok: true, submitted: value, note: 'The run started in this browser tab; results appear under the generator.' };
    }

    try {
      var pending = context.registerTool({
        name: 'generate_backlinks',
        description: 'Fill the free backlink generator with one page URL and start a client-side submission run for that page.',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'Absolute http(s) URL of the page to promote.' }
          },
          required: ['url']
        },
        execute: run
      });
      if (pending && typeof pending.catch === 'function') pending.catch(function () {});
    } catch (error) {
      /* Older or unsupported browsers simply skip WebMCP. */
    }
  }

  /* ---------- Suggestion box ---------- */

  function setupSuggestForm() {
    var form = document.getElementById('suggestForm');
    if (!form) return;
    var text = document.getElementById('suggestText');
    var email = document.getElementById('suggestEmail');
    var result = document.getElementById('suggestResult');

    function show(message, isError) {
      if (!result) return;
      result.hidden = false;
      result.textContent = message;
      result.classList.toggle('is-error', !!isError);
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var body = text ? text.value.trim() : '';
      var reply = email ? email.value.trim() : '';

      if (body.length < 10) {
        show('Add at least 10 characters so we know what to change.', true);
        if (text) text.focus();
        return;
      }

      var lines = [
        'Suggestion for backlink.is-an.ai',
        '',
        body,
        '',
        'Reply to: ' + (reply || 'not provided'),
        'Page: ' + location.href
      ];
      window.location.href = 'mailto:hello@f9xr.org' +
        '?subject=' + encodeURIComponent('Tool suggestion') +
        '&body=' + encodeURIComponent(lines.join('\n'));

      show('Your email app should open with the suggestion filled in. If nothing happens, email hello@f9xr.org directly.', false);
    });
  }

  /* ---------- AI assist: on-device link brief + handoff prompt ---------- */

  function setupAiBrief() {
    var panel = document.getElementById('aiAssist');
    var build = document.getElementById('aiBriefBtn');
    var copyBtn = document.getElementById('aiPromptBtn');
    var out = document.getElementById('aiBriefOut');
    var status = document.getElementById('aiBriefStatus');
    if (!panel || !build || !copyBtn || !out) return;

    var prompt = '';

    function say(message) {
      if (status) status.textContent = message;
    }

    function parseUrl(value) {
      var raw = (value || '').trim();
      if (!raw) return null;
      if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw.replace(/^\/+/, '');
      try {
        var parsed = new URL(raw);
        if (!/^https?:$/.test(parsed.protocol)) return null;
        if (parsed.hostname.indexOf('.') === -1) return null;
        return parsed;
      } catch (e) {
        return null;
      }
    }

    function render(parsed) {
      var host = parsed.hostname.replace(/^www\./, '');
      var segments = parsed.pathname.split('/').filter(Boolean);
      var last = segments.length ? segments[segments.length - 1] : '';
      var slug = last.replace(/\.(html?|php|aspx?)$/i, '').replace(/[-_]+/g, ' ').replace(/\d+/g, ' ').trim();
      var topic = slug.split(/\s+/).filter(function (word) { return word.length > 2; }).slice(0, 4).join(' ') || host.split('.')[0];
      var isVideo = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com)$/i.test(host);
      var anchors = [
        topic,
        topic + ' explained',
        'this ' + topic + ' guide',
        'more on ' + topic,
        topic + ' for beginners'
      ].map(function (text) { return text.charAt(0).toUpperCase() + text.slice(1); });

      var brief = [
        'Target: ' + host + (parsed.pathname === '/' ? ' (homepage)' : parsed.pathname),
        '',
        'Suggested anchor text',
        '1. ' + anchors[0],
        '2. ' + anchors[1],
        '3. ' + anchors[2],
        '4. ' + anchors[3],
        '5. ' + anchors[4],
        '',
        'Run plan',
        isVideo
          ? '- Video URL: the YouTube template set adds timestamp and embed variants, so run the video URL rather than the channel page.'
          : '- Page URL: the standard template set keeps this exact path in every request.',
        '- Start in IFrame mode at 5 concurrent requests and raise it only while statuses stay green.',
        '- Export the run to CSV and check the ten strongest targets by hand before repeating it.',
        '',
        'Handoff prompt'
      ].join('\n');

      prompt = [
        'You are an SEO assistant helping me promote one page.',
        '',
        'Page: ' + parsed.href,
        'Host: ' + host,
        'Topic keyword: ' + topic,
        'Path segments: ' + segments.length,
        'Content type: ' + (isVideo ? 'video' : 'article or landing page'),
        '',
        'I already ran it through https://backlink.is-an.ai/, a free browser tool that opens the page in 4,500+ backlink, ping, social-share and archive templates and reports which targets loaded.',
        '',
        'Please give me:',
        '1. Five natural internal anchor texts and five external anchor texts for this page.',
        '2. Three related pages on the same site that should link to it, and why.',
        '3. A realistic 30-day plan that mixes these discovery submissions with editorial outreach.',
        '4. What I should measure in Search Console to tell whether the run helped.',
        '',
        'Be specific and skip generic link building advice.'
      ].join('\n');

      out.textContent = brief + '\n';
      var pre = document.createElement('pre');
      pre.className = 'ai-brief__prompt';
      pre.textContent = prompt;
      out.appendChild(pre);
      out.hidden = false;
      say('Brief built on this device for ' + host + '.');
    }

    function fromInput() {
      var input = document.getElementById('urlInput');
      var parsed = parseUrl(input ? input.value : '');
      if (!parsed) {
        say('Enter a valid page URL in the field above first, for example https://example.com/blog/post.');
        if (input) input.focus();
        return null;
      }
      return parsed;
    }

    build.addEventListener('click', function () {
      var parsed = fromInput();
      if (parsed) render(parsed);
    });

    copyBtn.addEventListener('click', function () {
      if (!prompt) {
        var parsed = fromInput();
        if (!parsed) return;
        render(parsed);
      }
      if (!prompt) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(prompt).then(function () {
          say('Prompt copied. Paste it into your assistant.');
        }, function () {
          say('Copy blocked. Select the prompt text and copy it manually.');
        });
        return;
      }
      say('Copy is unavailable in this browser. Select the prompt text above and copy it manually.');
    });
  }

  function boot() {
    setupBackToTop();
    setupReveal();
    setupHowTabs();
    setupLatestPosts();
    setupDownloadMenu();
    setupReportForm();
    setupShare();
    setupTranslate();
    setupSuggestForm();
    setupAiBrief();
    setupWebMcp();
    setupStaticBits();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
