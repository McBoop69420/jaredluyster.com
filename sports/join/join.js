// Sign up / sign in for sports.jaredluyster.com. The worker (sports/_worker.js,
// /api/auth/*) owns the accounts and the session cookie; this page only talks to it.
(function () {
  "use strict";

  var MIN_PASSWORD = 8;
  var MESSAGES = {
    "bad-email": "That doesn't look like an email address.",
    "bad-password": "Passwords are " + MIN_PASSWORD + "–200 characters.",
    "email-taken": "An account with that email already exists. Sign in instead.",
    "bad-credentials": "That email and password don't match an account.",
    "not-configured": "Accounts aren't switched on for this site yet.",
    "server-error": "Something went wrong on our end. Try again.",
  };

  var $ = function (id) { return document.getElementById(id); };
  var mode = "signup";

  // Only same-site paths ("/betting/"), never "//host" or "https:..."
  function safeNext(raw) {
    return raw && /^\/(?!\/)/.test(raw) ? raw : "/betting/";
  }
  var next = safeNext(new URLSearchParams(location.search).get("next"));

  function setStatus(text) { $("joinStatus").textContent = text; }
  function setMsg(text, isError) {
    var el = $("joinMsg");
    el.textContent = text || "";
    el.classList.toggle("join-msg--error", !!isError);
  }

  function setMode(next) {
    mode = next;
    var up = mode === "signup";
    $("joinModeUp").setAttribute("aria-pressed", String(up));
    $("joinModeIn").setAttribute("aria-pressed", String(!up));
    $("joinSubmit").textContent = up ? "Create account" : "Sign in";
    $("joinPassword").setAttribute("autocomplete", up ? "new-password" : "current-password");
    $("joinHint").hidden = !up;
    setMsg("");
  }

  function showSignedIn(email) {
    $("joinEmail").textContent = email;
    $("joinOut").hidden = false;
    $("joinIn").hidden = true;
    setStatus("");
    $("joinContinue").href = next;
  }

  function showForm() {
    $("joinOut").hidden = true;
    $("joinIn").hidden = false;
    setStatus("");
  }

  function showUnavailable(text) {
    $("joinOut").hidden = true;
    $("joinIn").hidden = true;
    setStatus(text);
  }

  async function post(path, body) {
    var opts = { method: "POST", credentials: "same-origin", cache: "no-store" };
    if (body) {
      opts.headers = { "Content-Type": "application/json" };
      opts.body = JSON.stringify(body);
    }
    var res = await fetch(path, opts);
    var data = {};
    try { data = await res.json(); } catch (e) { /* empty or non-JSON answer */ }
    return { status: res.status, data: data };
  }

  $("joinModeUp").addEventListener("click", function () { setMode("signup"); });
  $("joinModeIn").addEventListener("click", function () { setMode("login"); });

  $("joinForm").addEventListener("submit", async function (ev) {
    ev.preventDefault();
    var email = $("joinEmailInput").value.trim();
    var password = $("joinPassword").value;
    if (!email || !$("joinEmailInput").checkValidity()) return setMsg("Enter a valid email address.", true);
    if (mode === "signup" && password.length < MIN_PASSWORD) return setMsg(MESSAGES["bad-password"], true);
    if (!password) return setMsg("Enter your password.", true);

    var submit = $("joinSubmit");
    submit.disabled = true;
    setMsg(mode === "signup" ? "Creating your account…" : "Signing you in…");
    try {
      var res = await post(mode === "signup" ? "/api/auth/signup" : "/api/auth/login", { email: email, password: password });
      if (res.status === 200 || res.status === 201) {
        location.replace(next);
        return;
      }
      setMsg(MESSAGES[res.data.error] || "Couldn't reach the account service. Try again.", true);
    } catch (e) {
      setMsg("Couldn't reach the account service. Check your connection and try again.", true);
    } finally {
      submit.disabled = false;
    }
  });

  $("joinSignOut").addEventListener("click", async function () {
    try { await post("/api/auth/logout"); } catch (e) { /* the cookie expires on its own */ }
    location.reload();
  });

  async function start() {
    setMode("signup");
    try {
      var res = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" });
      if (res.status === 200) {
        var me = await res.json();
        return showSignedIn(me.email);
      }
      if (res.status === 401) return showForm();
      if (res.status === 503) return showUnavailable(MESSAGES["not-configured"]);
      showUnavailable(MESSAGES["server-error"]);
    } catch (e) {
      showUnavailable("Couldn't reach the account service. Check your connection and reload.");
    }
  }

  start();
})();
