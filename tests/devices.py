import json,pathlib,sys,time
from playwright.sync_api import sync_playwright
base=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:4186'
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True);errors=[];contexts=[]
 def start(name,code=None,existing=False):
  c=browser.new_context(viewport={'width':390,'height':844});contexts.append(c);page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(base);page.wait_for_load_state('networkidle')
  page.locator('.topbar [data-action="profile"]').click();page.locator('[name="name"]').fill(name);page.locator('#profile-form button').click()
  page.locator('.bottom-nav [data-page="room"]').click()
  if code:
   page.locator('[data-action="join"]').click();page.locator('#join-form textarea').fill(code)
   page.locator('[name="entryMode"]').select_option('existing' if existing else 'new');page.locator('#join-form button').click()
  return c,page
 def value(page,addr,value):
  page.locator(f'[data-cell="{addr}"]').fill(str(value));page.locator(f'[data-cell="{addr}"]').press('Tab')
 a,pa=start('Один профиль')
 code=pa.evaluate('JSON.parse(localStorage.getItem("zhmi:state")).room')
 pa.locator('.bottom-nav [data-page="train"]').click();value(pa,'F77',80);value(pa,'G77',5);pa.locator('[data-cell="H77"]').select_option('8')
 b,pb=start('Новое устройство',code,True)
 pb.locator('[data-action="request-device"]').filter(has_text='Один профиль').click()
 pa.locator('.device-notice').wait_for(timeout=30000)
 # There is no automatic identity adoption before approval.
 assert pb.evaluate('JSON.parse(localStorage.getItem("zhmi:state")).name')=='Новое устройство'
 pa.locator('.device-notice button').click();pa.locator('[data-action="approve-device"]').wait_for(timeout=30000)
 assert pa.locator('.pairing-code').first.inner_text()==pb.locator('.pairing-code').first.inner_text()
 pa.locator('[data-action="approve-device"]').click()
 pb.locator('[data-action="confirm-device"]').wait_for(timeout=30000);pb.locator('[data-action="confirm-device"]').click()
 assert pb.locator('[data-cell="F77"]').input_value()=='80'
 assert pb.evaluate('JSON.parse(localStorage.getItem("zhmi:state")).name')=='Один профиль'
 pa.locator('.bottom-nav [data-page="room"]').click();assert pa.locator('.members .member').count()==1
 print('Own active device approval and one shared member passed',flush=True)
 # Concurrent offline edits to different fields must survive reconnection.
 pa.locator('.bottom-nav [data-page="train"]').click();a.set_offline(True);b.set_offline(True)
 value(pa,'F77',85);value(pb,'G77',6)
 a.set_offline(False);b.set_offline(False)
 for page in [pa,pb]:
  page.wait_for_function('document.querySelector("[data-cell=F77]").value==="85"&&document.querySelector("[data-cell=G77]").value==="6"',timeout=45000)
 pb.reload();pb.wait_for_load_state('networkidle');assert pb.locator('[data-cell="F77"]').input_value()=='85'
 print('Concurrent edits merged and survived device reload',flush=True)
 # Establish a recovery contact before both original devices disappear.
 c,pc=start('Знакомый участник',code)
 pa.wait_for_function('JSON.parse(localStorage.getItem("zhmi:state")).recoveryMembers.length>=1',timeout=30000)
 pc.wait_for_function('Object.keys(localStorage).filter(k=>k.startsWith("zhmi:room:")).some(k=>Object.values(JSON.parse(localStorage[k])).some(r=>r.payload.name==="Один профиль"&&r.payload.recoveryMembers?.length))',timeout=30000)
 a.close();contexts.remove(a);b.close();contexts.remove(b)
 d,pd=start('После потери',code,True)
 try:pd.locator('[data-action="request-device"]').filter(has_text='Один профиль').click(timeout=45000)
 except Exception:
  print('CHOICE DEBUG',errors,pc.evaluate('import("./app.js").then(m=>m.connectionDiagnostics())'),pd.evaluate('import("./app.js").then(m=>m.connectionDiagnostics())'),flush=True)
  raise
 try:pc.locator('[data-action="approve-device"]').wait_for(timeout=40000)
 except Exception:
  print('RECOVERY DEBUG',pc.evaluate('import("./app.js").then(m=>m.connectionDiagnostics())'),pd.evaluate('import("./app.js").then(m=>m.connectionDiagnostics())'),flush=True)
  raise
 assert 'восстановить' in pc.locator('[data-action="approve-device"]').inner_text()
 pc.locator('[data-action="approve-device"]').click();pd.locator('[data-action="confirm-device"]').wait_for(timeout=30000);pd.locator('[data-action="confirm-device"]').click()
 assert pd.locator('[data-cell="F77"]').input_value()=='85';assert pd.locator('[data-cell="G77"]').input_value()=='6'
 assert pd.evaluate('JSON.parse(localStorage.getItem("zhmi:state")).name')=='Один профиль'
 print('Recovery by an established participant restored the diary',flush=True)
 pd.locator('.bottom-nav [data-page="room"]').click()
 assert pd.locator('.members .member').count()==2
 assert not errors,errors
 print(json.dumps({'devices':'passed','activeApproval':True,'recovery':True,'concurrentMerge':True,'errors':errors}),flush=True)
 for c in contexts:c.close()
 browser.close()
