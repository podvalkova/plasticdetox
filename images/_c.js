const puppeteer=require('puppeteer');
(async()=>{const b=await puppeteer.launch({headless:'new'});const p=await b.newPage();
await p.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36');
for (const u of ['https://aquatruwater.com/products/aquatru-carafe','https://aquatruwater.com/pages/certifications']){
 try{ await p.goto(u,{waitUntil:'networkidle2',timeout:60000});
 const t=await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' '));
 const m=t.match(/.{0,300}(NSF|IAPMO|P473|473).{0,300}/g);
 console.log('###',u); console.log((m||[]).slice(0,4).join('\n---\n').slice(0,2500));
 }catch(e){console.log(u,'ERR',e.message);}
}
await b.close();})();
