import json, html, re
D='/tmp/claude-0/-home-user-ai-game/01c0b2f8-b1f9-50ef-8584-3f694aac66d0/'
d=json.load(open(D+'tasks/glyph.json')); g=d['design']; systems=d['all']
def e(t): return html.escape(str(t),quote=True)
def paras(t): return [p.strip() for p in t.split('\n') if p.strip()]

O=[];W=O.append
W('''<title>Dross</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
:root{
  --ground:#EAECEE; --surface:#FFFFFF; --sunk:#E2E5E8; --line:#C9CED3; --hair:#DCE0E4;
  --ink:#12151A; --ink-2:#3D454E; --ink-3:#697380;
  --hot:#A34A22; --hot-soft:#F5E2D8; --cool:#1F6285; --cool-soft:#DCE9F0;
  --shadow:0 1px 2px rgba(18,21,26,.05),0 12px 28px -20px rgba(18,21,26,.4);
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --ground:#0F1215; --surface:#171B1F; --sunk:#1E242A; --line:#2F373F; --hair:#232A31;
  --ink:#E7EAEC; --ink-2:#AFB8C1; --ink-3:#7C8794;
  --hot:#F0894A; --hot-soft:#33200F; --cool:#68B6DC; --cool-soft:#102A38;
  --shadow:0 1px 2px rgba(0,0,0,.5),0 14px 34px -22px rgba(0,0,0,.9);
}}
:root[data-theme="dark"]{
  --ground:#0F1215; --surface:#171B1F; --sunk:#1E242A; --line:#2F373F; --hair:#232A31;
  --ink:#E7EAEC; --ink-2:#AFB8C1; --ink-3:#7C8794;
  --hot:#F0894A; --hot-soft:#33200F; --cool:#68B6DC; --cool-soft:#102A38;
  --shadow:0 1px 2px rgba(0,0,0,.5),0 14px 34px -22px rgba(0,0,0,.9);
}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);
  font-family:"Source Serif 4",Georgia,serif;font-size:17px;line-height:1.66;-webkit-text-size-adjust:100%}
.wrap{max-width:760px;margin:0 auto;padding:0 20px 110px}
h1,h2,h3,h4,.ui{font-family:Archivo,ui-sans-serif,system-ui,sans-serif}
h1,h2,h3,h4{margin:0;text-wrap:balance;font-weight:700;letter-spacing:-.015em;line-height:1.15}
p{margin:0}
.mono{font-family:"JetBrains Mono",ui-monospace,monospace}
.label{font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)}
header{padding:64px 0 30px}
h1{font-size:clamp(58px,17vw,104px);letter-spacing:-.045em;line-height:.9}
.sub{margin-top:20px;font-size:clamp(18px,4.6vw,21px);color:var(--ink-2);max-width:56ch}
.rationale{margin-top:22px;padding:16px 18px;background:var(--surface);border:1px solid var(--line);border-radius:9px;font-size:16px;color:var(--ink-2)}
.rationale b{color:var(--ink)}
section{padding-top:56px}
h2{font-size:clamp(25px,6vw,34px)}
.kicker{display:block;margin-bottom:9px}
.note{color:var(--ink-2);margin-top:14px;max-width:64ch}
.hinge{margin-top:26px;padding:22px;background:var(--hot-soft);border-radius:11px}
.hinge p{font-size:17.5px}
.hinge p+p{margin-top:13px}
figure{margin:26px 0 0;padding:20px 16px;background:var(--surface);border:1px solid var(--line);border-radius:11px}
figure svg{display:block;margin:0 auto;max-width:100%;height:auto}
figcaption{margin-top:16px;font-size:14.5px;color:var(--ink-3);text-align:center;max-width:52ch;margin-left:auto;margin-right:auto}
.diag .hot{color:var(--hot)}
.diag text{font-family:Archivo,sans-serif}
.odds{display:flex;gap:12px;margin-top:24px;flex-wrap:wrap}
.odd{flex:1 1 150px;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:15px 16px}
.odd .n{font-family:Archivo,sans-serif;font-weight:700;font-size:34px;line-height:1;font-variant-numeric:tabular-nums}
.odd.was .n{color:var(--ink-3)} .odd.now .n{color:var(--hot)}
.odd .t{display:block;margin-top:9px;font-size:13.5px;color:var(--ink-2);line-height:1.4}
ol.steps{list-style:none;margin:24px 0 0;padding:0;display:flex;flex-direction:column}
ol.steps li{display:grid;grid-template-columns:auto 1fr;gap:15px;padding:16px 0;border-top:1px solid var(--hair)}
ol.steps li:first-child{border-top:0}
ol.steps .n{font-family:"JetBrains Mono",monospace;font-size:11.5px;color:var(--hot);padding-top:6px;font-variant-numeric:tabular-nums}
ol.steps h4{font-size:15px;margin-bottom:5px}
ol.steps p{font-size:16px;color:var(--ink-2)}
.stage{margin-top:26px}
.stage>.label{display:block;padding-bottom:9px;border-bottom:2px solid var(--ink);margin-bottom:4px;color:var(--ink)}
.chg{padding:17px 0;border-top:1px solid var(--hair)}
.chg:first-of-type{border-top:0}
.chg h4{font-size:15.5px;display:flex;gap:9px;align-items:baseline;flex-wrap:wrap}
.chip{font-family:"JetBrains Mono",monospace;font-size:9.5px;letter-spacing:.1em;padding:3px 6px;border-radius:4px;font-weight:400}
.chip.ceiling{background:var(--hot-soft);color:var(--hot)}
.chip.rate{background:var(--cool-soft);color:var(--cool)}
.chg p{margin-top:7px;font-size:16px;color:var(--ink-2)}
details.ph{background:var(--surface);border:1px solid var(--line);border-radius:11px;margin-top:11px;overflow:hidden}
details.ph[open]{box-shadow:var(--shadow)}
details.ph summary{list-style:none;cursor:pointer;padding:16px 18px}
summary::-webkit-details-marker{display:none}
.phhead{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}
.phhead h4{font-size:16px}
.dur{font-family:"JetBrains Mono",monospace;font-size:11px;color:var(--ink-3);margin-left:auto}
.see{margin-top:9px;font-size:15.5px;color:var(--ink-2)}
.see b{font-family:Archivo,sans-serif;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--hot);display:block;margin-bottom:3px;font-weight:600}
.phbody{padding:2px 18px 18px;border-top:1px solid var(--hair);margin-top:2px;padding-top:15px;display:flex;flex-direction:column;gap:13px}
.phbody .f .label{display:block;margin-bottom:3px}
.phbody .f p{font-size:15.5px;color:var(--ink-2)}
.num{background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--cool);border-radius:0 10px 10px 0;padding:16px 18px;margin-top:12px}
.num h4{font-size:15.5px;margin-bottom:7px}
.num p{font-size:15.5px;color:var(--ink-2)}
.num.gauge{border-left-color:var(--hot)}
.fc{margin-top:12px;padding:16px 18px;background:var(--surface);border:1px solid var(--line);border-radius:10px}
.fc .when{font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.1em;color:var(--hot);text-transform:uppercase}
.fc p{margin-top:8px;font-size:16px;color:var(--ink-2)}
.fc.bad{background:var(--sunk)}
.cut{margin-top:14px}
.cut summary{cursor:pointer;list-style:none;font-family:Archivo,sans-serif;font-weight:600;font-size:16px;padding:14px 16px;background:var(--surface);border:1px solid var(--line);border-radius:10px}
.cut[open] summary{border-radius:10px 10px 0 0}
.cutbody{border:1px solid var(--line);border-top:0;border-radius:0 0 10px 10px;padding:16px;background:var(--surface)}
.cutbody p{font-size:15.5px;color:var(--ink-2)}
.cutbody p+p{margin-top:12px}
summary:focus-visible,a:focus-visible{outline:2px solid var(--hot);outline-offset:2px}
footer{margin-top:74px;padding-top:22px;border-top:1px solid var(--line);color:var(--ink-3);font-size:14px}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
@media (min-width:700px){.wrap{padding:0 40px 120px}}
</style>
<div class="wrap">
<header>
  <p class="label">The build document</p>
  <h1>DROSS</h1>
  <p class="sub">A valley where nobody wrote the materials, nobody wrote the tech tree, and the only way to build something greater is out of what the last thing threw away.</p>
  <div class="rationale"><b>Dross</b> is the scum you skim off a melt and throw on a heap. Here you cannot throw it anywhere &mdash; every atom is counted and has to be somewhere &mdash; so the heap outside the furnace is real, it is on the map, and by simple arithmetic it is concentrated in whichever element refused to mix. That heap turns out to be the only thing in the valley that survives the next temperature up. <b>The waste of the first storey is the wall of the second.</b></div>
</header>''')

# HINGE + diagram
W('''<section>
  <span class="label kicker">The one idea everything rests on</span>
  <h2>Make the dream event the only door</h2>
  <div class="hinge">
    <p>In the original design, a building was a <em>discount</em> &mdash; it made an expensive job cheap at one spot. That is fatal, and quietly so: a kiln that is warm enough is warm enough forever, so the valley settles on the cheapest thing that survives winter and stops climbing.</p>
    <p>One change fixes it. <b>A building's upkeep is paid in real material, and the specification of that material is worked out from what the building has to survive.</b> To hold 1,780 K you need a lining that melts above about 2,370 K, and the lining is slowly eaten by what it holds. So the only way to hold a bigger number is a better wall &mdash; and a wall is a material.</p>
    <p>Now ask what happens when no rock in the valley has that property. There is exactly one route left, and it is the thing you said you wanted to see.</p>
  </div>
  <figure>
  <svg class="diag" viewBox="0 0 400 584" role="img" aria-label="Flow showing that holding a higher temperature requires a better wall material, and when no raw rock qualifies the only remaining route is a material produced by another building, which is the second-order building.">
    <defs>
      <marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker>
      <marker id="arh" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker>
    </defs>
    <rect x="16" y="14" width="368" height="46" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <text x="200" y="42" text-anchor="middle" font-size="14" fill="currentColor">A kiln holds 1,780 K</text>
    <line x1="52" y1="62" x2="52" y2="114" stroke="currentColor" stroke-width="1.5" marker-end="url(#ar)"/>
    <text x="68" y="83" font-size="12" fill="currentColor" opacity=".75">its lining is eaten by</text>
    <text x="68" y="99" font-size="12" fill="currentColor" opacity=".75">what it holds</text>
    <rect x="16" y="118" width="368" height="46" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <text x="200" y="146" text-anchor="middle" font-size="14" fill="currentColor">Upkeep = replacing the lining</text>
    <line x1="52" y1="166" x2="52" y2="218" stroke="currentColor" stroke-width="1.5" marker-end="url(#ar)"/>
    <text x="68" y="187" font-size="12" fill="currentColor" opacity=".75">to hold a bigger number</text>
    <text x="68" y="203" font-size="12" fill="currentColor" opacity=".75">you need a better wall</text>
    <rect x="16" y="222" width="368" height="52" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <text x="200" y="244" text-anchor="middle" font-size="14" fill="currentColor">You need a material that</text>
    <text x="200" y="262" text-anchor="middle" font-size="14" fill="currentColor">survives more</text>
    <path d="M200,276 L200,296" stroke="currentColor" stroke-width="1.5" fill="none"/>
    <path d="M106,296 L294,296" stroke="currentColor" stroke-width="1.5" fill="none"/>
    <line x1="106" y1="296" x2="106" y2="316" stroke="currentColor" stroke-width="1.5" marker-end="url(#ar)"/>
    <g class="hot"><line x1="294" y1="296" x2="294" y2="316" stroke="currentColor" stroke-width="2" marker-end="url(#arh)"/></g>
    <rect x="16" y="320" width="180" height="54" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".55"/>
    <text x="106" y="342" text-anchor="middle" font-size="12.5" fill="currentColor" opacity=".7">Some raw rock</text>
    <text x="106" y="359" text-anchor="middle" font-size="12.5" fill="currentColor" opacity=".7">already has it</text>
    <g class="hot">
      <rect x="204" y="320" width="180" height="54" rx="7" fill="none" stroke="currentColor" stroke-width="2"/>
      <text x="294" y="342" text-anchor="middle" font-size="12.5" fill="currentColor">No rock in the</text>
      <text x="294" y="359" text-anchor="middle" font-size="12.5" fill="currentColor">valley has it</text>
    </g>
    <line x1="106" y1="376" x2="106" y2="404" stroke="currentColor" stroke-width="1.5" opacity=".55" marker-end="url(#ar)"/>
    <rect x="16" y="408" width="180" height="46" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".55"/>
    <text x="106" y="436" text-anchor="middle" font-size="12.5" fill="currentColor" opacity=".7">An ordinary building</text>
    <g class="hot">
      <line x1="294" y1="376" x2="294" y2="404" stroke="currentColor" stroke-width="2" marker-end="url(#arh)"/>
      <rect x="204" y="408" width="180" height="70" rx="7" fill="none" stroke="currentColor" stroke-width="2"/>
      <text x="294" y="430" text-anchor="middle" font-size="12.5" fill="currentColor">The only source is</text>
      <text x="294" y="447" text-anchor="middle" font-size="12.5" fill="currentColor">a material another</text>
      <text x="294" y="464" text-anchor="middle" font-size="12.5" fill="currentColor">building made</text>
      <line x1="294" y1="480" x2="294" y2="508" stroke="currentColor" stroke-width="2" marker-end="url(#arh)"/>
      <rect x="150" y="512" width="234" height="56" rx="7" fill="currentColor" stroke="none" opacity=".14"/>
      <rect x="150" y="512" width="234" height="56" rx="7" fill="none" stroke="currentColor" stroke-width="2"/>
      <text x="267" y="535" text-anchor="middle" font-size="13" font-weight="600" fill="currentColor">SECOND-ORDER BUILDING</text>
      <text x="267" y="554" text-anchor="middle" font-size="12" fill="currentColor">craft becomes industry</text>
    </g>
  </svg>
  <figcaption>Because upkeep is a material with a derived specification, climbing past what raw rock can survive has exactly one route &mdash; and that route is the event you wanted. It stops being a lucky coincidence and becomes the only door.</figcaption>
  </figure>
</section>''')

# THE BET
W('<section><span class="label kicker">The bet</span><h2>Will it actually happen?</h2>')
W('''<div class="odds">
  <div class="odd was"><span class="n">15%</span><span class="t">Chance within six months, Glyphworks as originally designed &mdash; and most of that was you deciding a building counted when it didn't.</span></div>
  <div class="odd now"><span class="n">60%</span><span class="t">Chance within six months with this design, mechanically detected, no judgement call.</span></div>
  <div class="odd now"><span class="n">85%</span><span class="t">Within twelve months. The extra comes almost entirely from ruins &mdash; a relay across three peoples gets more attempts than one people's luck.</span></div>
</div>''')
de=g['dream_event']
head=de.split('WHAT HAS TO BE TRUE')[0].strip()
for p in paras(head): W(f'<p class="note">{e(p)}</p>')
body=de.split('WHAT HAS TO BE TRUE',1)[1] if 'WHAT HAS TO BE TRUE' in de else ''
items=re.split(r'\n(?=(?:ONE|TWO|THREE|FOUR|FIVE|SIX)\s+—)', body)
W('<ol class="steps">')
n=0
for it in items:
    m=re.match(r'^(ONE|TWO|THREE|FOUR|FIVE|SIX)\s+—\s*(.*)$', it.strip(), re.S)
    if not m: continue
    n+=1; txt=m.group(2).strip()
    sm=re.match(r'^(.+?[.!])\s+(.*)$', txt, re.S)
    hd,rest=(sm.group(1),sm.group(2)) if sm else (txt,'')
    W(f'<li><span class="n">{n:02d}</span><div><h4>{e(hd)}</h4>{f"<p>{e(rest)}</p>" if rest else ""}</div></li>')
W('</ol>')
tail=re.split(r'\nHONEST PROBABILITY', de)
if len(tail)>1:
    for p in paras('HONEST PROBABILITY'+tail[1]):
        W(f'<p class="note">{e(p)}</p>')
W('</section>')

# SPINE
W('<section><span class="label kicker">The machine</span><h2>How it works, start to finish</h2>')
W('<p class="note">Read this once and you have the whole thing. Nothing here is a metaphor &mdash; everything is a number, a table, or a loop.</p>')
sp=g['spine']
parts=re.split(r'===\s*([A-Z ,]+?)\s*===', sp)
if len(parts)>1:
    lead=parts[0].strip()
    for p in paras(lead)[1:]: W(f'<p class="note">{e(p)}</p>')
    for i in range(1,len(parts)-1,2):
        title=parts[i].strip().title(); bodyt=parts[i+1]
        W(f'<div class="stage"><span class="label">{e(title)}</span><ol class="steps">')
        for it in re.split(r'\n(?=\d+\.\s)', bodyt):
            it=it.strip()
            m=re.match(r'^(\d+)\.\s+(.*)$', it, re.S)
            if not m: continue
            num,txt=m.group(1),m.group(2).strip()
            sm=re.match(r'^([A-Z][A-Z ,\-–—’\'&]{3,70}[.:,])\s*(.*)$', txt, re.S)
            if sm: hd,rest=sm.group(1).rstrip('.:,'),sm.group(2)
            else:
                sm2=re.match(r'^(.+?\.)\s+(.*)$', txt, re.S); hd,rest=(sm2.group(1),sm2.group(2)) if sm2 else (txt,'')
            W(f'<li><span class="n">{int(num):02d}</span><div><h4>{e(hd)}</h4>{f"<p>{e(rest)}</p>" if rest else ""}</div></li>')
        W('</ol></div>')
W('</section>')

# WHAT CHANGED
W('<section><span class="label kicker">Eleven changes</span><h2>What is different from Glyphworks</h2>')
W('<p class="note">Each one either raises how <em>often</em> something unexpected happens, or raises how <em>big</em> the biggest possible surprise is. Tagged accordingly, with no dressing rate up as ceiling.</p>')
wc=g['what_changed']
for it in re.split(r'\n(?=\d+\.\s)', wc):
    it=it.strip()
    m=re.match(r'^(\d+)\.\s+(.*)$', it, re.S)
    if not m: continue
    txt=m.group(2).strip()
    sm=re.match(r'^([A-Z][A-Z ,\-–—’\'&0-9]{3,80}[.:,])\s*(.*)$', txt, re.S)
    hd,rest=(sm.group(1).rstrip('.:,'),sm.group(2)) if sm else (txt[:70],txt)
    ch=''
    if re.search(r'\bCEILING\b',rest): ch+='<span class="chip ceiling">CEILING</span>'
    if re.search(r'\bRATE\b',rest): ch+='<span class="chip rate">RATE</span>'
    W(f'<div class="chg"><h4>{e(hd)} {ch}</h4><p>{e(rest)}</p></div>')
W('</section>')

# BUILD ORDER
W('<section><span class="label kicker">Build order</span><h2>What to build, in what order</h2>')
W('<p class="note">Phase&nbsp;0 pays you a real surprise on day two, before a single night is simulated &mdash; and tells you whether this particular world is worth three months. Tap a phase for the detail.</p>')
for p in g['build_order']:
    W(f'''<details class="ph"><summary>
      <div class="phhead"><h4>{e(p['phase'])}</h4><span class="dur">{e(p['duration'])}</span></div>
      <p class="see"><b>What you see</b>{e(p['first_thing_you_see'])}</p></summary>
      <div class="phbody">
        <div class="f"><span class="label">Builds</span><p>{e(p['builds'])}</p></div>
        <div class="f"><span class="label">Unlocks</span><p>{e(p['unlocks'])}</p></div>''')
    if p.get('risk'): W(f'<div class="f"><span class="label">Risk</span><p>{e(p["risk"])}</p></div>')
    W('</div></details>')
W('</section>')

# THREE NUMBERS
W('<section><span class="label kicker">Instruments</span><h2>Three numbers that tell you the truth</h2>')
tn=g['three_numbers']
blocks=re.split(r'\n(?=(?:THE MISMATCH COUNT|NUMBER ONE|NUMBER TWO|NUMBER THREE|HOW TO USE THEM))', tn)
for b in blocks:
    b=b.strip()
    if not b: continue
    m=re.match(r'^(THE MISMATCH COUNT|NUMBER ONE|NUMBER TWO|NUMBER THREE|HOW TO USE THEM)\s*[—\-–:]*\s*(.*)$', b, re.S)
    if m:
        hd,rest=m.group(1),m.group(2).strip()
        sm=re.match(r'^([A-Z][A-Z ,\-–—’\'&]{3,70}[.:,])\s*(.*)$', rest, re.S)
        if sm: hd=hd+' — '+sm.group(1).rstrip('.:,'); rest=sm.group(2)
        cls=' gauge' if 'MISMATCH' in hd else ''
        W(f'<div class="num{cls}"><h4>{e(hd)}</h4><p>{e(rest)}</p></div>')
    elif 'THE MISMATCH COUNT' in b:
        for p in paras(b):
            if 'THE MISMATCH COUNT' in p:
                W(f'<div class="num gauge"><h4>The gauge that makes the other three mean anything &mdash; the mismatch count</h4><p>{e(p.split(":",1)[1].strip() if ":" in p.split("THE MISMATCH COUNT")[0] else p)}</p></div>')
            else:
                W(f'<p class="note">{e(p)}</p>')
    else:
        for p in paras(b): W(f'<p class="note">{e(p)}</p>')
W('</section>')

# FORECAST
W('<section><span class="label kicker">Honest forecast</span><h2>What the next year actually feels like</h2>')
fc=g['forecast']
for b in re.split(r'\n(?=(?:MONTH \d+|WHAT IT LOOKS LIKE|If it does happen))', fc):
    b=b.strip()
    if not b: continue
    m=re.match(r'^(MONTH \d+|WHAT IT LOOKS LIKE IF THE BET DOES NOT PAY)\.?\s*(.*)$', b, re.S)
    if m:
        bad=' bad' if 'NOT PAY' in m.group(1) else ''
        W(f'<div class="fc{bad}"><span class="when">{e(m.group(1))}</span><p>{e(m.group(2).strip())}</p></div>')
    else:
        for p in paras(b): W(f'<p class="note">{e(p)}</p>')
W('</section>')

# RISK + CUTS
W('<section><span class="label kicker">Before you write a line</span><h2>The biggest risk</h2>')
for p in paras(g['biggest_risk']): W(f'<p class="note">{e(p)}</p>')
W('<details class="cut"><summary>What was deliberately left out, and why &mdash; including the good ideas</summary><div class="cutbody">')
for p in paras(g['cut_list']): W(f'<p>{e(p)}</p>')
W('</div></details></section>')

W(f'''<footer><p>Assembled from {len(systems)} proposed systems across seven design lenses, each scored by an adversarial critic on whether it raises the ceiling of what kind of surprise is possible or merely the rate of familiar ones. {sum(1 for s in systems if (s.get('critique') or {{}}).get('keep_verdict')=='core')} were judged core, {sum(1 for s in systems if (s.get('critique') or {{}}).get('keep_verdict') in ('strong','cheap-win'))} strong or cheap wins, and the rest cut or deferred.</p></footer>
</div>''')
open(D+'scratchpad/dross.html','w').write('\n'.join(O))
print('ok',sum(len(x) for x in O),'chars')
