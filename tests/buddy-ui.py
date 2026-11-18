import json,sys
from playwright.sync_api import sync_playwright
base=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:4186'
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True);ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base);page.wait_for_load_state('networkidle');buddy=page.locator('.mobile-buddy [data-buddy]');buddy.scroll_into_view_if_needed()
 assert buddy.locator('[data-buddy-line]').inner_text()=='Ну что, по подходику?'
 assert buddy.locator('.buddy-gorilla').count()==0
 assert buddy.locator('.buddy-orbit').inner_text()=='💪'
 assert page.locator('.session-finish').bounding_box()['y']<buddy.bounding_box()['y']
 stage=buddy.locator('[data-buddy-touch]');box=stage.bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);page.mouse.down();page.wait_for_timeout(680);page.mouse.up()
 page.wait_for_function('document.querySelectorAll(".gorilla-rain").length>=12',timeout=5000)
 assert buddy.get_attribute('data-move')=='bend'
 page.wait_for_timeout(3500);page.locator('.bottom-nav [data-page="room"]').click();page.locator('[data-action="react"][data-emoji="🦍"]').click();page.wait_for_function('document.querySelectorAll(".gorilla-rain").length>=12',timeout=5000)
 # A finished rest period triggers its own shower and wakes the mascot.
 page.wait_for_timeout(3500);page.evaluate('localStorage.setItem("zhmi:timer",String(Date.now()+1700))');page.reload();page.wait_for_load_state('networkidle');page.wait_for_function('document.querySelectorAll(".gorilla-rain").length>=10',timeout=7000)
 assert page.evaluate('localStorage.getItem("zhmi:timer")') is None
 page.wait_for_function('document.querySelector(".mobile-buddy [data-buddy]").classList.contains("is-awake")',timeout=3000)
 page.locator('footer button').scroll_into_view_if_needed();gap=page.evaluate('document.documentElement.scrollHeight-(document.querySelector("footer button").getBoundingClientRect().bottom+scrollY)');assert gap<110,gap
 assert not errors,errors
 print(json.dumps({'buddy':'passed','originalQuote':True,'alwaysAnimated':True,'longPressBend':True,'gorillaShowers':['longPress','roomReaction','restFinished'],'bottomGap':gap,'errors':errors}),flush=True)
 browser.close()
