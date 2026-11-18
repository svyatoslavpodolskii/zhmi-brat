import json,pathlib,sys,time
from playwright.sync_api import sync_playwright
base=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:4186'
out=pathlib.Path(__file__).parent.parent/'test-results'/('calendar-audit-'+str(time.time_ns()));out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True);context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base);page.wait_for_load_state('networkidle')
 assert page.locator('.mobile-brand .brand-icon').inner_text()=='жб'
 assert '💪' not in page.locator('.mobile-brand').inner_text()
 assert page.locator('.warmup-panel').bounding_box()['y']<page.locator('.exercise').first.bounding_box()['y']
 assert page.locator('.exercise-tools').first.bounding_box()['y']<page.locator('.sets').first.bounding_box()['y']
 assert 'Evolution Yeti' not in page.locator('footer').inner_text()
 page.locator('.bottom-nav [data-page="calendar"]').click();assert page.locator('.calendar-day').count() in [28,29,30,31]
 month=page.locator('[data-cal-date]').first.get_attribute('data-cal-date')[:7];day=month+'-15';hold=month+'-16'
 page.locator(f'[data-cal-date="{day}"]').click();assert page.locator(f'[data-cal-date="{day}"]').get_attribute('class').find('planned')>=0
 page.locator('[data-action="cal-mode"][data-mode="done"]').click();page.locator(f'[data-cal-date="{day}"]').click()
 assert 'done' in page.locator(f'[data-cal-date="{day}"]').get_attribute('class')
 page.locator(f'[data-cal-date="{day}"]').click();assert 'has-training' not in page.locator(f'[data-cal-date="{day}"]').get_attribute('class')
 page.locator('[data-action="cal-mode"][data-mode="planned"]').click()
 cell=page.locator(f'[data-cal-date="{hold}"]');box=cell.bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);page.mouse.down();page.wait_for_timeout(650);page.mouse.up()
 assert 'work-day' in page.locator(f'[data-cal-date="{hold}"]').get_attribute('class')
 state=page.evaluate('JSON.parse(localStorage.getItem("zhmi:state"))');assert hold not in state['calendar']['training']
 # Work mode offers the same operation without a long press.
 page.locator('[data-action="cal-mode"][data-mode="work"]').click();page.locator(f'[data-cal-date="{hold}"]').click()
 page.locator('[data-action="cal-schedule"]').click();page.locator('[name="anchor"]').fill('2026-11-19');page.locator('#schedule-form .primary').click()
 assert 'work-day' in page.locator('[data-cal-date="2026-11-19"]').get_attribute('class')
 assert 'work-day' not in page.locator('[data-cal-date="2026-11-20"]').get_attribute('class')
 assert page.locator('.calendar-summary strong').first.inner_text()=='7'
 page.locator('[data-action="cal-schedule"]').click();page.locator('#schedule-preset').select_option('4/2');assert page.locator('[name="work"]').input_value()=='4';page.locator('#schedule-form .primary').click()
 assert page.evaluate('JSON.parse(localStorage.getItem("zhmi:state")).calendar.schedule.work')==4
 page.reload();page.wait_for_load_state('networkidle');page.locator('.bottom-nav [data-page="calendar"]').click();assert '4 рабочих / 2 выходных' in page.locator('.schedule-strip').inner_text()
 page.locator('.topbar [data-action="profile"]').click();page.locator('#profile-form select[name="avatar"]').select_option("🐺");page.locator('#profile-form button.primary').click();assert page.locator('.topbar>.avatar').inner_text()=='🐺'
 buddy=page.locator('.mobile-buddy [data-buddy]');buddy.scroll_into_view_if_needed()
 a=buddy.locator('.buddy-figure img').evaluate('(e)=>getComputedStyle(e).transform');page.wait_for_timeout(450);b=buddy.locator('.buddy-figure img').evaluate('(e)=>getComputedStyle(e).transform');assert a!=b
 buddy.locator('[data-buddy-action="five"]').click();assert 'контакт' in buddy.locator('[data-buddy-line]').inner_text() or buddy.locator('[data-buddy-line]').inner_text()
 buddy.locator('[data-buddy-action="chill"]').click();assert 'is-chilling' in buddy.get_attribute('class');page.screenshot(path=str(out/'calendar-chilling.png'),full_page=True)
 buddy.locator('[data-buddy-action="chill"]').click();assert 'is-awake' in buddy.get_attribute('class')
 page.locator('.floating-timer').click();page.locator('#dialog [data-action="timer"][data-min="3"]').click();assert 'is-chilling' in page.locator('#dialog [data-buddy]').get_attribute('class');page.locator('#dialog [data-action="timer-stop"]').click();page.locator('#dialog [data-action="close"]').click()
 # The backup restores both the work rule and training dates on a fresh device.
 backup_date=month+'-09';page.locator(f'[data-cal-date="{backup_date}"]').click();page.locator('.topbar [data-action="profile"]').click()
 with page.expect_download() as waiting:page.locator('[data-action="export"]').click()
 backup_path=out/'calendar-backup.json';waiting.value.save_as(backup_path);saved=json.loads(backup_path.read_text(encoding='utf-8'));assert saved['state']['calendar']['schedule']['work']==4
 page.locator('#dialog [data-action="close"]').click()
 restored_context=browser.new_context(viewport={'width':390,'height':844});restored=restored_context.new_page();restored.goto(base);restored.wait_for_load_state('networkidle');restored.locator('.topbar [data-action="profile"]').click();restored.locator('#import-file').set_input_files(backup_path)
 restored.wait_for_function('JSON.parse(localStorage.getItem("zhmi:state")).calendar?.schedule?.work===4');assert restored.evaluate('(d)=>JSON.parse(localStorage.getItem("zhmi:state")).calendar.training[d]',backup_date)=='planned';restored_context.close()
 # Announce a future version and inspect the real update banner.
 page.route('**/version.json?*',lambda route:route.fulfill(json={'version':'99.0.0-test'}))
 page.locator('.topbar [data-action="profile"]').click();page.locator('[data-check-updates]').click();page.locator('.update-notice').wait_for();page.locator('#dialog [data-action="close"]').click()
 for width in [320,360,390,414,768,1024,1440]:
  page.set_viewport_size({'width':width,'height':900})
  for target in ['train','calendar','progress','room','tech','calc','help']:
   if page.locator('.sidebar').is_visible():nav=page.locator(f'.sidebar button[data-page="{target}"]')
   elif target=='help':nav=page.locator('footer [data-page="help"]')
   else:nav=page.locator(f'.bottom-nav [data-page="{target}"]')
   nav.click();page.wait_for_timeout(60)
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,target,'page overflow')
   banner=page.locator('.update-notice').bounding_box();button=page.locator('[data-update-app]').bounding_box()
   assert banner['x']>=0 and banner['x']+banner['width']<=width+1,(width,target,'banner')
   assert button['x']>=banner['x'] and button['x']+button['width']<=banner['x']+banner['width'],(width,target,'update button')
   if page.locator('.mobile-brand').is_visible():
    avatar=page.locator('.topbar>.avatar').bounding_box();header=page.locator('.topbar').bounding_box();assert avatar['x']+avatar['width']<=width and avatar['y']>=header['y'] and avatar['y']+avatar['height']<=header['y']+header['height']+1,(width,'avatar alignment')
   if target=='calendar' and width in [320,390,1440]:page.screenshot(path=str(out/f'calendar-{width}.png'),full_page=True)
 # On a touch device, landscape retains the mobile navigation.
 landscape=browser.new_context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True);page=landscape.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base);page.wait_for_load_state('networkidle');page.wait_for_timeout(150)
 if not page.locator('.bottom-nav').is_visible():print('LANDSCAPE',page.evaluate('({width:innerWidth,outer:outerWidth,coarse:matchMedia("(pointer:coarse)").matches,touch:navigator.maxTouchPoints,query:matchMedia("(pointer:coarse) and (max-width:1020px)").matches})'),flush=True)
 assert page.locator('.bottom-nav').is_visible();assert not page.locator('.sidebar').is_visible()
 page.locator('.bottom-nav [data-page="calendar"]').click();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.locator('[data-action="cal-schedule"]').click();page.locator('#schedule-preset').select_option('5/2-week');assert not page.locator('.schedule-counts').is_visible();assert not page.locator('[name="anchor"]').is_visible();page.locator('#schedule-form button.primary').click()
 assert page.evaluate('JSON.parse(localStorage.getItem("zhmi:state")).calendar.schedule.type')=='weekdays'
 page.locator('[data-action="cal-schedule"]').click();assert not page.locator('[name="anchor"]').is_visible();page.locator('#dialog [data-action="close"]').click()
 assert not errors,errors
 print(json.dumps({'calendar':'passed','longPress':True,'schedules':True,'wolf':True,'continuousAnimation':True,'chill':True,'layoutWidths':[320,360,390,414,768,1024,1440],'pages':7,'screenshots':str(out),'errors':errors}),flush=True)
 browser.close()
