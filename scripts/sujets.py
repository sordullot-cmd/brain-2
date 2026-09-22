#!/usr/bin/env python3
"""
Un sujet d'examen, relu comme un sujet — exercices, questions, bareme.

Le texte brut d'un PDF de sujet est une suite de lignes ou l'enonce, les
consignes de la fac et les pointilles de la copie sont melanges. Ce module lui
rend sa structure : un en-tete (duree, documents autorises, consignes), puis
des EXERCICES, chacun avec son bareme, son enonce et ses questions numerotees.

C'est ce qui permet au site d'afficher un sujet qu'on peut traiter question par
question, au lieu d'une image de page a faire defiler.

Rien n'est reecrit : on ne fait que decouper, et reparer les ligatures perdues
a l'extraction (voir LIGATURES) — un defaut d'encodage du PDF, pas du contenu.
"""

import re

# Encodage T1 (Cork) des PDF produits par LaTeX : les ligatures sortent en
# caracteres de controle, faute de table de correspondance Unicode dans la
# police. « a\x1becte » = « affecte ». La table est celle de l'encodage, pas une
# supposition sur le mot.
LIGATURES = {
    "\x1b": "ff",
    "\x1c": "fi",
    "\x1d": "fl",
    "\x1e": "ffi",
    "\x1f": "ffl",
    "\x16": "•",
    "\x0b": "ff",
    "\x0c": "fi",
    "\x0d": "fl",
}

RE_EXERCICE = re.compile(
    r"^(Exercice|Partie|Probl[eè]me|Question|Dossier|Cas)\s*(?:n[°o]\s*)?([0-9IVX]+)?\s*"
    r"(?:\(([^)]*?)\))?\s*:?\s*(.*)$",
    re.I,
)
RE_POINTS = re.compile(r"(\d+(?:[.,]\d+)?)\s*(?:points?|pts?)", re.I)
RE_QUESTION = re.compile(r"^(\(?[a-z]\)|[a-z]\.|\d{1,2}\)|\d{1,2}\.)\s+(.{3,})$")
RE_PAGE_SEULE = re.compile(r"^\d{1,3}$")


def reparer(t: str) -> str:
    for mauvais, bon in LIGATURES.items():
        t = t.replace(mauvais, bon)
    return t


def paragraphes(lignes: list) -> list:
    """Recolle les lignes d'un meme paragraphe (le PDF coupe a la justification)."""
    out = []
    for l in lignes:
        l = l.strip()
        if not l:
            out.append("")
            continue
        if out and out[-1] and not out[-1].endswith((".", ":", "?", "!", "…")):
            # Mot coupe en fin de ligne : « de-\nmande ».
            if out[-1].endswith("-"):
                out[-1] = out[-1][:-1] + l
            else:
                out[-1] += " " + l
        else:
            out.append(l)
    return [p for p in out if p]


def structurer(pages: list) -> dict:
    """
    `pages` = le texte de chaque page, deja debarrasse des pointilles.
    Rend { entete, parties } — et `parties` vide si le sujet n'a pas de
    decoupage reconnaissable (ce n'est alors pas un echec : la page image
    reste la lecture de reference).
    """
    lignes = []
    for p in pages:
        for l in reparer(p).splitlines():
            l = l.strip()
            if not l or RE_PAGE_SEULE.match(l):
                continue
            lignes.append(l)

    parties = []
    courante = None
    question = None
    entete = []

    for l in lignes:
        m = RE_EXERCICE.match(l)
        # « Exercice 1 (6 points) » ouvre une partie ; « Exercice » perdu au
        # milieu d'une phrase, non — d'ou la ligne courte exigee.
        if m and len(l) < 120 and (m.group(2) or m.group(3)):
            titre = " ".join(x for x in [m.group(1).capitalize(), m.group(2)] if x)
            pts = RE_POINTS.search(m.group(3) or "")
            courante = {
                "titre": titre,
                "points": float(pts.group(1).replace(",", ".")) if pts else None,
                "enonce": [],
                "questions": [],
            }
            if m.group(4):
                courante["enonce"].append(m.group(4).strip())
            parties.append(courante)
            question = None
            continue

        mq = RE_QUESTION.match(l)
        if mq and courante is not None:
            ref = mq.group(1).strip("().")
            pts = RE_POINTS.search(mq.group(2))
            question = {
                "ref": ref,
                "texte": mq.group(2).strip(),
                "points": float(pts.group(1).replace(",", ".")) if pts else None,
            }
            courante["questions"].append(question)
            continue

        if question is not None:
            # La justification coupe les mots en fin de ligne : « convention-
            # nelle » doit se recoller sans espace.
            question["texte"] = (
                question["texte"][:-1] + l if question["texte"].endswith("-") else question["texte"] + " " + l
            )
        elif courante is not None:
            courante["enonce"].append(l)
        else:
            entete.append(l)

    for p in parties:
        p["enonce"] = paragraphes(p["enonce"])
        for q in p["questions"]:
            q["texte"] = re.sub(r"\s+", " ", q["texte"]).strip()
            q["texte"] = re.sub(r"\s*…\s*$", "", q["texte"])

    return {"entete": lire_entete(entete), "parties": parties}


RE_DUREE = re.compile(r"dur[ée]e[^:]*:?\s*([0-9]+\s*h(?:\s*[0-9]{1,2})?|[0-9]+\s*(?:min|heures?))", re.I)
RE_DOCS = re.compile(r"documents?\s*(?:autoris[ée]s?)?\s*:?\s*([^\n•]{2,60})", re.I)
RE_ENSEIGNANT = re.compile(r"(?:nom de l[’']enseignant|enseignante?)\s*:?\s*([^\n•]{3,60})", re.I)


def lire_entete(lignes: list) -> dict:
    """La page de garde : ce qu'elle dit des conditions de l'epreuve."""
    texte = "\n".join(lignes)
    duree = RE_DUREE.search(texte)
    docs = RE_DOCS.search(texte)
    ens = RE_ENSEIGNANT.search(texte)

    consignes = []
    for l in lignes:
        l = re.sub(r"^[—–\-•*]\s*", "", l.strip("•").strip())
        if len(l) < 30 or len(l) > 220:
            continue
        # Ce qui tient de l'administratif (intitules, cases a remplir) n'est pas
        # une consigne d'epreuve.
        if re.search(r"^(facult[ée]|universit|intitul|nom de l|ann[ée]e|ecrivez|aucun nom)", l, re.I):
            continue
        if re.search(
            r"interdit|autoris|r[ée]dig|justifi|formule|graphique|calculatrice|consigne|barr?[ée]|point",
            l,
            re.I,
        ):
            consignes.append(re.sub(r"\s+", " ", l))

    # « Aucun document n'est autorisé » se lit mieux que le bout de phrase capte
    # par la regex generique.
    documents = docs.group(1).strip() if docs else None
    if re.search(r"aucun document", texte, re.I):
        documents = "Aucun"

    return {
        "duree": duree.group(1).strip() if duree else None,
        "documents": documents,
        "enseignant": ens.group(1).strip() if ens else None,
        # Les consignes se repetent d'un sujet a l'autre : on garde l'ordre, sans doublons.
        "consignes": list(dict.fromkeys(consignes))[:8],
    }
