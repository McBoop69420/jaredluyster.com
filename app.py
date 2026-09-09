"""jaredluyster.com homepage — static file server."""

from pathlib import Path

from flask import Flask, send_from_directory

ROOT = Path(__file__).resolve().parent

app = Flask(__name__)


@app.route("/")
def home_page():
    return send_from_directory(str(ROOT), "index.html")


@app.route("/<path:filename>")
def site_static(filename):
    if (ROOT / filename).is_file():
        return send_from_directory(str(ROOT), filename)
    return "Not found", 404
