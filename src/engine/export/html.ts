import type { SceneData } from "../scene";

/**
 * Generates a standalone HTML file that plays the scene.
 * Inlines the scene JSON and a minimal runtime renderer.
 */
export function exportStandaloneHTML(scene: SceneData): string {
  const sceneJSON = JSON.stringify(scene);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>txtfx scene</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:#0a0a0e}
.wrap{position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center}
.bg{position:absolute;inset:0;background-size:cover;background-position:center;transform:scale(1.03);opacity:.86}
.vignette{position:absolute;inset:0;background:radial-gradient(at left top,rgba(0,0,0,.45),transparent 50%),radial-gradient(at right top,rgba(0,0,0,.45),transparent 50%),radial-gradient(at left bottom,rgba(0,0,0,.45),transparent 50%),radial-gradient(at right bottom,rgba(0,0,0,.45),transparent 50%)}
pre{position:absolute;inset:0;margin:0;padding:10px 8px 8px;overflow:hidden;white-space:pre;user-select:none;pointer-events:none;font-weight:700;mix-blend-mode:screen}
.ascii{color:rgba(220,230,255,.38);text-shadow:0 0 8px rgba(255,255,255,.04),0 0 16px rgba(140,180,255,.03)}
.fx{color:rgba(255,250,240,.95);text-shadow:0 0 6px rgba(200,220,255,.8),0 0 14px rgba(160,200,255,.4)}
.info{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);background:rgba(26,26,31,.85);padding:6px 14px;border-radius:8px;backdrop-filter:blur(8px);font:11px system-ui;color:#666;letter-spacing:.02em}
</style>
</head>
<body>
<div class="wrap" id="wrap">
  <div class="bg" id="bg"></div>
  <div class="vignette"></div>
  <pre class="ascii" id="ascii" style="line-height:0.78;letter-spacing:0.06em"></pre>
  <pre class="fx" id="fx" style="line-height:0.78;letter-spacing:0.06em"></pre>
  <div class="info">Made with txtfx</div>
</div>
<script>
var SCENE=${sceneJSON};
// Minimal playback runtime - effects rendered server-side as baked frames
// For a full runtime, the effect engine would need to be bundled here.
// This version shows the ASCII overlay with a "shimmer" animation.
(function(){
  var bg=document.getElementById("bg");
  var ascii=document.getElementById("ascii");
  var fx=document.getElementById("fx");
  var style=SCENE.ascii;
  var preStyle="font-size:"+style.fontSize+";font-family:"+style.fontFamily+";line-height:"+style.lineHeight+";letter-spacing:"+style.letterSpacing;
  ascii.setAttribute("style",ascii.getAttribute("style")+";"+preStyle+";color:"+style.color+";opacity:"+style.opacity);
  fx.setAttribute("style",fx.getAttribute("style")+";"+preStyle);

  if(SCENE.image.data){
    bg.style.backgroundImage='url("'+SCENE.image.data+'")';
  }

  // Simple shimmer effect for exported scenes
  var cols=80,rows=40;
  function measure(){
    var fs=parseFloat(getComputedStyle(ascii).fontSize);
    var cw=fs*0.6;var ch=fs*0.78;
    var rect=ascii.getBoundingClientRect();
    cols=Math.floor((rect.width-16)/cw);
    rows=Math.floor((rect.height-18)/ch);
  }

  function buildAscii(){
    if(!SCENE.image.data)return;
    var img=new Image();
    img.crossOrigin="anonymous";
    img.onload=function(){
      measure();
      var c=document.createElement("canvas");
      c.width=cols;c.height=rows;
      var ctx=c.getContext("2d");
      var iw=img.naturalWidth,ih=img.naturalHeight;
      var ia=iw/ih,ca=cols/rows;
      var sx=0,sy=0,sw=iw,sh=ih;
      if(ia>ca){sw=ih*ca;sx=(iw-sw)/2}
      else{sh=iw/ca;sy=(ih-sh)/2}
      ctx.drawImage(img,sx,sy,sw,sh,0,0,cols,rows);
      var d=ctx.getImageData(0,0,cols,rows).data;
      var ramp=" .\`,:;cbaO0%#@";
      var out="";
      for(var y=0;y<rows;y++){
        var line="";
        for(var x=0;x<cols;x++){
          var i=(y*cols+x)*4;
          var lum=(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2])/255;
          var adj=Math.pow(1-lum,1);
          line+=ramp[Math.floor(adj*(ramp.length-1))];
        }
        out+=line+"\\n";
      }
      ascii.textContent=out;
      animate();
    };
    img.src=SCENE.image.data;
  }

  function animate(){
    var chars=".+*";
    var stars=[];
    for(var i=0;i<40;i++){
      stars.push({c:Math.floor(Math.random()*cols),r:Math.floor(Math.random()*rows),phase:Math.random()*6.28,speed:0.5+Math.random()*2});
    }
    var start=performance.now();
    function loop(){
      var t=(performance.now()-start)/1000;
      var lines=[];
      for(var r=0;r<rows;r++){
        var line="";for(var c=0;c<cols;c++)line+=" ";
        lines.push(line.split(""));
      }
      for(var i=0;i<stars.length;i++){
        var s=stars[i];
        var p=0.5+0.5*Math.sin(t*s.speed+s.phase);
        if(p>0.3&&s.r>=0&&s.r<rows&&s.c>=0&&s.c<cols){
          lines[s.r][s.c]=chars[Math.min(Math.floor(p*3),2)];
        }
      }
      fx.textContent=lines.map(function(l){return l.join("")}).join("\\n");
      requestAnimationFrame(loop);
    }
    loop();
  }

  buildAscii();
  window.addEventListener("resize",function(){measure();buildAscii()});
})();
</script>
</body>
</html>`;
}
