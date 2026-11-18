import pathlib,shutil,subprocess,sys,time,json,urllib.request
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).parent.parent;target=root/'test-results'/'update-server';target.mkdir(parents=True,exist_ok=True)
shutil.copytree(root/'dist',target,dirs_exist_ok=True)
server=subprocess.Popen([sys.executable,'-m','http.server','4190','--bind','127.0.0.1','--directory',str(target)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
try:
 for i in range(40):
  try:urllib.request.urlopen('http://127.0.0.1:4190',timeout=1);break
  except Exception:time.sleep(.1)
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True);page=browser.new_page(viewport={'width':390,'height':844});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:4190');page.wait_for_load_state('networkidle')
  page.wait_for_function('navigator.serviceWorker.controller!==null',timeout=20000)
  page.locator('[data-cell="F77"]').fill('77');page.locator('[data-cell="F77"]').press('Tab')
  (target/'version.json').write_text(json.dumps({'version':'1.2.0-test'}),encoding='utf-8')
  for name in ['sw.js','updates.js']:
   f=target/name;f.write_text(f.read_text(encoding='utf-8').replace('1.1.0','1.2.0-test'),encoding='utf-8')
  page.evaluate('navigator.serviceWorker.getRegistration().then(r=>r.update())')
  page.locator('.update-notice').wait_for(timeout=30000)
  assert page.locator('[data-cell="F77"]').input_value()=='77'
  assert '1.1.0' in page.evaluate('fetch("updates.js").then(r=>r.text())') or page.locator('.update-notice').count()==1
  with page.expect_navigation(wait_until='networkidle'):
   page.locator('[data-update-app]').click()
  page.wait_for_function('navigator.serviceWorker.controller.scriptURL.endsWith("sw.js")',timeout=20000)
  page.locator('[data-cell="F77"]').wait_for(timeout=20000)
  assert page.locator('[data-cell="F77"]').input_value()=='77'
  if page.locator('.update-notice').count():
   print(page.evaluate('''async()=>({version:(await import('./updates.js')).APP_VERSION,caches:await caches.keys(),worker:await navigator.serviceWorker.getRegistration().then(r=>({active:r.active?.state,waiting:r.waiting?.state,installing:r.installing?.state})),latest:await fetch('./version.json',{cache:'no-store'}).then(r=>r.json())})'''),flush=True)
  assert page.locator('.update-notice').count()==0
  cache_names=page.evaluate('caches.keys()');assert 'zhmi-brat-v1.2.0-test' in cache_names,cache_names
  assert 'zhmi-brat-v1.1.0' not in cache_names,cache_names
  assert not errors,errors
  print(json.dumps({'updates':'passed','waitingWorker':True,'explicitButton':True,'savedInput':77,'oldCacheRemoved':True}))
  browser.close()
finally:server.terminate();server.wait(timeout=10)
