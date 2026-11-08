"""Generate the offline-signing key-screen mocks. Approved texts are read from
consequence-texts.md, never retyped, so a mock cannot reword them."""
import random, re, sys, pathlib, html

ROOT = pathlib.Path(sys.argv[1])
OUT = pathlib.Path(sys.argv[2])
CT = (ROOT / '_bmad-output/specs/spec-offline-signing/consequence-texts.md').read_text()
esc = html.escape

# ---------- approved text parsing ----------
def section(start, stop_pat=r'^#{2,3} '):
    lines = CT.splitlines()
    i = next(k for k, l in enumerate(lines) if l.startswith(start))
    out = []
    for l in lines[i + 1:]:
        if re.match(stop_pat, l):
            break
        out.append(l)
    return out

def items(lines):
    """[{'text': str, 'steps': [str]}] from a bullet list with wrapped lines."""
    res = []
    for l in lines:
        m = re.match(r'^  (\d)\. (.*)', l)
        if l.startswith('- '):
            res.append({'text': l[2:], 'steps': []})
        elif m and res:
            res[-1]['steps'].append(m.group(2))
        elif l.startswith('     ') and res and res[-1]['steps']:
            res[-1]['steps'][-1] += ' ' + l.strip()
        elif l.startswith('  ') and res:
            res[-1]['text'] += ' ' + l.strip()
    return res

TEXT = {k: items(section(f'### Text {k}.')) for k in 'ABCDE'}
W = {}
for it in items(section('## Key warnings', r'^## (?!Key)')):
    m = re.match(r'\*\*(W\d)\. (.*?)\*\*(.*)', it['text'])
    if m:
        quotes = re.findall(r'"([^"]+)"', m.group(3))
        W[m.group(1)] = {'title': m.group(2), 'quote': quotes[-1], 'quotes': quotes}
SEED_NET = re.search(r'## One Seed on one Network[^\n]*\n\n"([^"]+)"', CT).group(1)

def render_text(key, ack=False):
    out, steps_html = [], ''
    plain = []
    for it in TEXT[key]:
        t = it['text']
        m = re.match(r'\*\*(.*?)\*\*(.*)', t)
        if m:
            if plain:
                out.append('<ul class="lines">' + ''.join(plain) + '</ul>'); plain = []
            out.append(alert('caution', 'Caution', f'<strong>{esc(m.group(1))}</strong>{esc(m.group(2))}', ack=ack))
        else:
            li = f'<li>{esc(t)}'
            if it['steps']:
                li += '<ol>' + ''.join(f'<li>{esc(s)}</li>' for s in it['steps']) + '</ol>'
            plain.append(li + '</li>')
    if plain:
        out.append('<ul class="lines">' + ''.join(plain) + '</ul>')
    return ''.join(out)

# ---------- primitives ----------
CSS = """
/* Governing spines: ../EXPERIENCE.md (Component Patterns, State Patterns, Key Flows)
   and ../DESIGN.md (kind-stamp, was-online-stamp, signing-network-well, qr-handoff-plate,
   scan-plate, tx-field-list, consequence-block, earlier-signing-record).
   Tokens copied from the repo-root DESIGN.md. Spines win on conflict. */
:root{--chassis:oklch(0.918 0.01 250);--ink:oklch(0.215 0.016 250);--plate:oklch(0.972 0.005 250);--key:oklch(0.255 0.018 250);--key-legend:oklch(0.97 0.004 250);--recess:oklch(0.878 0.012 250);--muted:oklch(0.47 0.016 250);--scribe:oklch(0.7 0.016 250);--edge:oklch(0.598 0.02 250);--readout:oklch(0.205 0.014 250);--readout-ink:oklch(0.975 0.004 250);--readout-muted:oklch(0.74 0.014 250);--commit:oklch(0.545 0.155 42);--commit-legend:oklch(0.99 0.004 60);--alert:oklch(0.545 0.205 27);--alert-legend:oklch(0.985 0.003 27);--caution:oklch(0.78 0.155 72);--caution-legend:oklch(0.2 0.02 72);--live:oklch(0.52 0.135 150);--live-legend:oklch(0.985 0.003 150);--t-alert:oklch(0.495 0.2 27);--t-caution:oklch(0.455 0.09 72);--t-live:oklch(0.45 0.12 150)}
@media (prefers-color-scheme: dark){:root{--chassis:oklch(0.214 0.009 125);--ink:oklch(0.945 0.005 125);--plate:oklch(0.268 0.010 125);--key:oklch(0.36 0.016 125);--key-legend:oklch(0.965 0.004 125);--recess:oklch(0.322 0.014 125);--muted:oklch(0.735 0.014 125);--scribe:oklch(0.47 0.018 125);--edge:oklch(0.56 0.022 125);--readout:oklch(0.108 0.008 125);--readout-ink:oklch(0.975 0.004 125);--readout-muted:oklch(0.735 0.014 125);--commit:oklch(0.66 0.17 42);--commit-legend:oklch(0.18 0.02 42);--alert:oklch(0.69 0.185 25);--alert-legend:oklch(0.165 0.01 25);--caution:oklch(0.79 0.155 72);--caution-legend:oklch(0.19 0.02 72);--live:oklch(0.7 0.14 150);--live-legend:oklch(0.165 0.01 150);--t-alert:oklch(0.72 0.17 25);--t-caution:oklch(0.8 0.13 72);--t-live:oklch(0.76 0.13 150)}}
*{box-sizing:border-box}
body{margin:0;background:var(--chassis);color:var(--ink);font:400 0.875rem/1.375 "Barlow Semi Condensed",ui-sans-serif,system-ui,sans-serif;padding:16px}
h1.page{font-size:1rem;letter-spacing:.08em;text-transform:uppercase;margin:0 0 4px}
p.intro{color:var(--muted);max-width:60rem;margin:0 0 16px}
.row{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start;margin:0 0 28px;padding-bottom:20px;border-bottom:1px solid var(--scribe)}
.row>.cap{flex-basis:100%;color:var(--muted);font-size:.75rem;margin:0}
.row>.cap b{color:var(--ink)}
.dev{flex:0 1 340px;min-width:0;display:flex;flex-direction:column;gap:6px}
.dev>.who{font:600 .6875rem/1.1 inherit;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.phone{border:1px solid var(--scribe);border-radius:3px;background:var(--chassis);padding:10px 12px 16px;display:flex;flex-direction:column;gap:12px;box-shadow:0 1px 3px -1px rgb(0 0 0/.3)}
.hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--scribe);padding-bottom:8px;gap:8px;flex-wrap:wrap}
.nameplate{font-weight:600;font-size:.75rem;letter-spacing:.22em;text-transform:uppercase}
.tabs{display:grid;gap:0;border-bottom:1px solid var(--scribe)}
.tabs span{font-weight:600;font-size:.6875rem;letter-spacing:.11em;text-transform:uppercase;color:var(--muted);text-align:center;padding:6px 4px 8px}
.tabs span.on{color:var(--ink);box-shadow:inset 0 -2px 0 var(--ink)}
.plate{background:var(--plate);border:1px solid var(--scribe);border-radius:2px;padding:12px 16px 16px;display:flex;flex-direction:column;gap:10px;box-shadow:0 1px 0 0 color-mix(in oklab,var(--ink) 6%,transparent),0 1px 3px -1px color-mix(in oklab,var(--ink) 12%,transparent)}
.legend{font-weight:600;font-size:.6875rem;line-height:1.1;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:0}
.wname{font-weight:600;font-size:.9375rem;line-height:1.25;margin:0;overflow-wrap:anywhere}
.data{font-family:"Azeret Mono",ui-monospace,"Cascadia Mono",monospace;font-size:.8125rem;letter-spacing:-.025em;font-variant-numeric:tabular-nums slashed-zero;overflow-wrap:anywhere}
.cap2{font-size:.75rem;color:var(--muted);margin:0}
.stamps{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.stamp{font-weight:600;font-size:.6875rem;letter-spacing:.14em;text-transform:uppercase;border:1px solid var(--edge);border-radius:1px;padding:1px 6px;line-height:1.3}
.stamp.warn{background:var(--caution);color:var(--caution-legend);border-color:var(--caution)}
.netlabel{font-weight:600;font-size:.6875rem;letter-spacing:.1em;text-transform:uppercase}
.lamp{display:inline-flex;align-items:center;gap:6px;font-weight:600;font-size:.6875rem;letter-spacing:.1em;text-transform:uppercase;color:var(--t-live)}
.lamp::before{content:"";width:8px;height:8px;border-radius:9999px;background:var(--live);box-shadow:0 0 0 1px color-mix(in oklab,var(--ink) 22%,transparent),0 0 6px 0 var(--live)}
.lamp.off{color:var(--muted)}.lamp.off::before{background:var(--scribe);box-shadow:0 0 0 1px color-mix(in oklab,var(--ink) 22%,transparent)}
.recess{background:var(--chassis);border:1px solid var(--scribe);border-radius:2px;padding:8px 12px;box-shadow:inset 0 1px 3px 0 color-mix(in oklab,var(--ink) 18%,transparent);display:flex;flex-direction:column;gap:6px}
.keys{display:flex;flex-wrap:wrap;gap:8px}
.k{font-weight:600;font-size:.8125rem;letter-spacing:.09em;text-transform:uppercase;min-height:2.25rem;padding:6px 16px;border-radius:2px;border:1px solid var(--key);background:var(--key);color:var(--key-legend);box-shadow:inset 0 1px 0 0 rgb(255 255 255/.18),0 1px 2px 0 rgb(0 0 0/.28);cursor:default;text-align:center}
.k.out{background:var(--plate);color:var(--ink);border-color:var(--edge);box-shadow:inset 0 1px 0 0 rgb(255 255 255/.45),0 1px 1px 0 rgb(0 0 0/.12)}
.k.commit{background:var(--commit);border-color:var(--commit);color:var(--commit-legend)}
.k.danger{background:var(--plate);color:var(--t-alert);border-color:color-mix(in oklab,var(--alert) 55%,transparent)}
.k.dis{opacity:.55}
.k.sm{font-size:.6875rem;min-height:2rem;padding:4px 12px}
.why{font-size:.75rem;color:var(--muted);margin:0}
.al{border:1px solid color-mix(in oklab,var(--c) 58%,transparent);border-radius:2px;background:var(--plate);padding:8px 12px 10px;box-shadow:inset 0 1px 2px 0 rgb(0 0 0/.10)}
.al .lt{display:inline-flex;align-items:center;gap:5px;font-weight:600;font-size:.6875rem;letter-spacing:.14em;text-transform:uppercase;background:var(--c);color:var(--cl);padding:2px 6px;border-radius:1px;margin-bottom:6px}
.al .lt::before{content:"";width:6px;height:6px;border-radius:9999px;background:currentColor}
.al p{margin:0;color:var(--ct);overflow-wrap:anywhere}
.al.caution{--c:var(--caution);--cl:var(--caution-legend);--ct:var(--t-caution)}
.al.alert{--c:var(--alert);--cl:var(--alert-legend);--ct:var(--t-alert)}
.al.live{--c:var(--live);--cl:var(--live-legend);--ct:var(--t-live)}
.al.note{--c:var(--key);--cl:var(--key-legend);--ct:var(--ink)}
.ack{display:flex;gap:8px;align-items:flex-start;margin-top:8px;color:var(--ink);font-size:.8125rem}
.ack i{flex:none;width:16px;height:16px;border:1px solid var(--edge);border-radius:1px;background:var(--chassis);margin-top:1px;display:grid;place-items:center;font-style:normal;font-size:12px;line-height:1}
ul.lines,ol{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px}
ol{margin-top:4px}
.radio{display:flex;flex-direction:column;gap:6px}
.radio label{display:flex;gap:8px;align-items:center}
.radio i{width:16px;height:16px;border-radius:9999px;border:1px solid var(--edge);background:var(--chassis);display:grid;place-items:center}
.radio i.on::after{content:"";width:8px;height:8px;border-radius:9999px;background:var(--ink)}
.field{display:flex;flex-direction:column;gap:4px}
.field .in{background:var(--chassis);border:1px solid var(--edge);border-radius:2px;min-height:2.25rem;padding:6px 10px;box-shadow:inset 0 1px 2px 0 rgb(0 0 0/.14)}
dl.fl{margin:0;display:flex;flex-direction:column;gap:8px}
dl.fl>div{display:flex;flex-direction:column;gap:2px}
dl.fl dt{font-weight:600;font-size:.6875rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
dl.fl dd{margin:0}
.well{background:var(--readout);color:var(--readout-ink);border-radius:2px;padding:12px 16px 16px;box-shadow:inset 0 2px 5px -1px rgb(0 0 0/.55),inset 0 0 0 1px rgb(0 0 0/.25),inset 0 -1px 0 0 rgb(255 255 255/.07)}
.well .wl{font-weight:600;font-size:.6875rem;letter-spacing:.14em;text-transform:uppercase;color:var(--readout-muted)}
.well .pre{font-family:"Azeret Mono",ui-monospace,monospace;font-size:1rem;color:var(--readout-muted);margin-top:6px;letter-spacing:-.025em}
.well .big{font-family:"Azeret Mono",ui-monospace,monospace;font-weight:500;font-size:clamp(2.25rem,11vw,3rem);line-height:1.02;letter-spacing:-.035em}
.well .marks{border-top:1px solid color-mix(in oklab,var(--readout-ink) 25%,transparent);margin-top:10px;padding-top:8px;display:flex;flex-direction:column;gap:2px;font-family:"Azeret Mono",ui-monospace,monospace;font-size:.8125rem;color:var(--readout-muted)}
.qr{align-self:center;background:#fff;padding:6px;border-radius:0;line-height:0}
.scan{border:1px dashed var(--edge);border-radius:2px;padding:10px;display:flex;flex-direction:column;gap:8px;background:var(--chassis)}
.count{font-size:.75rem;color:var(--muted);margin:0}
.title{font-weight:600;font-size:.6875rem;letter-spacing:.14em;text-transform:uppercase;margin:0}
.ok{color:var(--t-live)}
.idle{color:var(--muted);font-style:italic;font-size:.8125rem;margin:0}
.rec{background:var(--recess);border-radius:2px;padding:8px 12px;box-shadow:inset 0 1px 2px 0 rgb(0 0 0/.14)}
"""

def qr(seed, label, modules=29, px=5):
    rnd = random.Random(seed)
    cells = []
    def finder(x, y):
        for i in range(7):
            for j in range(7):
                on = i in (0, 6) or j in (0, 6) or (2 <= i <= 4 and 2 <= j <= 4)
                if on: cells.append((x + i, y + j))
    fz = set()
    for (fx, fy) in ((0, 0), (modules - 7, 0), (0, modules - 7)):
        finder(fx, fy)
        fz |= {(fx + i, fy + j) for i in range(-1, 8) for j in range(-1, 8)}
    for i in range(modules):
        for j in range(modules):
            if (i, j) not in fz and rnd.random() < .5: cells.append((i, j))
    s = modules * px
    rects = ''.join(f'<rect x="{x*px}" y="{y*px}" width="{px}" height="{px}"/>' for x, y in cells)
    return f'<div class="qr"><svg role="img" aria-label="{esc(label)}" width="{s}" height="{s}" viewBox="0 0 {s} {s}"><g fill="#000">{rects}</g></svg></div>'

def alert(tone, word, body_html, ack=False):
    a = '<div class="ack"><i aria-hidden="true">✓</i><span>I read this warning.</span></div>' if ack else ''
    return f'<div class="al {tone}"><span class="lt">{word}</span><p>{body_html}</p>{a}</div>'

def stamps(kind, net, was=False):
    s = f'<span class="stamp">{kind}</span>'
    if was: s += '<span class="stamp warn">Was online</span>'
    s += f'<span class="netlabel">{net}</span>'
    if net == 'Mainnet': s += '<span class="stamp warn">Real funds</span>'
    return f'<div class="stamps">{s}</div>'

def plate(title, body, h='h2'):
    t = f'<{h} class="legend">{esc(title)}</{h}>' if title else ''
    return f'<section class="plate">{t}{body}</section>'

def k(text, v='', why=''):
    w = f'<p class="why">{esc(why)}</p>' if why else ''
    return f'<span class="k {v}">{esc(text)}</span>{w}'

def keys(*ks):
    return '<div class="keys">' + ''.join(ks) + '</div>'

def fl(rows):
    out = ''
    for t, v, *rest in rows:
        cls = 'data' if (rest[0] if rest else True) else ''
        out += f'<div><dt>{esc(t)}</dt><dd class="{cls}">{v}</dd></div>'
    return f'<dl class="fl">{out}</dl>'

TABS = {
    'online': ['Balances', 'Send', 'Receive', 'History', 'Tokens', 'Local settings'],
    'offline': ['New transaction', 'Sign', 'Receive', 'Signed', 'Local settings'],
    'tx-unsynced': ['Transmit', 'Local settings'],
    'tx': ['Transmit', 'Account', 'History', 'New transaction', 'Local settings'],
}

def phone(who, body, tabs=None, active=None, wallet=None, kind=None, net='Mainnet', was=False):
    hdr = '<div class="hdr"><span class="nameplate">XRPL Bench</span>'
    if wallet:
        hdr += f'<span class="k out sm">Wallets</span>'
    hdr += '</div>'
    head = ''
    if wallet:
        head = f'<div style="display:flex;flex-direction:column;gap:6px"><p class="wname">{esc(wallet)}</p>{stamps(kind, net, was)}</div>'
    tb = ''
    if tabs:
        t = TABS[tabs]
        cols = 3 if len(t) >= 5 else len(t)
        tb = f'<div class="tabs" style="grid-template-columns:repeat({cols},1fr)">' + ''.join(
            f'<span class="{"on" if x == active else ""}">{x}</span>' for x in t) + '</div>'
    return f'<div class="dev"><span class="who">{esc(who)}</span><div class="phone">{hdr}{head}{tb}{body}</div></div>'

def row(caption, *devs):
    return f'<div class="row"><p class="cap">{caption}</p>{"".join(devs)}</div>'

def page(fname, title, intro, rows):
    doc = f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{esc(title)}</title><style>{CSS}</style></head><body><h1 class="page">{esc(title)}</h1><p class="intro">{intro}</p>{"".join(rows)}</body></html>'
    (OUT / fname).write_text(doc)

def well(net, marks):
    m = ''.join(f'<span>{esc(x)}</span>' for x in marks)
    return (f'<div class="well"><div class="wl" aria-hidden="true">Network</div>'
            f'<h2 style="margin:0;font-weight:inherit"><span class="pre" style="display:block">You are signing for</span> <span class="big" style="display:block;overflow-wrap:anywhere">{net}</span></h2>'
            f'<div class="marks">{m}</div></div>')

def qrplate(title, net, count, lines, seed, extra=''):
    ls = ''.join(f'<p class="cap2" style="color:var(--ink)">{esc(x)}</p>' for x in lines)
    return plate('', f'<h2 class="title">{esc(title)}</h2>{stamps_net(net)}{qr(seed, f"QR code: {title.lower()}, {net}")}<p class="count">{count}</p>{keys(k('Show larger', 'out sm'))}{ls}{extra}')

def stamps_net(net):
    s = f'<span class="netlabel">{net}</span>' + ('<span class="stamp warn">Real funds</span>' if net == 'Mainnet' else '')
    return f'<div class="stamps">{s}</div>'

def scanplate(title, line, count, state='ready', extra=''):
    inner = (f'<span class="k out sm">Scan {esc(title)} with the camera</span>'
             f'<div class="field"><span class="legend">Or paste it</span><div class="in"></div></div>')
    return plate('', f'<h2 class="title">Scan {esc(title)}</h2><p class="count">{count}</p><p class="cap2" style="color:var(--ink)">{esc(line)}</p><div class="scan">{inner}</div>{extra}')

ADDR = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
def picker(sel, more=False):
    types = ['Payment', 'Trust line', 'Regular Key', 'Master key'] + (['Other writes…'] if more else [])
    opts = ''.join(f'<span class="k {"" if t == sel else "out"} sm">{t}</span>' for t in types)
    return plate('New transaction', '<p class="cap2">Type</p><div class="keys" role="radiogroup">' + opts + '</div>')
DEST = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
REGK = 'rGWrZyQqhTp9Xu7G5Pkayo7bXjH4k4QYpf'
HASH = 'E3FE6EA3D48F0C2B639448020EA4F03D4F4F8FFDB243A852A0F59177921B4879'

P1 = '<span>Comes from the Transmitter.</span>'

# ---------- 1. create quiz kind step ----------
def kind_radios(sel):
    def r(lbl, on):
        return f'<label><i class="{"on" if on else ""}"></i>{lbl}</label>'
    return (f'<fieldset class="radio" style="border:0;padding:0;margin:0"><legend class="title" style="margin-bottom:6px">Online wallet or offline wallet?</legend>'
            f'{r("Online wallet", sel=="online")}{r("Offline wallet", sel=="offline")}</fieldset>')

def quiz(step, n, title, body, nxt=('Next', '', '')):
    return (f'<p class="count">Step {step} of {n}</p><h2 class="legend" style="color:var(--ink)">{esc(title)}</h2>'
            f'{body}{keys(k("Back","out"), k(*nxt))}')

path = '<fieldset class="radio" style="border:0;padding:0;margin:0"><label><i class="on"></i>Create a new wallet</label><label><i></i>Import a wallet</label></fieldset>'
path_imp = '<fieldset class="radio" style="border:0;padding:0;margin:0"><label><i></i>Create a new wallet</label><label><i class="on"></i>Import a wallet</label></fieldset>'
lblnet = ('<div class="field"><span class="legend">Label</span><div class="in">Savings</div></div>'
          '<div class="field"><span class="legend">Network</span><div class="in" style="display:flex;flex-wrap:wrap;gap:6px"><span class="k sm">Mainnet</span><span class="k out sm">Testnet</span><span class="k out sm">Devnet</span></div></div>')

page('key-create-kind-step.html', 'Create quiz: the kind step',
     'OS-FR-2, OS-FR-7, OS-FR-8, OS-FR-23. Step 1 asks the kind right after Create or Import and before Label and Network. Texts are copied from consequence-texts.md by the generator, never retyped.',
     [row('<b>Online chosen.</b> Text A shows in place. No acknowledgement.',
          phone('Add wallet — step 1', plate('', quiz(1, 8, 'Create or import', path + kind_radios('online') + render_text('A') + lblnet)))),
      row('<b>Offline chosen.</b> Text B: six lines, then each WARNING as its own caution with its checkbox. Next waits on both boxes (P-7). Left: not yet ticked. The walk that follows has no Node step: 7 steps, where Online has 8.',
          phone('Add wallet — step 1, before ticking', plate('', quiz(1, 7, 'Create or import', path + kind_radios('offline') + render_text('B', ack=False).replace('</p></div>', '</p><div class="ack"><i aria-hidden="true"></i><span>I read this warning.</span></div></div>') + lblnet, ('Next', 'dis', 'Read and tick each warning to continue.'))))),
      row('<b>Import + Offline.</b> Text E above the Seed field, acknowledged.',
          phone('Add wallet — step 1, import', plate('', quiz(1, 5, 'Create or import', path_imp + kind_radios('offline') + '<p class="cap2">Text B shows here as above (not repeated in this frame).</p>' + render_text('E', ack=True) + lblnet + '<div class="field"><span class="legend">Seed</span><div class="in data">s••••••••••••••••••••••••••••</div></div>')))),
      row('<b>Optional step: Signs for (OS-FR-20).</b> Unticked by default; ticked, it asks for the Account address.',
          phone('Add wallet — step 6', plate('', quiz(6, 7, 'This key signs for another account', '<label class="ack" style="margin:0"><i aria-hidden="true">✓</i><span>This key signs for another account</span></label><div class="field"><span class="legend">Account address</span><div class="in data">' + ADDR + '</div></div><p class="cap2">This key must be the Regular Key of that account.</p>')))),
      row('<b>Review.</b> The OS-FR-23 warning sits above the final key, for every kind that holds a Seed, create and import.',
          phone('Add wallet — Review', plate('', quiz(7, 7, 'Review', fl([('Kind', 'Offline wallet', False), ('Label', 'Savings', False), ('Network', 'Mainnet', False), ('Seed Method', 'Stored Seed', False), ('Open Check', 'App PIN', False), ('Auto-lock', '5 minutes', False), ('Signing Check', 'App PIN', False)]) + alert('caution', 'Caution', esc(SEED_NET)), ('Create', '', ''))))),
      ])

# ---------- 2. chooser + transmitter ----------
def card(name, state, kind, net, addr, was=False, extra='', link=True):
    lamp = f'<span class="lamp {"" if state=="Open" else "off"}">{state}</span>'
    a = f'<span class="data" style="{"text-decoration:underline" if link else ""}">{addr}</span>' if addr else '<span class="cap2">Not synced</span>'
    return (f'<li class="plate" style="list-style:none"><p class="wname">{esc(name)}</p>{lamp}'
            f'<div class="recess">{stamps(kind, net, was)}<div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;align-items:center">{a}<span class="k out sm">Open</span></div></div>{extra}</li>')

chooser = ('<h1 class="legend" style="color:var(--ink);font-size:1rem">Wallets</h1><ul style="margin:0;padding:0;display:flex;flex-direction:column;gap:12px">'
           + card('Daily', 'Open', 'Online', 'Mainnet', 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH')
           + card('Savings', 'Locked', 'Offline', 'Mainnet', ADDR, was=True, link=False, extra='<p class="cap2">The key of this wallet was on a device that connected to the internet.</p>')
           + card('Savings (send)', 'Open', 'Transmitter', 'Mainnet', ADDR)
           + card('Practice relay', 'Locked', 'Transmitter', 'Testnet', None)
           + '</ul>' + keys(k('Add wallet', 'out'), k('Add Transmitter wallet', 'out')))

sync_step = plate('', quiz(4, 5, 'Sync to an address',
    '<p class="cap2" style="color:var(--ink)">Optional. You can sync later in Local settings.</p><div class="field"><span class="legend">Address</span><div class="in data">' + ADDR + '</div></div>'
    + '<span class="k out sm">Scan an address with the camera</span>'
    + alert('caution', 'Caution', '<strong>WARNING: An offline wallet on this device has this address.</strong> The offline key is then on a device that connects to the internet.')
    + keys(k('Skip this step', 'out'))))

balances = ('<div class="well"><div class="wl">XRP balance</div><div class="big">1 250.000</div><div class="marks"><span>Spendable 1 249.000</span><span>Reserved 1.000</span></div></div>'
            + plate('Trust lines', fl([('USD · rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B', '1 840.50')]))
            + plate('Key state', fl([('Regular Key', 'None', False), ('Master key', 'On', False), ('Signer list', 'None', False)]))
            + plate('Delegates', alert('caution', 'Caution', '<strong>WARNING: A delegate can send transactions for this account.</strong>')
                    + fl([('Delegate', 'rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv'), ('May do', 'Payment', False)]))
            + plate('Delegates — none', '<p>None.</p>') + plate('Delegates — read failed', '<p>Unknown. Could not read.</p>'))

transmit_tab = (plate('', '<h2 class="title">Transmit</h2><p>Scan a code from your offline wallet: a request for data to sign, or a signed transaction.</p>'
                '<div class="scan"><span class="k out sm">Scan a code with the camera</span><div class="field"><span class="legend">Or paste it</span><div class="in"></div></div></div>')
                + plate('Synced address', '<p>Not synced</p>' + keys(k('Sync to an address', 'out'))))

page('key-chooser-and-transmitter.html', 'Chooser cards, Transmitter Wallet and Sync',
     'OS-FR-1, OS-FR-3, OS-FR-4, OS-FR-22. The kind is a word on a stamp, never a colour. A locked card keeps its name, kind and Network (record fields, no read).',
     [row('<b>Chooser with all three kinds.</b> Offline card: no balance and no explorer link; "Was online" with its sentence. Transmitter card: the Synced address, or "Not synced". Two add keys.',
          phone('Chooser', chooser)),
      row('<b>Add Transmitter wallet, step 4.</b> Same-address warning (P-8): a warning, never a refusal. Earlier steps: Label + Network, Node, Open Check + auto-lock (required on Mainnet). No Seed, no Signing Check.',
          phone('Add Transmitter wallet', sync_step)),
      row('<b>Synced Transmitter, Account.</b> One read-only screen: balance, trust lines, key state, Delegates (shown in its three states).',
          phone('Transmitter, synced — Account', balances, tabs='tx', active='Account', wallet='Savings (send)', kind='Transmitter')),
      row('<b>Offline Wallet, Receive.</b> Only the address and its QR: no read, no balance, no funded check.',
          phone('Offline — Receive', plate('Receive', stamps_net('Mainnet') + qr(9, 'QR code: address of Savings, Mainnet') + '<p class="data" style="margin:0">' + ADDR + '</p>' + keys(k('Copy the address', 'out sm'))), tabs='offline', active='Receive', wallet='Savings', kind='Offline', was=True)),
      row('<b>Unsynced Transmitter.</b> Two tabs. It still answers requests and transmits.',
          phone('Transmitter, not synced', transmit_tab, tabs='tx-unsynced', active='Transmit', wallet='Practice relay', kind='Transmitter', net='Testnet')),
      ])

# ---------- 3. offline-builds route ----------
off = lambda who, body: phone(who, body, tabs='offline', active='New transaction', wallet='Savings', kind='Offline')
tx = lambda who, body: phone(who, body, tabs='tx', active='Transmit', wallet='Savings (send)', kind='Transmitter')

send_form = picker('Payment') + plate('Payment', '<div class="field"><span class="legend">Destination address</span><div class="in data">' + DEST + '</div></div>'
                  + '<div class="field"><span class="legend">Destination tag</span><div class="in data">50211</div></div>'
                  + '<div class="field"><span class="legend">Amount (XRP)</span><div class="in data">400</div></div>'
                  + fl([('Spendable', P1, False), ('Destination check', P1, False), ('Network fee', P1, False)])
                  + keys(k('Review')))
request = qrplate('Data to sign needed', 'Mainnet', 'Scan 1 of 3', ['Scan this code with the Transmitter wallet on your online device.'], 1,
                  keys(k('Change the transaction', 'out')) + '<p class="why">If you change the transaction, the request starts again.</p>')
data_scan = scanplate('the data to sign', 'Scan the data to sign from the Transmitter wallet.', 'Scan 2 of 3')
tx_scan = plate('', '<h2 class="title">Transmit</h2><p>Scan a code from your offline wallet: a request for data to sign, or a signed transaction.</p><div class="scan"><span class="k out sm">Stop the camera</span><p class="idle">Camera on — pointing at the old phone.</p></div>')
checks = plate('Checked on Mainnet', fl([('Account', ADDR), ('Destination', DEST + ' <span class="ok">exists</span>'), ('Destination tag', '<span class="ok">given</span> (50211)', False), ('Reserve and spendable', '<span class="ok">enough</span>', False), ('Fee', '0.000012 XRP, <span class="ok">under the fee limit</span>')]))
data_qr = qrplate('Data to sign', 'Mainnet', 'Scan 2 of 3', ['Scan this code with the offline wallet.'], 2)
review = (well('Mainnet', ['Window: about 10 minutes', 'Valid until ledger 91 204 377'])
          + plate('Transaction', fl([('Type', 'Payment', False), ('Account', ADDR), ('Destination', DEST), ('Destination tag', '50211'), ('Amount', '400 XRP'), ('Fee', '0.000012 XRP'), ('Sequence', '4128'), ('LastLedgerSequence', '91 204 377'), ('Flags', 'None', False)]))
          + keys(k('Sign'), k('Do not sign', 'out')))
signed = (qrplate('Signed transaction', 'Mainnet', 'Scan 3 of 3', ['This transaction is not sent. Scan this code with the Transmitter wallet to send it.', 'It is valid until ledger 91 204 377, about 10 minutes after 14:02.'], 3)
          + plate('Kept transaction', '<p>This device keeps the transaction until you mark the result. A lock erases it.</p>' + keys(k('The result is known', 'out'), k('Start the request again', 'out'), k('Cancel this transaction', 'out'))))
sending = plate('Transmit', fl([('Signature', '<span class="ok">correct</span>', False), ('Account', ADDR + ', as expected'), ('Network', 'Mainnet', False), ('Window', 'open until ledger 91 204 377')]))
ready = sending + plate('Transaction', fl([('Type', 'Payment', False), ('Destination', DEST), ('Amount', '400 XRP'), ('Fee', '0.000012 XRP')])) + keys(k('Send', 'commit'))
validated = sending + plate('', alert('live', 'Confirmed', 'Validated. 400 XRP sent to ' + DEST + '.') + fl([('Transaction hash', HASH)]))
expired = plate('', alert('alert', 'Error', 'Expired. Nothing was sent.'))

page('key-route-offline-builds.html', 'Offline-builds route, two devices (OS-UJ-1)',
     'OS-FR-11, OS-FR-13 to OS-FR-16, OS-FR-9. Left: Offline Wallet on the old phone. Right: Transmitter Wallet on the daily phone. Three scans, nothing typed twice (OS-SM-1). The side-by-side layout is for review only; each phone is its own screen.',
     [row('<b>1. Build.</b> New transaction → Payment. Every reading the online screen has reads "Comes from the Transmitter." (P-1).', off('Offline — Send', send_form), tx('Transmitter — Transmit tab', tx_scan)),
      row('<b>2. Request shown (Scan 1 of 3).</b> The Data-to-Sign scanner waits below. The Transmitter scans.', off('Offline — request', request + data_scan), tx('Transmitter — scanning', tx_scan)),
      row('<b>3. Transmitter answers (Scan 2 of 3).</b> The online pre-flight checks, in words, then the Data to Sign. A failed read gives no QR (P-28).', off('Offline — waiting', data_scan), tx('Transmitter — answer', checks + data_qr)),
      row('<b>4. Signing review.</b> The Network is the screen\'s readout: "You are signing for Mainnet". The Sign key is a default key, not commit orange: signing sends nothing.', off('Offline — signing review', review), tx('Transmitter — waiting', tx_scan)),
      row('<b>5. Signed QR (Scan 3 of 3), then the Transmit step.</b> No Send key on the offline device. The Transmitter checks, shows the transaction and its orange Send, every round: the scan never sends by itself.', off('Offline — signed', signed), tx('Transmitter — ready to send', ready)),
      row('<b>6. Send.</b> <b>Climax:</b> Validated.', off('Offline — kept', signed), tx('Transmitter — validated', validated)),
      row('<b>Edge: the window passed.</b> The offline phone still keeps the transaction; "Start the request again" needs nothing re-typed.', off('Offline — kept', signed), tx('Transmitter — expired', sending.replace('open until ledger 91 204 377', 'passed at ledger 91 204 377') + expired)),
      ])

# ---------- 4. transmitter-builds ----------
off2 = lambda who, body: phone(who, body, tabs='offline', active='Sign', wallet='Savings', kind='Offline')
tx_send = picker('Payment', more=True) + plate('Payment', '<div class="field"><span class="legend">Destination address</span><div class="in data">' + DEST + '</div></div><div class="field"><span class="legend">Amount</span><div class="in data">250 USD</div></div>'
                + fl([('Spendable', '1 840.50 USD'), ('Destination check', '<span class="ok">exists, trust line set</span>', False), ('Network fee', '0.000012 XRP')]) + keys(k('Make the unsigned transaction')))
unsigned = qrplate('Unsigned transaction', 'Mainnet', 'Scan 1 of 2', ['Scan this code with the offline wallet. Then scan the signed code from it.'], 4) + scanplate('the signed transaction', 'Scan the signed code from the offline wallet.', 'Scan 2 of 2')
off_entry = plate('Sign a transaction from your Transmitter', '<div class="scan"><span class="k out sm">Stop the camera</span><p class="idle">Camera on.</p></div>')
review2 = (well('Mainnet', ['Window: 18 ledgers', 'Valid until ledger 91 204 385'])
           + plate('Transaction', fl([('Type', 'Payment', False), ('Account', ADDR), ('Destination', DEST), ('Amount', '250 USD (issuer rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B)'), ('SendMax', 'At most 251.25 USD can leave your account', False)])
                   + alert('caution', 'Caution', 'At most 251.25 USD can leave your account. This is more than the amount above.')
                   + fl([('Fee', '0.000012 XRP'), ('Sequence', '4128'), ('LastLedgerSequence', '91 204 385'), ('Flags', 'None', False)]))
           + keys(k('Sign'), k('Do not sign', 'out')))
refused = (plate('', alert('alert', 'Error', '<strong>Not signed.</strong> This is for Testnet. This wallet is for Mainnet.')) + '<p class="cap2">No Sign key: there is nothing that can be signed.</p>')
signed2 = qrplate('Signed transaction', 'Mainnet', 'Scan 2 of 2', ['This transaction is not sent. Scan this code with the Transmitter wallet to send it.', 'It is valid until ledger 91 204 385, about 1 minute after 14:02.'], 5)
page('key-route-transmitter-builds.html', 'Transmitter-builds route, two devices (OS-UJ-2)',
     'OS-FR-17, OS-FR-18, OS-FR-9. The Synced Transmitter builds; the Offline Wallet shows every field in words and only signs.',
     [row('<b>1. Build on the Transmitter</b> with live reads. The final key makes an Unsigned Transaction (default key; nothing is sent).', off2('Offline — idle', off_entry), phone('Transmitter — New transaction', tx_send, tabs='tx', active='New transaction', wallet='Savings (send)', kind='Transmitter')),
      row('<b>2. Unsigned QR (Scan 1 of 2).</b> The offline phone scans it from "Sign a transaction from your Transmitter" (P-3).', off2('Offline — scanning', off_entry), phone('Transmitter — unsigned', unsigned, tabs='tx', active='New transaction', wallet='Savings (send)', kind='Transmitter')),
      row('<b>3. Signing review.</b> Every field and flag in words; risky field (SendMax) with its caution directly under the row; the window shown in ledgers.', off2('Offline — signing review', review2), phone('Transmitter — waiting', unsigned, tabs='tx', active='New transaction', wallet='Savings (send)', kind='Transmitter')),
      row('<b>4. Signed QR (Scan 2 of 2) → Transmit step checks → orange Send.</b>', off2('Offline — signed', signed2), phone('Transmitter — ready to send', ready.replace('400 XRP', '250 USD').replace('91 204 377', '91 204 385'), tabs='tx', active='New transaction', wallet='Savings (send)', kind='Transmitter')),
      row('<b>5. Validated.</b>', off2('Offline — signed', signed2), phone('Transmitter — validated', validated.replace('400 XRP', '250 USD').replace('91 204 377', '91 204 385'), tabs='tx', active='New transaction', wallet='Savings (send)', kind='Transmitter')),
      row('<b>Edge: wrong Network.</b> Refused with the reason; the list stops; nothing is signed.', off2('Offline — refused', refused)),
      ])

# ---------- 5. retry ----------
record = '<div class="rec">' + fl([('Sequence', '4127'), ('Transaction hash', HASH), ('Valid until ledger', '91 204 377'), ('Signed at', '14:02', False)]) + '</div>'
same_build = plate('Review', alert('note', 'Notice', 'You signed the same transaction before.') + record + fl([('Destination', DEST), ('Amount', '400 XRP')]) + keys(k('Show the request')))
case_a = plate('', alert('caution', 'Caution', 'The earlier transaction probably went through. Its Sequence is used. Check the history on the Transmitter before you pay again.') + record
               + fl([('Sequence received', '4128')]) + keys(k('Check first', 'out'), k('This is a new payment', 'out')))
case_b = well('Mainnet', ['Window: about 10 minutes', 'Valid until ledger 91 204 641']) + plate('', alert('note', 'Notice', 'The earlier transaction cannot go through now. This signing is the only one.') + keys(k('Sign'), k('Do not sign', 'out')))
case_c = well('Mainnet', ['Window: about 10 minutes', 'Valid until ledger 91 204 377']) + plate('', alert('note', 'Notice', 'This uses the Sequence of the earlier transaction. Only one of the two can go through.') + fl([('Sequence', '4127 (same as before)')]) + keys(k('Sign'), k('Do not sign', 'out')))
past_seq = plate('Transmit', alert('caution', 'Probably sent before', 'The earlier transaction probably went through. Check before you pay again.') + fl([('Ledger result', 'tefPAST_SEQ')]))
page('key-retry.html', 'Retry without paying twice', 'OS-FR-16, route-checks.md "Retry without paying twice". No signed blob is stored; the record holds no secret and survives a lock.',
     [row('<b>Same Build at review.</b> Detected by content hash, even when typed again after a lock.', off('Offline — review', same_build)),
      row('<b>Case (a): higher Sequence received.</b> Signs nothing until the user decides. "Check first" goes back to the request.', off('Offline — case a', case_a)),
      row('<b>Case (b): the earlier window passed.</b> Signs again; a notice, not a warning.', off('Offline — case b', case_b)),
      row('<b>Case (c): the earlier one can still apply.</b> Re-signs with the same Sequence. "This is a new payment" is not offered: no new Sequence exists yet.', off('Offline — case c', case_c)),
      row('<b>Transmit step, <span class="data">tefPAST_SEQ</span> on a same-Sequence retry.</b> Reported as probably sent before, never as failed. No resend key.', tx('Transmitter — outcome', past_seq)),
      ])

# ---------- 6. change kind ----------
on = lambda who, body, active='Local settings': phone(who, body, tabs='online', active=active, wallet='Daily', kind='Online')
kind_plate = plate('Wallet kind', stamps('Online', 'Mainnet') + keys(k('Change to an offline wallet', 'out')))
text_c = plate('', '<h2 class="title">Change to an offline wallet</h2>' + render_text('C') + keys(k('Back', 'out'), k('Change to an offline wallet')))
after = plate('Wallet kind', stamps('Offline', 'Mainnet', was=True) + '<p class="cap2">The key of this wallet was on a device that connected to the internet.</p>' + keys(k('Change to an online wallet', 'danger')))
c_steps = next(it for it in TEXT['C'] if it['steps'])
steps_plate = plate('', alert('live', 'Confirmed', 'This wallet is now an offline wallet. The node setting is gone. The network is Mainnet.') + f'<p>{esc(c_steps["text"])}</p><ol>' + ''.join(f'<li>{esc(s)}</li>' for s in c_steps['steps']) + '</ol>')
text_d = plate('', '<h2 class="title">Change to an online wallet</h2>' + render_text('D')
               + '<div class="field"><span class="legend">Node</span><div class="in">Built-in Nodes</div></div>'
               + '<div class="field"><span class="legend">Type “change to online” to confirm</span><div class="in data"></div></div>'
               + keys(k('Back', 'out'), k('Change to an online wallet', 'dis', 'Type the words above. Then the Signing Check follows.')))
page('key-change-kind.html', 'Change of kind (OS-UJ-3)', 'OS-FR-5, OS-FR-6, OS-FR-7. Text C with a plain confirm; Text D is irreversible-class (typed confirm on Mainnet, then the Signing Check). The typed phrase is the existing master-key pattern; its words are proposed.',
     [row('<b>Wallet kind plate, Online.</b>', on('Online — Local settings', kind_plate)),
      row('<b>Text C.</b> Every line, both warnings and the three steps, in full.', on('Online — change', text_c)),
      row('<b>After.</b> Was online is permanent; the never-online steps are shown again. The Node plate is gone.', phone('Offline — Local settings', steps_plate + after, tabs='offline', active='Local settings', wallet='Daily', kind='Offline', was=True)),
      row('<b>Text D.</b> Node chosen, typed confirm, then the Signing Check. Same address on the same Network as another Wallet is refused (P-35).', phone('Offline — change to online', text_d, tabs='offline', active='Local settings', wallet='Daily', kind='Offline', was=True)),
      ])

# ---------- 7. show before sending ----------
setting = plate('Before sending', '<label class="ack" style="margin:0"><i aria-hidden="true">✓</i><span>Show the signed transaction before sending</span></label><p class="cap2">Off by default. Shows the hash, the fields and a copy key, then asks before it sends.</p>')
blobwarn = alert('caution', 'Caution', '<strong>WARNING: This signed transaction stays valid until ledger 91 204 377.</strong> Anyone who has it can send it until then.')
show = plate('Signed transaction', fl([('Transaction hash', HASH), ('Type', 'Payment', False), ('Destination', DEST), ('Amount', '25 XRP'), ('Fee', '0.000012 XRP'), ('Sequence', '88'), ('LastLedgerSequence', '91 204 377')])
             + keys(k('Copy', 'out sm')) + blobwarn + '<p class="title" style="margin-top:4px">Send it to the ledger?</p>' + keys(k('Send', 'commit'), k('Do not send', 'out')))
declined = plate('', blobwarn + '<p><strong>Nothing was sent.</strong></p>')
page('key-transmit-show-before-sending.html', 'Transmit step: show the signed transaction before sending', 'OS-FR-9, OS-FR-10. Per-Wallet, Online and Transmitter only, off by default. When on, "Send" here is the screen\'s one commit key.',
     [row('<b>Setting.</b>', on('Online — Local settings', setting)),
      row('<b>After signing.</b> Hash, decoded fields, Copy. Copy shows the warning and it stays.', on('Online — before sending', show, 'Send')),
      row('<b>Declined.</b>', on('Online — declined', declined, 'Send')),
      ])

# ---------- 8. key warnings ----------
offk = lambda who, body: phone(who, body, tabs='offline', active='New transaction', wallet='Savings', kind='Offline')
wq = lambda n: esc(W[n]['quote'])
regkey = picker('Regular Key') + plate('Regular Key', fl([('Regular Key now', P1, False)]) + '<div class="field"><span class="legend">New Regular Key address</span><div class="in data">' + REGK + '</div></div>'
               + '<span class="k out sm">Scan an address with the camera</span>'
               + alert('caution', 'Caution', '<strong>' + esc(W['W1']['title']) + '</strong> ' + wq('W1'))
               + '<p class="cap2">No W5 here: this device cannot know if a Regular Key is set. The Transmitter reads it and shows W5.</p>' + keys(k('Review')))
black = picker('Regular Key') + plate('Regular Key', '<div class="field"><span class="legend">New Regular Key address</span><div class="in data">rrrrrrrrrrrrrrrrrrrrrhoLvTp</div></div>' + alert('caution', 'Caution', '<strong>' + esc(W['W2']['title']) + '</strong> ' + wq('W2')) + keys(k('Review')))
w3 = (well('Mainnet', ['Window: 18 ledgers']) + plate('Transaction', fl([('Type', 'SetRegularKey', False), ('Account', ADDR)]) + alert('caution', 'Caution', '<strong>' + esc(W['W3']['title']) + '</strong> ' + wq('W3')) + fl([('New Regular Key', REGK)])
      + alert('caution', 'Caution', '<strong>' + esc(W['W1']['title']) + '</strong> ' + wq('W1'))) + keys(k('Sign'), k('Do not sign', 'out')))
w4 = picker('Master key') + plate('Turn off the master key', fl([('Regular Key', P1, False)])
           + keys(k('Test the Regular Key', 'out')) + '<p class="cap2">Offered, never required. If the Regular Key is a wallet on this device, the test is a round with that wallet. If not, test it in the wallet that holds it.</p>'
           + alert('caution', 'Caution', wq('W4'))
           + '<p class="cap2">The typed confirm and the Signing Check come on the signing review, after the Data to Sign.</p>' + keys(k('Review')))
state = plate('Key state', fl([('Account', ADDR), ('Regular Key', REGK), ('Master key', 'Unknown. Could not read.', False), ('Signer list', 'None', False)])
              + alert('caution', 'Caution', '<strong>' + esc(W['W5']['title']) + '</strong> ' + wq('W5')))
refusal = plate('', alert('alert', 'Error', '<strong>Only the master key can turn off the master key.</strong> The network fee was still charged.') + fl([('Ledger result', 'tecNEED_MASTER_KEY (claimed: applied, fee taken)')]))
page('key-warnings.html', 'Key warnings W1 to W5', 'OS-FR-21. The app warns and never refuses a key action the ledger would accept; every warning appears before the Signing Check. W-texts are copied from consequence-texts.md by the generator.',
     [row('<b>Regular Key, offline Build</b> (New transaction → Regular Key). The address is typed or scanned on the offline device. W1: the address is not a Wallet here.', offk('Offline — New transaction', regkey)),
      row('<b>W2, a black-hole address.</b>', offk('Offline — New transaction', black)),
      row('<b>W3 on the signing review</b> of a SetRegularKey the device did not build (Transmitter-builds).', phone('Offline — signing review', w3, tabs='offline', active='Sign', wallet='Savings', kind='Offline')),
      row('<b>W4 before the master key goes off.</b> "Test the Regular Key" first, then the W4 sentence. The typed confirm comes on the signing review.', offk('Offline — New transaction', w4)),
      row('<b>Transmitter answer to a key-change request, and a later ledger refusal.</b> Key state read from the ledger; a failed read is "Unknown", never safe. A tec refusal is today\'s claimed outcome with the reason in words, never "Not sent."', tx('Transmitter — key state', state), tx('Transmitter — ledger refusal', refusal)),
      ])

# ---------- 9. local settings per kind ----------
def lsh(name):
    return f'<h1 style="margin:0"><span class="legend" style="display:block">Local settings</span><span class="wname" style="font-size:1.125rem">{esc(name)}</span></h1>'
def pl(t, body=''):
    return plate(t, body or '<p class="cap2">As today.</p>')
before = pl('Before sending', '<label class="ack" style="margin:0"><i aria-hidden="true"></i><span>Show the signed transaction before sending</span></label><p class="cap2">Off by default. Shows the hash, the fields and a copy key, then asks before it sends.</p>')
signsfor = pl('Signs for', fl([('Account', ADDR)]) + keys(k('Change', 'out sm')))
online_ls = (lsh('Daily') + pl('This wallet', fl([('Address', 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH'), ('Signature type', 'Ed25519', False), ('Seed Method', 'Stored Seed', False)]))
    + pl('Wallet kind', stamps('Online', 'Mainnet') + keys(k('Change to an offline wallet', 'out'))) + pl('Name') + pl('Address Book') + pl('Checks') + pl('Seed') + signsfor
    + pl('Keys', fl([('Regular Key', 'None', False), ('Master key', 'On', False)]) + keys(k('Set a Regular Key', 'out sm'))) + pl('Node') + before + pl('Remove this wallet'))
offline_ls = (lsh('Savings') + pl('This wallet', fl([('Address', ADDR), ('Signature type', 'Ed25519', False), ('Seed Method', 'Stored Seed', False)]))
    + pl('Wallet kind', stamps('Offline', 'Mainnet', was=True) + '<p class="cap2">The key of this wallet was on a device that connected to the internet.</p>' + keys(k('Change to an online wallet', 'danger')))
    + pl('Name') + pl('Address Book') + pl('Checks') + pl('Seed') + signsfor
    + pl('Remove this wallet'))
tx_ls = (lsh('Savings (send)') + pl('This wallet', fl([('Address', ADDR)]) + '<p class="cap2">No key. This wallet never signs.</p>') + pl('Wallet kind', stamps('Transmitter', 'Mainnet'))
    + pl('Synced address', fl([('Address', ADDR)]) + keys(k('Sync to an address', 'out sm'), k('Remove the sync', 'out sm')))
    + pl('Name') + pl('Address Book') + pl('Checks', '<p class="cap2">Open Check and auto-lock only.</p>')
    + pl('Node') + before + pl('Remove this wallet'))
w2 = next(it for it in TEXT['B'] if 'synced passkey' in it['text'])
m = re.match(r'\*\*(.*?)\*\*(.*)', w2['text'])
passkey = plate('', '<h2 class="legend" style="color:var(--ink)">Write down your ordinal</h2><p class="cap2">As today, then:</p>'
    + '<p><strong>This passkey is synced</strong></p>'
    + alert('caution', 'Caution', f'<strong>{esc(m.group(1))}</strong>{esc(m.group(2))}').replace('</p></div>', '</p><div class="ack"><i aria-hidden="true"></i><span>I read this warning.</span></div></div>')
    + keys(k('Finish', 'dis', 'Read and tick each warning to continue.')))
page('key-local-settings.html', 'Local settings and Signed, per Wallet type', 'OS-FR-5 to OS-FR-7, OS-FR-10, OS-FR-19, OS-FR-20, OS-FR-8. Plates in their fixed order; "As today" plates are unchanged. "Operating another account" and "Two-device signing" are gone from every kind. Plate contents beyond the new ones are not redrawn.',
     [row('<b>Online.</b> Keys replaces Operating another account; Before sending is new.', phone('Online — Local settings', online_ls, tabs='online', active='Local settings', wallet='Daily', kind='Online')),
      row('<b>Offline.</b> No Node, no Before sending, no Keys: key changes are types in New transaction, and the signed list is its own screen.', phone('Offline — Local settings', offline_ls, tabs='offline', active='Local settings', wallet='Savings', kind='Offline', was=True)),
      row('<b>Transmitter.</b> No Seed, no Signing Check, no change of kind, no Keys: key changes are types in New transaction.', phone('Transmitter — Local settings', tx_ls, tabs='tx', active='Local settings', wallet='Savings (send)', kind='Transmitter')),
      row('<b>Offline, Signed.</b> The signed list as its own screen: read-only, no secret, survives a lock.', phone('Offline — Signed', plate('Signed by this wallet', '<div class="rec">' + fl([('Sequence', '4128'), ('Transaction hash', HASH), ('Valid until ledger', '91 204 377'), ('Signed at', '14:02', False)]) + '</div><p class="cap2">No signed transaction is kept. This list holds no secret.</p>') + plate('Signed by this wallet — empty', '<p>Nothing signed yet.</p>'), tabs='offline', active='Signed', wallet='Savings', kind='Offline', was=True)),
      row('<b>Synced-passkey warning (OS-FR-8).</b> Offline + Passkey-Derived Seed, passkey synced or unknown: Text B\'s second warning again after the passkey ceremony, acknowledged before Finish. A warning, never a refusal.', phone('Add wallet — after the passkey', passkey)),
      ])

print('ok', sorted(W), {k: len(v) for k, v in TEXT.items()})
