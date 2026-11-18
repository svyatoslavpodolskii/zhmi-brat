import json,pathlib,sys,time
from playwright.sync_api import sync_playwright

base=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:4186'
out=pathlib.Path(__file__).parent.parent/'test-results';out.mkdir(exist_ok=True)
errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 ctx=browser.new_context(viewport={'width':1440,'height':1000})
 page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base);page.wait_for_load_state('networkidle');page.locator('.exercise').first.wait_for()
 assert page.locator('[data-cell="F77"]').input_value()==''
 assert page.locator('[data-cell="G77"]').input_value()==''
 page.screenshot(path=str(out/'desktop.png'),full_page=True)
 def fill_cell(addr,value):
  page.locator(f'[data-cell="{addr}"]').fill(str(value));page.locator(f'[data-cell="{addr}"]').press('Tab')
 fill_cell('F77',76);fill_cell('G77',4);page.locator('[data-cell="H77"]').select_option('10')
 assert page.locator('[data-cell="I77"]').get_attribute('placeholder')=='67,5'
 assert page.locator('[data-cell="O77"]').count()==0
 page.locator('[data-action="log"][data-slot="77"][data-set="0"]').click()
 assert page.locator('[data-action="log"][data-slot="77"][data-set="0"]').get_attribute('class').find('checked')>=0
 page.reload();page.wait_for_load_state('networkidle');assert page.locator('[data-cell="F77"]').input_value()=='76'
 page.locator('.sidebar button[data-page="progress"]').click();assert '76' in page.locator('table').inner_text()
 page.locator('.sidebar button[data-page="calc"]').click();assert 'кг' in page.locator('#calc-result').inner_text()
 page.locator('[data-mode="warmup"]').click();assert page.locator('#warmup-result tbody tr').count()==9
 page.locator('#warmup-mode').select_option('5');assert page.locator('#warmup-result tbody tr').count()==12
 assert '302,5' in page.locator('#warmup-result').inner_text()
 page.locator('.sidebar button[data-page="tech"]').click();assert page.locator('.tech-link').count()==30
 page.locator('#tech-search').fill('Жим');assert page.locator('.tech-link').count()>0
 page.locator('.sidebar button[data-page="help"]').click();assert '2 260' in page.locator('main').inner_text().replace('\u202f',' ').replace('\xa0',' ')
 page.locator('[data-action="explorer"]').first.click();assert page.locator('#dialog table tbody tr').count()>0
 page.locator('#dialog [data-action="close"]').click()
 # Exercise choices remain available; a new cycle retains the selection and clears results.
 page.locator('.sidebar button[data-page="train"]').click()
 page.locator('[data-exercise="77"]').select_option(label='Отжимания на брусьях (с доп весом)')
 page.locator('[data-action="cycles"]').first.click();page.locator('[data-action="new-cycle"]').click()
 assert page.locator('[data-exercise="77"]').input_value()=='Отжимания на брусьях (с доп весом)'
 assert page.locator('[data-cell="F77"]').input_value()==''
 page.locator('[data-action="cycles"]').first.click();assert page.locator('.cycle-option').count()==2
 page.locator('.cycle-option').first.click();assert page.locator('[data-cell="F77"]').input_value()=='76'
 # Test -> mesocycle -> actual sets. Draft facts survive an RPE recalculation.
 page.locator('[data-action="phase"][data-phase="test"]').click()
 fill_cell('C111',100);fill_cell('D111',5)
 page.locator('[data-action="phase"][data-phase="meso"]').click()
 first=page.locator('.exercise').first
 first.locator('[data-fact$="0-0:weight"]').fill('95')
 first.locator('[data-fact$="0-0:reps"]').fill('3')
 page.locator('[data-cell="F154"]').select_option('8')
 assert first.locator('[data-fact$="0-0:weight"]').input_value()=='95'
 first.locator('[data-action="log"][data-set="0-0"]').click()
 first.locator('[data-action="log"][data-set="1-0"]').click()
 state=page.evaluate('JSON.parse(localStorage.getItem("zhmi:state"))')
 active=next(c for c in state['cycles'] if c['id']==state['activeCycle'])
 assert active['logs']['meso:0:0:77:0-0']['weight']==95
 assert active['logs']['meso:0:0:77:0-0']['rpe']==8
 assert active['logs']['meso:0:0:77:1-0']['rpe'] is None
 page.locator('#week').select_option('1')
 assert 'ждём' not in page.locator('.exercise').first.locator('[data-fact$="0-0:weight"]').get_attribute('placeholder')
 page.locator('[data-action="phase"][data-phase="prep"]').click()
 for w in [320,390,768]:
  page.set_viewport_size({'width':w,'height':844});page.screenshot(path=str(out/f'mobile-{w}.png'),full_page=True)
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),f'overflow at {w}'
 page.set_viewport_size({'width':390,'height':844})
 for nav in ['progress','room','tech','calc']:
  page.locator(f'.bottom-nav [data-page="{nav}"]').click()
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),f'overflow page {nav}'
  page.screenshot(path=str(out/f'mobile-{nav}.png'),full_page=True)
 # Backup dialog and keyboard-accessible mobile timer.
 page.locator('.topbar [data-action="profile"]').click();assert page.locator('#profile-form').count()==1
 page.locator('#dialog [data-action="close"]').click()
 page.locator('.floating-timer').click();page.locator('#dialog [data-action="timer"][data-min="3"]').click()
 assert page.locator('#dialog #timer-time').inner_text().startswith('03:')
 page.locator('#dialog [data-action="timer-stop"]').click();page.locator('#dialog [data-action="close"]').click()
 assert not errors,errors
 print(json.dumps({'ui':'passed','viewports':[320,390,768,1440],'errors':errors,'screenshots':str(out)}))
 browser.close()
