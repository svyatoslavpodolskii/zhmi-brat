import sys,pathlib,time,json
from playwright.sync_api import sync_playwright
base=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:4186'
out=pathlib.Path('test-results')/('states-'+str(time.time_ns()));out.mkdir(parents=True)
with sync_playwright() as p:
 b=p.chromium.launch();errors=[]
 for width in [320,390,1440]:
  c=b.new_context(viewport={'width':width,'height':900},is_mobile=width<500,has_touch=width<500,color_scheme='dark');pg=c.new_page();pg.on('pageerror',lambda e:errors.append(str(e)));pg.goto(base);pg.wait_for_load_state('networkidle')
  buddy=pg.locator('.mobile-buddy [data-buddy]' if width<500 else '.rightbar>[data-buddy]');buddy.scroll_into_view_if_needed()
  assert buddy.locator('[data-buddy-line]').inner_text()=='Ну что, по подходику?'
  assert buddy.locator('img').bounding_box()['y']<buddy.bounding_box()['y']
  img=buddy.locator('img');assert img.evaluate('(e)=>getComputedStyle(e).mixBlendMode')=='normal'
  assert img.evaluate('(e)=>getComputedStyle(e).opacity')=='1'
  assert buddy.locator('.buddy-art').evaluate('(e)=>getComputedStyle(e).overflow')=='visible'
  assert buddy.evaluate('(e)=>getComputedStyle(e).backgroundColor')==pg.locator('.exercise').first.evaluate('(e)=>getComputedStyle(e).backgroundColor')
  for selector in ['.exercise-header','.exercise-tools','.set-row']:
   assert pg.locator(selector).first.evaluate('(e)=>getComputedStyle(e).backgroundColor')=='rgba(0, 0, 0, 0)',selector
  before=buddy.locator('[data-buddy-line]').inner_text();poses=set();words=set()
  for _ in range(6):
   buddy.locator('[data-buddy-action="five"]').click();poses.add(buddy.get_attribute('data-variant'));words.add(buddy.locator('[data-buddy-line]').inner_text())
  assert len(poses)==3;assert len(words)>=3
  if width<500:pg.locator('.floating-timer').click()
  else:pg.locator('.rightbar [data-action="timer-open"]').click()
  assert pg.locator('#dialog .timer-scene').is_visible()==(width<500)
  # Opening rest already shows the reclining preview; there is no standing flash.
  scene=pg.locator('#dialog [data-buddy]') if width<500 else buddy
  if width<500:assert 'is-chilling' in scene.get_attribute('class')
  pg.locator('#dialog [data-action="timer"][data-min="3"]').click();assert 'is-chilling' in buddy.get_attribute('class')
  if width<500:
   assert 'is-chilling' in scene.get_attribute('class')
   pg.wait_for_timeout(750);pose=scene.locator('.buddy-pose').evaluate('(e)=>getComputedStyle(e).transform')
   for action in ['five','flex','banana']:
    scene.locator(f'[data-buddy-action="{action}"]').click();pg.wait_for_timeout(60);assert scene.locator('.buddy-pose').evaluate('(e)=>getComputedStyle(e).transform')==pose
  pg.locator('#dialog [data-action="timer-toggle"]').click();assert scene.get_attribute('data-mode')=='paused';first=scene.locator('[data-buddy-line]').inner_text();pg.locator('#dialog [data-action="timer-toggle"]').click();pg.locator('#dialog [data-action="timer-toggle"]').click();assert scene.locator('[data-buddy-line]').inner_text()!=first
  pg.screenshot(path=str(out/f'rest-{width}.png'));assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
  pg.locator('#dialog [data-action="timer-stop"]').click();pg.locator('#dialog [data-action="close"]').click();assert 'is-awake' in buddy.get_attribute('class')
  buddy.locator('[data-buddy-action="banana"]').click();last=buddy.locator('[data-buddy-line]').inner_text()
  nav=pg.locator('.sidebar button[data-page="calendar"]' if width==1440 else '.bottom-nav [data-page="calendar"]');nav.click();assert buddy.locator('[data-buddy-line]').inner_text()==last
  pg.locator('.sidebar button[data-page="train"]' if width==1440 else '.bottom-nav [data-page="train"]').click();pg.locator('[data-action="phase"][data-phase="rest"]').click();assert 'is-chilling' in buddy.get_attribute('class');pg.screenshot(path=str(out/f'recovery-week-{width}.png'),full_page=True)
  c.close()
 assert not errors,errors
 print(json.dumps({'states':'passed','widths':[320,390,1440],'variantsPerAction':3,'poseRetained':True,'pauseQuotesChange':True,'screenshots':str(out),'errors':errors}),flush=True);b.close()
