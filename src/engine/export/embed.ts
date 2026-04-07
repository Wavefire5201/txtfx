import type { SceneData } from "../scene";

function sanitizeCSS(val: string): string {
  return val.replace(/[;{}\\<>]/g, '');
}

/**
 * Generates an embeddable HTML snippet (iframe-friendly)
 * that can be dropped into any webpage.
 */
export function exportEmbedSnippet(scene: SceneData): string {
  const sceneB64 = typeof btoa === "function"
    ? btoa(unescape(encodeURIComponent(JSON.stringify(scene))))
    : Buffer.from(JSON.stringify(scene)).toString("base64");

  return `<!-- txtfx embed -->
<div style="position:relative;width:100%;max-width:800px;aspect-ratio:16/9;background:#0a0a0e;border-radius:8px;overflow:hidden">
  <iframe
    srcdoc='${createMinimalPlayer(scene).replace(/'/g, "&#39;")}'
    style="width:100%;height:100%;border:none"
    sandbox="allow-scripts"
    loading="lazy"
    title="txtfx scene"
  ></iframe>
</div>
<!-- /txtfx embed -->`;
}

function createMinimalPlayer(scene: SceneData): string {
  const b64 = typeof btoa === "function"
    ? btoa(unescape(encodeURIComponent(JSON.stringify(scene))))
    : Buffer.from(JSON.stringify(scene)).toString("base64");

  const safeFontFamily = sanitizeCSS(scene.ascii.fontFamily);

  return `<!DOCTYPE html>
<html><head><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:#0a0a0e}
.w{position:relative;width:100%;height:100%}
.bg{position:absolute;inset:0;background-size:cover;background-position:center;opacity:.86}
pre{position:absolute;inset:0;margin:0;padding:10px 8px 8px;overflow:hidden;white-space:pre;user-select:none;pointer-events:none;font-weight:700;line-height:.78;letter-spacing:.06em;mix-blend-mode:screen}
.a{color:rgba(220,230,255,.38)}
.f{color:rgba(255,250,240,.95);text-shadow:0 0 6px rgba(200,220,255,.8)}
canvas.g{position:absolute;inset:0;pointer-events:none;z-index:3}
</style></head><body>
<div class="w"><div class="bg" id="bg"></div>
<pre class="a" id="A"></pre><pre class="f" id="F"></pre><canvas class="g" id="G"></canvas></div>
<script>var S=JSON.parse(decodeURIComponent(escape(atob("${b64}"))));
(function(){
var bg=document.getElementById("bg"),A=document.getElementById("A"),F=document.getElementById("F"),G=document.getElementById("G");
if(S.image.data)bg.style.backgroundImage='url("'+S.image.data+'")';
var st=S.ascii||{};
var ps="font-size:"+(st.fontSize||"0.85vw")+";font-family:"+(st.fontFamily||"monospace")+";line-height:"+(st.lineHeight||.78)+";letter-spacing:"+(st.letterSpacing||"0.06em");
A.setAttribute("style",A.getAttribute("style")+";"+ps+";color:"+(st.color||"rgba(220,230,255,.38)")+";opacity:"+(st.opacity||.38));
F.setAttribute("style",F.getAttribute("style")+";"+ps);

var C=80,R=40,cw=6,ch=9,fs=12,baseText="";
function measure(){fs=parseFloat(getComputedStyle(A).fontSize);cw=fs*.6;ch=fs*.78;var rc=A.getBoundingClientRect();C=Math.floor((rc.width-16)/cw);R=Math.floor((rc.height-18)/ch);}

function buildAscii(cb){
  if(!S.image.data){cb();return}
  var img=new Image();img.crossOrigin="anonymous";
  img.onload=function(){measure();var cv=document.createElement("canvas");cv.width=C;cv.height=R;
  var cx=cv.getContext("2d"),iw=img.naturalWidth,ih=img.naturalHeight,ia=iw/ih,ca=C/R,sx=0,sy=0,sw=iw,sh=ih;
  if(ia>ca){sw=ih*ca;sx=(iw-sw)/2}else{sh=iw/ca;sy=(ih-sh)/2}
  cx.drawImage(img,sx,sy,sw,sh,0,0,C,R);var d=cx.getImageData(0,0,C,R).data,ramp=" .\`,:;cbaO0%#@",out="";
  for(var y=0;y<R;y++){var ln="";for(var x=0;x<C;x++){var i=(y*C+x)*4;var l=(.299*d[i]+.587*d[i+1]+.114*d[i+2])/255;ln+=ramp[Math.floor(Math.pow(1-l,1)*(ramp.length-1))];}out+=ln+"\\n";}
  baseText=out;A.textContent=out;cb();};
  img.src=S.image.data;
}

var EF={
twinkle:function(p){var stars=[],n=p.count||50;for(var i=0;i<n;i++)stars.push({c:~~(Math.random()*C),r:~~(Math.random()*R),ph:Math.random()*6.28,sp:(p.speedMin||.5)+Math.random()*((p.speedMax||2.3)-(p.speedMin||.5))});return function(dt,t,out){for(var i=0;i<stars.length;i++){var s=stars[i],pulse=.5+.5*Math.sin(t*s.sp+s.ph);if(pulse>.25)out.push({r:s.r,c:s.c,ch:pulse>.85?"*":pulse>.6?"+":".",b:pulse});}};},
rain:function(p){var drops=[],den=p.density||.3,sn=p.speedMin||15,sx=p.speedMax||35,w=p.wind||0,acc=0;return function(dt,t,out){acc+=C*den*dt;var n=~~acc;acc-=n;for(var i=0;i<n;i++)drops.push({c:~~(Math.random()*C),y:-1,sp:sn+Math.random()*(sx-sn),len:2+~~(Math.random()*3)});for(var i=drops.length-1;i>=0;i--){var d=drops[i];d.y+=d.sp*dt;d.c+=w*dt;if(d.y-d.len>R){drops.splice(i,1);continue}var hr=~~d.y,col=Math.round(d.c);for(var j=0;j<d.len;j++){var r=hr-j;if(r>=0&&r<R&&col>=0&&col<C)out.push({r:r,c:col,ch:j===0?"|":j===1?":":".",b:1-j/d.len});}};};},
snow:function(p){var fl=[],den=p.density||.15,sn=p.speedMin||2,sx=p.speedMax||6,dr=p.driftAmount||2,acc=0;return function(dt,t,out){acc+=C*den*dt;var n=~~acc;acc-=n;for(var i=0;i<n;i++)fl.push({c:Math.random()*C,y:-1,sp:sn+Math.random()*(sx-sn),ph:Math.random()*6.28});for(var i=fl.length-1;i>=0;i--){var f=fl[i];f.y+=f.sp*dt;f.c+=Math.sin(t*1.5+f.ph)*dr*dt;if(f.y>R){fl.splice(i,1);continue}var r=~~f.y,c=~~f.c;if(r>=0&&r<R&&c>=0&&c<C)out.push({r:r,c:c,ch:f.sp>4?"*":".",b:.6+.4*Math.sin(t+f.ph)});}};},
fire:function(p){var em=[],int=p.intensity||.5,ht=p.height||.3,sp=p.spread||1.5,acc=0,ramp=["@","#","*","+","."," "];return function(dt,t,out){acc+=C*int*dt*3;var n=~~acc;acc-=n;for(var i=0;i<n;i++)em.push({c:Math.random()*C,y:R-1+Math.random(),sp:5+Math.random()*10,life:0,mx:.5+Math.random()*1.5*ht});for(var i=em.length-1;i>=0;i--){var e=em[i];e.life+=dt;e.y-=e.sp*dt;e.c+=(Math.random()-.5)*sp*dt*5;if(e.life>e.mx){em.splice(i,1);continue}var tt=e.life/e.mx,ri=Math.min(~~(tt*(ramp.length-1)),ramp.length-1),ch=ramp[ri];if(ch===" ")continue;var r=Math.round(e.y),c=Math.round(e.c);if(r>=0&&r<R&&c>=0&&c<C)out.push({r:r,c:c,ch:ch,b:1-tt});}};},
matrix:function(p){var cols=[],den=p.density||.4,sn=p.speedMin||5,sx=p.speedMax||14,MC="0123456789abcdefABCDEF:.<>+*";function rc(){return MC[~~(Math.random()*MC.length)]}for(var i=0;i<C;i++){if(Math.random()>den)continue;cols.push({col:i,sp:sn+Math.random()*(sx-sn),ph:-(Math.random()*R),len:8+~~(Math.random()*14),del:.5+Math.random()*3,wt:0,chs:Array.from({length:R},rc)});}return function(dt,t,out){for(var i=0;i<cols.length;i++){var co=cols[i];if(co.ph>R+co.len){co.wt+=dt;if(co.wt>=co.del){co.ph=-co.len;co.wt=0;co.sp=sn+Math.random()*(sx-sn);co.len=8+~~(Math.random()*14);co.col=~~(Math.random()*C);co.chs=Array.from({length:R},rc);}continue;}co.ph+=co.sp*dt;var hr=~~co.ph;if(Math.random()<.05){var ci=~~(Math.random()*co.chs.length);co.chs[ci]=rc();}for(var j=0;j<co.len;j++){var r=hr-j;if(r<0||r>=R)continue;var b=j===0?1:j<3?.7:Math.max(.1,.5*(1-j/co.len));out.push({r:r,c:co.col,ch:co.chs[r]||rc(),b:b});}}};},
meteor:function(p){var ms=[],imin=p.intervalMin||3,imax=p.intervalMax||7,sn=p.speedMin||22,sx=p.speedMax||36,tl=p.trailLength||25,next=1,acc=0;var ang=(p.angle||-75)*Math.PI/180,dc=Math.cos(ang),dr=Math.sin(-ang);return function(dt,t,out){if(t>next){ms.push({c:Math.random()*C*1.1-C*.05,r:-2,age:0,mx:2+Math.random()*1.2,sp:sn+Math.random()*(sx-sn),trail:[]});next=t+imin+Math.random()*(imax-imin);}for(var i=ms.length-1;i>=0;i--){var m=ms[i];m.age+=dt;m.c+=dc*m.sp*dt;m.r+=dr*m.sp*dt;m.trail.push({c:Math.round(m.c),r:Math.round(m.r),age:0});while(m.trail.length>tl)m.trail.shift();for(var j=0;j<m.trail.length;j++)m.trail[j].age+=dt;var off=m.r>R+2||m.c>C+2||m.c<-2;if((m.age>m.mx||off)&&m.trail.every(function(p){return p.age>.7})){ms.splice(i,1);continue}for(var j=0;j<m.trail.length;j++){var p2=m.trail[j];if(p2.age>.7)continue;var ch=p2.age<.12?"*":p2.age<.35?"+":".";out.push({r:p2.r,c:p2.c,ch:ch,b:1-p2.age/.7});}if(m.age<m.mx&&!off)out.push({r:Math.round(m.r),c:Math.round(m.c),ch:"@",b:1});}};},
firework:function(p){var bu=[],next=3+Math.random()*2,imin=p.intervalMin||3,imax=p.intervalMax||5,pc=p.particleCount||50,mr=p.maxRadius||20;return function(dt,t,out){if(t>next){var cx=C>16?8+Math.random()*(C-16):C/2,cy=R>12?6+Math.random()*(R-12):R/2,parts=[];for(var i=0;i<pc;i++){var a=6.28*i/pc+(Math.random()-.5)*.5,d=(.4+.6*Math.random())*mr;parts.push({cx:cx,cy:cy,a:a,d:d,life:0,mx:.7+Math.random()});}for(var i=0;i<16;i++)parts.push({cx:cx,cy:cy,a:Math.random()*6.28,d:2+Math.random()*4,life:0,mx:.2+Math.random()*.3});bu.push({parts:parts});next=t+imin+Math.random()*(imax-imin);}for(var i=bu.length-1;i>=0;i--){var b=bu[i],alive=false;for(var j=0;j<b.parts.length;j++){var pp=b.parts[j];pp.life+=dt;if(pp.life>pp.mx)continue;alive=true;var tt=pp.life/pp.mx,ease=1-Math.pow(1-Math.min(1,2.2*tt),3),dist=pp.d*ease;var rr=Math.round(pp.cy+Math.sin(pp.a)*dist*.45),cc=Math.round(pp.cx+Math.cos(pp.a)*dist);if(rr>=0&&rr<R&&cc>=0&&cc<C)out.push({r:rr,c:cc,ch:tt<.3?"@":tt<.6?"+":".",b:Math.pow(1-tt,2)});}if(!alive)bu.splice(i,1);}};},
glitch:function(p){var bl=[],int=p.frequency||.3,bs=p.blockSize||6,acc=0,gc="!@#$%&*<>[]{}|/\\\\~";return function(dt,t,out){acc+=int*dt*3;if(acc>=1){acc-=1;var w=2+~~(Math.random()*bs),h=1+~~(Math.random()*(bs/2));bl.push({c:~~(Math.random()*Math.max(1,C-w)),r:~~(Math.random()*Math.max(1,R-h)),w:w,h:h,life:0,mx:.1+Math.random()*.3});}for(var i=bl.length-1;i>=0;i--){var b=bl[i];b.life+=dt;if(b.life>b.mx){bl.splice(i,1);continue}for(var r=0;r<b.h;r++)for(var c=0;c<b.w;c++){var rr=b.r+r,cc=b.c+c;if(rr>=0&&rr<R&&cc>=0&&cc<C)out.push({r:rr,c:cc,ch:gc[~~(Math.random()*gc.length)],b:.7+.3*Math.random()});}}};},
scanline:function(p){var sp=p.speed||8,w=p.width||2,br=p.brightness||1,cnt=p.count||1,chs=p.chars||"=-~";return function(dt,t,out){for(var s=0;s<cnt;s++){var phase=(s/cnt)*R;var head=((t*sp+phase)%(R+w))-w;for(var wi=0;wi<w;wi++){var r=~~(head+wi);if(r<0||r>=R)continue;var tt=wi/w,b=br*(1-tt*.6),ch=chs[Math.min(wi,chs.length-1)]||"=";for(var c=0;c<C;c++){var fl=Math.sin(c*.5+t*12+s*3)*.15;out.push({r:r,c:c,ch:ch,b:Math.max(.1,b+fl)});}}}};},
typewriter:function(p){var bt=null,sp=p.speed||80;return function(dt,t,out){if(!bt)bt=baseText.split("\\n");var total=0;for(var i=0;i<bt.length;i++)total+=bt[i].length;var shown=Math.min(~~(t*sp),total),idx=0;for(var r=0;r<Math.min(bt.length,R);r++){var ln=bt[r]||"";for(var c=0;c<ln.length;c++){if(idx<shown&&ln[c]!==" ")out.push({r:r,c:c,ch:ln[c],b:1});idx++;}};};},
decode:function(p){var bt=null,sp=p.duration||2.4,ramp="@#W$9876543210?!abc;:+=-,._ ",delays=null;return function(dt,t,out){if(!bt){bt=baseText.split("\\n");delays=[];for(var r=0;r<Math.min(bt.length,R);r++){var row=[];for(var c=0;c<C;c++){var bias=p.diagonalBias||0.7;row.push((c/C+r/R)/2*bias+(1-bias)*Math.random());}delays.push(row);}}for(var r=0;r<Math.min(bt.length,R);r++){var ln=bt[r]||"";for(var c=0;c<ln.length;c++){if(ln[c]===" ")continue;var delay=delays[r][c]*sp*2;var el=t-delay;if(el<0){if(Math.random()<.15)out.push({r:r,c:c,ch:ramp[~~(Math.random()*(ramp.length-1))],b:.3});}else if(el<(p.settleTime||0.4)){out.push({r:r,c:c,ch:Math.random()<.5?ln[c]:ramp[~~(Math.random()*(ramp.length-1))],b:.7});}else{out.push({r:r,c:c,ch:ln[c],b:1});}};};},
"custom-emitter":function(p){var parts=[],rate=p.spawnRate||10,sp=p.speed||8,life=p.lifetime||2,sprd=(p.spread||30)*Math.PI/180,acc=0,pch=p.chars||"*+.";return function(dt,t,out){acc+=rate*dt;var n=~~acc;acc-=n;var ox=C*(p.spawnX||0.5),oy=R*(p.spawnY||1.0);for(var i=0;i<n;i++){var dir=(p.direction||-90)*Math.PI/180;var a=dir+Math.random()*sprd-sprd/2;parts.push({x:ox,y:oy,vx:Math.cos(a)*sp*(.5+Math.random()),vy:Math.sin(a)*sp*.45*(.5+Math.random()),life:0,mx:life*(.5+Math.random())});}for(var i=parts.length-1;i>=0;i--){var pp=parts[i];pp.life+=dt;if(pp.life>pp.mx){parts.splice(i,1);continue}pp.x+=pp.vx*dt;pp.y+=pp.vy*dt;pp.vy+=(p.gravity||0)*dt;var r=~~pp.y,c=~~pp.x,tt=pp.life/pp.mx;if(r>=0&&r<R&&c>=0&&c<C)out.push({r:r,c:c,ch:pch[~~(tt*(pch.length-1))]||".",b:Math.pow(1-tt,2)});}};},
};

function hexRGB(h){if(!h||h[0]!=="#")return null;return[parseInt(h.slice(1,3),16)||0,parseInt(h.slice(3,5),16)||0,parseInt(h.slice(5,7),16)||0];}
var active=[];
function initEffects(){active=[];if(!S.effects)return;for(var i=0;i<S.effects.length;i++){var cfg=S.effects[i];if(!cfg.enabled)continue;var factory=EF[cfg.type];if(!factory)continue;active.push({fn:factory(cfg.params||{}),start:cfg.timeline.start,end:cfg.timeline.end,color:cfg.params&&cfg.params.color||null,gr:cfg.params&&cfg.params.glowRadius||null});}}

var _raf=0;
function animate(){
  if(_raf)cancelAnimationFrame(_raf);
  initEffects();
  var t0=performance.now(),dur=S.playback.duration,loop=S.playback.loop,lastT=0,dpr=window.devicePixelRatio||1;
  var lastFrame=0,fpsInterval=1/(S.playback.fps||30);
  function tick(){
    var wallNow=performance.now()/1000;
    if(wallNow-lastFrame<fpsInterval){_raf=requestAnimationFrame(tick);return;}
    lastFrame=wallNow;
    var el=(performance.now()-t0)/1000,t=loop&&dur>0?el%dur:Math.min(el,dur);
    if(!loop&&el>dur)return;
    var dt=Math.min(.05,Math.abs(t-lastT));if(t<lastT-.1)initEffects();lastT=t;
    var cells=[];
    for(var i=0;i<active.length;i++){var a=active[i];if(t<a.start)continue;if(a.end!==null&&t>a.end)continue;var before=cells.length;a.fn(dt,t-a.start,cells);if(a.color){var rgb=hexRGB(a.color);if(rgb)for(var j=before;j<cells.length;j++){cells[j].color=a.color;cells[j].rgb=rgb;cells[j].gr=a.gr;}}}
    var bm=new Float32Array(C*R),cmap=new Uint8Array(C*R),chars=[" "],ci={" ":0};
    for(var i=0;i<cells.length;i++){var cell=cells[i];if(cell.r<0||cell.r>=R||cell.c<0||cell.c>=C)continue;var idx=cell.r*C+cell.c,b=cell.b||.5;if(b>bm[idx]){bm[idx]=b;var ch=cell.ch;var k=ci[ch];if(k===undefined){k=chars.length;chars.push(ch);ci[ch]=k;}cmap[idx]=k;}}
    var lines=[];for(var r=0;r<R;r++){var ln="";for(var c=0;c<C;c++)ln+=chars[cmap[r*C+c]];lines.push(ln);}
    F.textContent=lines.join("\\n");
    var hasGlow=false;for(var i=0;i<cells.length;i++){if(cells[i].rgb){hasGlow=true;break;}}
    if(hasGlow&&G){var rect=G.parentElement.getBoundingClientRect();G.width=rect.width*dpr;G.height=rect.height*dpr;G.style.width=rect.width+"px";G.style.height=rect.height+"px";var ctx=G.getContext("2d");if(ctx){ctx.scale(dpr,dpr);ctx.font=fs+"px ${safeFontFamily}";ctx.textBaseline="top";for(var i=0;i<cells.length;i++){var cell=cells[i];if(!cell.rgb||cell.r<0||cell.r>=R||cell.c<0||cell.c>=C)continue;var x=8+cell.c*cw,y=10+cell.r*ch,ccx=x+cw*.5,ccy=y+ch*.5;var rgb=cell.rgb,a=cell.b||.5,gr=cell.gr||(4+14*a);var gd=ctx.createRadialGradient(ccx,ccy,0,ccx,ccy,gr);gd.addColorStop(0,"rgba("+rgb[0]+","+rgb[1]+","+rgb[2]+","+(a*.7)+")");gd.addColorStop(.4,"rgba("+rgb[0]+","+rgb[1]+","+rgb[2]+","+(a*.28)+")");gd.addColorStop(1,"rgba("+rgb[0]+","+rgb[1]+","+rgb[2]+",0)");ctx.fillStyle=gd;ctx.fillRect(ccx-gr,ccy-gr,gr*2,gr*2);ctx.save();ctx.shadowColor="rgba("+rgb[0]+","+rgb[1]+","+rgb[2]+","+Math.min(1,a)+")";ctx.shadowBlur=12;ctx.fillStyle="rgba("+rgb[0]+","+rgb[1]+","+rgb[2]+","+Math.min(1,a*.95)+")";ctx.fillText(cell.ch,x,y);ctx.fillText(cell.ch,x,y);ctx.restore();}}}else if(G){G.width=0;G.height=0;}
    _raf=requestAnimationFrame(tick);
  }_raf=requestAnimationFrame(tick);
}
buildAscii(animate);
window.addEventListener("resize",function(){measure();buildAscii(animate)});
})();
</script></body></html>`;
}

/**
 * Generates a shareable URL with scene data encoded in the hash.
 * Only works for small scenes (URL length limits).
 */
export function generateShareURL(baseUrl: string, scene: SceneData): string {
  const json = JSON.stringify(scene);
  const encoded = typeof btoa === "function"
    ? btoa(unescape(encodeURIComponent(json)))
    : Buffer.from(json).toString("base64");
  return `${baseUrl}#scene=${encoded}`;
}
