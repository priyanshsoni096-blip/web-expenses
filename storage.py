"""
storage.py
Persists expenses to Firebase Firestore (free "Spark" tier — no billing
required). Data is instant and persistent across Streamlit Cloud
restarts/redeploys, since it lives outside the app's filesystem.

Setup required (one-time, done outside this code):
    1. Create a project at https://console.firebase.google.com (any
       personal Google account, free Spark plan).
    2. Enable "Firestore Database" for that project (start in
       production or test mode, either works for a single-user app).
    3. Project Settings -> Service Accounts -> Generate new private key.
       This downloads a JSON file.
    4. Put its contents into .streamlit/secrets.toml (local) or the
       Streamlit Cloud "Secrets" panel (deployed), under the key
       [firebase_service_account], e.g.:

        [firebase_service_account]
        type = "service_account"
        project_id = "..."
        private_key_id = "..."
        private_key = "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"
        client_email = "...@....iam.gserviceaccount.com"
        client_id = "..."
        token_uri = "https://oauth2.googleapis.com/token"

Exposes the same interface as the previous SQLite version, so app.py
doesn't need to change:
    load_expenses() -> pandas.DataFrame
    save_expense(expense: dict) -> None
    delete_expense(doc_id: str) -> None
    month_total(df, year, month) -> float
    category_totals(df) -> pandas.Series
"""

import datetime
import functools
import os
import pandas as pd
import firebase_admin
from firebase_admin import credentials, firestore

try:                      # Python 3.11+
    import tomllib
except ModuleNotFoundError:
    import tomli as tomllib   # pip install tomli on older Pythons

COLLECTION = "expenses"
CATEGORIES_COLLECTION = "categories"
SETTINGS_COLLECTION = "settings"
BUDGET_DOC_ID = "monthly_budget"

DEFAULT_CATEGORIES = [
    {"name": "Food & Dining", "icon": "🍽️", "color": "#A78BFA"},
    {"name": "Transport", "icon": "🚗", "color": "#60A5FA"},
    {"name": "Groceries", "icon": "🛒", "color": "#34D399"},
    {"name": "Shopping", "icon": "🛍️", "color": "#F87171"},
    {"name": "Entertainment", "icon": "🎬", "color": "#F472B6"},
    {"name": "Bills & Utilities", "icon": "🧾", "color": "#FBBF24"},
    {"name": "Health & Fitness", "icon": "💊", "color": "#22D3EE"},
    {"name": "Education", "icon": "📚", "color": "#818CF8"},
    {"name": "Travel", "icon": "✈️", "color": "#FB923C"},
    {"name": "Other", "icon": "•", "color": "#9CA3AF"},
]


SECRETS_PATH = os.environ.get("SECRETS_PATH", ".streamlit/secrets.toml")


def _load_service_account() -> dict:
    """Read the Firebase service account.

    Prefers the FIREBASE_SERVICE_ACCOUNT env var (a JSON string) so the app can be
    deployed without a secrets file; otherwise falls back to the same
    .streamlit/secrets.toml the Streamlit version used, so an existing local setup
    keeps working with no changes.
    """
    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if raw:
        import json
        return json.loads(raw)

    if not os.path.exists(SECRETS_PATH):
        raise RuntimeError(
            f"No credentials found. Set FIREBASE_SERVICE_ACCOUNT, or place your "
            f"service account at {SECRETS_PATH} under [firebase_service_account]."
        )
    with open(SECRETS_PATH, "rb") as f:
        data = tomllib.load(f)
    if "firebase_service_account" not in data:
        raise RuntimeError(
            f"{SECRETS_PATH} has no [firebase_service_account] section."
        )
    return dict(data["firebase_service_account"])


@functools.lru_cache(maxsize=1)
def _get_client():
    """Initialise the Firebase app once per process and return a Firestore client.

    lru_cache replaces Streamlit's @st.cache_resource - same purpose, no framework.
    """
    if not firebase_admin._apps:
        cred = credentials.Certificate(_load_service_account())
        firebase_admin.initialize_app(cred)
    return firestore.client()


def load_expenses() -> pd.DataFrame:
    """Fetch all expenses as a DataFrame, newest first."""
    db = _get_client()
    docs = db.collection(COLLECTION).order_by(
        "date", direction=firestore.Query.DESCENDING
    ).stream()

    rows = []
    for doc in docs:
        data = doc.to_dict()
        data["id"] = doc.id
        rows.append(data)

    columns = ["id", "date", "raw_text", "merchant", "amount", "category",
               "source", "payment_mode", "account", "notes",
               "receipt", "receipt_name"]
    if not rows:
        return pd.DataFrame(columns=columns)

    df = pd.DataFrame(rows)
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    for col in columns:
        if col not in df.columns:
            df[col] = "" if col not in ("amount",) else 0.0
    df["payment_mode"] = df["payment_mode"].fillna("Cash").replace("", "Cash")
    df["notes"] = df["notes"].fillna("")
    return df


def save_expense(expense: dict) -> str:
    """
    Add one expense document.
    Expected keys: raw_text, merchant, amount, category, source,
    payment_mode, account, notes (all optional except amount/category).
    'date' is stamped automatically as today unless explicitly provided.
    Returns the new document's ID.
    """
    db = _get_client()
    doc = {
        "date": expense.get("date", datetime.date.today().isoformat()),
        "raw_text": expense.get("raw_text", ""),
        "merchant": expense.get("merchant", "Unknown"),
        "amount": float(expense.get("amount") or 0),
        "category": expense.get("category", "Other"),
        "source": expense.get("source", "text"),
        "payment_mode": expense.get("payment_mode", "Cash"),
        "account": expense.get("account", ""),
        "notes": expense.get("notes", ""),
        # Receipt is stored inline as a data URL. Firestore caps a document at
        # 1 MiB, so the browser downscales images before upload and anything that
        # would not fit is rejected client-side rather than failing here.
        "receipt": expense.get("receipt", ""),
        "receipt_name": expense.get("receipt_name", ""),
    }
    _, ref = db.collection(COLLECTION).add(doc)
    return ref.id


def delete_expense(doc_id: str) -> None:
    db = _get_client()
    db.collection(COLLECTION).document(doc_id).delete()


def update_expense(doc_id: str, updates: dict) -> None:
    """
    Update specific fields of an existing expense document.
    """
    db = _get_client()
    allowed_fields = {"merchant", "amount", "category", "raw_text", "source",
                       "date", "payment_mode", "account", "notes",
                       "receipt", "receipt_name"}
    clean_updates = {k: v for k, v in updates.items() if k in allowed_fields}
    if "amount" in clean_updates:
        clean_updates["amount"] = float(clean_updates["amount"] or 0)
    if clean_updates:
        db.collection(COLLECTION).document(doc_id).update(clean_updates)


def month_total(df: pd.DataFrame, year: int, month: int) -> float:
    """Sum of amounts for a given year/month."""
    if df.empty:
        return 0.0
    mask = (df["date"].dt.year == year) & (df["date"].dt.month == month)
    return float(df.loc[mask, "amount"].sum())


def category_totals(df: pd.DataFrame) -> pd.Series:
    """Total spend per category, sorted descending."""
    if df.empty:
        return pd.Series(dtype=float)
    return df.groupby("category")["amount"].sum().sort_values(ascending=False)


def payment_mode_totals(df: pd.DataFrame) -> pd.Series:
    """Total spend per payment mode, sorted descending."""
    if df.empty:
        return pd.Series(dtype=float)
    return df.groupby("payment_mode")["amount"].sum().sort_values(ascending=False)


def top_merchants(df: pd.DataFrame, n: int = 5) -> pd.DataFrame:
    """Top N merchants by total spend, with transaction counts.

    Grouping is case- and whitespace-insensitive. Rows saved before merchant
    normalisation was fixed contain spellings like "Mcdonald'S" alongside
    "McDonald's"; grouping on the raw string split one real merchant across two
    rows and understated both. The display name shown is the most common
    spelling for that merchant.
    """
    if df.empty:
        return pd.DataFrame(columns=["merchant", "amount", "count"])

    working = df.copy()
    working["merchant"] = working["merchant"].fillna("Unknown").astype(str)
    working["_merchant_key"] = working["merchant"].str.strip().str.casefold()

    def _display_name(names: pd.Series) -> str:
        # .strip() so a stray-whitespace variant does not become the label shown.
        cleaned = names.str.strip()
        modes = cleaned.mode()
        return modes.iat[0] if not modes.empty else cleaned.iat[0]

    grouped = working.groupby("_merchant_key").agg(
        merchant=("merchant", _display_name),
        amount=("amount", "sum"),
        count=("amount", "size"),
    ).reset_index(drop=True)

    return grouped.sort_values("amount", ascending=False).head(n)


# --- Categories (custom categories, merged with defaults) ---

def load_categories() -> list:
    """
    Returns the full category list: built-in defaults plus any custom
    categories the user has added, merged and deduplicated by name.
    """
    db = _get_client()
    docs = db.collection(CATEGORIES_COLLECTION).stream()
    custom = [doc.to_dict() | {"id": doc.id} for doc in docs]

    result = list(DEFAULT_CATEGORIES)
    existing_names = {c["name"] for c in result}
    for c in custom:
        if c.get("name") and c["name"] not in existing_names:
            result.append(c)
            existing_names.add(c["name"])
    return result


def add_category(name: str, icon: str = "🏷️", color: str = "#9CA3AF") -> None:
    db = _get_client()
    db.collection(CATEGORIES_COLLECTION).add({"name": name, "icon": icon, "color": color})


def delete_category(doc_id: str) -> None:
    db = _get_client()
    db.collection(CATEGORIES_COLLECTION).document(doc_id).delete()


# --- Budget ---

def get_budget() -> float:
    """Returns the monthly budget goal, or 0.0 if not set."""
    db = _get_client()
    doc = db.collection(SETTINGS_COLLECTION).document(BUDGET_DOC_ID).get()
    if doc.exists:
        return float(doc.to_dict().get("amount", 0))
    return 0.0


def set_budget(amount: float) -> None:
    db = _get_client()
    db.collection(SETTINGS_COLLECTION).document(BUDGET_DOC_ID).set({"amount": float(amount)})


# --- Profile ---------------------------------------------------------------

PROFILE_DOC_ID = "profile"
NAME_MAX_LEN = 40


def get_user_name(default: str = "there") -> str:
    """The display name, or `default` if none has been set."""
    db = _get_client()
    doc = db.collection(SETTINGS_COLLECTION).document(PROFILE_DOC_ID).get()
    if doc.exists:
        name = str((doc.to_dict() or {}).get("name", "")).strip()
        if name:
            return name
    return default


def set_user_name(name: str) -> None:
    """Store the display name. Trimmed and length-capped so a stray paste cannot
    break the sidebar layout. merge=True so this never clobbers other settings
    that may live on the same document later."""
    cleaned = str(name).strip()[:NAME_MAX_LEN]
    if not cleaned:
        return
    db = _get_client()
    db.collection(SETTINGS_COLLECTION).document(PROFILE_DOC_ID).set(
        {"name": cleaned}, merge=True
    )