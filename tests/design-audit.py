import sys,time,pathlib,json
from playwright.sync_api import sync_playwright
base=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:4186'
out=pathlib.Path('test-results')/('design-'+str(time.time_ns()));out.mkdir(parents=True)
with sync_playwright() as p:
 b=p.chromium.launch();errors=[]
 for theme in ['light','dark']:
  for width in [390,1440]:
   c=b.new_context(viewport={'width':width,'height':900},is_mobile=width==390,has_touch=width==390,color_scheme=theme);pg=c.new_page();pg.on('pageerror',lambda e:errors.append(str(e)));pg.goto(base);pg.wait_for_load_state('networkidle')
   for target in ['train','calendar','progress','room','tech','calc','help']:
    nav=pg.locator(f'.sidebar button[data-page="{target}"]') if width==1440 else pg.locator(f'.bottom-nav [data-page="{target}"]') if target!='help' else pg.locator('footer [data-page="help"]')
    nav.click();pg.evaluate('scrollTo(0,0)');pg.wait_for_timeout(80);assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth'),(theme,width,target);pg.screenshot(path=str(out/f'{theme}-{width}-{target}.png'),full_page=True)
   for action in ['profile','timer-open','invite','join','cycles','devices']:
    if action=='timer-open':pg.locator('.floating-timer' if width==390 else '.rightbar [data-action="timer-open"]').click()
    elif action=='profile':pg.locator('.topbar [data-action="profile"]').click()
    elif action in ['invite','join']:pg.locator(('.sidebar button' if width==1440 else '.bottom-nav button')+'[data-page="room"]').click();pg.locator(f'main [data-action="{action}"]').first.click()
    elif action in ['cycles','devices']:pg.locator('.topbar [data-action="profile"]').click();pg.locator(f'#dialog [data-action="{action}"]').click() if action=='devices' else (pg.locator('#dialog [data-action="close"]').click(),pg.locator('.sidebar [data-action="cycles"]').click()) if width==1440 else (pg.locator('#dialog [data-action="close"]').click(),pg.locator('.bottom-nav [data-page="train"]').click(),pg.locator('main [data-action="cycles"]').click())
    if action=='timer-open':pg.locator('#dialog [data-action="timer"][data-min="3"]').click()
    pg.wait_for_timeout(120);pg.screenshot(path=str(out/f'{theme}-{width}-{action}.png'))
    if action=='timer-open':pg.locator('#dialog [data-action="timer-stop"]').click()
    pg.locator('#dialog [data-action="close"]').click()
   def nav_to(target):
    (pg.locator(f'.sidebar button[data-page="{target}"]') if width==1440 else pg.locator(f'.bottom-nav [data-page="{target}"]') if target!='help' else pg.locator('footer [data-page="help"]')).click()
   def shot(name,full=True):
    if full:pg.evaluate('scrollTo(0,0)')
    assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth'),(theme,width,name)
    pg.screenshot(path=str(out/f'{theme}-{width}-{name}.png'),full_page=full)
   nav_to('train')
   for phase in ['test','meso','rest']:
    pg.locator(f'[data-action="phase"][data-phase="{phase}"]').click();shot('phase-'+phase)
   pg.locator('[data-action="phase"][data-phase="prep"]').click();pg.locator('.warmup-panel summary').click();shot('warmup-instructions')
   for action in ['rpe-help','exercise-info']:
    pg.locator(f'main [data-action="{action}"]').first.click();shot(action,False);pg.locator('#dialog [data-action="close"]').click()
   nav_to('calc')
   for mode in ['warmup','table']:
    pg.locator(f'[data-action="calc-mode"][data-mode="{mode}"]').click();shot('calc-'+mode)
   nav_to('calendar');pg.locator('[data-action="cal-schedule"]').click();shot('schedule',False);pg.locator('#dialog [data-action="close"]').click()
   nav_to('help');pg.locator('[data-action="explorer"]').click();shot('original-sheets',False);pg.locator('#dialog [data-action="close"]').click()
   pg.locator('[data-action="connection"]').click();shot('connection',False);pg.locator('#dialog [data-action="close"]').click()
   nav_to('room');pg.locator('[data-action="room-history"]').click();shot('room-history',False);pg.locator('#dialog [data-action="close"]').click()
   c.close()
 # Contact sheets point to the original screenshots; screenshots remain unmodified.
 for theme in ['light','dark']:
  for width in [390,1440]:
   pictures=sorted(out.glob(f'{theme}-{width}-*.png'))
   html='<html><style>body{margin:0;padding:18px;background:#dfe5ec;font:16px sans-serif}main{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}article{background:white;padding:10px;border-radius:12px}h3{margin:0 0 8px;font-size:15px}img{width:100%;height:520px;object-fit:cover;object-position:top}</style><h1>'+theme+' · '+str(width)+'</h1><main>'+''.join(f'<article><h3>{i.stem}</h3><a href="{i.name}"><img src="{i.name}"></a></article>' for i in pictures)+'</main></html>'
   file=out/f'overview-{theme}-{width}.html';file.write_text(html,encoding='utf-8');contact=b.new_page(viewport={'width':1400,'height':1000});contact.goto(file.resolve().as_uri());contact.screenshot(path=str(out/f'overview-{theme}-{width}.png'),full_page=True);contact.close()
 assert not errors,errors
 print(json.dumps({'screenshots':str(out),'count':len(list(out.glob('light-390-*.png')))*4,'pages':7,'extraStates':12,'themes':2,'widths':[390,1440],'errors':errors}),flush=True);b.close()
