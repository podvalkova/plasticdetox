/**
 * Our own app banner, in place of Apple's.
 *
 * Apple's Smart App Banner renders the App Store seller name and gives the
 * page no say in it. On an Individual developer account that name is the
 * founder's legal name, so "ANNA KIRWAN" was printed above every one of a
 * hundred pages with no way to change it from here. The alternative to living
 * with that is owning the bar, so we own it: the same shape, the same job, and
 * every word ours.
 *
 * What is lost is real and worth naming. Apple's banner opens the App Store
 * sheet in place and carries the store's own credibility; this is a link. The
 * trade was made deliberately.
 *
 * Shown once per person until they dismiss it, on the phones that can actually
 * install the thing, and never on the pages that are the app pitch already.
 */
(function () {
  var IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.MSStream;
  var ANDROID = /Android/i.test(navigator.userAgent);
  if (!IOS && !ANDROID) return;

  var KEY = "pd.appbanner.dismissed.v1";
  try { if (localStorage.getItem(KEY)) return; } catch (e) {}

  var STORE = IOS
    ? "https://apps.apple.com/app/id6807191826"
    : "https://play.google.com/store/apps/details?id=org.plasticdetox.app";

  var css = document.createElement("style");
  css.textContent = [
    ".pd-appbar{display:flex;align-items:center;gap:12px;padding:10px 14px;",
    "background:#F5F5F3;border-bottom:1px solid #E7E7E3;font-family:inherit;position:relative;z-index:60}",
    ".pd-appbar img{width:52px;height:52px;border-radius:12px;flex:none}",
    ".pd-appbar .pd-x{flex:none;width:26px;height:26px;border:0;background:none;cursor:pointer;",
    "color:#8B8B88;font-size:19px;line-height:1;padding:0}",
    ".pd-appbar .pd-t{flex:1 1 auto;min-width:0;line-height:1.3}",
    ".pd-appbar .pd-t b{display:block;font-size:15px;font-weight:700;color:#0A0A0A}",
    // The line wraps rather than truncating. Apple's clipped it too, but the
    // whole reason for owning this bar is to say what we want to say.
    ".pd-appbar .pd-t span{display:block;font-size:13px;color:#71716E}",
    ".pd-appbar .pd-get{flex:none;padding:8px 16px;border-radius:999px;background:#7C3AED;",
    "color:#fff;font-size:14px;font-weight:700;text-decoration:none;white-space:nowrap}"
  ].join("");
  document.head.appendChild(css);

  var bar = document.createElement("div");
  bar.className = "pd-appbar";
  bar.innerHTML =
    '<button class="pd-x" type="button" aria-label="Dismiss">&times;</button>'
    + '<img src="/images/app-icon.png" alt="" width="52" height="52">'
    + '<span class="pd-t"><b>Plastic Detox</b><span>Check, swap, live plastic free</span></span>'
    + '<a class="pd-get" href="' + STORE + '">Get</a>';

  bar.querySelector(".pd-x").onclick = function () {
    try { localStorage.setItem(KEY, "1"); } catch (e) {}
    bar.remove();
  };
  bar.querySelector(".pd-get").onclick = function () {
    if (window.gtag) gtag("event", "app_banner_click", { platform: IOS ? "ios" : "android" });
  };

  function mount() {
    document.body.insertBefore(bar, document.body.firstChild);
    if (window.gtag) gtag("event", "app_banner_view", { platform: IOS ? "ios" : "android" });
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
