"""
Erzeugt die winzige Schrift "Athena Balken" fuer den Balken-Stil der versteckten Zahlen
(globals.css, Abschnitt "Praesentations-Modus").

Jedes Zeichen wird zu einem massiven Block; nebeneinander ergeben sie EINEN geschlossenen
Balken in ungefaehr der Breite der echten Zahl (Ziffern/Waehrungen 0,6 em, Punkt/Komma 0,3 em,
Prozent 0,8 em). Warum eine Schrift statt `text-decoration: line-through`: eine Dekoration kann
nur EINE Volltonfarbe, ein Hintergrund wuerde bei Block-Elementen die ganze Zeile fuellen.
Mit Glyphen als Form klappt `background-clip: text` — der Farbverlauf liegt genau auf dem
Balken. Gleicher Block fuer alles heisst: sichtbar ist nur die Laenge, nie die Zeichen.

Aufruf (braucht `pip install fonttools`):
    python scripts/baue-balken-font.py            -> gibt die Base64-Daten fuer die @font-face aus
    python scripts/baue-balken-font.py out.ttf    -> schreibt zusaetzlich die TTF-Datei

Das Ergebnis steht als Data-URI in globals.css (kein Netzwerkabruf: eine nachladende Schrift
wuerde die echten Ziffern kurz zeigen, bevor der Balken da ist).
"""
import base64
import io
import sys

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

UEBERLAPP = 70          # Nachbarbloecke ueberlappen deutlich: sonst Naehte, wo zwei weichgezeichnete Kanten aufeinandertreffen
Y0, Y1 = -60, 720       # Balkenhoehe 0,78 em, um die Ziffernmitte zentriert

BREITEN = {
    "voll": 600,        # Ziffern, Buchstaben, Waehrungen, Plus/Minus
    "schmal": 300,      # . , : ’
    "breit": 800,       # %
}


def codepoints():
    schmal = [0x2E, 0x2C, 0x3A, 0x2019]
    breit = [0x25]
    voll = list(range(0x30, 0x3A)) + [0x2B, 0x2D, 0x2212, 0x20AC, 0x24, 0xA3]
    voll += list(range(0x41, 0x5B)) + list(range(0x61, 0x7B))
    return {"voll": voll, "schmal": schmal, "breit": breit}


def block(breite):
    pen = TTGlyphPen(None)
    x0, x1 = -UEBERLAPP, breite + UEBERLAPP
    # Uhrzeigersinn = Aussenkontur (TrueType)
    pen.moveTo((x0, Y0))
    pen.lineTo((x0, Y1))
    pen.lineTo((x1, Y1))
    pen.lineTo((x1, Y0))
    pen.closePath()
    return pen.glyph()


def baue():
    namen = [".notdef"] + list(BREITEN)
    cmap = {}
    for gruppe, cps in codepoints().items():
        for cp in cps:
            cmap[cp] = gruppe
    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(namen)
    fb.setupCharacterMap(cmap)
    glyphen = {".notdef": TTGlyphPen(None).glyph()}
    metriken = {".notdef": (600, 0)}
    for gruppe, breite in BREITEN.items():
        glyphen[gruppe] = block(breite)
        metriken[gruppe] = (breite, -UEBERLAPP)
    fb.setupGlyf(glyphen)
    fb.setupHorizontalMetrics(metriken)
    # Ascent + Descent = genau 1 em: bei Inline-Elementen ist die Hintergrundflaeche damit exakt
    # so hoch wie die Schrift, der Verlauf liegt also deckungsgleich auf dem Balken.
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable({"familyName": "Athena Balken", "styleName": "Regular"})
    fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, sTypoLineGap=0, usWinAscent=800, usWinDescent=200)
    fb.setupPost()
    return fb.font


if __name__ == "__main__":
    puffer = io.BytesIO()
    baue().save(puffer)
    daten = puffer.getvalue()
    if len(sys.argv) > 1:
        with open(sys.argv[1], "wb") as f:
            f.write(daten)
    print(base64.b64encode(daten).decode())
