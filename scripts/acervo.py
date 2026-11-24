#!/usr/bin/env python3
"""Acervo do escritor: guarda o texto completo de tudo o que o Andrade publica.

Roda no GitHub Actions (todo dia) e grava na branch "acervo":
  recanto/<id>.json   um arquivo por texto do Recanto das Letras (cache)
  site/<slug>.json    um arquivo por publicação do site
  txt/...             os mesmos textos em .txt (abre em qualquer computador)
Só baixa do Recanto os textos que ainda não estão no acervo.
"""
import json, os, re, sys, time, urllib.request
from html.parser import HTMLParser

sys.path.insert(0, os.path.dirname(__file__))
from recanto_sync import fetch, parse, LIST_URL  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else "acervo-out"
ROOT = os.path.join(os.path.dirname(__file__), "..")
SB_URL = "https://kfoapsxrzfebjyvmvktf.supabase.co"
SB_KEY = "sb_publishable_fWX65PvnnCqOCfK64KQq5w_gnzN9CQd"
CAT_SITE = {"pensamentos": "Pensamento", "frases": "Frase", "textos": "Texto", "poesias": "Poesia"}
BLOCK = {"p", "div", "br", "li", "h1", "h2", "h3", "h4", "tr", "blockquote"}
SKIP = {"script", "style", "noscript", "nav", "header", "footer", "form", "select", "button"}


class Body(HTMLParser):
    """Guarda o texto de cada contêiner (div/td/article/section) preservando as quebras de linha."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.done, self.skip = [], [], 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in SKIP:
            self.skip += 1
        if tag in ("div", "td", "article", "section", "span"):
            self.stack.append([tag, (a.get("id") or "") + " " + (a.get("class") or ""), []])
        if tag in BLOCK:
            self._put("\n")

    def handle_startendtag(self, tag, attrs):
        if tag == "br":
            self._put("\n")

    def handle_endtag(self, tag):
        if tag in SKIP and self.skip:
            self.skip -= 1
        if tag in BLOCK:
            self._put("\n")
        if tag in ("div", "td", "article", "section", "span"):
            for i in range(len(self.stack) - 1, -1, -1):
                if self.stack[i][0] == tag:
                    n = self.stack.pop(i)
                    txt = "".join(n[2])
                    self.done.append((n[1], txt))
                    if self.stack:
                        self.stack[-1][2].append(txt)
                    break

    def _put(self, s):
        if self.stack and not self.skip:
            self.stack[-1][2].append(s)

    def handle_data(self, d):
        if not self.skip:
            self._put(d)


def clean(t):
    lines = [" ".join(l.split()) for l in t.replace("\xa0", " ").split("\n")]
    out, blank = [], 0
    for l in lines:
        if not l:
            blank += 1
            continue
        if out and blank:
            out.append("")
        out.append(l)
        blank = 0
    return "\n".join(out).strip()


def body_of(html, title):
    b = Body()
    b.feed(html)
    cands = []
    for ident, txt in b.done:
        t = clean(txt)
        if len(t) < 15:
            continue
        score = 0
        if re.search(r"\btexto\b|texto[-_ ]?(conteudo|corpo)|conteudo|content", ident, re.I):
            score += 3
        if re.search(r"menu|nav|rodape|footer|topo|header|coment|lateral|sidebar|anuncio", ident, re.I):
            score -= 5
        if "Enviado por" in t or "Publicado no Recanto" in t:
            score -= 1
        cands.append((score, -len(t), t, ident))
    if not cands:
        return ""
    # O melhor contêiner marcado como "texto"; senão, o menor bloco que ainda contém a maior parte do conteúdo.
    cands.sort(key=lambda c: (-c[0], c[1]))
    best = cands[0]
    t = best[2]
    if title and t.startswith(title):
        t = t[len(title):].strip()
    t = re.split(r"\n(?:Enviado por|Publicado no Recanto das Letras|Comentários|Esta obra está licenciada)", t)[0]
    return t.strip()


def list_all():
    seen, texts = set(), []
    for p in range(1, 80):
        url = LIST_URL + ("" if p == 1 else f"&pag={p}")
        try:
            t, *_ = parse(fetch(url))
        except Exception as e:
            print("lista página", p, e)
            break
        new = [x for x in t if x["id"] not in seen]
        for x in new:
            seen.add(x["id"])
        texts.extend(new)
        print(f"lista página {p}: {len(new)} novos")
        if not new:
            break
        time.sleep(1.2)
    return texts


def site_posts():
    posts = []
    src = open(os.path.join(ROOT, "app.js"), encoding="utf-8").read()
    for m in re.finditer(r'\{slug:"([^"]+)",cat:"([^"]+)",title:"([^"]+)",text:"([^"]+)"\}', src):
        posts.append({"slug": m.group(1), "cat": m.group(2), "title": m.group(3), "text": m.group(4), "em": ""})
    req = urllib.request.Request(SB_URL + "/rest/v1/escritor_docs?select=path,dados&colecao=eq.posts",
                                 headers={"apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY})
    try:
        rows = json.load(urllib.request.urlopen(req, timeout=30))
    except Exception as e:
        print("supabase:", e)
        rows = []
    db = {r["path"].split("/", 1)[-1]: r["dados"] or {} for r in rows}
    for p in posts:
        o = db.pop(p["slug"], None)
        if o:
            p.update({k: o[k] for k in ("cat", "title", "text", "em") if o.get(k)})
            p["removido"] = bool(o.get("removido"))
    for slug, o in db.items():
        if o.get("text"):
            posts.append({"slug": slug, "cat": o.get("cat", "textos"), "title": o.get("title", "Sem título"),
                          "text": o["text"], "em": o.get("em", ""), "removido": bool(o.get("removido"))})
    return [p for p in posts if not p.get("removido")]


def safe(s):
    return re.sub(r'[\\/:*?"<>|]+', "-", s).strip()[:90] or "Sem título"


def main():
    rdir, sdir = os.path.join(OUT, "recanto"), os.path.join(OUT, "site")
    os.makedirs(rdir, exist_ok=True)
    os.makedirs(sdir, exist_ok=True)

    for p in site_posts():
        json.dump(p, open(os.path.join(sdir, p["slug"] + ".json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    texts = list_all()
    have = {f[:-5] for f in os.listdir(rdir) if f.endswith(".json")}
    todo = [x for x in texts if x["id"] not in have]
    print(f"Recanto: {len(texts)} na lista, {len(have)} já no acervo, {len(todo)} para baixar")
    t0, ok = time.time(), 0
    for x in todo:
        if time.time() - t0 > 40 * 60:
            print("Tempo esgotado; o resto vai na próxima execução.")
            break
        try:
            html = fetch(x["url"])
        except Exception as e:
            print("erro", x["id"], e)
            time.sleep(3)
            continue
        if not os.path.exists(os.path.join(OUT, "_exemplo.html")):
            open(os.path.join(OUT, "_exemplo.html"), "w", encoding="utf-8").write(html)
        body = body_of(html, x["title"])
        if not body:
            print("sem corpo", x["id"], x["url"])
            continue
        x["text"] = body
        json.dump(x, open(os.path.join(rdir, x["id"] + ".json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        ok += 1
        time.sleep(1.2)
    print(f"Baixados agora: {ok}")

    # Versão .txt: um arquivo por categoria, do mais antigo para o mais novo.
    tdir = os.path.join(OUT, "txt")
    os.makedirs(os.path.join(tdir, "Recanto das Letras"), exist_ok=True)
    os.makedirs(os.path.join(tdir, "Site"), exist_ok=True)

    def dkey(x):
        d = x.get("date") or ""
        m = re.match(r"(\d{2})/(\d{2})/(\d{4})", d)
        return (m.group(3) + m.group(2) + m.group(1)) if m else "0", int(x.get("id", 0) or 0)

    rec = [json.load(open(os.path.join(rdir, f), encoding="utf-8")) for f in os.listdir(rdir) if f.endswith(".json")]
    by = {}
    for x in rec:
        by.setdefault(x.get("cat") or "Outros", []).append(x)
    for cat, xs in by.items():
        xs.sort(key=dkey)
        with open(os.path.join(tdir, "Recanto das Letras", safe(cat) + ".txt"), "w", encoding="utf-8") as f:
            f.write(f"ANDRADE ESCRITOR — {cat} (Recanto das Letras)\n{len(xs)} textos\n\n")
            for x in xs:
                f.write("=" * 60 + f"\n{x['title']}\n{x.get('date') or ''}  ·  {x['url']}\n\n{x['text']}\n\n")
    site = [json.load(open(os.path.join(sdir, f), encoding="utf-8")) for f in os.listdir(sdir) if f.endswith(".json")]
    for p in site:
        cat = CAT_SITE.get(p["cat"], p["cat"].capitalize())
        d = (p.get("em") or "")[:10]
        name = (d + " - " if d else "") + cat + " - " + safe(p["title"]) + ".txt"
        with open(os.path.join(tdir, "Site", name), "w", encoding="utf-8") as f:
            f.write(f"{p['title']}\n{cat}{'  ·  ' + d if d else ''}\n— Andrade\n\n{p['text']}\n")
    print(f"OK: {len(rec)} textos do Recanto e {len(site)} do site no acervo.")


if __name__ == "__main__":
    main()
