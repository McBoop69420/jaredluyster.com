/* compass.js — Wizard Battle THE COMPASS generator.
   Built on the class-icon grammar: a double glowing rune-ring with bright
   cardinal seal-points, a central glyph, and a soft neon bloom — the same
   language as the eight element icons, elevated to the game's master mark.

   buildCompass(opts) -> SVG markup string. Pure, deterministic, no deps.
*/
(function (root) {
  "use strict";

  // colour presets (glow halo / core tube / bright / inner highlight / deep)
  var PRESETS = {
    gold:    { glow:"#ff9e1f", core:"#ffc740", bright:"#ffe07a", hi:"#fff6d6", deep:"#c8932c", bloom:"#ffb22e" },
    arcane:  { glow:"#8a5cff", core:"#b48cff", bright:"#d6c2ff", hi:"#f1eaff", deep:"#6a3fd0", bloom:"#9a6bff" },
    ember:   { glow:"#ff5a22", core:"#ff8a3d", bright:"#ffb066", hi:"#ffe2c2", deep:"#d8431a", bloom:"#ff6a2a" },
    frost:   { glow:"#2aa8ff", core:"#6fd0ff", bright:"#aee8ff", hi:"#eaffff", deep:"#1f7fd0", bloom:"#3fb0ff" }
  };

  // the eight classes, in wheel order — one octagram point each
  var CLASS_COLORS = [
    { id:"pyromancer",  name:"Fire",   core:"#ff4422", deep:"#8c2513" },
    { id:"verdantmaker",name:"Grass",  core:"#22c55e", deep:"#136c34" },
    { id:"frostweaver", name:"Ice",    core:"#88ddff", deep:"#4b7a8c" },
    { id:"shadowblade", name:"Shadow", core:"#8c2a5e", deep:"#4d1734" },
    { id:"dawnmage",    name:"Light",  core:"#ffe234", deep:"#8c7c1d" },
    { id:"stormseeker", name:"Arc",    core:"#f97316", deep:"#893f0c" },
    { id:"tidecaller",  name:"Water",  core:"#2277ff", deep:"#13418c" },
    { id:"stonewarden", name:"Rock",   core:"#a87832", deep:"#5c421c" }
  ];

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

  function glyphPaths(name, cx, cy){
    // returns array of {d, hi?:bool} primary stroke/fill paths for the central glyph
    if(name === "octagram"){
      return {
        fill: octagram(cx, cy, 122, 50, -Math.PI/2),
        inner: octagram(cx, cy, 66, 24, -Math.PI/2),
        pip: { cx:cx, cy:cy, r:11 }
      };
    }
    if(name === "eye"){
      // vesica eye + iris + pupil + radiant ticks
      var w=120, h=70;
      var top = "M "+(cx-w)+" "+cy+" Q "+cx+" "+(cy-h)+" "+(cx+w)+" "+cy
              + " Q "+cx+" "+(cy+h)+" "+(cx-w)+" "+cy+" Z";
      return { vesica: top, iris:{cx:cx,cy:cy,r:40}, pupil:{cx:cx,cy:cy,r:15},
        rays: [ [cx,cy-h-6,cx,cy-h-30], [cx,cy+h+6,cx,cy+h+30],
                [cx-w-6,cy,cx-w-26,cy], [cx+w+6,cy,cx+w+26,cy] ] };
    }
    if(name === "staves"){
      // two crossed staves with orbs at the tips + central burst
      var L=120, t=Math.PI/4;
      function tip(sign,ax){ // returns [x,y]
        var a = ax ? t : -t;
        return [cx+sign*L*Math.cos(a), cy+sign*L*Math.sin(a)];
      }
      var p1a=[cx-L*Math.cos(t),cy-L*Math.sin(t)], p1b=[cx+L*Math.cos(t),cy+L*Math.sin(t)];
      var p2a=[cx-L*Math.cos(-t),cy-L*Math.sin(-t)], p2b=[cx+L*Math.cos(-t),cy+L*Math.sin(-t)];
      return { lines:[ [p1a[0],p1a[1],p1b[0],p1b[1]], [p2a[0],p2a[1],p2b[0],p2b[1]] ],
        orbs:[p1a,p1b,p2a,p2b], burst:{cx:cx,cy:cy,r:16} };
    }
  }

  // eight colour-coded kite wedges — the octagram glyph, spectrum mode
  function spectrumGlyph(u, cx, cy, glowAmt){
    var pts=16, rot=-Math.PI/2, step=Math.PI*2/pts;
    var Rout=122, Rin=50;
    var outer=[], inner=[];
    for(var i=0;i<pts;i++){
      var a = rot + i*step, r = (i%2===0)?Rout:Rin;
      var pt = [cx+r*Math.cos(a), cy+r*Math.sin(a)];
      if(i%2===0) outer.push(pt); else inner.push(pt);
    }
    var defs="", body="";
    for(var k=0;k<8;k++){
      var cls = CLASS_COLORS[k];
      var o = outer[k], ip = inner[(k+7)%8], iN = inner[k];
      var gid = u+"sp"+k;
      defs += '<linearGradient id="'+gid+'" gradientUnits="userSpaceOnUse" x1="'+cx+'" y1="'+cy+'" x2="'+o[0].toFixed(1)+'" y2="'+o[1].toFixed(1)+'">'
            + '<stop offset="0%" stop-color="'+cls.deep+'"/>'
            + '<stop offset="55%" stop-color="'+cls.core+'"/>'
            + '<stop offset="100%" stop-color="#ffffff"/></linearGradient>';
      var d = "M "+cx+" "+cy+" L "+ip[0].toFixed(1)+" "+ip[1].toFixed(1)+" L "+o[0].toFixed(1)+" "+o[1].toFixed(1)+" L "+iN[0].toFixed(1)+" "+iN[1].toFixed(1)+" Z";
      body += '<path d="'+d+'" fill="'+cls.core+'" opacity="'+(0.75*glowAmt)+'" filter="url(#'+u+'tight)"/>';
      body += '<path d="'+d+'" fill="url(#'+gid+')" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>';
      body += '<path d="'+star4(o[0],o[1],10,3)+'" fill="#ffffff" opacity="0.9"/>';
    }
    body += '<circle cx="'+cx+'" cy="'+cy+'" r="15" fill="#fff6d6"/><circle cx="'+cx+'" cy="'+cy+'" r="9" fill="#ffe07a"/>';
    return { defs:defs, body:body };
  }

  function buildCompass(opts){
    opts = opts || {};
    var size = opts.size || 512;
    var glyph = opts.glyph || "octagram";
    var mode = opts.mode || "mono";
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
          + '<stop offset="0%" stop-color="'+c.bright+'"/>'
          + '<stop offset="62%" stop-color="'+c.core+'"/>'
          + '<stop offset="100%" stop-color="'+c.deep+'"/></radialGradient>';
    defs += '<filter id="'+u+'soft" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="'+(6*glowAmt)+'"/></filter>';
    defs += '<filter id="'+u+'tight" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="'+(2.6*glowAmt)+'"/></filter>';

    var body = "";
    // ambient bloom
    body += '<circle cx="'+cx+'" cy="'+cy+'" r="238" fill="url(#'+u+'bloom)"/>';

    // ---- neon ring helper ----
    function ring(R, w){
      var s = "";
      s += '<circle cx="'+cx+'" cy="'+cy+'" r="'+R+'" fill="none" stroke="'+c.glow+'" stroke-width="'+(w+5)+'" stroke-opacity="'+(0.8*glowAmt)+'" filter="url(#'+u+'soft)"/>';
      s += '<circle cx="'+cx+'" cy="'+cy+'" r="'+R+'" fill="none" stroke="'+c.core+'" stroke-width="'+w+'"/>';
      s += '<circle cx="'+cx+'" cy="'+cy+'" r="'+R+'" fill="none" stroke="'+c.hi+'" stroke-width="'+(w*0.34)+'" stroke-opacity="0.9"/>';
      return s;
    }
    body += ring(Rout, 4.5);
    body += ring(Rin, 3.4);

    // ---- cardinal seal-points ----
    function seal(px, py, L, s){
      var g = "";
      g += '<path d="'+star4(px,py,L+6,s+3)+'" fill="'+c.glow+'" opacity="'+(0.8*glowAmt)+'" filter="url(#'+u+'soft)"/>';
      g += '<path d="'+star4(px,py,L,s)+'" fill="'+c.hi+'"/>';
      g += '<path d="'+star4(px,py,L*0.5,s*0.5)+'" fill="#ffffff"/>';
      return g;
    }
    var card = [[cx,cy-Rout],[cx+Rout,cy],[cx,cy+Rout],[cx-Rout,cy]];
    for(var k=0;k<4;k++) body += seal(card[k][0], card[k][1], 15, 4.5);
    // small inner seal-points (diagonals on inner ring)
    var dr = Rin*Math.SQRT1_2;
    var diag = [[cx-dr,cy-dr],[cx+dr,cy-dr],[cx+dr,cy+dr],[cx-dr,cy+dr]];
    for(k=0;k<4;k++) body += seal(diag[k][0], diag[k][1], 7, 2.2);

    // ---- central glyph ----
    if(glyph === "octagram" && mode === "spectrum"){
      var sp = spectrumGlyph(u, cx, cy, glowAmt);
      defs += sp.defs;
      body += sp.body;
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="'+size+'" height="'+size+'">'
        + '<defs>'+defs+'</defs>'+body+'</svg>';
    }
    var g = glyphPaths(glyph, cx, cy);
    var gl = '<g filter="url(#'+u+'tight)" opacity="'+(0.85*glowAmt)+'">'; // glow pass (color)
    var fg = '<g>'; // crisp pass
    if(glyph === "octagram"){
      gl += '<path d="'+g.fill+'" fill="'+c.glow+'"/></g>';
      fg += '<path d="'+g.fill+'" fill="url(#'+u+'gfill)" stroke="'+c.hi+'" stroke-width="1.2" stroke-opacity="0.7"/>';
      fg += '<path d="'+g.inner+'" fill="'+c.hi+'" opacity="0.9"/>';
      fg += '<circle cx="'+g.pip.cx+'" cy="'+g.pip.cy+'" r="'+g.pip.r+'" fill="#fff"/></g>';
    } else if(glyph === "eye"){
      gl += '<path d="'+g.vesica+'" fill="'+c.glow+'"/></g>';
      fg += '<path d="'+g.vesica+'" fill="none" stroke="url(#'+u+'gfill)" stroke-width="9" stroke-linejoin="round"/>';
      fg += '<circle cx="'+g.iris.cx+'" cy="'+g.iris.cy+'" r="'+g.iris.r+'" fill="url(#'+u+'gfill)"/>';
      fg += '<circle cx="'+g.pupil.cx+'" cy="'+g.pupil.cy+'" r="'+g.pupil.r+'" fill="#1a1206"/>';
      fg += '<circle cx="'+(g.pupil.cx-4)+'" cy="'+(g.pupil.cy-4)+'" r="4" fill="#fff" opacity="0.9"/>';
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

  root.buildCompass = buildCompass;
  root.COMPASS_PRESETS = PRESETS;
  root.COMPASS_CLASS_COLORS = CLASS_COLORS;
})(typeof window !== "undefined" ? window : globalThis);
