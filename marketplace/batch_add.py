"""Batch Card Add — GUI tool for adding cards to inventory.

Paste cards one per line in the format:
    [qty] [foil] card name collector_number

Examples:
    cool but rude 89
    5 dig through time 36
    foil hermit druid 202
    2 rot-curse rakshasa 87
"""

import subprocess
import sys
import threading
import tkinter as tk
from tkinter import ttk
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "Software" / "MTG Scanner"))

from mtg_scanner.scryfall import ScryfallClient, ScryfallError
from mtg_scanner.collection import Collection

PUBLISH_SCRIPT = Path(__file__).resolve().parent / "publish.py"

C = {
    "bg": "#1c1c1c", "surface": "#252525", "surf2": "#2e2e2e",
    "fg": "#f0ede8", "subfg": "#888078", "accent": "#E89A1A",
    "green": "#4cb87a", "red": "#C92020", "border": "#383838",
    "entry": "#1e1e1e", "header": "#161616", "select": "#3a2a08",
}
FONT = ("Segoe UI", 10)
FONT_BOLD = ("Segoe UI", 10, "bold")
FONT_LG = ("Segoe UI", 14, "bold")
FONT_SM = ("Segoe UI", 9)
FONT_MONO = ("Consolas", 10)


def quarter(price):
    return round(price * 4) / 4 if price else 0.0


def parse_line(line):
    line = line.strip()
    if not line:
        return None
    qty = 1
    foil = False
    tokens = line.split()
    if tokens[0].isdigit():
        qty = int(tokens.pop(0))
    if tokens and tokens[0].lower() == "foil":
        foil = True
        tokens.pop(0)
    if len(tokens) < 2:
        return None
    collector_num = tokens.pop()
    name = " ".join(tokens)
    return qty, foil, name, collector_num


class BatchAddApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Batch Card Add")
        self.geometry("820x680")
        self.minsize(700, 500)
        self.configure(bg=C["bg"])

        self._sc = ScryfallClient()
        self._results = []

        self._apply_theme()
        self._build_ui()

    def _apply_theme(self):
        s = ttk.Style(self)
        s.theme_use("clam")
        s.configure(".", background=C["bg"], foreground=C["fg"], font=FONT,
                     bordercolor=C["border"], relief="flat")
        s.configure("TFrame", background=C["bg"])
        s.configure("TLabel", background=C["bg"], foreground=C["fg"])
        s.configure("TButton", background=C["surf2"], foreground=C["fg"],
                     bordercolor=C["border"], padding=(12, 6))
        s.map("TButton", background=[("active", C["border"]), ("disabled", C["surface"])],
              foreground=[("disabled", C["subfg"])])
        s.configure("Accent.TButton", background=C["accent"], foreground=C["bg"],
                     bordercolor=C["accent"], padding=(14, 8), font=FONT_BOLD)
        s.map("Accent.TButton", background=[("active", "#c87e10"), ("disabled", C["surface"])],
              foreground=[("disabled", C["subfg"])])
        s.configure("Green.TButton", background=C["green"], foreground=C["bg"],
                     bordercolor=C["green"], padding=(14, 8), font=FONT_BOLD)
        s.map("Green.TButton", background=[("active", "#3a9a64"), ("disabled", C["surface"])],
              foreground=[("disabled", C["subfg"])])
        s.configure("Treeview", background=C["surface"], foreground=C["fg"],
                     fieldbackground=C["surface"], bordercolor=C["border"], rowheight=26)
        s.configure("Treeview.Heading", background=C["surf2"], foreground=C["subfg"],
                     bordercolor=C["border"], relief="flat", padding=(4, 5), font=FONT_SM)
        s.map("Treeview", background=[("selected", C["select"])],
              foreground=[("selected", C["fg"])])
        s.configure("TScrollbar", background=C["surf2"], troughcolor=C["surface"],
                     bordercolor=C["surface"], arrowcolor=C["subfg"])
        s.configure("TSeparator", background=C["border"])
        s.configure("Header.TFrame", background=C["header"])
        s.configure("Header.TLabel", background=C["header"], foreground=C["fg"])

    def _build_ui(self):
        self.columnconfigure(0, weight=1)
        self.rowconfigure(2, weight=1)

        # header
        hdr = ttk.Frame(self, style="Header.TFrame", padding=(16, 10))
        hdr.grid(row=0, column=0, sticky="ew")
        ttk.Label(hdr, text="Batch Card Add", font=FONT_LG,
                  style="Header.TLabel").pack(side=tk.LEFT)
        self._status_var = tk.StringVar(value="Paste cards below, one per line")
        ttk.Label(hdr, textvariable=self._status_var, font=FONT_SM,
                  foreground=C["subfg"], style="Header.TLabel").pack(side=tk.RIGHT)

        # input area
        input_frame = ttk.Frame(self, padding=(16, 12, 16, 0))
        input_frame.grid(row=1, column=0, sticky="ew")
        input_frame.columnconfigure(0, weight=1)

        ttk.Label(input_frame, text="[qty] [foil] card name collector_number",
                  foreground=C["subfg"], font=FONT_SM).grid(row=0, column=0, sticky="w")

        self._input_text = tk.Text(input_frame, height=6, bg=C["entry"], fg=C["fg"],
                                    insertbackground=C["fg"], font=FONT_MONO,
                                    borderwidth=1, relief="solid", highlightthickness=0,
                                    selectbackground=C["select"], selectforeground=C["fg"],
                                    padx=8, pady=6)
        self._input_text.grid(row=1, column=0, sticky="ew", pady=(4, 8))

        btn_row = ttk.Frame(input_frame)
        btn_row.grid(row=2, column=0, sticky="ew")
        self._lookup_btn = ttk.Button(btn_row, text="Look Up Cards",
                                       style="Accent.TButton", command=self._on_lookup)
        self._lookup_btn.pack(side=tk.LEFT)
        ttk.Button(btn_row, text="Clear", command=self._on_clear).pack(side=tk.LEFT, padx=(8, 0))

        ttk.Separator(self).grid(row=1, column=0, sticky="ew", pady=(0, 0), padx=16)

        # results table
        table_frame = ttk.Frame(self, padding=(16, 8, 16, 0))
        table_frame.grid(row=2, column=0, sticky="nsew")
        table_frame.columnconfigure(0, weight=1)
        table_frame.rowconfigure(0, weight=1)

        cols = ("name", "set", "qty", "raw", "rounded", "total")
        heads = {
            "name": ("Card", 240, tk.W),
            "set": ("Set", 100, tk.W),
            "qty": ("Qty", 50, tk.CENTER),
            "raw": ("Market", 80, tk.E),
            "rounded": ("Sell", 80, tk.E),
            "total": ("Line Total", 90, tk.E),
        }
        self._tree = ttk.Treeview(table_frame, columns=cols, show="headings", selectmode="browse")
        for key, (label, width, anchor) in heads.items():
            self._tree.heading(key, text=label)
            self._tree.column(key, width=width, anchor=anchor, minwidth=40)
        self._tree.tag_configure("even", background=C["surface"])
        self._tree.tag_configure("odd", background=C["surf2"])
        self._tree.tag_configure("error", background="#2a1515", foreground=C["red"])
        self._tree.grid(row=0, column=0, sticky="nsew")

        sb = ttk.Scrollbar(table_frame, orient=tk.VERTICAL, command=self._tree.yview)
        self._tree.configure(yscrollcommand=sb.set)
        sb.grid(row=0, column=1, sticky="ns")

        # bottom bar
        bot = ttk.Frame(self, padding=(16, 10))
        bot.grid(row=3, column=0, sticky="ew")
        bot.columnconfigure(1, weight=1)

        self._total_var = tk.StringVar(value="")
        ttk.Label(bot, textvariable=self._total_var, font=FONT_LG,
                  foreground=C["accent"]).pack(side=tk.LEFT)

        self._add_btn = ttk.Button(bot, text="Add to Inventory & Publish",
                                    style="Green.TButton", command=self._on_add,
                                    state=tk.DISABLED)
        self._add_btn.pack(side=tk.RIGHT)

    def _on_clear(self):
        self._input_text.delete("1.0", tk.END)
        for row in self._tree.get_children():
            self._tree.delete(row)
        self._results = []
        self._total_var.set("")
        self._add_btn.configure(state=tk.DISABLED)
        self._status_var.set("Paste cards below, one per line")

    def _on_lookup(self):
        text = self._input_text.get("1.0", tk.END).strip()
        lines = [l.strip() for l in text.splitlines() if l.strip()]
        if not lines:
            return

        for row in self._tree.get_children():
            self._tree.delete(row)
        self._results = []
        self._total_var.set("")
        self._add_btn.configure(state=tk.DISABLED)
        self._lookup_btn.configure(state=tk.DISABLED)
        self._status_var.set(f"Looking up {len(lines)} cards...")

        threading.Thread(target=self._lookup_worker, args=(lines,), daemon=True).start()

    def _lookup_worker(self, lines):
        results = []
        errors = []

        for i, line in enumerate(lines):
            parsed = parse_line(line)
            if not parsed:
                errors.append((line, "Could not parse"))
                continue

            qty, foil, name, cn = parsed
            try:
                match = self._sc.find_by_name(name)
                if not match:
                    errors.append((line, f"Card not found: '{name}'"))
                    continue

                printings = self._sc.search_printings(match.name)
                found = None
                for p in printings:
                    if p.collector_number == cn:
                        found = p
                        break

                if not found:
                    available = ", ".join(f"{p.set_code}#{p.collector_number}" for p in printings[:5])
                    errors.append((line, f"No #{cn} printing. Try: {available}"))
                    continue

                price = found.prices.best_for(foil)
                rounded = quarter(price)
                results.append({
                    "match": found, "qty": qty, "foil": foil,
                    "raw_price": price, "price": rounded,
                    "line_total": rounded * qty,
                })

            except ScryfallError as e:
                errors.append((line, str(e)))

        self.after(0, lambda: self._show_results(results, errors))

    def _show_results(self, results, errors):
        self._results = results
        self._lookup_btn.configure(state=tk.NORMAL)

        for row in self._tree.get_children():
            self._tree.delete(row)

        idx = 0
        for r in results:
            m = r["match"]
            foil_str = " (Foil)" if r["foil"] else ""
            tag = "even" if idx % 2 == 0 else "odd"
            self._tree.insert("", tk.END, tags=(tag,), values=(
                m.name + foil_str,
                f"{m.set_code.upper()} #{m.collector_number}",
                r["qty"],
                f"${r['raw_price']:.2f}" if r["raw_price"] else "N/A",
                f"${r['price']:.2f}",
                f"${r['line_total']:.2f}",
            ))
            idx += 1

        for line, err in errors:
            tag = "error"
            self._tree.insert("", tk.END, tags=(tag,), values=(
                line, err, "", "", "", "",
            ))
            idx += 1

        total_cards = sum(r["qty"] for r in results)
        batch_total = sum(r["line_total"] for r in results)
        self._total_var.set(f"{total_cards} cards — ${batch_total:.2f}")

        if results:
            self._add_btn.configure(state=tk.NORMAL)
            self._status_var.set(f"Found {len(results)} cards, {len(errors)} errors")
        else:
            self._status_var.set(f"No valid cards found ({len(errors)} errors)")

    def _on_add(self):
        if not self._results:
            return

        self._add_btn.configure(state=tk.DISABLED)
        self._status_var.set("Adding to inventory...")

        col = Collection()
        for r in self._results:
            col.add_card(r["match"], quantity=r["qty"], foil=r["foil"], sell_price=r["price"])
        col.close()

        total_cards = sum(r["qty"] for r in self._results)
        self._status_var.set(f"Added {total_cards} cards. Publishing...")

        result = subprocess.run(
            [sys.executable, str(PUBLISH_SCRIPT)],
            cwd=str(PUBLISH_SCRIPT.parent), capture_output=True, text=True,
        )

        batch_total = sum(r["line_total"] for r in self._results)
        if result.returncode != 0:
            error = (result.stderr or result.stdout or "unknown error").strip().splitlines()[-1]
            self._status_var.set(
                f"Added {total_cards} cards (${batch_total:.2f}) locally, but publishing failed: {error}"
            )
        else:
            self._status_var.set(f"Done! Added {total_cards} cards (${batch_total:.2f}) and republished.")
        self._results = []


if __name__ == "__main__":
    BatchAddApp().mainloop()
