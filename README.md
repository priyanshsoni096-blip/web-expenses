# Smart Expense Tracker — FastAPI + Jinja2

Replaces the Streamlit version. Same features, same data, same parser.

## What was reused unchanged

| File | Changes |
|---|---|
| `categorizer.py` | none — parsing, brand names, Hindi/Hinglish |
| `hindi_numbers.py` | none — Devanagari number words |
| `storage.py` | credential loading only (no `st.secrets` / `st.cache_resource`) |

Your Firestore data is untouched. This app reads and writes the same collections.

## Run it

```bash
cd expense_web
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Credentials — either keep your existing file:

```
expense_web/.streamlit/secrets.toml     # same format, same [firebase_service_account]
```

or set an environment variable (better for deployment):

```bash
export FIREBASE_SERVICE_ACCOUNT='{"type":"service_account", ...}'
```

Then:

```bash
uvicorn main:app --reload
```

Open http://127.0.0.1:8000

## Deploying

Works on Render, Railway, Fly.io, or any host that runs a Python web process.

- Build: `pip install -r requirements.txt`
- Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Set `FIREBASE_SERVICE_ACCOUNT` as a secret env var — do not commit the key.

## Layout notes

The problems that were hard to fix in Streamlit are ordinary CSS here:

- **Profile card at the sidebar bottom** — `.sidebar` is a flex column and
  `.sidebar-footer` has `margin-top: auto`. In normal flow, so it cannot overlap
  the nav: if it grows, the gap above it shrinks.
- **Cards that never wrap awkwardly** — `.stat-grid` uses
  `repeat(auto-fit, minmax(...))`, so the browser picks the column count and
  `auto-fit` collapses empty tracks. 4 across when wide, 2×2, then 1.
- **Expense table** — a real CSS grid with per-column minimums inside a
  container query. Reflows to two lines with inline field labels *before* any
  column can be squeezed below its minimum, so it cannot overflow at any width.
- **Fluid sizing** — every size that affects layout is `clamp(min, Nvw, max)`.

## Not carried over

- **Voice input.** `streamlit-mic-recorder` is a Streamlit component. The browser
  equivalent is `MediaRecorder` plus an upload endpoint calling `voice_input.py`.
  Ask if you want it — it's roughly 40 lines of JS and one route.
- **File attachments.** The uploader stub was never wired to storage.
