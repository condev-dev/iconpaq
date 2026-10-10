/* =============================================================================
   IconPaq — interactions
   Theme switching, the Customize panel, search / category filtering, the icon
   detail modal, clipboard helpers and SVG / PNG export.
   Every handler is bound through data-action attributes, so the markup stays
   free of inline JavaScript.
   ========================================================================== */

(function () {
  "use strict";

  var THEME_KEY = "iconpaq-theme";
  var DEFAULT_ICON_SIZE = 30;
  var DEFAULT_ICON_STROKE = 1;
  var ALL_CATEGORIES = "All Icons";
  var PREVIEW_LIMIT = 320;

  var cards = [];
  var currentCard = null;
  var activeCategory = ALL_CATEGORIES;
  var multiSelectMode = false;
  var currentColor = null;
  var toastTimer = null;

  /* --- tiny DOM helpers ---------------------------------------------------- */

  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qsa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function isDark() {
    return document.documentElement.classList.contains("theme-dark");
  }

  function defaultIconColor() {
    return isDark() ? "#F2F2F8" : "#56566F";
  }

  function slug(value) {
    return (value || "icon")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "icon";
  }

  /* --- feedback ------------------------------------------------------------ */

  function notify(message) {
    var host = qs("#Toast_Host");
    if (!host) {
      return;
    }
    host.textContent = message;
    host.classList.add("Is_Visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      host.classList.remove("Is_Visible");
    }, 2000);
  }

  function copyText(text, message) {
    function done() {
      notify(message || "Copied to clipboard");
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {
        legacyCopy(text);
        done();
      });
    } else {
      legacyCopy(text);
      done();
    }
  }

  function legacyCopy(text) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copy");
    } catch (error) {
      /* clipboard is unavailable — nothing else we can do */
    }
    document.body.removeChild(area);
  }

  /* --- icon colouring ------------------------------------------------------ */

  function paintSvg(svg, color) {
    if (!svg || !color || svg.classList.contains("colorful")) {
      return;
    }
    qsa("path, circle, rect, line, polyline, polygon, ellipse", svg).forEach(function (shape) {
      if (shape.getAttribute("stroke")) {
        shape.setAttribute("stroke", color);
      } else {
        shape.setAttribute("fill", color);
      }
    });
  }

  function paintEverything(color) {
    currentColor = color;
    qsa(".Icon_Pack .svg-icon").forEach(function (svg) {
      paintSvg(svg, color);
    });
    paintSvg(qs("#ConImageChange"), color);
  }

  /* --- serialising an icon ------------------------------------------------- */

  function svgMarkup(source) {
    var clone = source.cloneNode(true);
    var referenced = (clone.outerHTML.match(/url\(#[^)]+\)/g) || []).map(function (ref) {
      return ref.slice(5, -1);
    });
    qsa("[id]", clone).forEach(function (node) {
      if (referenced.indexOf(node.getAttribute("id")) === -1) {
        node.removeAttribute("id");
      }
    });
    qsa("[class]", clone).forEach(function (node) {
      node.removeAttribute("class");
    });
    clone.removeAttribute("id");
    clone.removeAttribute("class");
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    return clone.outerHTML.replace(/\s{2,}/g, " ").replace(/>\s+</g, "><").trim();
  }

  /* --- customize panel ----------------------------------------------------- */

  function updateRangeFill(input) {
    if (!input) {
      return;
    }
    var min = parseFloat(input.min) || 0;
    var max = parseFloat(input.max) || 100;
    var value = parseFloat(input.value);
    var percent = ((value - min) / (max - min)) * 100;
    input.style.setProperty("--ip-fill", percent + "%");
  }

  function setIconSize(value) {
    var size = parseFloat(value) || DEFAULT_ICON_SIZE;
    document.documentElement.style.setProperty("--ip-icon-size", size + "px");
    var readout = qs("#IconSize_Value");
    if (readout) {
      readout.textContent = size + "px";
    }
    updateRangeFill(qs('[data-action="size"]'));
  }

  function setStrokeWidth(value) {
    var stroke = parseFloat(value) || DEFAULT_ICON_STROKE;
    document.documentElement.style.setProperty("--ip-icon-stroke", String(stroke));
    var readout = qs("#StrokeWidth_Value");
    if (readout) {
      readout.textContent = String(stroke) + "px";
    }
    updateRangeFill(qs('[data-action="stroke"]'));
  }

  function resetCustomize() {
    var size = qs('[data-action="size"]');
    var stroke = qs('[data-action="stroke"]');
    var color = qs("#ColorPic");

    if (size) {
      size.value = String(DEFAULT_ICON_SIZE);
    }
    if (stroke) {
      stroke.value = String(DEFAULT_ICON_STROKE);
    }
    if (color) {
      color.value = defaultIconColor();
    }

    setIconSize(DEFAULT_ICON_SIZE);
    setStrokeWidth(DEFAULT_ICON_STROKE);
    paintEverything(defaultIconColor());

    var search = qs("#searchInput");
    if (search) {
      search.value = "";
    }
    applyCategory(ALL_CATEGORIES, qs("#Category_List .Switch"));
    notify("Filters reset");
  }

  /* --- theme --------------------------------------------------------------- */

  function setTheme(dark, remember) {
    document.documentElement.classList.toggle("theme-dark", dark);

    qsa('[data-action="toggle-theme"]').forEach(function (pill) {
      var label = qs("p", pill);
      var icon = qs("i", pill);
      if (label) {
        label.textContent = dark ? "Light" : "Dark";
      }
      if (icon) {
        icon.className = dark ? "fa fa-sun-o" : "fa fa-moon-o";
      }
    });

    var picker = qs("#ColorPic");
    if (picker) {
      picker.value = defaultIconColor();
    }
    paintEverything(defaultIconColor());

    if (remember) {
      try {
        localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
      } catch (error) {
        /* private mode — the preference simply will not persist */
      }
    }
  }

  /* --- search & filtering -------------------------------------------------- */

  function collectCards() {
    cards = qsa(".Icon_Pack").map(function (element) {
      var label = qs(".Icon_Text small", element);
      return {
        el: element,
        name: label ? label.textContent.trim() : "",
        category: element.getAttribute("data-category") || ""
      };
    });
  }

  /* The counts are rendered by CSS through attr(data-count), so the label text
     itself stays untouched and the filter can still match on it. */
  function setCategoryCounts() {
    var totals = {};
    cards.forEach(function (card) {
      totals[card.category] = (totals[card.category] || 0) + 1;
    });
    qsa("#Category_List .Switch").forEach(function (item) {
      var name = item.textContent.trim();
      var total = name === ALL_CATEGORIES ? cards.length : totals[name] || 0;
      item.setAttribute("data-count", String(total));
    });
  }

  function applyFilters() {
    var search = qs("#searchInput");
    var query = (search ? search.value : "").trim().toUpperCase();
    var shown = 0;

    cards.forEach(function (card) {
      var matchesCategory = activeCategory === ALL_CATEGORIES || card.category === activeCategory;
      var matchesQuery = !query || card.name.toUpperCase().indexOf(query) > -1;
      var visible = matchesCategory && matchesQuery;
      card.el.style.display = visible ? "" : "none";
      if (visible) {
        shown += 1;
      }
    });

    var count = qs("#Result_Count");
    if (count) {
      count.textContent = shown + (shown === 1 ? " icon" : " icons");
    }
  }

  function applyCategory(name, item) {
    activeCategory = name || ALL_CATEGORIES;
    qsa("#Category_List .Switch").forEach(function (entry) {
      entry.classList.toggle("NewGray", entry === item);
    });
    applyFilters();
  }

  /* --- the icon modal ------------------------------------------------------ */

  function showModal() {
    var modal = qs("#exampleModal");
    if (!modal || !window.jQuery || !window.jQuery.fn.modal) {
      return;
    }
    window.jQuery(modal).modal("show");
  }

  function variantSvgs(card) {
    return card ? qsa(".Icons_Button_Slider .con > svg", card.el) : [];
  }

  function buildVariants(card) {
    var host = qs("#Items_Slider");
    if (!host) {
      return;
    }
    host.innerHTML = "";
    variantSvgs(card).forEach(function (svg, index) {
      var item = document.createElement("div");
      item.className = "Item-Carousel Pointer d-flex justify-content-center align-items-center";
      item.setAttribute("data-action", "pick-variant");
      item.setAttribute("data-variant-index", String(index));
      item.setAttribute("role", "button");
      item.setAttribute("title", "Style " + (index + 1));
      item.appendChild(svg.cloneNode(true));
      host.appendChild(item);
    });
  }

  function renderPreview(card, sourceSvg, activeIndex) {
    var preview = qs("#ConImageChange");
    if (!preview || !sourceSvg) {
      return;
    }

    var clone = sourceSvg.cloneNode(true);
    clone.removeAttribute("id");
    clone.setAttribute("id", "ConImageChange");
    var firstPath = qs("path", clone);
    if (firstPath) {
      firstPath.setAttribute("id", "ContainerImage");
    }
    preview.replaceWith(clone);
    paintSvg(clone, currentColor || defaultIconColor());

    var picker = qs("#ColorPic2");
    if (picker) {
      picker.disabled = clone.classList.contains("colorful");
    }

    var nameField = qs("#Input_Groupe");
    if (nameField) {
      nameField.textContent = (card && card.name) || "Icon";
    }

    setCodeField(qs("#svg_Code"), svgMarkup(clone));
    setCodeField(
      qs("#Component_Code"),
      clone.innerHTML.replace(/\s{2,}/g, " ").replace(/>\s+</g, "><").trim()
    );

    qsa("#Items_Slider .Item-Carousel").forEach(function (item, index) {
      item.classList.toggle("Is_Active", index === activeIndex);
    });
  }

  function openIcon(card) {
    if (multiSelectMode) {
      card.el.classList.toggle("Icon_Pack_Selected");
      updateMultiState();
      return;
    }

    currentCard = card;
    var main = qs(".svg-icon", card.el);
    if (!main) {
      return;
    }
    buildVariants(card);
    renderPreview(card, main, 0);
    showModal();
  }

  /* --- multi select -------------------------------------------------------- */

  function selectedCards() {
    return cards.filter(function (card) {
      return card.el.classList.contains("Icon_Pack_Selected");
    });
  }

  function updateMultiState() {
    var button = qs('[data-action="multi-download"]');
    var label = button ? qs("span", button) : null;
    var total = selectedCards().length;
    if (label) {
      label.textContent = total ? "Download " + total + " selected" : "Download selected";
    }
  }

  function clearSelection() {
    cards.forEach(function (card) {
      card.el.classList.remove("Icon_Pack_Selected");
    });
    updateMultiState();
  }

  function toggleMultiSelect() {
    multiSelectMode = !multiSelectMode;
    qsa('[data-action="multi-select-toggle"]').forEach(function (button) {
      button.classList.toggle("Is_Active", multiSelectMode);
    });
    var pill = qs(".MultipleSelect_Menu");
    if (pill) {
      pill.classList.toggle("Is_Visible", multiSelectMode);
    }
    if (!multiSelectMode) {
      clearSelection();
    } else {
      notify("Click icons to select them");
    }
  }

  /* --- export -------------------------------------------------------------- */

  function downloadPng(svg, filename) {
    if (!svg || !window.html2canvas) {
      return Promise.resolve();
    }
    return window
      .html2canvas(svg, { backgroundColor: null, scale: 4, logging: false })
      .then(function (canvas) {
        var link = document.createElement("a");
        link.href = canvas.toDataURL("image/png");
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
      });
  }

  function downloadQueue(list) {
    var queue = Promise.resolve();
    list.forEach(function (card) {
      queue = queue.then(function () {
        return downloadPng(qs(".svg-icon", card.el), slug(card.name) + ".png");
      });
    });
    return queue;
  }

  function downloadSelected() {
    var list = selectedCards();
    if (!list.length) {
      notify("Select at least one icon first");
      return;
    }
    notify("Preparing " + list.length + " PNG files…");
    downloadQueue(list).then(function () {
      notify(list.length + " icons downloaded");
    });
  }

  function downloadVisible() {
    var list = cards.filter(function (card) {
      return card.el.style.display !== "none";
    });
    if (!list.length) {
      notify("Nothing to download");
      return;
    }
    if (list.length > 20 && !window.confirm("Download " + list.length + " icons as PNG files?")) {
      return;
    }
    notify("Preparing " + list.length + " PNG files…");
    downloadQueue(list).then(function () {
      notify(list.length + " icons downloaded");
    });
  }

  function downloadSvg() {
    var svg = qs("#ConImageChange");
    if (!svg) {
      return;
    }
    var blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + svgMarkup(svg)], {
      type: "image/svg+xml;charset=utf-8"
    });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = slug(currentCard ? currentCard.name : "icon") + ".svg";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
    notify("SVG downloaded");
  }

  function copyIcon() {
    var svg = qs("#ConImageChange");
    if (svg) {
      copyText(svgMarkup(svg), "Icon code copied");
    }
  }

  function copyField(trigger) {
    var container = trigger.parentElement;
    var target = container ? qs("small, p", container) : null;
    if (!target) {
      copyText(container ? container.innerText : "", "Copied to clipboard");
      return;
    }
    copyText(target.getAttribute("data-full-text") || target.textContent, "Copied to clipboard");
  }

  /* Long markup is shortened for display only; copying always uses the full
     value, which is kept on the element itself. This also guarantees the field
     can never widen the dialog, whatever the flex layout does. */
  function setCodeField(element, fullText) {
    if (!element) {
      return;
    }
    element.setAttribute("data-full-text", fullText);
    element.textContent =
      fullText.length > PREVIEW_LIMIT ? fullText.slice(0, PREVIEW_LIMIT) + " ..." : fullText;
  }

  /* --- wiring -------------------------------------------------------------- */

  var actions = {
    "nav-active": function (element) {
      qsa("#buttom_Line_Menu .Line_Menu_Item").forEach(function (link) {
        link.classList.remove("Active_Item_MainMenu");
      });
      element.classList.add("Active_Item_MainMenu");
    },
    "toggle-theme": function () {
      setTheme(!isDark(), true);
    },
    "open-icon": function (element) {
      var card = cards.filter(function (entry) {
        return entry.el === element;
      })[0];
      if (card) {
        openIcon(card);
      }
    },
    "pick-variant": function (element) {
      if (!currentCard) {
        return;
      }
      var index = parseInt(element.getAttribute("data-variant-index"), 10) || 0;
      renderPreview(currentCard, variantSvgs(currentCard)[index], index);
    },
    filter: function (element) {
      applyCategory(element.textContent.trim(), element);
    },
    "multi-select-toggle": function () {
      toggleMultiSelect();
    },
    "multi-cancel": function () {
      toggleMultiSelect();
    },
    "multi-download": function () {
      downloadSelected();
    },
    "download-all": function () {
      downloadVisible();
    },
    "download-svg": function () {
      downloadSvg();
    },
    "download-png": function () {
      var svg = qs("#ConImageChange");
      downloadPng(svg, slug(currentCard ? currentCard.name : "icon") + ".png").then(function () {
        notify("PNG downloaded");
      });
    },
    "copy-icon": function () {
      copyIcon();
    },
    "copy-field": function (element) {
      copyField(element);
    },
    "reset-customize": function () {
      resetCustomize();
    }
  };

  function actionTarget(event) {
    var target = event.target;
    if (!target || typeof target.closest !== "function") {
      return null;
    }
    return target.closest("[data-action]");
  }

  document.addEventListener("click", function (event) {
    var trigger = actionTarget(event);
    if (!trigger) {
      return;
    }
    var handler = actions[trigger.getAttribute("data-action")];
    if (!handler) {
      return;
    }
    /* Only placeholder links are swallowed so the action can drive the UI.
       Real links must keep their default navigation — the menu items are
       anchors, and cancelling them stopped every one of them from opening. */
    if (trigger.tagName === "A") {
      var href = trigger.getAttribute("href");
      if (!href || href === "#") {
        event.preventDefault();
      }
    }
    handler(trigger);
  });

  /* Keyboard parity for the custom controls: the markup already marks the
     toolbar and the category list as buttons and tabs to them, so Enter and
     Space have to activate them exactly like a click does. Native controls
     keep their own built in behaviour and are skipped. */
  var NATIVE_ACTIVATION = ["A", "BUTTON", "INPUT", "SELECT", "SUMMARY", "TEXTAREA"];

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") {
      return;
    }
    var trigger = actionTarget(event);
    if (!trigger || NATIVE_ACTIVATION.indexOf(trigger.tagName) > -1) {
      return;
    }
    if (trigger.getAttribute("role") !== "button") {
      return;
    }
    event.preventDefault();
    trigger.click();
  });

  document.addEventListener("input", function (event) {
    var trigger = actionTarget(event);
    if (!trigger) {
      return;
    }
    var action = trigger.getAttribute("data-action");
    if (action === "search") {
      applyFilters();
    } else if (action === "size") {
      setIconSize(trigger.value);
    } else if (action === "stroke") {
      setStrokeWidth(trigger.value);
    } else if (action === "color") {
      paintEverything(trigger.value);
    } else if (action === "preview-color") {
      paintSvg(qs("#ConImageChange"), trigger.value);
    }
  });

  /* --- boot ---------------------------------------------------------------- */

  function init() {
    var saved = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch (error) {
      saved = null;
    }
    if (saved === null) {
      saved = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    setTheme(saved === "dark", false);

    collectCards();
    setCategoryCounts();
    applyFilters();

    /* Spell the library size out in the field, the way a real icon site does. */
    var searchField = qs("#searchInput");
    if (searchField) {
      searchField.placeholder = "Search " + cards.length + " icons…";
    }

    var size = qs('[data-action="size"]');
    var stroke = qs('[data-action="stroke"]');
    updateRangeFill(size);
    updateRangeFill(stroke);

    var color = qs("#ColorPic");
    if (color) {
      color.value = defaultIconColor();
    }

    var modal = qs("#exampleModal");
    if (modal && window.jQuery && window.jQuery.fn.modal) {
      window.jQuery(modal).on("hidden.bs.modal", function () {
        qsa("#Items_Slider .Item-Carousel").forEach(function (item) {
          item.classList.remove("Is_Active");
        });
        if (!currentCard) {
          return;
        }
        var main = qs(".svg-icon", currentCard.el);
        if (main) {
          renderPreview(currentCard, main, 0);
        }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
