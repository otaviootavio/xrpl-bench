import re, sys, html, pathlib
root = pathlib.Path(sys.argv[1]); wd = pathlib.Path(sys.argv[2])
ct = (root/'_bmad-output/specs/spec-offline-signing/consequence-texts.md').read_text()
text = ' '.join(re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', p.read_text()))) for p in wd.glob('*.html'))
text = re.sub(r'\s+', ' ', text)
# every bullet/step line of Texts A-E, W quotes, OS-FR-23, fixed strings
lines = []
body = ct.split('## Fixed short strings')[0]
cur = None
for l in body.splitlines():
    if re.match(r'^- |^  \d\. ', l):
        if cur: lines.append(cur)
        cur = re.sub(r'^- |^  \d\. ', '', l)
    elif l.startswith('  ') and cur is not None:
        cur += ' ' + l.strip()
    else:
        if cur: lines.append(cur); cur = None
if cur: lines.append(cur)
missing = []
for l in lines:
    l = l.replace('**', '')
    if l.startswith('W'):
        for q in re.findall(r'"([^"]+)"', l)[-1:]:
            if q not in text: missing.append(q)
        continue
    if l not in text: missing.append(l)
for q in re.findall(r'^"([^"]+)"$', ct, re.M):
    if q not in text: missing.append(q)
fixed = re.findall(r'^\| [^|]+ \| "([^"]+)"', ct.split('## Fixed short strings')[1], re.M)
for f in fixed + ['Change to an online wallet']:
    if f not in text: missing.append('FIXED: ' + f)
print(len(lines), 'lines checked;', 'missing:', *missing, sep='\n')
