"""
main.py — Smart Expense Tracker (FastAPI + Jinja2)

Replaces the Streamlit app. The business logic is untouched:
    categorizer.py    parsing, brand names, Hindi/Hinglish   — unchanged
    hindi_numbers.py  Devanagari number words                — unchanged
    storage.py        Firestore queries                      — only the credential
                      loading changed (no st.secrets / st.cache_resource)

Run:
    uvicorn main:app --reload
    -> http://127.0.0.1:8000

Why this instead of Streamlit: every page here is plain HTML we own, so layout is
ordinary CSS. A sidebar that pins its footer to the bottom is three lines of
flexbox instead of four failed attempts at overriding a framework's internals.
"""

import calendar
import datetime
import io
import csv
from typing import Optional

import pandas as pd
from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

import categorizer
import storage

app = FastAPI(title="Smart Expense Tracker")
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

PAYMENT_MODES = ["Cash", "UPI", "Card", "Other"]
PAYMENT_ICONS = {"Cash": "💵", "UPI": "📱", "Card": "💳", "Other": "🔁"}
USER_NAME = "sachi"

NAV_ITEMS = [
    ("dashboard", "🏠", "Dashboard", "/"),
    ("add", "➕", "Add Expense", "/add"),
    ("history", "📄", "History", "/history"),
    ("analytics", "📊", "Analytics", "/analytics"),
    ("categories", "🏷️", "Categories", "/categories"),
]


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def _initials(name: str) -> str:
    parts = [w for w in name.split() if w]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()


def _category_lookup():
    """{name: {icon, color}} for every category, defaults plus custom."""
    return {c["name"]: c for c in storage.load_categories()}


def _greeting() -> str:
    h = datetime.datetime.now().hour
    if h < 12:
        return "Good morning"
    if h < 17:
        return "Good afternoon"
    return "Good evening"


def _base_context(request: Request, active: str) -> dict:
    return {
        "request": request,
        "nav_items": NAV_ITEMS,
        "active": active,
        "user_name": USER_NAME,
        "user_initials": _initials(USER_NAME),
    }


def _rows_for_template(df: pd.DataFrame, cats: dict) -> list:
    """DataFrame -> list of plain dicts the template can render.

    Done here rather than in Jinja so the template stays presentational and the
    date/number formatting is testable Python.
    """
    rows = []
    for _, r in df.iterrows():
        cat = cats.get(r["category"], {})
        rows.append({
            "id": r.get("id", ""),
            "date": r["date"].strftime("%d %b %Y") if pd.notnull(r["date"]) else "—",
            "date_iso": r["date"].strftime("%Y-%m-%d") if pd.notnull(r["date"]) else "",
            "merchant": r["merchant"],
            "notes": r.get("notes") or "",
            "category": r["category"],
            "cat_icon": cat.get("icon", "•"),
            "cat_color": cat.get("color", "#9CA3AF"),
            "amount": float(r["amount"] or 0),
            "amount_fmt": f"{float(r['amount'] or 0):,.2f}",
            "payment_mode": r.get("payment_mode") or "Cash",
            "payment_icon": PAYMENT_ICONS.get(r.get("payment_mode") or "Cash", "💵"),
        })
    return rows


# --------------------------------------------------------------------------
# Dashboard
# --------------------------------------------------------------------------

@app.get("/", response_class=HTMLResponse)
def dashboard(request: Request, ok: str = "", err: str = ""):
    df = storage.load_expenses()
    cats = _category_lookup()
    today = datetime.date.today()

    if df.empty:
        month_df = df
    else:
        month_df = df[(df["date"].dt.year == today.year)
                      & (df["date"].dt.month == today.month)]

    total_spent = float(month_df["amount"].sum()) if not month_df.empty else 0.0
    txn_count = len(month_df)
    days_elapsed = today.day
    daily_avg = total_spent / days_elapsed if days_elapsed else 0.0

    if month_df.empty:
        highest = {"amount": 0.0, "merchant": "—", "date": "—"}
    else:
        h = month_df.loc[month_df["amount"].idxmax()]
        highest = {
            "amount": float(h["amount"]),
            "merchant": h["merchant"],
            "date": h["date"].strftime("%d %b") if pd.notnull(h["date"]) else "—",
        }

    budget = storage.get_budget()
    pct = min(total_spent / budget, 1.0) if budget > 0 else 0.0

    cat_totals = storage.category_totals(month_df) if not month_df.empty else pd.Series(dtype=float)
    pie = {
        "labels": [str(i) for i in cat_totals.index],
        "data": [float(v) for v in cat_totals.values],
        "colors": [cats.get(str(i), {}).get("color", "#9CA3AF") for i in cat_totals.index],
        "total": float(cat_totals.sum()) if not cat_totals.empty else 0.0,
    }

    if month_df.empty:
        trend = {"x": [], "y": []}
    else:
        daily = month_df.groupby(month_df["date"].dt.day)["amount"].sum().sort_index()
        trend = {"x": [int(d) for d in daily.index], "y": [float(v) for v in daily.values]}

    insights = []
    if not month_df.empty:
        by_day = month_df.groupby(month_df["date"].dt.day_name())["amount"].sum()
        if not by_day.empty:
            insights.append(("📅", f"Your spending is highest on {by_day.idxmax()}s."))
        if not cat_totals.empty:
            top = cat_totals.index[0]
            insights.append(("📈", f"{top} is your biggest category this month "
                                   f"at ₹{cat_totals.iloc[0]:,.0f}."))
    if not insights:
        insights.append(("💡", "Add a few expenses to unlock personalised insights."))

    ctx = _base_context(request, "dashboard")
    ctx.update({
        "greeting": _greeting(),
        "stats": [
            {"icon": "💳", "label": "Total Spent", "value": f"₹{total_spent:,.0f}", "sub": "This Month"},
            {"icon": "🔁", "label": "Transactions", "value": str(txn_count), "sub": "This Month"},
            {"icon": "📈", "label": "Daily Average", "value": f"₹{daily_avg:,.0f}", "sub": "This Month"},
            {"icon": "🔺", "label": "Highest Expense", "value": f"₹{highest['amount']:,.0f}",
             "sub": f"{highest['merchant']} • {highest['date']}"},
        ],
        "budget": budget,
        "budget_fmt": f"{budget:,.0f}",
        "spent_fmt": f"{total_spent:,.0f}",
        "left_fmt": f"{max(budget - total_spent, 0):,.0f}",
        "pct": round(pct * 100),
        "pie": pie,
        "trend": trend,
        "rows": _rows_for_template(df.head(5), cats),
        "insights": insights,
        "categories": list(cats.keys()),
        "payment_modes": PAYMENT_MODES,
        "flash_ok": {"budget": "Budget saved.", "added": "Expense added."}.get(ok),
        "flash_err": {
            "budget": "Enter a number for the budget, e.g. 35000.",
            "noamount": "No amount detected - include a number, e.g. \"500 at McDonald's\".",
        }.get(err),
    })
    return templates.TemplateResponse(request, "dashboard.html", ctx)


@app.post("/quick-add")
def quick_add(text: str = Form("")):
    parsed = categorizer.parse_multiple_expenses(text)
    saved = 0
    for p in parsed:
        if p["amount"] and p["amount"] > 0:
            storage.save_expense({
                "raw_text": p["raw_text"], "merchant": p["merchant"],
                "amount": p["amount"], "category": p["category"], "source": "text",
            })
            saved += 1
    # No amount found means nothing was saved - say so instead of silently
    # returning to an unchanged page.
    return RedirectResponse("/?ok=added" if saved else "/?err=noamount", status_code=303)


def _parse_money(raw: str) -> Optional[float]:
    """Parse a money field the way a browser might actually send it.

    `amount: float = Form(...)` rejected an empty field, "40,000" and any typo
    with HTTP 422 - a raw error page, which is why clicking Save Budget looked
    like a crash. Commas and spaces are stripped, and None means "unparseable"
    so the caller can decide rather than the request failing.
    """
    if raw is None:
        return None
    cleaned = str(raw).strip().replace(",", "").replace(" ", "").replace("\u20b9", "")
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


@app.post("/budget")
def set_budget(amount: str = Form("")):
    value = _parse_money(amount)
    if value is None:
        # Nothing usable typed - leave the stored budget alone rather than
        # zeroing it or erroring out.
        return RedirectResponse("/?err=budget", status_code=303)
    storage.set_budget(max(value, 0.0))
    return RedirectResponse("/?ok=budget", status_code=303)


# --------------------------------------------------------------------------
# Add Expense
# --------------------------------------------------------------------------

@app.get("/add", response_class=HTMLResponse)
def add_page(request: Request, text: str = "", mode: str = "type"):
    cats = _category_lookup()
    drafts = categorizer.parse_multiple_expenses(text) if text.strip() else []
    ctx = _base_context(request, "add")
    ctx.update({
        "text": text,
        # Which tab was in use. Carried through the parse round-trip so speaking
        # an expense does not drop you back on the Type tab afterwards.
        "mode": "speak" if mode == "speak" else "type",
        "drafts": drafts,
        "categories": list(cats.keys()),
        "payment_modes": PAYMENT_MODES,
        "today": datetime.date.today().isoformat(),
        "examples_en": ["500 at McDonald's", "200 for groceries",
                        "Uber ride 150", "Netflix subscription 649"],
        "examples_hi": ["500 मैकडॉनल्ड्स में", "200 किराना सामान के लिए",
                        "उबर राइड 150", "नेटफ्लिक्स सब्सक्रिप्शन 649"],
    })
    return templates.TemplateResponse(request, "add_expense.html", ctx)


@app.post("/add/parse")
def add_parse(text: str = Form(""), mode: str = Form("type")):
    from urllib.parse import quote
    keep = "speak" if mode == "speak" else "type"
    return RedirectResponse(f"/add?mode={keep}&text={quote(text)}", status_code=303)


@app.post("/add/save")
async def add_save(request: Request):
    """Save every draft row the form submitted.

    Fields arrive as merchant_0, amount_0, category_0 ... so the row index keeps
    them grouped without needing JavaScript to build a JSON payload.
    """
    form = await request.form()
    shared = {
        "date": form.get("date") or datetime.date.today().isoformat(),
        "payment_mode": form.get("payment_mode") or "Cash",
        "account": form.get("account") or "",
        "notes": form.get("notes") or "",
    }
    idx = 0
    saved = 0
    while f"amount_{idx}" in form:
        try:
            amount = float(form.get(f"amount_{idx}") or 0)
        except ValueError:
            amount = 0.0
        if amount > 0:
            storage.save_expense({
                **shared,
                "merchant": form.get(f"merchant_{idx}") or "Unknown",
                "category": form.get(f"category_{idx}") or "Other",
                "amount": amount,
                "raw_text": form.get("raw_text") or "",
                "source": "text",
            })
            saved += 1
        idx += 1
    return RedirectResponse("/history" if saved else "/add", status_code=303)


# --------------------------------------------------------------------------
# History
# --------------------------------------------------------------------------

PAGE_SIZE = 10


@app.get("/history", response_class=HTMLResponse)
def history(request: Request, q: str = "", category: str = "All",
            payment: str = "All", period: str = "All time", page: int = 1):
    df = storage.load_expenses()
    cats = _category_lookup()
    today = datetime.date.today()

    filtered = df.copy()
    if not filtered.empty:
        if period == "This month":
            filtered = filtered[(filtered["date"].dt.year == today.year)
                                & (filtered["date"].dt.month == today.month)]
        elif period == "Last 7 days":
            filtered = filtered[filtered["date"] >= pd.Timestamp(today - datetime.timedelta(days=7))]
        elif period == "Last 30 days":
            filtered = filtered[filtered["date"] >= pd.Timestamp(today - datetime.timedelta(days=30))]
        if category != "All":
            filtered = filtered[filtered["category"] == category]
        if payment != "All":
            filtered = filtered[filtered["payment_mode"] == payment]
        if q.strip():
            needle = q.strip().lower()
            filtered = filtered[
                filtered["merchant"].astype(str).str.lower().str.contains(needle)
                | filtered["notes"].astype(str).str.lower().str.contains(needle)
            ]

    total = float(filtered["amount"].sum()) if not filtered.empty else 0.0
    avg = total / len(filtered) if len(filtered) else 0.0
    month_total = 0.0
    if not filtered.empty:
        m = filtered[(filtered["date"].dt.year == today.year)
                     & (filtered["date"].dt.month == today.month)]
        month_total = float(m["amount"].sum())

    ct = storage.category_totals(filtered) if not filtered.empty else pd.Series(dtype=float)
    top_cat = str(ct.index[0]) if not ct.empty else "—"
    top_cat_amt = float(ct.iloc[0]) if not ct.empty else 0.0

    total_pages = max((len(filtered) - 1) // PAGE_SIZE + 1, 1)
    page = max(1, min(page, total_pages))
    slice_ = filtered.iloc[(page - 1) * PAGE_SIZE: page * PAGE_SIZE]

    # Windowed page list: first, last, and the current page's neighbours.
    shown = {1, total_pages} | {p for p in range(page - 1, page + 2)
                                if 1 <= p <= total_pages}
    page_slots, prev = [], 0
    for p in sorted(shown):
        if p - prev > 1:
            page_slots.append(None)
        page_slots.append(p)
        prev = p

    ctx = _base_context(request, "history")
    ctx.update({
        "rows": _rows_for_template(slice_, cats),
        "categories": list(cats.keys()),
        "payment_modes": PAYMENT_MODES,
        "q": q, "category": category, "payment": payment, "period": period,
        "periods": ["All time", "This month", "Last 7 days", "Last 30 days"],
        "page": page, "total_pages": total_pages, "page_slots": page_slots,
        "count": len(filtered),
        "stats": [
            {"label": "Total Expenses", "value": f"₹{total:,.2f}", "sub": f"{len(filtered)} Transactions"},
            {"label": "This Month", "value": f"₹{month_total:,.2f}", "sub": "Current month"},
            {"label": "Average", "value": f"₹{avg:,.2f}", "sub": "Per Transaction"},
            {"label": "Top Category", "value": top_cat, "sub": f"₹{top_cat_amt:,.2f}"},
        ],
        "showing_from": (page - 1) * PAGE_SIZE + 1 if len(filtered) else 0,
        "showing_to": min(page * PAGE_SIZE, len(filtered)),
    })
    return templates.TemplateResponse(request, "history.html", ctx)


@app.post("/expense/{doc_id}/delete")
def delete_expense(doc_id: str, back: str = Form("/history")):
    storage.delete_expense(doc_id)
    return RedirectResponse(back, status_code=303)


@app.post("/expense/{doc_id}/update")
def update_expense(doc_id: str,
                   merchant: str = Form(...), amount: float = Form(...),
                   category: str = Form(...), payment_mode: str = Form("Cash"),
                   back: str = Form("/history")):
    storage.update_expense(doc_id, {
        "merchant": merchant, "amount": amount,
        "category": category, "payment_mode": payment_mode,
    })
    return RedirectResponse(back, status_code=303)


@app.get("/export")
def export_csv():
    df = storage.load_expenses()
    buf = io.StringIO()
    if df.empty:
        writer = csv.writer(buf)
        writer.writerow(["date", "merchant", "amount", "category", "payment_mode", "notes"])
    else:
        out = df[["date", "merchant", "amount", "category", "payment_mode", "notes"]].copy()
        out["date"] = out["date"].dt.strftime("%Y-%m-%d")
        out.to_csv(buf, index=False)
    buf.seek(0)
    stamp = datetime.date.today().isoformat()
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="expenses_{stamp}.csv"'},
    )


# --------------------------------------------------------------------------
# Analytics
# --------------------------------------------------------------------------

@app.get("/analytics", response_class=HTMLResponse)
def analytics(request: Request):
    df = storage.load_expenses()
    cats = _category_lookup()

    ct = storage.category_totals(df) if not df.empty else pd.Series(dtype=float)
    pie = {
        "labels": [str(i) for i in ct.index],
        "data": [float(v) for v in ct.values],
        "colors": [cats.get(str(i), {}).get("color", "#9CA3AF") for i in ct.index],
        "total": float(ct.sum()) if not ct.empty else 0.0,
    }

    if df.empty:
        trend = {"x": [], "y": []}
        daily_totals = pd.Series(dtype=float)
    else:
        daily_totals = df.groupby(df["date"].dt.date)["amount"].sum().sort_index()
        trend = {"x": [d.isoformat() for d in daily_totals.index],
                 "y": [float(v) for v in daily_totals.values]}

    pm = storage.payment_mode_totals(df) if not df.empty else pd.Series(dtype=float)
    pm_chart = {"labels": [str(i) for i in pm.index], "data": [float(v) for v in pm.values]}

    top_m = storage.top_merchants(df, n=5)
    total_spend = float(df["amount"].sum()) if not df.empty else 0.0
    merchants = [{
        "rank": i + 1,
        "name": r["merchant"],
        "count": int(r["count"]),
        "amount": f"{float(r['amount']):,.0f}",
        "pct": round(float(r["amount"]) / total_spend * 100) if total_spend else 0,
    } for i, (_, r) in enumerate(top_m.iterrows())]

    if daily_totals.empty:
        peak_day, peak_amt = "—", 0.0
    else:
        peak = daily_totals.idxmax()
        peak_day, peak_amt = peak.strftime("%d %b %Y"), float(daily_totals.max())

    highest = df.loc[df["amount"].idxmax()] if not df.empty else None
    freq = top_m.loc[top_m["count"].idxmax()] if not top_m.empty else None

    ctx = _base_context(request, "analytics")
    ctx.update({
        "stats": [
            {"label": "Total Expenses", "value": f"₹{total_spend:,.0f}", "sub": f"{len(df)} Transactions"},
            {"label": "Categories", "value": str(len(ct)), "sub": "In use"},
            {"label": "Average", "value": f"₹{(total_spend/len(df) if len(df) else 0):,.0f}", "sub": "Per Transaction"},
            {"label": "Highest", "value": f"₹{float(highest['amount']):,.0f}" if highest is not None else "₹0",
             "sub": str(highest["merchant"]) if highest is not None else "—"},
        ],
        "pie": pie, "trend": trend, "pm_chart": pm_chart, "merchants": merchants,
        "tiles": [
            ("Most Spent Day", peak_day, f"₹{peak_amt:,.0f}"),
            ("Highest Expense", f"₹{float(highest['amount']):,.0f}" if highest is not None else "₹0",
             str(highest["merchant"]) if highest is not None else "—"),
            ("Frequent Merchant", str(freq["merchant"]) if freq is not None else "—",
             f"{int(freq['count'])} transactions" if freq is not None else ""),
        ],
    })
    return templates.TemplateResponse(request, "analytics.html", ctx)


# --------------------------------------------------------------------------
# Categories
# --------------------------------------------------------------------------

@app.get("/categories", response_class=HTMLResponse)
def categories_page(request: Request):
    df = storage.load_expenses()
    cats = storage.load_categories()
    ct = storage.category_totals(df) if not df.empty else pd.Series(dtype=float)
    total = float(ct.sum()) if not ct.empty else 0.0

    rows = []
    for c in cats:
        amt = float(ct.get(c["name"], 0.0))
        count = int((df["category"] == c["name"]).sum()) if not df.empty else 0
        rows.append({
            "name": c["name"], "icon": c.get("icon", "•"),
            "color": c.get("color", "#9CA3AF"), "id": c.get("id"),
            "amount": f"{amt:,.0f}",
            "pct": round(amt / total * 100) if total else 0,
            "count": count,
        })
    rows.sort(key=lambda r: -float(r["amount"].replace(",", "")))

    ctx = _base_context(request, "categories")
    ctx.update({
        "rows": rows,
        "pie": {
            "labels": [str(i) for i in ct.index],
            "data": [float(v) for v in ct.values],
            "colors": [next((c["color"] for c in cats if c["name"] == str(i)), "#9CA3AF")
                       for i in ct.index],
            "total": total,
        },
    })
    return templates.TemplateResponse(request, "categories.html", ctx)


@app.post("/categories/add")
def add_category(name: str = Form(...), icon: str = Form("🏷️"), color: str = Form("#9CA3AF")):
    if name.strip():
        storage.add_category(name.strip(), icon or "🏷️", color)
    return RedirectResponse("/categories", status_code=303)


@app.post("/categories/{doc_id}/delete")
def remove_category(doc_id: str):
    storage.delete_category(doc_id)
    return RedirectResponse("/categories", status_code=303)