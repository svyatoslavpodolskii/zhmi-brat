import json,sys,time,pathlib
from playwright.sync_api import sync_playwright
base=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:4186'
out=pathlib.Path('test-results')/('theme-'+str(time.time_ns()));out.mkdir(parents=True)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True);ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base);page.wait_for_load_state('networkidle');buddy=page.locator('.mobile-buddy [data-buddy]');buddy.scroll_into_view_if_needed()
 assert buddy.locator('[data-buddy-line]').inner_text()=='Ну что, по подходику?'
 assert page.locator('.buddy-orbit').count()==0
 for action in ['banana','chill','chill','five','flex']:buddy.locator(f'[data-buddy-action="{action}"]').click()
 stage=buddy.locator('[data-buddy-touch]');box=stage.bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);page.mouse.down();page.wait_for_timeout(680);page.mouse.up();assert buddy.get_attribute('data-move')=='bend'
 page.locator('.floating-timer').click();timer=page.locator('#dialog [data-buddy]');page.locator('#dialog [data-action="timer"][data-min="3"]').click()
 assert 'is-chilling' in timer.get_attribute('class');assert 'is-awake' in buddy.get_attribute('class')
 a=timer.locator('.buddy-figure').evaluate('(e)=>getComputedStyle(e).transform');page.wait_for_timeout(500);assert a!=timer.locator('.buddy-figure').evaluate('(e)=>getComputedStyle(e).transform')
 page.screenshot(path=str(out/'timer-light.png'));page.locator('#dialog [data-action="timer-stop"]').click();assert 'is-awake' in timer.get_attribute('class');page.locator('#dialog [data-action="close"]').click()
 page.locator('.topbar [data-action="profile"]').click();assert page.locator('.avatar-picker').count()==0;assert page.locator('#profile-form select[name="avatar"]').count()==1;page.locator('#dialog [data-action="close"]').click()
 page.locator('[data-action="theme"]').click();assert page.locator('html').get_attribute('data-theme')=='dark';page.reload();page.wait_for_load_state('networkidle');assert page.locator('html').get_attribute('data-theme')=='dark'
 for width in [320,390,768,1440]:
  page.set_viewport_size({'width':width,'height':900})
  for target in ['train','calendar','room','calc','tech','progress','help']:
   if page.locator('.sidebar').is_visible():nav=page.locator(f'.sidebar button[data-page="{target}"]')
   elif target=='help':nav=page.locator('footer [data-page="help"]')
   else:nav=page.locator(f'.bottom-nav [data-page="{target}"]')
   nav.click();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,target)
   if target in ['train','calendar']:page.screenshot(path=str(out/f'{target}-dark-{width}.png'),full_page=True)
 page.set_viewport_size({'width':390,'height':844});page.locator('.floating-timer').click();page.locator('#dialog [data-action="timer"][data-min="3"]').click();page.screenshot(path=str(out/'timer-dark.png'));page.locator('#dialog [data-action="timer-stop"]').click();page.locator('#dialog [data-action="close"]').click()
 page.locator('.bottom-nav [data-page="room"]').click()
 for emoji in ['🦍','🐺','🍌','💪','🔥','🦧']:
  btn=page.locator(f'[data-action="react"][data-emoji="{emoji}"]');btn.click();page.wait_for_timeout(100);assert page.locator('.emoji-rain').count()==0
  btn.click();page.wait_for_timeout(100);assert page.locator('.emoji-rain').count()==0
  btn.click();page.wait_for_function('document.querySelectorAll(".emoji-rain").length>=12');assert page.locator('.emoji-rain').first.inner_text()==emoji
  page.wait_for_timeout(4400)
 page.locator('[data-action="theme"]').click();assert page.locator('html').get_attribute('data-theme')=='light'
 assert not errors,errors
 print(json.dumps({'buddy':'passed','timerChill':True,'themePersisted':True,'reactionThreshold':3,'allSixReactions':True,'errors':errors,'screenshots':str(out)}),flush=True)
 browser.close()
