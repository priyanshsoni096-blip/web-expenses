"""
toml_to_env.py
Converts .streamlit/secrets.toml into the single-line JSON that
FIREBASE_SERVICE_ACCOUNT expects for deployment.

Usage:
    python3 toml_to_env.py            # copies to clipboard (macOS)
    python3 toml_to_env.py --stdout   # prints it (only if you must)

The JSON is put on the clipboard rather than printed, so the private key never
appears in your terminal scrollback, in a screenshot, or in a chat window. Paste
it straight into the host's environment-variable field.
"""

import json
import os
import subprocess
import sys

try:
    import tomllib
except ModuleNotFoundError:
    import tomli as tomllib

SECRETS_PATH = ".streamlit/secrets.toml"
REQUIRED = {"type", "project_id", "private_key", "client_email", "token_uri"}


def main() -> None:
    if not os.path.exists(SECRETS_PATH):
        print(f"Not found: {SECRETS_PATH}")
        print("Run this from your project root.")
        sys.exit(1)

    with open(SECRETS_PATH, "rb") as f:
        data = tomllib.load(f)

    if "firebase_service_account" not in data:
        print(f"{SECRETS_PATH} has no [firebase_service_account] section.")
        sys.exit(1)

    account = dict(data["firebase_service_account"])
    missing = REQUIRED - account.keys()
    if missing:
        print(f"Missing field(s): {', '.join(sorted(missing))}")
        sys.exit(1)

    # separators removes the spaces json.dumps adds by default, keeping this to a
    # single compact line — some hosts mangle multi-line env var values.
    blob = json.dumps(account, separators=(",", ":"))

    if "--stdout" in sys.argv:
        print(blob)
        print("\n^ This contains your PRIVATE KEY. Clear your terminal after copying.",
              file=sys.stderr)
        return

    try:
        subprocess.run(["pbcopy"], input=blob.encode("utf-8"), check=True)
    except (FileNotFoundError, subprocess.CalledProcessError):
        print("Could not reach the clipboard (pbcopy is macOS only).")
        print("Re-run with --stdout, or on Linux pipe to xclip:")
        print("    python3 toml_to_env.py --stdout | xclip -selection clipboard")
        sys.exit(1)

    print("Copied to clipboard. Paste it as the FIREBASE_SERVICE_ACCOUNT value.\n")
    print("Safe details, for checking you pasted the right project:")
    for key in ("project_id", "private_key_id", "client_email"):
        if key in account:
            print(f"    {key} = {account[key]}")
    print(f"\n    length = {len(blob)} characters "
          "(the host's field should show roughly this many)")
    print("\nThe private key itself was NOT printed. Do not paste it into a chat.")


if __name__ == "__main__":
    main()