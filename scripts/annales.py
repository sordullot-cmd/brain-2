#!/usr/bin/env python3
"""
Les annales de L1 -> public/annales/ + public/annales.json

Les sujets d'examen ne vivent pas dans le vault : ils sont dans
~/Documents/L1/<matiere>/Annales*/, tels que Sacha les recupere — PDF de la
fac, scans, photos de telephone. Ce script les prepare pour la lecture en
ligne :

  * chaque epreuve (un PDF, ou un dossier de photos) devient une suite de
    PAGES en WebP, lisibles sans telecharger 3 Mo de JPEG d'iPhone ;
  * l'ORIGINAL reste servi a cote, pour l'imprimer ou l'annoter ;
  * le TEXTE est extrait quand le PDF en porte (les sujets de micro, les QCM
    de macro) : c'est ce qui permet de rejouer l'epreuve au lieu de la
    regarder. Les scans n'en ont pas — leur contenu est transcrit a la main
    dans data/annales/<id>.json (voir merge plus bas).

La sortie est COMMITEE : Vercel ne lance que `vite build`, il n'a ni les
annales ni Python.

    python3 scripts/annales.py
"""

import json
import os
import re
import shutil
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:
    sys.exit("PyMuPDF manquant :  python3 -m pip install --user pymupdf")

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import qcm as qcm_mod  # noqa: E402
import sujets as sujets_mod  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SOURCE = Path(os.environ.get("ANNALES_PATH", Path.home() / "Documents" / "L1"))
OUT_DIR = ROOT / "public" / "annales"
OUT_JSON = ROOT / "public" / "annales.json"
OUT_QCM = ROOT / "public" / "annales-qcm.json"
DATA_DIR = ROOT / "data" / "annales"

# Une page lue a l'ecran : 1500 px suffisent pour un sujet A4 scanne, y compris
# sur ecran retine ou l'on zoome. Au-dela on sert des Mo pour rien.
PAGE_W = 1500
PAGE_Q = 80
VIGNETTE_W = 420
VIGNETTE_Q = 70

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".heic", ".webp"}
SKIP = {".DS_Store"}

# Les titres courants repetes en haut de chaque page des QCM : ils ne sont ni
# une question ni une proposition.
ENTETES_QCM = ("QCM Macroéconomie", "Pensées et Auteurs")


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower().replace("’", "'")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


# ----------------------------------------------------------------- metadonnees

TYPES = [
    (r"\brattrapage\b|session\s*2|2\s*(?:eme|ème|nde)\s*session", "Rattrapage", 2),
    (r"\bqcm\b", "QCM", None),
    (r"\bcc\s*\d?\b|contr[oô]le\s*continu", "Contrôle continu", None),
    (r"\bct\b|contr[oô]le\s*terminal|\bexamen\b|\bexam\b", "Examen", None),
]


def lire_meta(nom: str, dossier: str = "") -> dict:
    """Ce que le nom du fichier dit de l'epreuve : annee, type, session, numero."""
    texte = f"{dossier} {nom}"
    bas = texte.lower()

    annee = None
    m = re.search(r"(20\d{2})\s*[-–/_]\s*(20\d{2}|\d{2})", texte)
    if m:
        fin = m.group(2)
        annee = f"{m.group(1)}-{fin if len(fin) == 4 else '20' + fin}"
    elif (m := re.search(r"\b(20\d{2})\b", texte)) :
        debut = int(m.group(1))
        annee = f"{debut}-{debut + 1}"
    # « 23-24 » : l'annee universitaire ecrite court, comme sur les copies.
    elif (m := re.search(r"\b(\d{2})\s*[-–/]\s*(\d{2})\b", texte)) and int(m.group(2)) == int(m.group(1)) + 1:
        annee = f"20{m.group(1)}-20{m.group(2)}"

    type_ = None
    session = None
    for motif, libelle, sess in TYPES:
        if re.search(motif, bas):
            type_ = libelle
            session = sess
            break

    if session is None:
        m = re.search(r"session\s*(\d)", bas)
        if m:
            session = int(m.group(1))
        elif re.search(r"1\s*(?:ere|ère)\s*session", bas):
            session = 1

    numero = None
    m = re.search(r"\bcc\s*(\d)\b", bas)
    if m:
        numero = int(m.group(1))

    corrige = bool(re.search(r"corrig|correction", bas))

    return {
        "type": type_,
        "annee": annee,
        "session": session,
        "numero": numero,
        "corrige": corrige,
    }


def titre_lisible(nom: str) -> str:
    """Le nom du fichier, debarrasse de son extension et de ses tirets bas."""
    t = re.sub(r"\.[A-Za-z0-9]+$", "", nom).replace("_", " ").strip()
    t = re.sub(r"\s+", " ", t)
    return t[:1].upper() + t[1:]


# --------------------------------------------------------------------- rendus


def ecrire_webp(img: Image.Image, dest: Path, largeur: int, qualite: int) -> dict:
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    if img.width > largeur:
        h = round(img.height * largeur / img.width)
        img = img.resize((largeur, h), Image.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest, "WEBP", quality=qualite, method=5)
    return {"w": img.width, "h": img.height}


def pages_du_pdf(pdf: Path, dest_dir: Path, rotation: int = 0) -> list:
    """Rasterise chaque page. Le zoom vise PAGE_W en largeur finale."""
    doc = fitz.open(pdf)
    pages = []
    for i, page in enumerate(doc):
        zoom = min(3.0, max(1.0, PAGE_W / max(1.0, page.rect.width)))
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        if rotation:
            img = img.rotate(rotation, expand=True)
        nom = f"p{i + 1:02d}"
        dim = ecrire_webp(img, dest_dir / f"{nom}.webp", PAGE_W, PAGE_Q)
        ecrire_webp(img, dest_dir / f"{nom}-min.webp", VIGNETTE_W, VIGNETTE_Q)
        pages.append({"url": None, "nom": nom, **dim})
    doc.close()
    return pages


def pages_des_images(fichiers: list, dest_dir: Path, rotation: int = 0) -> list:
    pages = []
    for i, f in enumerate(fichiers):
        try:
            img = Image.open(f)
            img = corriger_orientation(img)
            if rotation:
                img = img.rotate(rotation, expand=True)
        except Exception as e:  # noqa: BLE001
            print(f"  ! image illisible : {f.name} ({e})")
            continue
        nom = f"p{i + 1:02d}"
        dim = ecrire_webp(img, dest_dir / f"{nom}.webp", PAGE_W, PAGE_Q)
        ecrire_webp(img, dest_dir / f"{nom}-min.webp", VIGNETTE_W, VIGNETTE_Q)
        pages.append({"url": None, "nom": nom, **dim})
    return pages


def corriger_orientation(img: Image.Image) -> Image.Image:
    """Les photos d'iPhone arrivent couchees si on ignore leur tag EXIF."""
    try:
        exif = img.getexif()
        orient = exif.get(274)
        if orient == 3:
            return img.rotate(180, expand=True)
        if orient == 6:
            return img.rotate(270, expand=True)
        if orient == 8:
            return img.rotate(90, expand=True)
    except Exception:  # noqa: BLE001
        pass
    return img


# ---------------------------------------------------------------- texte du PDF

LIGNE_POINTILLES = re.compile(r"^[\s.·…_]{10,}$")


def nettoyer_texte(t: str) -> str:
    """
    Les sujets a trous sont remplis de lignes de pointilles (la place laissee
    pour repondre). Elles font les trois quarts du texte extrait et ne disent
    rien : on les enleve, en gardant une trace qu'il y avait une reponse a
    rediger.
    """
    t = sujets_mod.reparer(t)
    out = []
    trou = False
    for ligne in t.splitlines():
        l = ligne.rstrip()
        if LIGNE_POINTILLES.match(l.strip()) or re.match(r"^[\s.·…]*\.{20,}[\s.·…]*$", l):
            trou = True
            continue
        # Une ligne qui FINIT par une longue trainee de points : on coupe la traine.
        l = re.sub(r"\s*\.{8,}[\s.]*$", " …", l)
        if l.strip():
            if trou:
                out.append("")
                trou = False
            out.append(l)
    return "\n".join(out).strip()


def texte_du_pdf(pdf: Path) -> list:
    doc = fitz.open(pdf)
    pages = [nettoyer_texte(p.get_text()) for p in doc]
    doc.close()
    return pages


# --------------------------------------------------------------------- collecte


def epreuves_de(dossier: Path, matiere: str) -> list:
    """
    Une epreuve = un PDF, ou un dossier de photos (les pages d'un meme sujet),
    ou une photo isolee. Les photos isolees d'un meme dossier sans nom parlant
    (UUID d'export) sont regroupees : ce sont les pages d'un meme sujet
    photographie page par page.
    """
    epreuves = []
    fichiers = sorted(
        [f for f in dossier.iterdir() if f.is_file() and f.name not in SKIP and not f.name.startswith("._")],
        key=lambda f: f.name.lower(),
    )
    sous_dossiers = sorted([d for d in dossier.iterdir() if d.is_dir()], key=lambda d: d.name.lower())

    def ranger(fichiers_du_lot, nom_du_lot, groupe=None):
        """
        Un lot de fichiers d'un meme dossier -> des epreuves.

        Les PDF font chacun leur epreuve. Les photos qui portent un nom
        (« Cc macro 2023-2024.jpg », « Corrigé Pensées et Auteurs.jpg ») aussi :
        le nom dit de quelle epreuve il s'agit. Les exports anonymes (UUID de
        l'app photo) sont au contraire les PAGES d'un meme sujet, prises a la
        suite — ils se lisent dans l'ordre alphabetique, qui est celui de
        l'export.
        """
        lot = []
        pdfs = [f for f in fichiers_du_lot if f.suffix.lower() == ".pdf"]
        images = [f for f in fichiers_du_lot if f.suffix.lower() in IMAGE_EXT]
        # Un nom parlant porte au moins un mot : « Cc macro 2023-2024 » en a,
        # « 18553700_1446139845449330_o » ou « IMG_1982 » n'en ont pas.
        anonymes = [
            f
            for f in images
            if re.fullmatch(r"[0-9a-f-]{20,}|img[_-]?\d+|\d{1,2}", f.stem, re.I)
            or not re.search(r"[a-zA-Z]{3,}", re.sub(r"^img", "", f.stem, flags=re.I))
        ]
        nommees = [f for f in images if f not in anonymes]

        for pdf in pdfs:
            lot.append({"nom": pdf.stem, "source": pdf, "fichiers": [pdf], "format": "pdf", "groupe": groupe})
        for img in nommees:
            lot.append({"nom": img.stem, "source": img, "fichiers": [img], "format": "image", "groupe": groupe})
        if anonymes:
            lot.append(
                {"nom": nom_du_lot, "source": None, "fichiers": anonymes, "format": "photos", "groupe": groupe}
            )
        return lot

    epreuves += ranger(fichiers, dossier.name.strip())
    for sd in sous_dossiers:
        sous = sorted(
            [f for f in sd.rglob("*") if f.is_file() and f.name not in SKIP and not f.name.startswith("._")],
            key=lambda f: f.name.lower(),
        )
        epreuves += ranger(sous, sd.name.strip(), groupe=sd.name)
    return epreuves


def main() -> None:
    if not SOURCE.exists():
        sys.exit(f"Dossier des annales introuvable : {SOURCE}")

    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # Les transcriptions sont lues d'abord : elles peuvent dire comment RENDRE
    # une page (redresser une photo prise de travers), pas seulement ce qu'elle
    # contient.
    blocs = []
    if DATA_DIR.exists():
        for f in sorted(DATA_DIR.glob("*.json")):
            donnees = json.loads(f.read_text(encoding="utf-8"))
            blocs += donnees if isinstance(donnees, list) else [donnees]
    overrides = {b["id"]: b for b in blocs if b.get("id")}

    matieres = []
    toutes = []

    for mat_dir in sorted([d for d in SOURCE.iterdir() if d.is_dir()], key=lambda d: d.name.lower()):
        dossiers = [
            d for d in mat_dir.iterdir() if d.is_dir() and "annale" in slugify(d.name)
        ]
        if not dossiers:
            continue
        matiere = mat_dir.name.replace("_", "’")
        mslug = slugify(matiere)

        epreuves = []
        for d in sorted(dossiers, key=lambda d: d.name.lower()):
            epreuves += epreuves_de(d, matiere)

        if not epreuves:
            continue

        for ep in epreuves:
            eslug = slugify(ep["nom"]) or "epreuve"
            eid = f"{mslug}/{eslug}"
            dest = OUT_DIR / mslug / eslug
            meta = lire_meta(ep["nom"], ep.get("groupe", ""))

            questions = None
            structure = None
            rotation = overrides.get(eid, {}).get("rotation", 0)
            if ep["format"] == "pdf":
                pages = pages_du_pdf(ep["source"], dest, rotation)
                textes = texte_du_pdf(ep["source"])
                if sum(len(t) for t in textes) > 400:
                    # Un QCM se rejoue, un sujet redige se traite : on regarde
                    # d'abord si le fichier est un QCM, sinon on le decoupe en
                    # exercices.
                    trouvees = qcm_mod.extraire(ep["source"], ENTETES_QCM)
                    if len(trouvees) >= 8 and all(len(q["options"]) >= 2 for q in trouvees):
                        questions = trouvees
                    else:
                        structure = sujets_mod.structurer(textes)
            else:
                pages = pages_des_images(ep["fichiers"], dest, rotation)
                textes = []

            for p in pages:
                p["url"] = f"/annales/{mslug}/{eslug}/{p['nom']}.webp"
                p["mini"] = f"/annales/{mslug}/{eslug}/{p['nom']}-min.webp"

            # L'original, servi tel quel pour l'impression.
            original = None
            if ep["source"] is not None:
                ext = ep["source"].suffix.lower()
                dest.mkdir(parents=True, exist_ok=True)
                shutil.copy2(ep["source"], dest / f"source{ext}")
                original = {
                    "url": f"/annales/{mslug}/{eslug}/source{ext}",
                    "nom": ep["source"].name,
                    "octets": ep["source"].stat().st_size,
                    "ext": ext.lstrip("."),
                }

            texte_utile = [t for t in textes if len(t) > 40]
            octets = sum(f.stat().st_size for f in ep["fichiers"])
            mtime = max(f.stat().st_mtime for f in ep["fichiers"]) * 1000

            toutes.append(
                {
                    "id": eid,
                    "slug": eslug,
                    "matiere": matiere,
                    "matiereSlug": mslug,
                    "titre": titre_lisible(ep["nom"]),
                    "format": ep["format"],
                    **meta,
                    "pages": pages,
                    "nbPages": len(pages),
                    # Le texte brut du PDF a servi a batir `epreuve` ; le
                    # resservir au client doublerait l'index pour rien.
                    "aDuTexte": bool(texte_utile),
                    "original": original,
                    "octets": octets,
                    "mtime": mtime,
                    # `epreuve` = le sujet reconstruit (exercices, questions),
                    # qu'il vienne du texte du PDF ou d'une transcription.
                    "epreuve": structure,
                    "qcm": None if questions is None else {"questions": questions},
                }
            )

        matieres.append({"slug": mslug, "nom": matiere})

    # ---- fusion avec les transcriptions ecrites a la main (scans, QCM relus)
    transcrites = 0
    par_id = {e["id"]: e for e in toutes}
    if True:
        for bloc in blocs:
            if True:
                cible = par_id.get(bloc.get("id"))
                if not cible:
                    print(f"  ! transcription orpheline : {bloc.get('id')}")
                    continue
                if bloc.get("epreuve"):
                    cible["epreuve"] = bloc["epreuve"]
                # Des photos d'un sujet prises dans le desordre (l'ordre des
                # noms d'export n'est pas celui des pages) : la transcription
                # donne l'ordre reel, « ordre »: [3, 1, 2] = la page 3 d'abord.
                if bloc.get("ordre"):
                    rangs = [n - 1 for n in bloc["ordre"]]
                    if sorted(rangs) == list(range(len(cible["pages"]))):
                        cible["pages"] = [cible["pages"][r] for r in rangs]
                    else:
                        print(f"  ! ordre des pages incohérent pour {bloc['id']}")
                if bloc.get("qcm"):
                    cible["qcm"] = bloc["qcm"]
                # Un corrige transcrit a la main se pose sur les questions deja
                # extraites du PDF : { "reponses": { "12": ["a","c"] } }.
                if bloc.get("reponses") and cible.get("qcm"):
                    qcm_mod.poser_reponses(cible["qcm"]["questions"], bloc["reponses"])
                for cle in ("type", "annee", "session", "titre", "source", "note"):
                    if bloc.get(cle) is not None:
                        cible[cle] = bloc[cle]
                transcrites += 1

    # ---- le corrige d'un QCM vaut pour son sujet
    # « QCM vrac » et « QCM vrac corriges » portent les memes questions ; seul
    # le second dit lesquelles sont justes. On reporte donc les reponses sur le
    # sujet, et chacun garde ses pages.
    for e in toutes:
        if not e.get("qcm") or qcm_mod.corrige(e["qcm"]["questions"]):
            continue
        jumeau = next(
            (
                o
                for o in toutes
                if o is not e
                and o["matiereSlug"] == e["matiereSlug"]
                and o.get("qcm")
                and o["corrige"]
                # Le titre est compare en slug : « corrigés » s'y ecrit
                # « corriges », accent decompose ou non.
                and re.sub(r"-?corrections?$|-?corriges?$", "", slugify(o["titre"])) == slugify(e["titre"])
            ),
            None,
        )
        if not jumeau:
            continue
        source = {q["numero"]: q for q in jumeau["qcm"]["questions"]}
        reportees = 0
        for q in e["qcm"]["questions"]:
            ref = source.get(q["numero"])
            if not ref or len(ref["options"]) != len(q["options"]):
                continue
            for o, r in zip(q["options"], ref["options"]):
                o["correcte"] = r["correcte"]
            q["multiple"] = ref["multiple"]
            reportees += 1
        if reportees:
            e["corrigePar"] = jumeau["id"]
            jumeau["corrigeDe"] = e["id"]

    # ---- les QCM sortent a part : seule la page qui les joue les charge
    qcms = []
    for e in toutes:
        if not e.get("qcm"):
            continue
        questions = e["qcm"]["questions"]
        sans_reponse = [q["n"] for q in questions if not any(o["correcte"] for o in q["options"])]
        qcms.append(
            {
                "id": e["id"],
                "titre": e["titre"],
                "matiere": e["matiere"],
                "matiereSlug": e["matiereSlug"],
                "annee": e["annee"],
                "questions": questions,
            }
        )
        e["qcm"] = {
            "nbQuestions": len(questions),
            "themes": sorted({q["theme"] for q in questions if q["theme"]}),
            "multiples": sum(1 for q in questions if q["multiple"]),
            # Les questions que le corrige laisse sans reponse : signalees, pas
            # devinees — c'est le fichier qui est muet, pas le site.
            "sansReponse": sans_reponse,
            # Celles dont la reponse a ete RETROUVEE (cours du prof, corrige
            # d'une autre version) : elles portent leur source, et le site la
            # montre plutot que de la faire passer pour la reponse du fichier.
            "retrouvees": sum(1 for q in questions if q.get("source")),
        }

    # Ordre de lecture : la plus recente d'abord, corriges colles a leur sujet.
    def cle_tri(e):
        return (-(int((e["annee"] or "0000-0000")[:4])), e["titre"].lower())

    toutes.sort(key=cle_tri)

    for m in matieres:
        m["count"] = sum(1 for e in toutes if e["matiereSlug"] == m["slug"])
        m["annees"] = sorted({e["annee"] for e in toutes if e["matiereSlug"] == m["slug"] and e["annee"]}, reverse=True)

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": str(SOURCE),
        "matieres": matieres,
        "epreuves": toutes,
        "stats": {
            "matieres": len(matieres),
            "epreuves": len(toutes),
            "pages": sum(e["nbPages"] for e in toutes),
            "reconstruites": sum(1 for e in toutes if e["epreuve"] and e["epreuve"].get("parties")),
            "qcm": len(qcms),
            "questions": sum(len(q["questions"]) for q in qcms)
            + sum(
                len(p["questions"])
                for e in toutes
                if e["epreuve"]
                for p in e["epreuve"].get("parties", [])
            ),
            "octets": sum(e["octets"] for e in toutes),
        },
    }
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    OUT_QCM.write_text(
        json.dumps({"generatedAt": payload["generatedAt"], "qcm": qcms}, ensure_ascii=False),
        encoding="utf-8",
    )

    poids = sum(f.stat().st_size for f in OUT_DIR.rglob("*") if f.is_file()) / 1024 / 1024
    muettes = [e["id"] for e in toutes if not e["epreuve"] and not e.get("qcm")]
    print(f"\n  Annales indexées : {SOURCE}")
    print(f"  {len(matieres)} matières · {len(toutes)} épreuves · {payload['stats']['pages']} pages")
    print(
        f"  {payload['stats']['reconstruites']} sujets reconstruits · {len(qcms)} QCM"
        f" · {payload['stats']['questions']} questions ({transcrites} blocs transcrits)"
    )
    if muettes:
        print(f"  {len(muettes)} épreuves encore en images seules :")
        for m in muettes:
            print(f"      {m}")
    print(f"  -> public/annales.json + annales-qcm.json + public/annales/ ({poids:.1f} Mo)\n")


if __name__ == "__main__":
    main()
