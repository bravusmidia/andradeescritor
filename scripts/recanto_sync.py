#!/usr/bin/env python3
"""Sincroniza a página de autor do Recanto das Letras com o site (recanto-data.js).

Roda no GitHub Actions. Lê a lista pública de textos do autor, extrai título,
categoria, data e leituras, e grava um arquivo de dados que a aba "Recanto" usa.
Se a leitura falhar, mantém os dados anteriores (o site nunca fica vazio por erro).
"""
import json, os, re, sys, time, urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser

AUTHOR_ID = "81643"
BASE = "https://www.recantodasletras.com.br"
LIST_URL = BASE + "/autor_textos.php?id=" + AUTHOR_ID + "&categoria=&lista=ultimas"
MAX_PAGES = 4
OUT = os.path.join(os.path.dirname(__file__), "..", "recanto-data.js")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0 Safari/537.36")
TEXT_RE = re.compile(r"^(?:https?://(?:www\.)?recantodasletras\.com\.br)?/([a-z][a-z0-9-]{2,40})/(\d{4,9})/?$")
SKIP_SLUGS = {"autor", "autores", "escriv", "audios", "mural", "textos", "busca"}
VOID = {"br", "img", "hr", "input", "meta", "link", "area", "base", "col", "embed", "source", "track", "wbr"}

LABELS = {
    "poesias": "Poesia", "pensamentos": "Pensamento", "frases": "Frase", "cartas": "Carta",
    "discursos": "Discurso", "homenagens": "Homenagem", "cronicas": "Crônica", "contos": "Conto",
    "sonetos": "Soneto", "reflexoes": "Reflexão", "artigos": "Artigo", "mensagens": "Mensagem",
    "prosapoetica": "Prosa poética", "acrosticos": "Acróstico", "trovas": "Trova",
    "ensaios": "Ensaio", "resenhas": "Resenha", "redacoes": "Redação", "oracoes": "Oração",
    "cordel": "Cordel", "duetos": "Dueto", "entrevistas": "Entrevista", "letras": "Letra", "frases-e-pensamentos": "Pensamento",
}


class Node:
    __slots__ = ("tag", "attrs", "children", "parent")

    def __init__(self, tag, attrs, parent):
        self.tag, self.attrs, self.children, self.parent = tag, dict(attrs), [], parent

    def text(self):
        out = []
        for c in self.children:
            out.append(c if isinstance(c, str) else c.text())
        return " ".join(" ".join(out).split())


class Tree(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("root", [], None)
        self.cur = self.root
        self.anchors = []

    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs, self.cur)
        self.cur.children.append(n)
        if tag == "a":
            self.anchors.append(n)
        if tag not in VOID:
            self.cur = n

    def handle_endtag(self, tag):
        n = self.cur
        while n is not self.root and n.tag != tag:
            n = n.parent
        if n is not self.root:
            self.cur = n.parent

    def handle_data(self, data):
        if data.strip() and self.cur.tag not in ("script", "style"):
            self.cur.children.append(data)


def fetch(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9"})
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
        cs = r.headers.get_content_charset() or ""
    for enc in [cs, "utf-8", "iso-8859-1"]:
        if not enc:
            continue
        try:
            return raw.decode(enc)
        except (LookupError, UnicodeDecodeError):
            pass
    return raw.decode("utf-8", "replace")


def label(slug):
    if slug in LABELS:
        return LABELS[slug]
    for k, v in LABELS.items():
        if slug.startswith(k):
            return v
    return slug.replace("-", " ").capitalize()


def row_of(a):
    n = a.parent
    hops = 0
    while n is not None and n.tag != "root" and hops < 6:
        if n.tag in ("tr", "li", "article"):
            return n
        if n.tag in ("div", "p", "td") and len(n.text()) < 300 and len(n.text()) > len(a.text()) + 4:
            return n
        n, hops = n.parent, hops + 1
    return a.parent


def parse(html):
    t = Tree()
    t.feed(html)
    page_text = t.root.text()
    texts, cats = [], []
    for a in t.anchors:
        href = (a.attrs.get("href") or "").strip()
        title = a.text()
        m = TEXT_RE.match(href)
        if m and m.group(1) not in SKIP_SLUGS and title and len(title) <= 200:
            slug, tid = m.group(1), m.group(2)
            ctx = row_of(a).text()
            date = re.search(r"\b(\d{2}/\d{2}/\d{4})\b", ctx)
            reads = re.search(r"([\d.]+)\s*leituras?", ctx, re.I)
            if not reads:
                nums = [x for x in re.findall(r"(?<![\d/:.])(\d{1,3}(?:\.\d{3})*|\d+)(?![\d/:])", ctx.replace(title, ""))]
                reads_v = nums[-1] if nums and date else None
            else:
                reads_v = reads.group(1)
            texts.append({
                "id": tid, "title": title, "cat": label(slug), "slug": slug,
                "url": f"{BASE}/{slug}/{tid}",
                "date": date.group(1) if date else None,
                "reads": int(reads_v.replace(".", "")) if reads_v and reads_v.replace(".", "").isdigit() else None,
            })
        elif "autor_textos.php" in href and "categoria=" in href and title:
            cm = re.search(r"categoria=([^&]+)", href)
            if cm and cm.group(1) and len(title) < 60:
                url = href if href.startswith("http") else BASE + "/" + href.lstrip("/")
                cats.append({"label": title, "url": url})
    stats = {}
    sm = re.search(r"([\d.]+)\s*textos?\s*,\s*([\d.]+)\s*leituras", page_text, re.I)
    if sm:
        stats = {"texts": int(sm.group(1).replace(".", "")), "reads": int(sm.group(2).replace(".", ""))}
    return texts, cats, stats, None


def load_prev():
    try:
        with open(OUT, encoding="utf-8") as f:
            s = f.read()
        return json.loads(s[s.index("{"): s.rindex("}") + 1])
    except Exception:
        return {}


def main():
    prev = load_prev()
    texts, cats, stats, loc, seen, errors = [], [], {}, None, set(), []
    for p in range(1, MAX_PAGES + 1):
        url = LIST_URL + ("" if p == 1 else f"&pag={p}")
        try:
            html = fetch(url)
        except Exception as e:
            errors.append(f"página {p}: {e}")
            break
        t, c, s, l = parse(html)
        if p == 1:
            cats, stats, loc = c, s, l
        new = [x for x in t if x["id"] not in seen]
        for x in new:
            seen.add(x["id"])
        texts.extend(new)
        print(f"página {p}: {len(t)} links, {len(new)} novos")
        if not new:
            break
        time.sleep(2)

    if not texts:
        print("Nenhum texto lido do Recanto.", *errors, sep="\n", file=sys.stderr)
        if prev.get("texts"):
            print("Mantendo os dados anteriores.")
            return 0
        return 1

    dedup_cats = list({c["label"]: c for c in cats}.values())
    data = {
        "profile": {
            "name": "Andradeescritor",
            "location": loc or prev.get("profile", {}).get("location") or "Fortaleza - Ceará - Brasil",
            "texts": stats.get("texts") or prev.get("profile", {}).get("texts"),
            "reads": stats.get("reads") or prev.get("profile", {}).get("reads"),
            "url": f"{BASE}/autor.php?id={AUTHOR_ID}",
            "listUrl": LIST_URL,
        },
        "categories": dedup_cats or prev.get("categories", []),
        "texts": texts,
    }
    old = {k: v for k, v in prev.items() if k != "updated"}
    if old == data:
        print("Sem mudanças no Recanto.")
        return 0
    data["updated"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("/* Gerado automaticamente por scripts/recanto_sync.py — não editar à mão. */\n")
        f.write("window.RECANTO=" + json.dumps(data, ensure_ascii=False, indent=1) + ";\n")
    print(f"OK: {len(texts)} textos, {len(dedup_cats)} categorias, stats={stats}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
