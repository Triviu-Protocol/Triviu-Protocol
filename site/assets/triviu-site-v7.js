/* Progressive enhancement only. Every section above is readable, navigable and
   complete with JavaScript disabled; the tab panels fall back to stacked cards. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* menu */
  var toggle = $("#menuToggle"), nav = $("#primaryNav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.getAttribute("data-open") === "true";
      nav.setAttribute("data-open", String(!open));
      toggle.setAttribute("aria-expanded", String(!open));
    });
    $$("a", nav).forEach(function (a) {
      a.addEventListener("click", function () {
        nav.setAttribute("data-open", "false");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* tablist · W3C ARIA Authoring Practices 1.2 pattern */
  var tabs = $$('[role="tab"]');
  if (tabs.length) {
    tabs.forEach(function (tab) {
      var panel = document.getElementById(tab.getAttribute("aria-controls"));
      if (panel && tab.getAttribute("aria-selected") !== "true") panel.hidden = true;
      tab.setAttribute("tabindex", tab.getAttribute("aria-selected") === "true" ? "0" : "-1");
      tab.addEventListener("click", function () { select(tab); });
      tab.addEventListener("keydown", function (e) {
        var i = tabs.indexOf(tab), next = null;
        if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
        else if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (e.key === "Home") next = tabs[0];
        else if (e.key === "End") next = tabs[tabs.length - 1];
        if (next) { e.preventDefault(); select(next); next.focus(); }
      });
    });
    function select(chosen) {
      tabs.forEach(function (t) {
        var on = t === chosen, p = document.getElementById(t.getAttribute("aria-controls"));
        t.setAttribute("aria-selected", String(on));
        t.setAttribute("tabindex", on ? "0" : "-1");
        if (p) p.hidden = !on;
      });
    }
  }

  /* marca a secao corrente na navegacao, sem mexer no scroll */
  var links = $$('.nav a[href^="#"]');
  if (links.length && "IntersectionObserver" in window) {
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var a = byId[en.target.id];
        if (!a) return;
        if (en.isIntersecting) {
          links.forEach(function (x) { x.removeAttribute("aria-current"); });
          a.setAttribute("aria-current", "true");
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    Object.keys(byId).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) io.observe(el);
    });
  }
})();