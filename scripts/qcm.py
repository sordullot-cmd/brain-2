#!/usr/bin/env python3
"""
Les QCM, relus comme des questions — pas comme des pages.

Un QCM en PDF est une image de sujet : on le regarde, on ne le passe pas. Or
c'est la seule epreuve qui se rejoue telle quelle. Ce module rend donc au QCM
sa forme de QCM : une liste de questions, leurs propositions, et la (ou les)
bonne(s) reponse(s).

Comment on sait ce qui est juste : dans les corriges de macro, la bonne
proposition est ecrite en VERT (0x70ad47). Ce n'est pas une convention qu'on
invente, c'est celle du fichier — et elle est lisible span par span dans le
PDF. Quand une epreuve n'a pas de corrige numerique (le corrige est une photo),
les reponses sont transcrites a la main dans data/annales/ et posees ici.

Les questions a PLUSIEURS bonnes reponses sont la regle dans ces QCM, pas
l'exception : « Quel(s) courant(s)… ». On ne force donc jamais une reponse
unique.
"""

import re

import fitz

# Le vert des corriges. On compare avec une tolerance : le meme vert ressort
# parfois a un ou deux points pres selon le profil colorimetrique.
VERT = (0x70, 0xAD, 0x47)
TOLERANCE = 40

RE_QUESTION = re.compile(r"^(\d{1,3})\s*[).]\s*(.*)$")
RE_OPTION = re.compile(r"^([a-h])\s*[)..]\s*(.+)$", re.I)
# Un intitule de theme dans le QCM « classe » : en gras, et il finit par « : ».
RE_THEME = re.compile(r"^(.{2,60}?)\s*:\s*$")


def _rgb(couleur: int) -> tuple:
    return (couleur >> 16 & 255, couleur >> 8 & 255, couleur & 255)


def _est_vert(couleur: int) -> bool:
    r, g, b = _rgb(couleur)
    return (
        abs(r - VERT[0]) < TOLERANCE and abs(g - VERT[1]) < TOLERANCE and abs(b - VERT[2]) < TOLERANCE
    )


def lignes(pdf_path) -> list:
    """Les lignes du PDF, avec ce que leur mise en forme dit d'elles."""
    doc = fitz.open(pdf_path)
    out = []
    for page in doc:
        for bloc in page.get_text("dict")["blocks"]:
            for ligne in bloc.get("lines", []):
                spans = [s for s in ligne["spans"] if s["text"].strip()]
                if not spans:
                    continue
                texte = "".join(s["text"] for s in ligne["spans"])
                texte = re.sub(r"\s+", " ", texte).strip()
                if not texte:
                    continue
                out.append(
                    {
                        "texte": texte,
                        "vert": any(_est_vert(s["color"]) for s in spans),
                        "gras": all(s["flags"] & 16 for s in spans),
                        "taille": max(s["size"] for s in spans),
                    }
                )
    doc.close()
    return out


def extraire(pdf_path, entete_a_ignorer=()) -> list:
    """
    Le QCM en questions. Chaque question porte son numero, son intitule, ses
    propositions, et — si le fichier est un corrige — lesquelles sont justes.

    Le numero repart a 1 a chaque theme dans le QCM « classe » : les questions
    sont donc numerotees a la suite pour le site (`n`), le numero d'origine
    restant lisible (`numero`).
    """
    questions = []
    theme = None
    courante = None
    option = None

    def clore():
        nonlocal courante, option
        if courante and courante["options"]:
            questions.append(courante)
        courante, option = None, None

    for ligne in lignes(pdf_path):
        t = ligne["texte"]
        if any(t.startswith(e) for e in entete_a_ignorer):
            continue

        m_opt = RE_OPTION.match(t)
        m_q = RE_QUESTION.match(t)

        # Un titre de theme : en gras, sans numero, termine par deux points.
        if ligne["gras"] and not m_opt and RE_THEME.match(t):
            clore()
            theme = RE_THEME.match(t).group(1).strip()
            continue

        if m_q and not m_opt:
            clore()
            courante = {
                "numero": int(m_q.group(1)),
                "theme": theme,
                "enonce": m_q.group(2).strip(),
                "options": [],
            }
            option = None
            continue

        if m_opt and courante:
            option = {
                "lettre": m_opt.group(1).lower(),
                "texte": m_opt.group(2).strip(),
                "correcte": ligne["vert"],
            }
            courante["options"].append(option)
            continue

        # Suite de ligne : elle appartient a la derniere proposition ouverte,
        # sinon a l'intitule de la question.
        if option is not None:
            option["texte"] += " " + t
            option["correcte"] = option["correcte"] or ligne["vert"]
        elif courante is not None:
            courante["enonce"] += " " + t

    clore()

    for i, q in enumerate(questions, 1):
        q["n"] = i
        q["multiple"] = sum(1 for o in q["options"] if o["correcte"]) > 1
        q["enonce"] = re.sub(r"\s+", " ", q["enonce"]).strip()
        for o in q["options"]:
            o["texte"] = re.sub(r"\s+", " ", o["texte"]).strip()
    return questions


def poser_reponses(questions: list, reponses: dict) -> int:
    """
    Applique un corrige transcrit a la main.

    Deux formes, selon d'ou vient la reponse :
      "12": ["a", "c"]                       -> le corrige du fichier
      "12": {"lettres": ["a"], "source": "…"} -> une reponse RETROUVEE (dans le
      cours du prof, ou ailleurs) quand le fichier n'en donne pas. La source est
      gardee et affichee : le site dit alors d'ou sort la reponse, au lieu de la
      faire passer pour celle de l'enseignant.

    Les clefs sont le numero d'origine de la question (celui du sujet).
    """
    poses = 0
    for q in questions:
        cle = str(q["numero"]) if str(q["numero"]) in reponses else str(q["n"])
        justes = reponses.get(cle)
        if not justes:
            continue
        if isinstance(justes, dict):
            if justes.get("source"):
                q["source"] = justes["source"]
            justes = justes.get("lettres", [])
        justes = [l.lower() for l in justes]
        for o in q["options"]:
            o["correcte"] = o["lettre"] in justes
        q["multiple"] = len(justes) > 1
        poses += 1
    return poses


def corrige(questions: list) -> bool:
    """Un QCM est corrige quand chacune de ses questions a au moins une reponse."""
    return bool(questions) and all(any(o["correcte"] for o in q["options"]) for q in questions)
