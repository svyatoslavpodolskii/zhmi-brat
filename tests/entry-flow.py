import json,sys
from playwright.sync_api import sync_playwright
base=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:4186'
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True);page=browser.new_page(viewport={'width':1440,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base);page.wait_for_load_state('networkidle')
 page.locator('[data-cell="F77"]').fill('76');page.keyboard.press('Tab');page.wait_for_function('document.activeElement?.dataset.cell==="G77"')
 page.keyboard.type('4');page.keyboard.press('Tab');page.wait_for_function('document.activeElement?.dataset.cell==="H77"')
 page.locator('[data-cell="H77"]').select_option('10');page.wait_for_function('document.querySelector("[data-cell=I77]").placeholder==="67,5"');assert page.locator('[data-cell="H77"]').evaluate('(e)=>e===document.activeElement')
 page.keyboard.press('Tab');page.wait_for_function('document.activeElement?.dataset.action==="log"')
 page.keyboard.press('Enter');page.wait_for_function('document.activeElement?.dataset.action==="log"&&document.activeElement.classList.contains("checked")')
 page.keyboard.press('Tab');page.wait_for_function('document.activeElement?.dataset.cell==="I77"')
 page.locator('[data-cell="I77"]').fill('70');page.keyboard.press('Tab');page.wait_for_function('document.activeElement?.dataset.cell==="J77"')
 assert page.locator('[data-cell="F77"]').input_value()=='76';assert page.locator('[data-cell="G77"]').input_value()=='4'
 assert page.locator('.warmup-panel').bounding_box()['y']<page.locator('.exercise').first.bounding_box()['y']
 assert not errors,errors
 print(json.dumps({'entryFlow':'passed','keyboardTab':True,'inputFocusPreserved':True,'roundingImmediate':True,'warmupFirst':True,'errors':errors}))
 browser.close()
