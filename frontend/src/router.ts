import "./public.css";

const app = document.querySelector<HTMLDivElement>("#app")!;
const path = window.location.pathname.replace(/\/+$/, "") || "/";

function renderLanding() {
  document.title = "Learning Links";
  app.innerHTML = `<main class="landing">
    <header class="landing-nav">
      <a class="landing-brand" href="/">◆ <strong>Learning Links</strong></a>
      <a class="landing-signin" href="/app">Sign in</a>
    </header>
    <section class="landing-hero">
      <div class="landing-copy">
        <span class="eyebrow">PERSONAL LEARNING MAP</span>
        <h1>Notice what keeps coming up while you learn.</h1>
        <p>Capture the concepts that surface while studying, then discover which topics keep returning across different contexts.</p>
        <div class="landing-actions">
          <a class="landing-primary" href="/demo">Try the demo</a>
          <a class="landing-secondary" href="/app">Sign in</a>
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

async function renderApplication(demo: boolean) {
  if (demo) document.body.classList.add("demo-mode");
  await import("./main");
  if (demo) {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<a class="demo-banner" href="/" aria-label="Exit demo"><strong>Demo</strong><span>Changes reset when you leave or refresh.</span><b>Exit</b></a>`,
    );
  }
}

if (path === "/") {
  renderLanding();
} else if (path === "/demo") {
  void renderApplication(true);
} else if (path === "/app") {
  void renderApplication(false);
} else {
  renderLanding();
}
