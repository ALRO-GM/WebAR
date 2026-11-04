"""Genera src/data/elements.ts a partir de fuentes públicas.

Uso (descarga en una carpeta aparte y pasa las rutas):

    curl -fsSL -o pubchem.csv 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/periodictable/CSV'
    curl -fsSL -o radios.html 'https://en.wikipedia.org/wiki/Atomic_radii_of_the_elements_(data_page)'
    python3 -I scripts/generar-elementos.py pubchem.csv radios.html > src/data/elements.ts

Fuentes:
- PubChem (NIH, dominio público): masa atómica, configuración electrónica,
  color CPK, familia.
- Wikipedia, «Atomic radii of the elements (data page)»: radio calculado
  (Clementi et al., 1967), del 1 al 86. Del 87 al 118, estimado (ver estimar).

Correcciones a mano (marcadas abajo): isótopo más abundante cuando no coincide
con la masa media redondeada, colores que faltan y la configuración de Lr.
"""
import csv
import json
import re
import sys
from html.parser import HTMLParser

NOMBRES = """Hidrógeno Helio Litio Berilio Boro Carbono Nitrógeno Oxígeno Flúor Neón
Sodio Magnesio Aluminio Silicio Fósforo Azufre Cloro Argón Potasio Calcio
Escandio Titanio Vanadio Cromo Manganeso Hierro Cobalto Níquel Cobre Zinc
Galio Germanio Arsénico Selenio Bromo Kriptón Rubidio Estroncio Itrio Circonio
Niobio Molibdeno Tecnecio Rutenio Rodio Paladio Plata Cadmio Indio Estaño
Antimonio Telurio Yodo Xenón Cesio Bario Lantano Cerio Praseodimio Neodimio
Prometio Samario Europio Gadolinio Terbio Disprosio Holmio Erbio Tulio Iterbio
Lutecio Hafnio Tantalio Wolframio Renio Osmio Iridio Platino Oro Mercurio
Talio Plomo Bismuto Polonio Astato Radón Francio Radio Actinio Torio
Protactinio Uranio Neptunio Plutonio Americio Curio Berkelio Californio Einstenio Fermio
Mendelevio Nobelio Lawrencio Rutherfordio Dubnio Seaborgio Bohrio Hasio Meitnerio Darmstatio
Roentgenio Copernicio Nihonio Flerovio Moscovio Livermorio Teneso Oganesón""".split()

FAMILIAS = {
    'Nonmetal': 'no-metal', 'Noble gas': 'gas-noble', 'Alkali metal': 'alcalino',
    'Alkaline earth metal': 'alcalinoterreo', 'Metalloid': 'metaloide', 'Halogen': 'halogeno',
    'Post-transition metal': 'metal-postransicion', 'Transition metal': 'metal-transicion',
    'Lanthanide': 'lantanido', 'Actinide': 'actinido',
}

# Isótopo más abundante en la naturaleza, cuando no es la masa media redondeada.
ISOTOPO_MAS_ABUNDANTE = {
    28: 58, 29: 63, 30: 64, 31: 69, 32: 74, 34: 80, 35: 79, 40: 90, 42: 98, 44: 102,
    47: 107, 48: 114, 50: 120, 51: 121, 52: 130, 54: 132, 56: 138, 60: 142, 62: 152,
    63: 153, 64: 158, 66: 164, 68: 166, 70: 174, 72: 180, 75: 187, 76: 192, 77: 193,
    80: 202, 81: 205, 82: 208,
    118: 294,  # el único isótopo observado
}
# Sin isótopos estables: el número másico es el del isótopo de vida más larga.
RADIACTIVOS = {43, 61} | set(range(84, 119))

COLORES = {46: '006985', 68: '00E675'}  # Pd viene mal y Er vacío (colores Jmol)
SIN_COLOR = 'E8E8E8'                      # del 110 en adelante no hay color CPK

CONFIG = {103: '[Rn]7s2 5f14 7p1'}  # medida en 2015: 7p1, no 6d1

# Huecos de la tabla larga para calcular grupo y periodo.
def grupo_y_periodo(z):
    limites = [(2, 1), (10, 2), (18, 3), (36, 4), (54, 5), (86, 6), (118, 7)]
    periodo = next(p for lim, p in limites if z <= lim)
    if 57 <= z <= 71 or 89 <= z <= 103:
        return None, periodo  # lantánidos y actínidos: fuera de los grupos
    inicio = {1: 1, 2: 3, 3: 11, 4: 19, 5: 37, 6: 55, 7: 87}[periodo]
    i = z - inicio
    if periodo == 1:
        return (1 if z == 1 else 18), 1
    if periodo in (2, 3):
        return (i + 1 if i < 2 else i + 11), periodo
    if periodo in (4, 5):
        return i + 1, periodo
    if i < 2:
        return i + 1, periodo
    return i - 14 + 1, periodo  # tras los 15 de la serie f (el 3.º va con ellos)


class Tabla(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tablas, self.fila, self.celda, self.sup = [], None, None, 0
    def handle_starttag(self, tag, attrs):
        if tag == 'table': self.tablas.append([])
        elif tag == 'tr' and self.tablas: self.fila = []; self.tablas[-1].append(self.fila)
        elif tag in ('td', 'th') and self.fila is not None: self.celda = []
        elif tag == 'sup': self.sup += 1
    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self.celda is not None:
            self.fila.append(''.join(self.celda).strip()); self.celda = None
        elif tag == 'sup': self.sup -= 1
    def handle_data(self, data):
        if self.celda is not None and not self.sup: self.celda.append(data)


def radios_calculados(ruta):
    t = Tabla(); t.feed(open(ruta, encoding='utf8').read())
    filas = max(t.tablas, key=len)
    radios = {}
    for f in filas:
        if f and f[0].isdigit() and len(f) > 4 and re.fullmatch(r'\d+', f[4] or ''):
            radios[int(f[0])] = int(f[4])
    return radios


ORDEN = '1s 2s 2p 3s 3p 4s 3d 4p 5s 4d 5p 6s 4f 5d 6p 7s 5f 6d 7p'.split()

def expandir(config, configs):
    config = config.replace('(predicted)', '').replace('(calculated)', '').strip()
    m = re.match(r'\[(\w+)\]\s*(.*)', config)
    capas = {}
    if m:
        nucleo = next(z for z, (s, _) in configs.items() if s == m.group(1))
        capas.update(expandir(configs[nucleo][1], configs))
        config = m.group(2)
    for n, l, e in re.findall(r'(\d)([spdf])(\d+)', config):
        capas[n + l] = int(e)
    return capas

# Reglas de Slater: carga efectiva y radio del electrón más externo.
GRUPOS = '1s|2sp|3sp|3d|4sp|4d|4f|5sp|5d|5f|6sp|6d|7sp'.split('|')
N_EF = {1: 1, 2: 2, 3: 3, 4: 3.7, 5: 4.0, 6: 4.2, 7: 4.4}

def grupo_slater(sub):
    n, l = sub[0], sub[1]
    return n + ('sp' if l in 'sp' else l) if sub != '1s' else '1s'

def radio_slater(capas, z):
    externo = max(capas, key=lambda s: (int(s[0]), 'spdf'.index(s[1])))
    g = grupo_slater(externo); n = int(externo[0])
    idx = GRUPOS.index(g)
    apant = 0.0
    for sub, e in capas.items():
        gs = grupo_slater(sub); i = GRUPOS.index(gs)
        if gs == g:
            apant += (e - (1 if sub == externo else 0)) * (0.30 if g == '1s' else 0.35)
        elif i < idx:
            if g.endswith('sp'):
                ns = int(sub[0])
                apant += e * (0.85 if ns == n - 1 else 1.0)
            else:
                apant += e * 1.0
    zef = z - apant
    return N_EF[n] ** 2 / zef * 52.9


def main():
    filas = list(csv.DictReader(open(sys.argv[1], encoding='utf8')))
    calc = radios_calculados(sys.argv[2])
    configs = {int(f['AtomicNumber']): (f['Symbol'], CONFIG.get(int(f['AtomicNumber']), f['ElectronConfiguration'])) for f in filas}
    capas = {z: expandir(c, configs) for z, (_, c) in configs.items()}
    for z, c in capas.items():
        assert sum(c.values()) == z, (z, c)

    # Del 87 en adelante no hay radio calculado: se parte del elemento de su
    # misma columna en el periodo 6 (z - 32) y se corrige con el cociente de los
    # radios de Slater de ambos. Así se conserva la tendencia del grupo.
    def estimar(z):
        base = z - 32
        return calc[base] * radio_slater(capas[z], z) / radio_slater(capas[base], base)

    elementos = []
    for f in filas:
        z = int(f['AtomicNumber'])
        masa = float(f['AtomicMass'])
        a = ISOTOPO_MAS_ABUNDANTE.get(z, round(masa))
        grupo, periodo = grupo_y_periodo(z)
        config = CONFIG.get(z, f['ElectronConfiguration'])
        estimado = z not in calc
        elementos.append({
            'z': z,
            'symbol': f['Symbol'],
            'name': NOMBRES[z - 1],
            'nameEn': f['Name'],
            'atomicMass': masa,
            'massNumber': a,
            'radioactive': z in RADIACTIVOS,
            'family': FAMILIAS[f['GroupBlock']],
            'group': grupo,
            'period': periodo,
            'color': '#' + (COLORES.get(z) or f['CPKHexColor'] or SIN_COLOR).zfill(6).lower(),
            'radius': calc[z] if not estimado else round(estimar(z)),
            'radiusEstimated': estimado,
            'configuration': re.sub(r'\s*\((predicted|calculated)\)', '', config).replace('] ', ']'),
            'configurationPredicted': '(predicted)' in config or '(calculated)' in config,
        })

    print('// Generado por scripts/generar-elementos.py: no editar a mano.')
    print('// Fuentes: PubChem (NIH) y Wikipedia, «Atomic radii of the elements (data page)».')
    print("import type { ElementData } from '../types';")
    print()
    print('export const ELEMENTS: readonly ElementData[] = [')
    for e in elementos:
        print('  ' + json.dumps(e, ensure_ascii=False, separators=(', ', ': ')) + ',')
    print('];')


main()
