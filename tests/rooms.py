import json,pathlib,sys,time
from playwright.sync_api import sync_playwright
base=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:4186'
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 contexts=[];errors=[]
 def start(name,code=None):
  c=browser.new_context(viewport={'width':390,'height':844});contexts.append(c)
  page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(base);page.wait_for_load_state('networkidle')
  page.locator('.topbar [data-action="profile"]').click();page.locator('[name="name"]').fill(name);page.locator('#profile-form button').click()
  page.locator('.bottom-nav [data-page="room"]').click()
  if code:
   page.locator('[data-action="join"]').click();page.locator('#join-form textarea').fill(code);page.locator('#join-form button').click()
  return c,page
 a,pa=start('Тестовый Брат')
 code=pa.evaluate('JSON.parse(localStorage.getItem("zhmi:state")).room')
 b,pb=start('Тестовый Гусь',code)
 pa.locator('.members').get_by_text('Тестовый Гусь',exact=True).wait_for(timeout=60000)
 pb.locator('.members').get_by_text('Тестовый Брат',exact=True).wait_for(timeout=60000)
 print('Two independent browsers connected',flush=True)
 pa.locator('.bottom-nav [data-page="train"]').click()
 pa.locator('[data-exercise="79"]').select_option(label='Приседания со штангой')
 for addr,value in [('F77','76'),('G77','4')]:
  pa.locator(f'[data-cell="{addr}"]').fill(value);pa.locator(f'[data-cell="{addr}"]').press('Tab')
 pa.locator('[data-cell="H77"]').select_option('10');pa.locator('[data-action="log"][data-slot="77"][data-set="0"]').click()
 pb.locator('.member').filter(has_text='Тестовый Брат').click()
 pb.locator('[data-cell="F77"]').wait_for();pb.wait_for_function('document.querySelector("[data-cell=F77]").value==="76"',timeout=30000)
 assert pb.locator('[data-cell="F77"]').is_disabled()
 assert pb.locator('[data-cell="I77"]').get_attribute('placeholder')=='67,5'
 print('Remote result synchronized; read-only diary verified',flush=True)
 pb.locator('[data-action="copy-exercises-open"]').click()
 pb.locator('[data-action="copy-exercises"][data-target="new"]').click()
 assert pb.locator('[data-exercise="79"]').input_value()=='Приседания со штангой'
 assert pb.locator('[data-cell="F77"]').input_value()==''
 copied=pb.evaluate('JSON.parse(localStorage.getItem("zhmi:state"))')
 assert len(copied['cycles'])==2
 assert len(copied['cycles'][-1]['logs'])==0
 assert all('!B' in k or '!E' in k for k in copied['cycles'][-1]['overrides'])
 print('Exercise choices copied into a new cycle without results',flush=True)
 pb.locator('.bottom-nav [data-page="room"]').click()
 pb.locator('.member').filter(has_text='Тестовый Брат').click()
 # Looking through a friend's weeks must not mutate their signed payload.
 pb.locator('[data-action="phase"][data-phase="meso"]').click()
 pb.locator('[data-action="own"]').click();pb.locator('.bottom-nav [data-page="room"]').click()
 c,pc=start('Тестовый Кабачок',code)
 pc.locator('.members').get_by_text('Тестовый Гусь',exact=True).wait_for(timeout=60000)
 pc.locator('.member').filter(has_text='Тестовый Брат').click()
 assert pc.locator('[data-cell="F77"]').input_value()=='76'
 print('Three-party relay preserved valid signatures',flush=True)
 signatures=pc.evaluate('''async()=>{const{Room}=await import('./rooms.js');const records=Object.keys(localStorage).filter(k=>k.startsWith('zhmi:room:')).flatMap(k=>Object.values(JSON.parse(localStorage[k])));const rec=records.find(r=>r.payload.name==='Тестовый Брат');const test=Object.create(Room.prototype);test.code=rec.payload.room;test.records={};const valid=await test.accept(structuredClone(rec));const replay=await test.accept(structuredClone(rec));test.records={};const forged=structuredClone(rec);forged.payload.name='Подделка';const tampered=await test.accept(forged);test.code='другая-комната';const otherRoom=await test.accept(structuredClone(rec));return{valid,replay,tampered,otherRoom};}''')
 assert signatures=={'valid':True,'replay':False,'tampered':False,'otherRoom':False},signatures
 # Host disappears; remaining peers elect a new host and retain all diaries.
 a.close();contexts.remove(a)
 pc.locator('[data-action="own"]').click();pc.locator('.bottom-nav [data-page="room"]').click()
 pb.wait_for_function('document.querySelector("#connection-text").textContent.includes("Вы в комнате") || document.querySelector("#connection-text").textContent.includes("Соединение")',timeout=60000)
 # Change one surviving profile and require delivery after the host election.
 pc.locator('.topbar [data-action="profile"]').click();pc.locator('[name="name"]').fill('Кабачок после переподключения');pc.locator('#profile-form button').click()
 try:
  pb.locator('.members').get_by_text('Кабачок после переподключения',exact=True).wait_for(timeout=40000)
 except Exception:
  for label,pp in [('b',pb),('c',pc)]:
   print(label,pp.locator('#connection-text').inner_text(),pp.evaluate('Object.keys(localStorage).filter(k=>k.startsWith("zhmi:room:")).map(k=>Object.values(JSON.parse(localStorage[k])).map(r=>({name:r.payload.name,rev:r.payload.rev})))'),flush=True)
  raise
 print('Host failover and subsequent edit synchronized',flush=True)
 # Offline reads and writes remain available.
 b.set_offline(True);pb.locator('.bottom-nav [data-page="train"]').click()
 pb.locator('[data-cell="F77"]').fill('50');pb.locator('[data-cell="F77"]').press('Tab');pb.reload();pb.wait_for_load_state('domcontentloaded')
 pb.locator('[data-cell="F77"]').wait_for();assert pb.locator('[data-cell="F77"]').input_value()=='50'
 assert not errors,errors
 print(json.dumps({'p2p':'passed','participants':3,'failover':True,'offline':True,'errors':errors}),flush=True)
 for x in contexts:x.close()
 browser.close()
