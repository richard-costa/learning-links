import "./public.css";
import { ApiError, getPublicConfig, getSession, signIn, signOut, signUp } from "./api";

const app = document.querySelector<HTMLDivElement>("#app")!;
const path = window.location.pathname.replace(/\/+$/, "") || "/";

function renderLanding(signupEnabled: boolean) {
  document.title = "Learning Links";
  app.innerHTML = `<main class="landing">
    <header class="landing-nav">
      <a class="landing-brand" href="/">◆ <strong>Learning Links</strong></a>
      <div class="landing-nav-actions"><a class="landing-signin" href="/login">Sign in</a>${signupEnabled ? `<a class="landing-signup" href="/signup">Create account</a>` : ""}</div>
    </header>
    <section class="landing-hero">
      <div class="landing-copy">
        <span class="eyebrow">PERSONAL LEARNING MAP</span>
        <h1>Notice what keeps coming up while you learn.</h1>
        <p>Capture the concepts that surface while studying, then discover which topics keep returning across different contexts.</p>
        <div class="landing-actions">
          <a class="landing-primary" href="/demo">Try the demo</a>
          ${signupEnabled ? `<a class="landing-secondary" href="/signup">Create account</a>` : `<a class="landing-secondary" href="/login">Sign in</a>`}
        </div>
        <p class="landing-note">The demo runs only in your browser. Changes are temporary and never touch the database.</p>
      </div>
      <div class="landing-preview" aria-label="Example learning links">
        <div class="preview-context"><small>WHILE STUDYING</small><strong>Classical Mechanics</strong><span>Harmonic oscillators</span></div>
        <div class="preview-arrow">→</div>
        <div class="preview-topic"><small>KEEPS RESURFACING</small><strong>Differential Equations</strong><span>4 study contexts</span></div>
        <div class="preview-context"><small>WHILE STUDYING</small><strong>Control Theory</strong><span>State evolution</span></div>
      </div>
    </section>
    <section class="landing-points">
      <article><strong>Capture</strong><p>Record what a study session led you to learn, review, or explore.</p></article>
      <article><strong>Rediscover</strong><p>See where a topic surfaced before and which ideas recur across subjects.</p></article>
      <article><strong>Explore locally</strong><p>Use focused maps and matrices instead of an unreadable global graph.</p></article>
    </section>
  </main>`;
}

function renderAuth(mode: "login" | "signup", signupEnabled: boolean) {
  const signup = mode === "signup";
  if (signup && !signupEnabled) {
    window.location.replace("/login");
    return;
  }

  document.title = `${signup ? "Create account" : "Sign in"} · Learning Links`;
  app.innerHTML = `<main class="auth-page">
    <a class="auth-brand" href="/">◆ <strong>Learning Links</strong></a>
    <section class="auth-card">
      <span class="eyebrow">${signup ? "START YOUR WORKSPACE" : "WELCOME BACK"}</span>
      <h1>${signup ? "Create your account" : "Sign in"}</h1>
      <p>${signup ? "Your topics and encounters stay in your own workspace." : "Open your personal learning workspace."}</p>
      <form id="auth-form" novalidate>
        <label>Email<input id="auth-email" type="email" autocomplete="email" required maxlength="254"></label>
        <label>Password<input id="auth-password" type="password" autocomplete="${signup ? "new-password" : "current-password"}" required minlength="8" maxlength="256"></label>
        ${signup ? `<small class="auth-help">Use at least 8 characters.</small>` : ""}
        <p id="auth-error" class="auth-error" role="alert"></p>
        <button class="auth-submit" type="submit">${signup ? "Create account" : "Sign in"}</button>
      </form>
      <p class="auth-switch">${signup ? `Already have an account? <a href="/login">Sign in</a>` : signupEnabled ? `New here? <a href="/signup">Create account</a>` : ""}</p>
      <a class="auth-demo" href="/demo">Or try the demo without an account</a>
    </section>
  </main>`;

  const form = document.querySelector<HTMLFormElement>("#auth-form")!;
  const email = document.querySelector<HTMLInputElement>("#auth-email")!;
  const password = document.querySelector<HTMLInputElement>("#auth-password")!;
  const error = document.querySelector<HTMLElement>("#auth-error")!;
  form.addEventListener("submit", async event => {
    event.preventDefault();
    error.textContent = "";
    const submit = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
    submit.disabled = true;
    try {
      if (signup) await signUp(email.value, password.value);
      else await signIn(email.value, password.value);
      window.location.assign("/app");
    } catch (err) {
      error.textContent = err instanceof ApiError ? err.message : "Could not continue. Try again.";
      submit.disabled = false;
    }
  });
}

async function renderApplication(demo: boolean) {
  if (!demo) {
    try {
      await getSession(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.replace("/login");
        return;
      }
      throw err;
    }
  }

  if (demo) document.body.classList.add("demo-mode");
  await import("./main");

  if (demo) {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<a class="demo-banner" href="/" aria-label="Exit demo"><strong>Demo</strong><span>Changes reset when you leave or refresh.</span><b>Exit</b></a>`,
    );
    return;
  }

  const session = await getSession();
  const header = document.querySelector<HTMLElement>(".app-shell>header");
  if (header) {
    header.insertAdjacentHTML(
      "beforeend",
      `<div class="account-control"><span>${session.email}</span><button id="sign-out" type="button">Sign out</button></div>`,
    );
    document.querySelector<HTMLButtonElement>("#sign-out")?.addEventListener("click", async () => {
      const button = document.querySelector<HTMLButtonElement>("#sign-out")!;
      button.disabled = true;
      try {
        await signOut();
      } finally {
        window.location.assign("/");
      }
    });
  }
}

async function start() {
  let signupEnabled = false;
  try {
    signupEnabled = (await getPublicConfig()).signup_enabled;
  } catch {
    // Fail closed: account creation stays hidden if public config cannot load.
  }

  if (path === "/") {
    renderLanding(signupEnabled);
  } else if (path === "/login") {
    renderAuth("login", signupEnabled);
  } else if (path === "/signup") {
    renderAuth("signup", signupEnabled);
  } else if (path === "/demo") {
    await renderApplication(true);
  } else if (path === "/app") {
    await renderApplication(false);
  } else {
    renderLanding(signupEnabled);
  }
}

void start();
