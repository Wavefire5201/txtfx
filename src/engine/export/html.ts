import type { SceneData } from "../scene";

function sanitizeCSS(val: string): string {
  return val.replace(/[;{}\\<>]/g, '');
}

export function exportStandaloneHTML(scene: SceneData): string {
  const safeJSON = JSON.stringify(scene)
    .replace(/<\//g, '<\\/')
    .replace(/<!--/g, '<\\!--');

  const safeFontSize = sanitizeCSS(scene.ascii.fontSize);
  const safeFontFamily = sanitizeCSS(scene.ascii.fontFamily);
  const safeLetterSpacing = sanitizeCSS(scene.ascii.letterSpacing);
  const safeColor = sanitizeCSS(scene.ascii.color);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>txtfx scene</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:#0a0a0e}
.wrap{position:relative;width:100%;height:100%}
.bg{position:absolute;inset:0;background-size:cover;background-position:center;transform:scale(1.03);opacity:.86}
.vig{position:absolute;inset:0;background:radial-gradient(at left top,rgba(0,0,0,.45),transparent 50%),radial-gradient(at right top,rgba(0,0,0,.45),transparent 50%),radial-gradient(at left bottom,rgba(0,0,0,.45),transparent 50%),radial-gradient(at right bottom,rgba(0,0,0,.45),transparent 50%)}
pre{position:absolute;inset:0;margin:0;padding:10px 8px 8px;overflow:hidden;white-space:pre;user-select:none;pointer-events:none;font-weight:700;mix-blend-mode:screen}
.a{color:rgba(220,230,255,.38);text-shadow:0 0 8px rgba(255,255,255,.04),0 0 16px rgba(140,180,255,.03)}
.f{color:rgba(255,250,240,.95);text-shadow:0 0 6px rgba(200,220,255,.8),0 0 14px rgba(160,200,255,.4)}
canvas.glow{position:absolute;inset:0;pointer-events:none;z-index:3}
.info{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);background:rgba(26,26,31,.85);padding:6px 14px;border-radius:8px;backdrop-filter:blur(8px);font:11px system-ui;color:#666;letter-spacing:.02em}
</style>
</head>
<body>
<div class="wrap" id="W">
  <div class="bg" id="bg"></div>
  <div class="vig"></div>
  <pre class="a" id="A"></pre>
  <pre class="f" id="F"></pre>
  <canvas class="glow" id="G"></canvas>
  <div class="info">Made with txtfx</div>
</div>
<script>
var S=${safeJSON};
(function(){
var bg=document.getElementById("bg"),A=document.getElementById("A"),F=document.getElementById("F"),G=document.getElementById("G");
var ps="font-size:${safeFontSize};font-family:${safeFontFamily};line-height:${scene.ascii.lineHeight};letter-spacing:${safeLetterSpacing}";
A.setAttribute("style",A.getAttribute("style")+";"+ps+";color:${safeColor};opacity:${scene.ascii.opacity}");
F.setAttribute("style",F.getAttribute("style")+";"+ps);
if(S.image.data)bg.style.backgroundImage='url("'+S.image.data+'")';

var C=80,R=40,cw=6,ch=9,fs=12,baseText="";

function measure(){
  fs=parseFloat(getComputedStyle(A).fontSize);
  cw=fs*0.6;ch=fs*0.78;
  var rc=A.getBoundingClientRect();
  C=Math.floor((rc.width-16)/cw);
  R=Math.floor((rc.height-18)/ch);
}

function buildAscii(cb){
  if(!S.image.data){cb();return}
  var img=new Image();img.crossOrigin="anonymous";
  img.onload=function(){
    measure();
    var cv=document.createElement("canvas");cv.width=C;cv.height=R;
    var cx=cv.getContext("2d"),iw=img.naturalWidth,ih=img.naturalHeight;
    var ia=iw/ih,ca=C/R,sx=0,sy=0,sw=iw,sh=ih;
    if(ia>ca){sw=ih*ca;sx=(iw-sw)/2}else{sh=iw/ca;sy=(ih-sh)/2}
    cx.drawImage(img,sx,sy,sw,sh,0,0,C,R);
    var d=cx.getImageData(0,0,C,R).data,ramp=" .\`,:;cbaO0%#@",out="";
    for(var y=0;y<R;y++){var ln="";for(var x=0;x<C;x++){var i=(y*C+x)*4;var l=(.299*d[i]+.587*d[i+1]+.114*d[i+2])/255;ln+=ramp[Math.floor(Math.pow(1-l,1)*(ramp.length-1))];}out+=ln+"\\n";}
    baseText=out;A.textContent=out;cb();
  };
  img.src=S.image.data;
}

// --- Effect implementations ---
var EF={
twinkle:function(p){
  var stars=[],n=p.count||50;
  for(var i=0;i<n;i++)stars.push({c:~~(Math.random()*C),r:~~(Math.random()*R),ph:Math.random()*6.28,sp:(p.speedMin||.5)+Math.random()*((p.speedMax||2.3)-(p.speedMin||.5))});
  return function(dt,t,out){
    for(var i=0;i<stars.length;i++){var s=stars[i],pulse=.5+.5*Math.sin(t*s.sp+s.ph);
    if(pulse>.25)out.push({r:s.r,c:s.c,ch:pulse>.85?"*":pulse>.6?"+":".",b:pulse});}
  };
},
rain:function(p){
  var drops=[],den=p.density||.3,sn=p.speedMin||15,sx=p.speedMax||35,w=p.wind||0,acc=0;
  return function(dt,t,out){
    acc+=C*den*dt;var n=~~acc;acc-=n;
    for(var i=0;i<n;i++)drops.push({c:~~(Math.random()*C),y:-1,sp:sn+Math.random()*(sx-sn),len:2+~~(Math.random()*3)});
    for(var i=drops.length-1;i>=0;i--){var d=drops[i];d.y+=d.sp*dt;d.c+=w*dt;
    if(d.y-d.len>R){drops.splice(i,1);continue}
    var hr=~~d.y,col=Math.round(d.c);
    for(var j=0;j<d.len;j++){var r=hr-j;if(r>=0&&r<R&&col>=0&&col<C)out.push({r:r,c:col,ch:j===0?"|":j===1?":":".",b:1-j/d.len});}}
  };
},
snow:function(p){
  var flakes=[],den=p.density||.15,sn=p.speedMin||2,sx=p.speedMax||6,dr=p.driftAmount||2,acc=0;
  return function(dt,t,out){
    acc+=C*den*dt;var n=~~acc;acc-=n;
    for(var i=0;i<n;i++)flakes.push({c:Math.random()*C,y:-1,sp:sn+Math.random()*(sx-sn),ph:Math.random()*6.28});
    for(var i=flakes.length-1;i>=0;i--){var f=flakes[i];f.y+=f.sp*dt;f.c+=Math.sin(t*1.5+f.ph)*dr*dt;
    if(f.y>R){flakes.splice(i,1);continue}
    var r=~~f.y,c=~~f.c;if(r>=0&&r<R&&c>=0&&c<C)out.push({r:r,c:c,ch:f.sp>4?"*":".",b:.6+.4*Math.sin(t+f.ph)});}
  };
},
fire:function(p){
  var embers=[],int=p.intensity||.5,ht=p.height||.3,sp=p.spread||1.5,acc=0;
  var ramp=["@","#","*","+","."," "];
  return function(dt,t,out){
    acc+=C*int*dt*3;var n=~~acc;acc-=n;
    for(var i=0;i<n;i++)embers.push({c:Math.random()*C,y:R-1+Math.random(),sp:5+Math.random()*10,life:0,mx:.5+Math.random()*1.5*ht});
    for(var i=embers.length-1;i>=0;i--){var e=embers[i];e.life+=dt;e.y-=e.sp*dt;e.c+=(Math.random()-.5)*sp*dt*5;
    if(e.life>e.mx){embers.splice(i,1);continue}
    var tt=e.life/e.mx,ri=Math.min(~~(tt*(ramp.length-1)),ramp.length-1),ch=ramp[ri];
    if(ch===" ")continue;var r=Math.round(e.y),c=Math.round(e.c);
    if(r>=0&&r<R&&c>=0&&c<C)out.push({r:r,c:c,ch:ch,b:1-tt});}
  };
},
matrix:function(p){
  var cols=[],den=p.density||.4,sn=p.speedMin||5,sx=p.speedMax||14;
  var MC="0123456789abcdefABCDEF:.<>+*";
  function rc(){return MC[~~(Math.random()*MC.length)]}
  for(var i=0;i<C;i++){if(Math.random()>den)continue;
  cols.push({col:i,sp:sn+Math.random()*(sx-sn),ph:-(Math.random()*R),len:8+~~(Math.random()*14),del:.5+Math.random()*3,wt:0,chs:Array.from({length:R},rc)});}
  return function(dt,t,out){
    for(var i=0;i<cols.length;i++){var co=cols[i];
    if(co.ph>R+co.len){co.wt+=dt;if(co.wt>=co.del){co.ph=-co.len;co.wt=0;co.sp=sn+Math.random()*(sx-sn);co.len=8+~~(Math.random()*14);co.col=~~(Math.random()*C);co.chs=Array.from({length:R},rc);}continue;}
    co.ph+=co.sp*dt;var hr=~~co.ph;if(Math.random()<.05){var ci=~~(Math.random()*co.chs.length);co.chs[ci]=rc();}
    for(var j=0;j<co.len;j++){var r=hr-j;if(r<0||r>=R)continue;
    var b=j===0?1:j<3?.7:Math.max(.1,.5*(1-j/co.len));
    out.push({r:r,c:co.col,ch:co.chs[r]||rc(),b:b});}}
  };
},
meteor:function(p){
  var meteors=[],rate=p.spawnRate||0.3,sn=p.speedMin||15,sx=p.speedMax||30,tl=p.tailLength||8,acc=0;
  return function(dt,t,out){
    acc+=rate*dt;if(acc>=1){acc-=1;
    meteors.push({c:~~(Math.random()*C),r:0,sp:sn+Math.random()*(sx-sn),tl:tl+~~(Math.random()*4)});}
    for(var i=meteors.length-1;i>=0;i--){var m=meteors[i];var ang=(p.angle||-75)*Math.PI/180;m.r-=Math.sin(ang)*m.sp*dt;m.c+=Math.cos(ang)*m.sp*dt;
    if(m.r-m.tl>R){meteors.splice(i,1);continue}
    var hr=~~m.r,hc=~~m.c;
    for(var j=0;j<m.tl;j++){var r=hr-j,c=hc+~~(j*.3);if(r>=0&&r<R&&c>=0&&c<C){
    var b=1-j/m.tl;out.push({r:r,c:c,ch:j===0?"@":j<3?"#":j<5?"*":".",b:b});}}}
  };
},
firework:function(p){
  var bursts=[],next=3+Math.random()*2,imin=p.intervalMin||3,imax=p.intervalMax||5,pc=p.particleCount||50,mr=p.maxRadius||20;
  return function(dt,t,out){
    if(t>next){
      var cx=C>16?8+Math.random()*(C-16):C/2,cy=R>12?6+Math.random()*(R-12):R/2;
      var parts=[];
      for(var i=0;i<pc;i++){var a=6.28*i/pc+(Math.random()-.5)*.5,d=(.4+.6*Math.random())*mr;
      parts.push({cx:cx,cy:cy,a:a,d:d,life:0,mx:.7+Math.random(),type:"m"});}
      for(var i=0;i<16;i++){var a=Math.random()*6.28,d=2+Math.random()*4;
      parts.push({cx:cx,cy:cy,a:a,d:d,life:0,mx:.2+Math.random()*.3,type:"f"});}
      bursts.push({parts:parts,age:0});
      next=t+imin+Math.random()*(imax-imin);
    }
    for(var i=bursts.length-1;i>=0;i--){var bu=bursts[i];bu.age+=dt;var alive=false;
    for(var j=0;j<bu.parts.length;j++){var pp=bu.parts[j];pp.life+=dt;if(pp.life>pp.mx)continue;alive=true;
    var tt=pp.life/pp.mx,ease=1-Math.pow(1-Math.min(1,2.2*tt),3),dist=pp.d*ease;
    var rr=Math.round(pp.cy+Math.sin(pp.a)*dist*.45),cc=Math.round(pp.cx+Math.cos(pp.a)*dist);
    if(rr>=0&&rr<R&&cc>=0&&cc<C){var b=Math.pow(1-tt,2);var ch=tt<.3?"@":tt<.6?"+":".";
    out.push({r:rr,c:cc,ch:ch,b:b});}}
    if(!alive)bursts.splice(i,1);}
  };
},
glitch:function(p){
  var blocks=[],int=p.intensity||.3,bs=p.blockSize||6,acc=0;
  var gc="!@#$%&*<>[]{}|/\\\\~";
  return function(dt,t,out){
    acc+=int*dt*3;if(acc>=1){acc-=1;var w=2+~~(Math.random()*bs),h=1+~~(Math.random()*(bs/2));
    blocks.push({c:~~(Math.random()*Math.max(1,C-w)),r:~~(Math.random()*Math.max(1,R-h)),w:w,h:h,life:0,mx:.1+Math.random()*.3});}
    for(var i=blocks.length-1;i>=0;i--){var bl=blocks[i];bl.life+=dt;if(bl.life>bl.mx){blocks.splice(i,1);continue}
    for(var r=0;r<bl.h;r++)for(var c=0;c<bl.w;c++){var rr=bl.r+r,cc=bl.c+c;
    if(rr>=0&&rr<R&&cc>=0&&cc<C)out.push({r:rr,c:cc,ch:gc[~~(Math.random()*gc.length)],b:.7+.3*Math.random()});}}
  };
},
scanline:function(p){
  var sp=p.speed||8,w=p.width||3,br=p.brightness||1,cnt=p.count||2,chs=p.chars||"=-~";
  return function(dt,t,out){
    for(var s=0;s<cnt;s++){var phase=(s/cnt)*R;var head=((t*sp+phase)%(R+w))-w;
    for(var wi=0;wi<w;wi++){var r=~~(head+wi);if(r<0||r>=R)continue;
    var tt=wi/w,b=br*(1-tt*.6),ch=chs[Math.min(wi,chs.length-1)]||"=";
    for(var c=0;c<C;c++){var fl=Math.sin(c*.5+t*12+s*3)*.15;
    out.push({r:r,c:c,ch:ch,b:Math.max(.1,b+fl)});}}}
  };
},
typewriter:function(p){
  var bt=null,sp=p.speed||80;
  return function(dt,t,out){
    if(!bt)bt=baseText.split("\\n");
    var total=0;for(var i=0;i<bt.length;i++)total+=bt[i].length;
    var shown=Math.min(~~(t*sp),total),idx=0;
    for(var r=0;r<Math.min(bt.length,R);r++){var ln=bt[r]||"";
    for(var c=0;c<ln.length;c++){if(idx<shown&&ln[c]!==" ")out.push({r:r,c:c,ch:ln[c],b:1});idx++;}}
  };
},
decode:function(p){
  var bt=null,sp=p.duration||2.4,ramp="@#W$9876543210?!abc;:+=-,._ ";
  return function(dt,t,out){
    if(!bt)bt=baseText.split("\\n");
    for(var r=0;r<Math.min(bt.length,R);r++){var ln=bt[r]||"";
    for(var c=0;c<ln.length;c++){if(ln[c]===" ")continue;
    var delay=((c/C+r/R)/2*(p.diagonalBias||0.7)+(1-(p.diagonalBias||0.7))*Math.random())*sp*2;var el=t-delay;
    if(el<0){if(Math.random()<.15)out.push({r:r,c:c,ch:ramp[~~(Math.random()*(ramp.length-1))],b:.3});}
    else if(el<(p.settleTime||0.4)){out.push({r:r,c:c,ch:Math.random()<.5?ln[c]:ramp[~~(Math.random()*(ramp.length-1))],b:.7});}
    else{out.push({r:r,c:c,ch:ln[c],b:1});}}}
  };
},
"custom-emitter":function(p){
  var parts=[],rate=p.rate||10,sp=p.speed||8,life=p.life||2,sprd=p.spread||6.28,acc=0;
  var ch=p.chars||"*+.";
  return function(dt,t,out){
    acc+=rate*dt;var n=~~acc;acc-=n;
    var ox=C*(p.spawnX||0.5),oy=R*(p.spawnY||1.0);
    for(var i=0;i<n;i++){var dir=(p.direction||-90)*Math.PI/180;var a=dir+Math.random()*sprd-sprd/2;
    parts.push({x:ox,y:oy,vx:Math.cos(a)*sp*(0.5+Math.random()),vy:Math.sin(a)*sp*.45*(0.5+Math.random()),life:0,mx:life*(.5+Math.random())});}
    for(var i=parts.length-1;i>=0;i--){var pp=parts[i];pp.life+=dt;if(pp.life>pp.mx){parts.splice(i,1);continue}
    pp.x+=pp.vx*dt;pp.y+=pp.vy*dt;pp.vy+=(p.gravity||0)*dt;
    var r=~~pp.y,c=~~pp.x,tt=pp.life/pp.mx;
    if(r>=0&&r<R&&c>=0&&c<C)out.push({r:r,c:c,ch:ch[~~(tt*(ch.length-1))]||".",b:Math.pow(1-tt,2)});}
  };
}
};

// Parse hex color to RGB
function hexRGB(h){
  if(!h||h[0]!=="#")return null;
  return[parseInt(h.slice(1,3),16)||0,parseInt(h.slice(3,5),16)||0,parseInt(h.slice(5,7),16)||0];
}

// Init active effects
var active=[];
function initEffects(){
  active=[];
  if(!S.effects)return;
  for(var i=0;i<S.effects.length;i++){
    var cfg=S.effects[i];
    if(!cfg.enabled)continue;
    var factory=EF[cfg.type];
    if(!factory)continue;
    active.push({fn:factory(cfg.params||{}),start:cfg.timeline.start,end:cfg.timeline.end,color:cfg.params&&cfg.params.color||null,gr:cfg.params&&cfg.params.glowRadius||null});
  }
}

var _raf=0;
function animate(){
  if(_raf)cancelAnimationFrame(_raf);
  initEffects();
  var t0=performance.now(),dur=S.playback.duration,loop=S.playback.loop,lastT=0;
  var dpr=window.devicePixelRatio||1;

  var lastFrame=0;
  var fpsInterval=1/(S.playback.fps||30);
  function tick(){
    var wallNow=performance.now()/1000;
    if(wallNow-lastFrame<fpsInterval){_raf=requestAnimationFrame(tick);return;}
    lastFrame=wallNow;
    var el=(performance.now()-t0)/1000;
    var t=loop&&dur>0?el%dur:Math.min(el,dur);
    if(!loop&&el>dur)return;
    var dt=Math.min(.05,Math.abs(t-lastT));
    if(t<lastT-.1)initEffects();
    lastT=t;

    var cells=[];
    for(var i=0;i<active.length;i++){
      var a=active[i];
      if(t<a.start)continue;
      if(a.end!==null&&t>a.end)continue;
      var before=cells.length;
      a.fn(dt,t-a.start,cells);
      if(a.color){var rgb=hexRGB(a.color);if(rgb)for(var j=before;j<cells.length;j++){cells[j].color=a.color;cells[j].rgb=rgb;cells[j].gr=a.gr;}}
    }

    // Composite to text grid
    var bm=new Float32Array(C*R),cm=new Uint8Array(C*R);
    var chars=[" "],ci={"_":0};ci[" "]=0;
    for(var i=0;i<cells.length;i++){
      var cell=cells[i],idx=cell.r*C+cell.c;
      if(cell.r<0||cell.r>=R||cell.c<0||cell.c>=C)continue;
      var b=cell.b||.5;
      if(b>bm[idx]){bm[idx]=b;var ch=cell.ch;var k=ci[ch];if(k===undefined){k=chars.length;chars.push(ch);ci[ch]=k;}cm[idx]=k;}
    }
    var lines=[];
    for(var r=0;r<R;r++){var ln="";for(var c=0;c<C;c++)ln+=chars[cm[r*C+c]];lines.push(ln);}
    F.textContent=lines.join("\\n");

    // Glow canvas
    var hasGlow=false;
    for(var i=0;i<cells.length;i++){if(cells[i].rgb){hasGlow=true;break;}}
    if(hasGlow&&G){
      var rect=G.parentElement.getBoundingClientRect();
      G.width=rect.width*dpr;G.height=rect.height*dpr;
      G.style.width=rect.width+"px";G.style.height=rect.height+"px";
      var ctx=G.getContext("2d");
      if(ctx){ctx.scale(dpr,dpr);
      ctx.font=fs+"px ${safeFontFamily}";ctx.textBaseline="top";
      for(var i=0;i<cells.length;i++){var cell=cells[i];if(!cell.rgb)continue;
      var x=8+cell.c*cw,y=10+cell.r*ch,cx=x+cw*.5,cy=y+ch*.5;
      var rgb=cell.rgb,a=cell.b||.5,gr=cell.gr||(4+14*a);
      var gd=ctx.createRadialGradient(cx,cy,0,cx,cy,gr);
      gd.addColorStop(0,"rgba("+rgb[0]+","+rgb[1]+","+rgb[2]+","+(a*.7)+")");
      gd.addColorStop(.4,"rgba("+rgb[0]+","+rgb[1]+","+rgb[2]+","+(a*.28)+")");
      gd.addColorStop(1,"rgba("+rgb[0]+","+rgb[1]+","+rgb[2]+",0)");
      ctx.fillStyle=gd;ctx.fillRect(cx-gr,cy-gr,gr*2,gr*2);
      ctx.save();ctx.shadowColor="rgba("+rgb[0]+","+rgb[1]+","+rgb[2]+","+Math.min(1,a)+")";
      ctx.shadowBlur=12;ctx.fillStyle="rgba("+rgb[0]+","+rgb[1]+","+rgb[2]+","+Math.min(1,a*.95)+")";
      ctx.fillText(cell.ch,x,y);ctx.fillText(cell.ch,x,y);ctx.restore();}}
    }else if(G){G.width=0;G.height=0;}

    _raf=requestAnimationFrame(tick);
  }
  _raf=requestAnimationFrame(tick);
}

buildAscii(animate);
window.addEventListener("resize",function(){measure();buildAscii(animate)});
})();
</script>
</body>
</html>`;
}
