import json,pathlib,sys
from playwright.sync_api import sync_playwright
base=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:4186'
out=pathlib.Path(__file__).parent.parent/'test-results';out.mkdir(exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True);errors=[];contexts=[]
 def start(name,avatar,code=None):
  c=browser.new_context(viewport={'width':390,'height':844});contexts.append(c);page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(base);page.wait_for_load_state('networkidle');page.locator('.topbar [data-action="profile"]').click();page.locator('[name="name"]').fill(name);page.locator('[name="avatar"]').select_option(avatar);page.locator('#profile-form button.primary').click();page.locator('.bottom-nav [data-page="room"]').click()
  if code:
   page.locator('[data-action="join"]').click();page.locator('#join-form textarea').fill(code);page.locator('#join-form button.primary').click()
  return c,page
 a,pa=start('Горилла','🦍');code=pa.evaluate('JSON.parse(localStorage.getItem("zhmi:state")).room')
 b,pb=start('Волк','🐺',code);c,pc=start('Орангутан','🦧',code)
 pa.wait_for_function('document.querySelectorAll(".members .member").length===3',timeout=45000)
 for page in [pa,pb,pc]:page.locator('.bottom-nav [data-page="calendar"]').click()
 month=pa.locator('[data-cal-date]').first.get_attribute('data-cal-date')[:7];date=month+'-22';other=month+'-23'
 for page in [pa,pb,pc]:page.locator(f'[data-cal-date="{date}"]').click()
 for page in [pa,pb,pc]:
  page.wait_for_function('(date)=>document.querySelector(`[data-cal-date="${date}"]`).classList.contains("whole-team")',arg=date,timeout=45000)
  text=page.locator(f'[data-cal-date="{date}"] .calendar-day-emojis').inner_text();assert all(x in text for x in ['🦍','🐺','🦧']),text
  assert page.locator(f'[data-cal-date="{date}"] .team-check').count()==1
 print('Three participant calendars, wolf/gorilla emojis and full-group match passed',flush=True)
 pa.screenshot(path=str(out/'calendar-group-mobile.png'),full_page=True)
 # One participant changes their plan; all-group matching must disappear everywhere.
 pb.locator(f'[data-cal-date="{date}"]').click()
 for page in [pa,pc]:page.wait_for_function('(date)=>!document.querySelector(`[data-cal-date="${date}"]`).classList.contains("whole-team")',arg=date,timeout=30000)
 assert '🐺' not in pa.locator(f'[data-cal-date="{date}"] .calendar-day-emojis').inner_text()
 # An offline date is retained and delivered after reconnection.
 b.set_offline(True);pb.locator(f'[data-cal-date="{other}"]').click();b.set_offline(False)
 pa.wait_for_function('(date)=>document.querySelector(`[data-cal-date="${date}"] .calendar-day-emojis`).textContent.includes("🐺")',arg=other,timeout=45000)
 pb.reload();pb.wait_for_load_state('networkidle');pb.locator('.bottom-nav [data-page="calendar"]').click();assert 'has-training' in pb.locator(f'[data-cal-date="{other}"]').get_attribute('class')
 assert not errors,errors
 pb.wait_for_function('document.querySelector("#connection-text").textContent.includes("Соединение установлено")',timeout=45000)
 pa.locator('.bottom-nav [data-page="room"]').click();pa.locator('[data-action="react"][data-emoji="🦍"]').click(click_count=3,delay=90)
 for page in [pa,pb,pc]:page.wait_for_function('document.querySelectorAll(".emoji-rain").length>=10',timeout=7000)
 pa.wait_for_timeout(4400)
 # A combo can also be assembled by three different participants.
 for page in [pb,pc]:page.locator('.bottom-nav [data-page="room"]').click()
 for page in [pa,pb,pc]:page.locator('[data-action="react"][data-emoji="🐺"]').click()
 for page in [pa,pb,pc]:
  page.wait_for_function('document.querySelectorAll(".emoji-rain").length>=10',timeout=7000)
  assert page.locator('.emoji-rain').first.inner_text()=='🐺'
 print(json.dumps({'calendarP2P':'passed','members':3,'fullGroupMatch':True,'removedMark':True,'offline':True,'errors':errors}),flush=True)
 for context in contexts:context.close()
 browser.close()
