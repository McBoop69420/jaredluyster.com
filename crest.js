/* crest.js — Wizard Battle MASTER SIGIL generator.
   Built on the class-icon grammar: a double glowing rune-ring with bright
   cardinal seal-points, a central glyph, and a soft neon bloom — the same
   language as the eight element icons, elevated to the game's master mark.

   The central EIGHT-POINTED STAR now carries the EIGHT magic schools, one ray
   per type, each in its CANONICAL colour from bibles/ui-and-design.md:

     Fire #ff4422 · Water #2277ff · Rock #a87832 · Arc  #f97316
     Ice  #88ddff · Shadow #bb33ee · Light #facc15 · Grass #22c55e

   Ray order clockwise from top is locked to Fire so it aligns with the vortex:
     Fire – Light – Grass – Arc – Water – Ice – Rock – Shadow.

   buildCrest(opts) -> SVG markup string. Pure, deterministic, no deps.
*/

(function (root) {
  "use strict";

  // the eight magic schools, in ray order (top = Fire, clockwise)
  var CANON_TYPES = [
    { id:"fire",    name:"Fire",    color:"#ff4422" },
    { id:"light",   name:"Light",   color:"#facc15" },
    { id:"grass",   name:"Grass",   color:"#22c55e" },
    { id:"arc",     name:"Arc",     color:"#f97316" },
    { id:"water",   name:"Water",   color:"#2277ff" },
    { id:"ice",     name:"Ice",     color:"#88ddff" },
    { id:"rock",    name:"Rock",    color:"#a87832" },
    { id:"shadow",  name:"Shadow",  color:"#bb33ee" }
  ];

  // colour presets (glow halo / core tube / bright / inner highlight / deep) — used for the frame, not the rays
  var PRESETS = {
    gold:    { glow:"#ff9e1f", core:"#ffc740", bright:"#ffe07a", hi:"#fff6d6", deep:"#c8932c", bloom:"#ffb22e" },
    arcane:  { glow:"#8a5cff", core:"#b48cff", bright:"#d6c2ff", hi:"#f1eaff", deep:"#6a3fd0", bloom:"#9a6bff" },
    ember:   { glow:"#ff5a22", core:"#ff8a3d", bright:"#ffb066", hi:"#ffe2c2", deep:"#d8431a", bloom:"#ff6a2a" },
    frost:   { glow:"#2aa8ff", core:"#6fd0ff", bright:"#aee8ff", hi:"#eaffff", deep:"#1f7fd0", bloom:"#3fb0ff" }
  };

  var uid = 0;

  function star4(cx, cy, L, s){ // 4-point sparkle
    return "M "+cx+" "+(cy-L)+" L "+(cx+s)+" "+(cy-s)+" L "+(cx+L)+" "+cy
         + " L "+(cx+s)+" "+(cy+s)+" L "+cx+" "+(cy+L)+" L "+(cx-s)+" "+(cy+s)
         + " L "+(cx-L)+" "+cy+" L "+(cx-s)+" "+(cy-s)+" Z";
  }

  function octagram(cx, cy, Ro, Ri, rot){
    var pts=16, d="", i, a, r, x, y;
    rot = rot || -Math.PI/2;
    for(i=0;i<pts;i++){
      a = rot + i*(Math.PI*2/pts);
      r = (i%2===0) ? Ro : Ri;
      x = cx + r*Math.cos(a); y = cy + r*Math.sin(a);
      d += (i===0?"M ":"L ") + x.toFixed(2) + " " + y.toFixed(2) + " ";
    }
    return d + "Z";
  }

  // eight sharp rays, one per type; ray k centred at rot + k*(TAU/8)
  function eightRays(cx, cy, Ro, Ri, rot){
    var d=[], i; rot = rot==null? -Math.PI/2 : rot;
    var step = Math.PI/8, half = Math.PI/16;
    for(i=0;i<8;i++){
      var aOut = rot + i*(step*2);
      var a1 = aOut - half, a2 = aOut + half;
      var ox = cx+Ro*Math.cos(aOut), oy = cy+Ro*Math.sin(aOut);
      var x1 = cx+Ri*Math.cos(a1),   y1 = cy+Ri*Math.sin(a1);
      var x2 = cx+Ri*Math.cos(a2),   y2 = cy+Ri*Math.sin(a2);
      d.push("M "+x1.toFixed(2)+" "+y1.toFixed(2)+" L "+ox.toFixed(2)+" "+oy.toFixed(2)+" L "+x2.toFixed(2)+" "+y2.toFixed(2)+" Z");
    }
    return d;
  }

  function glyphPaths(name, cx, cy){
    if(name === "octagram"){
      return {
        rays:    eightRays(cx, cy, 122, 50, -Math.PI/2),
        inner:   octagram(cx, cy, 66, 24, -Math.PI/2),
        hub:     { cx:cx, cy:cy, r:25 },
        pip:     { cx:cx, cy:cy, r:11 }
      };
    }
    if(name === "eye"){
      var w=120, h=70;
      var top = "M "+(cx-w)+" "+cy+" Q "+cx+" "+(cy-h)+" "+(cx+w)+" "+cy
              + " Q "+cx+" "+(cy+h)+" "+(cx-w)+" "+cy+" Z";
      return { vesica: top, iris:{cx:cx,cy:cy,r:40}, pupil:{cx:cx,cy:cy,r:15},
        rays: [ [cx,cy-h-6,cx,cy-h-30], [cx,cy+h+6,cx,cy+h+30],
                [cx-w-6,cy,cx-w-26,cy], [cx+w+6,cy,cx+w+26,cy] ] };
    }
    if(name === "staves"){
      var L=120, t=Math.PI/4;
      var p1a=[cx-L*Math.cos(t),cy-L*Math.sin(t)], p1b=[cx+L*Math.cos(t),cy+L*Math.sin(t)];
      var p2a=[cx-L*Math.cos(-t),cy-L*Math.sin(-t)], p2b=[cx+L*Math.cos(-t),cy+L*Math.sin(-t)];
      return { lines:[ [p1a[0],p1a[1],p1b[0],p1b[1]], [p2a[0],p2a[1],p2b[0],p2b[1]] ],
        orbs:[p1a,p1b,p2a,p2b], burst:{cx:cx,cy:cy,r:16} };
    }
  }

  function buildCrest(opts){
    opts = opts || {};
    var size = opts.size || 512;
    var glyph = opts.glyph || "octagram";
    var c = PRESETS[opts.preset || "gold"] || PRESETS.gold;
    var u = "c"+(uid++);
    var cx=256, cy=256;
    var Rout = opts.rOuter!=null?opts.rOuter:202;
    var Rin  = opts.rInner!=null?opts.rInner:166;
    var glowAmt = opts.glow!=null?opts.glow:1;

    var defs = "";
    defs += '<radialGradient id="'+u+'bloom" cx="50%" cy="50%" r="50%">'
          + '<stop offset="0%" stop-color="'+c.bloom+'" stop-opacity="'+(0.32*glowAmt)+'"/>'
          + '<stop offset="48%" stop-color="'+c.bloom+'" stop-opacity="'+(0.10*glowAmt)+'"/>'
          + '<stop offset="100%" stop-color="'+c.bloom+'" stop-opacity="0"/></radialGradient>';
    defs += '<radialGradient id="'+u+'gfill" cx="50%" cy="42%" r="62%">'
          + '<stop offset="0%" stop-color="'+c.bright+'"/><stop offset="62%" stop-color="'+c.core+'"/><stop offset="100%" stop-color="'+c.deep+'"/></radialGradient>';
    defs += '<filter id="'+u+'soft" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="'+(6*glowAmt)+'"/></filter>';
    defs += '<filter id="'+u+'tight" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="'+(2.6*glowAmt)+'"/></filter>';

    var body = "";
    // ambient bloom
    body += '<circle cx="'+cx+'" cy="'+cy+'" r="238" fill="url(#'+u+'bloom)"/>';

    // ---- neon ring helper (preset colour) ----
    function ring(R, w){
      var s = "";
      s += '<circle cx="'+cx+'" cy="'+cy+'" r="'+R+'" fill="none" stroke="'+c.glow+'" stroke-width="'+(w+5)+'" stroke-opacity="'+(0.8*glowAmt)+'" filter="url(#'+u+'soft)"/>';
      s += '<circle cx="'+cx+'" cy="'+cy+'" r="'+R+'" fill="none" stroke="'+c.core+'" stroke-width="'+w+'"/>';
      s += '<circle cx="'+cx+'" cy="'+cy+'" r="'+R+'" fill="none" stroke="'+c.hi+'" stroke-width="'+(w*0.34)+'" stroke-opacity="0.9"/>';
      return s;
    }
    body += ring(Rout, 4.5);
    body += ring(Rin, 3.4);

    // ---- cardinal seal-points (preset colour) ----
    function seal(px, py, L, s){
      var g = "";
      g += '<path d="'+star4(px,py,L+6,s+3)+'" fill="'+c.glow+'" opacity="'+(0.8*glowAmt)+'" filter="url(#'+u+'soft)"/>';
      g += '<path d="'+star4(px,py,L,s)+'" fill="'+c.hi+'"/>';
      g += '<path d="'+star4(px,py,L*0.5,s*0.5)+'" fill="#ffffff"/>';
      return g;
    }
    var card = [[cx,cy-Rout],[cx+Rout,cy],[cx,cy+Rout],[cx-Rout,cy]];
    for(var k=0;k<4;k++) body += seal(card[k][0], card[k][1], 15, 4.5);
    var dr = Rin*Math.SQRT1_2;
    var diag = [[cx-dr,cy-dr],[cx+dr,cy-dr],[cx+dr,cy+dr],[cx-dr,cy+dr]];
    for(k=0;k<4;k++) body += seal(diag[k][0], diag[k][1], 7, 2.2);

    // ---- central glyph ----
    var g = glyphPaths(glyph, cx, cy);
    var gl = '<g filter="url(#'+u+'tight)" opacity="'+(0.7*glowAmt)+'">'; // glow pass (colour halos)
    var fg = '<g>'; // crisp pass
    if(glyph === "octagram"){
      // each ray glows in its school colour
      for(var i=0;i<8;i++){
        gl += '<path d="'+g.rays[i]+'" fill="'+CANON_TYPES[i].color+'"/>';
      }
      gl += '</g>';
      // crisp rays, solid school colour + dark separation
      for(i=0;i<8;i++){
        fg += '<path d="'+g.rays[i]+'" fill="'+CANON_TYPES[i].color+'" stroke="#05060c" stroke-width="1.3" stroke-linejoin="round"/>';
      }
      // neutral hub + inner seal echo (preset) + white pip
      fg += '<circle cx="'+g.hub.cx+'" cy="'+g.hub.cy+'" r="'+g.hub.r+'" fill="#0a0d16"/>';
      fg += '<path d="'+g.inner+'" fill="none" stroke="'+c.core+'" stroke-width="1.4" stroke-opacity="0.55"/>';
      fg += '<circle cx="'+g.pip.cx+'" cy="'+g.pip.cy+'" r="'+g.pip.r+'" fill="#fff"/>';
      fg += '</g>';
    } else if(glyph === "eye"){
      gl += '<path d="'+g.vesica+'" fill="'+c.glow+'"/></g>';
      fg += '<path d="'+g.vesica+'" fill="none" stroke="url(#'+u+'gfill)" stroke-width="9" stroke-linejoin="round"/>';
      fg += '<circle cx="'+g.iris.cx+'" cy="'+g.iris.cy+'" r="'+g.iris.r+'" fill="url(#'+u+'gfill)"/>';
      fg += '<circle cx="'+g.pupil.cx+'" cy="'+g.pupil.cy+'" r="'+g.pupil.r+'" fill="#1a1206"/>';
      fg += '<circle cx="'+g.pupil.cx+'" cy="'+g.pupil.cy+'" r="4" fill="#fff" opacity="0.9"/>';
      g.rays.forEach(function(r){ fg += '<line x1="'+r[0]+'" y1="'+r[1]+'" x2="'+r[2]+'" y2="'+r[3]+'" stroke="'+c.bright+'" stroke-width="5" stroke-linecap="round"/>'; });
      fg += '</g>';
    } else if(glyph === "staves"){
      g.lines.forEach(function(l){ gl += '<line x1="'+l[0]+'" y1="'+l[1]+'" x2="'+l[2]+'" y2="'+l[3]+'" stroke="'+c.glow+'" stroke-width="12" stroke-linecap="round"/>'; });
      gl += '</g>';
      g.lines.forEach(function(l){ fg += '<line x1="'+l[0]+'" y1="'+l[1]+'" x2="'+l[2]+'" y2="'+l[3]+'" stroke="url(#'+u+'gfill)" stroke-width="7" stroke-linecap="round"/>'; });
      g.orbs.forEach(function(o){ fg += '<circle cx="'+o[0].toFixed(1)+'" cy="'+o[1].toFixed(1)+'" r="10" fill="url(#'+u+'gfill)" stroke="'+c.hi+'" stroke-width="1"/>'; });
      fg += '<circle cx="'+g.burst.cx+'" cy="'+g.burst.cy+'" r="'+g.burst.r+'" fill="'+c.bright+'"/>';
      fg += '<circle cx="'+g.burst.cx+'" cy="'+g.burst.cy+'" r="7" fill="#fff"/></g>';
    }
    body += gl + fg;

    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="'+size+'" height="'+size+'">'
      + '<defs>'+defs+'</defs>'+body+'</svg>';
  }

  root.buildCrest = buildCrest;
  root.CREST_PRESETS = PRESETS;
  root.CREST_TYPES = CANON_TYPES;
})(typeof window !== "undefined" ? window : globalThis);
