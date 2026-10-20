/**
 * Club Athletic — one-question, 5-star text survey.
 *
 * How it works:
 *   1. GHL (or anything else) texts a link like:
 *        https://YOUR-WORKER.workers.dev/survey?loc=WVA&cid={{contact.id}}
 *   2. The customer taps a star rating on a one-question page (mobile friendly).
 *   3. The rating is saved immediately (so you never lose it even if they
 *      close the page), then they're shown an optional comment box.
 *   4. Everything lands in a D1 table called survey_responses.
 *
 * Fill in LOCATIONS below with your real location names. (The question text
 * is intentionally generic — edit QUESTION_TEXT if you want something
 * club-specific.)
 */

// ---- Fill this in with your real location names -------------------------
// Only the "name" field is used right now (shown at the top of the survey
// page). Nothing here is guessed — it's just the 10 codes from your setup,
// each with a blank name for you to fill in.
const LOCATIONS = {
  LSA: { name: "" },
  OTA: { name: "" },
  HBA: { name: "" },
  FLA: { name: "" },
  FiDi: { name: "" },
  GVA: { name: "" },
  MPA: { name: "" },
  LEA: { name: "" },
  WVA: { name: "" },
  WBA: { name: "" },
};

const QUESTION_TEXT = "How was your visit today?";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/survey") {
        return handleSurveyPage(url);
      }
      if (request.method === "POST" && url.pathname === "/api/responses") {
        return handleCreateResponse(request, env);
      }
      if (request.method === "PATCH" && url.pathname.startsWith("/api/responses/")) {
        const id = url.pathname.split("/").pop();
        return handleAddComment(request, env, id);
      }
      if (request.method === "GET" && url.pathname === "/api/responses") {
        return handleListResponses(request, env);
      }
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders() });
      }
      return new Response("Not found", { status: 404 });
    } catch (err) {
      return jsonResponse({ error: "server_error", detail: String(err && err.message || err) }, 500);
    }
  },
};

// ---------------------------------------------------------------------------
// GET /survey?loc=WVA&cid=12345
// ---------------------------------------------------------------------------
function handleSurveyPage(url) {
  const locCode = (url.searchParams.get("loc") || "").trim();
  const contactId = (url.searchParams.get("cid") || "").trim();

  const location = LOCATIONS[locCode];
  if (!locCode || !location) {
    return new Response(renderErrorPage(locCode), {
      status: 400,
      headers: { "content-type": "text/html; charset=UTF-8" },
    });
  }

  return new Response(renderSurveyPage({ locCode, contactId, locationName: location.name }), {
    headers: { "content-type": "text/html; charset=UTF-8" },
  });
}

// ---------------------------------------------------------------------------
// POST /api/responses   { location, rating, contactId }
// ---------------------------------------------------------------------------
async function handleCreateResponse(request, env) {
  if (!env.DB) return jsonResponse({ error: "no_database_bound" }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const locationCode = String(body.location || "").trim();
  const rating = Number(body.rating);
  const contactId = body.contactId ? String(body.contactId).trim() : null;

  if (!locationCode || !LOCATIONS[locationCode]) {
    return jsonResponse({ error: "unknown_location" }, 400);
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return jsonResponse({ error: "invalid_rating" }, 400);
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO survey_responses (id, location_code, rating, contact_id, created_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(id, locationCode, rating, contactId, createdAt)
    .run();

  return jsonResponse({ id });
}

// ---------------------------------------------------------------------------
// PATCH /api/responses/:id   { comment }
// ---------------------------------------------------------------------------
async function handleAddComment(request, env, id) {
  if (!env.DB) return jsonResponse({ error: "no_database_bound" }, 500);
  if (!id) return jsonResponse({ error: "missing_id" }, 400);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const comment = String(body.comment || "").slice(0, 2000);
  const commentAddedAt = new Date().toISOString();

  const result = await env.DB.prepare(
    `UPDATE survey_responses SET comment = ?, comment_added_at = ? WHERE id = ?`
  )
    .bind(comment, commentAddedAt, id)
    .run();

  if (!result.meta || result.meta.changes === 0) {
    return jsonResponse({ error: "not_found" }, 404);
  }

  return jsonResponse({ ok: true });
}

// ---------------------------------------------------------------------------
// GET /api/responses  (simple export, protected by ADMIN_KEY secret)
// ---------------------------------------------------------------------------
async function handleListResponses(request, env) {
  if (!env.ADMIN_KEY) {
    return jsonResponse({ error: "admin_export_disabled" }, 404);
  }
  const key = request.headers.get("x-admin-key");
  if (key !== env.ADMIN_KEY) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 1000);

  const { results } = await env.DB.prepare(
    `SELECT * FROM survey_responses ORDER BY created_at DESC LIMIT ?`
  )
    .bind(limit)
    .all();

  return jsonResponse({ results });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders() },
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
    "access-control-allow-headers": "content-type, x-admin-key",
  };
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function renderErrorPage(locCode) {
  return `<!doctype html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Survey link issue</title></head>
<body style="font-family: -apple-system, system-ui, sans-serif; padding: 40px 20px; text-align:center; color:#333;">
  <p>This survey link is missing or doesn't match a known location${locCode ? ` ("${escapeHtml(locCode)}")` : ""}.</p>
  <p>Please double-check the link.</p>
</body></html>`;
}

function renderSurveyPage({ locCode, contactId, locationName }) {
  const heading = locationName ? escapeHtml(locationName) : escapeHtml(locCode);
  return `<!doctype html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Quick feedback</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #f7f7f8;
    color: #1a1a1a;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
  }
  .card {
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 2px 16px rgba(0,0,0,0.08);
    max-width: 420px;
    width: 100%;
    padding: 32px 24px;
    text-align: center;
  }
  .club-name { font-size: 14px; letter-spacing: 0.04em; text-transform: uppercase; color: #888; margin: 0 0 8px; }
  h1 { font-size: 20px; margin: 0 0 28px; line-height: 1.4; }
  .stars { display: flex; justify-content: center; gap: 6px; margin-bottom: 8px; }
  .star-btn {
    background: none; border: none; cursor: pointer; padding: 6px;
    font-size: 44px; line-height: 1; color: #d8d8d8;
    transition: transform 0.1s ease, color 0.1s ease;
  }
  .star-btn:active { transform: scale(0.9); }
  .star-btn.filled { color: #f5a623; }
  textarea {
    width: 100%; min-height: 90px; margin-top: 16px; padding: 12px;
    border: 1px solid #ddd; border-radius: 10px; font-size: 15px;
    font-family: inherit; resize: vertical;
  }
  .btn {
    display: inline-block; margin-top: 16px; padding: 12px 28px;
    border-radius: 999px; border: none; font-size: 15px; font-weight: 600;
    cursor: pointer;
  }
  .btn-primary { background: #1a1a1a; color: #fff; }
  .btn-secondary { background: none; color: #888; }
  .hidden { display: none; }
  .thanks { font-size: 17px; line-height: 1.5; }
</style>
</head>
<body>
  <div class="card">
    <div id="step-rate">
      <p class="club-name">${heading}</p>
      <h1>${escapeHtml(QUESTION_TEXT)}</h1>
      <div class="stars" id="stars" role="radiogroup" aria-label="Star rating">
        ${[1, 2, 3, 4, 5]
          .map(
            (n) =>
              `<button class="star-btn" data-value="${n}" aria-label="${n} star${n > 1 ? "s" : ""}">&#9733;</button>`
          )
          .join("")}
      </div>
    </div>

    <div id="step-comment" class="hidden">
      <h1>Thanks! Want to add anything?</h1>
      <textarea id="comment" placeholder="Optional — tell us more"></textarea>
      <div>
        <button class="btn btn-primary" id="submit-comment">Submit</button>
      </div>
      <div><button class="btn btn-secondary" id="skip-comment">Skip</button></div>
    </div>

    <div id="step-done" class="hidden thanks">
      <p>Thanks for letting us know — we appreciate it!</p>
    </div>
  </div>

<script>
(function () {
  var locCode = ${JSON.stringify(locCode)};
  var contactId = ${JSON.stringify(contactId || null)};
  var stepRate = document.getElementById('step-rate');
  var stepComment = document.getElementById('step-comment');
  var stepDone = document.getElementById('step-done');
  var starButtons = Array.prototype.slice.call(document.querySelectorAll('.star-btn'));
  var responseId = null;

  function paintStars(value) {
    starButtons.forEach(function (btn) {
      var v = Number(btn.getAttribute('data-value'));
      btn.classList.toggle('filled', v <= value);
    });
  }

  starButtons.forEach(function (btn) {
    btn.addEventListener('mouseenter', function () { paintStars(Number(btn.getAttribute('data-value'))); });
    btn.addEventListener('click', function () {
      var value = Number(btn.getAttribute('data-value'));
      paintStars(value);
      submitRating(value);
    });
  });

  function submitRating(rating) {
    starButtons.forEach(function (b) { b.disabled = true; });
    fetch('/api/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ location: locCode, rating: rating, contactId: contactId }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        responseId = data.id;
        stepRate.classList.add('hidden');
        stepComment.classList.remove('hidden');
      })
      .catch(function () {
        // Even if the network call fails, don't leave the customer stuck.
        stepRate.classList.add('hidden');
        stepDone.classList.remove('hidden');
      });
  }

  function finish() {
    stepComment.classList.add('hidden');
    stepDone.classList.remove('hidden');
  }

  document.getElementById('submit-comment').addEventListener('click', function () {
    var comment = document.getElementById('comment').value.trim();
    if (!responseId || !comment) { finish(); return; }
    fetch('/api/responses/' + responseId, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ comment: comment }),
    }).finally(finish);
  });

  document.getElementById('skip-comment').addEventListener('click', finish);
})();
</script>
</body>
</html>`;
}
