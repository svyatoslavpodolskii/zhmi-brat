import json,sys,pathlib,time
from playwright.sync_api import sync_playwright
base=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:4186'
out=pathlib.Path('test-results')/('presence-'+str(time.time_ns()));out.mkdir(parents=True)
with sync_playwright() as p:
 b=p.chromium.launch();a=b.new_context(viewport={'width':390,'height':844});pa=a.new_page();errors=[];pa.on('pageerror',lambda e:errors.append(str(e)));pa.goto(base);pa.wait_for_load_state('networkidle');code=pa.evaluate('JSON.parse(localStorage.getItem("zhmi:state")).room')
 c=b.new_context(viewport={'width':390,'height':844});pc=c.new_page();pc.on('pageerror',lambda e:errors.append(str(e)));pc.goto(base+'#room='+code);pc.wait_for_load_state('networkidle');original=pc.evaluate('JSON.parse(localStorage.getItem("zhmi:state")).room');assert original!=code
 assert 'пригласили' in pc.locator('#dialog h2').inner_text();pc.locator('#dialog [data-action="close"]').click();assert pc.locator('[data-action="invite-back"]').is_visible();pc.screenshot(path=str(out/'invite-warning.png'));pc.locator('[data-action="invite-back"]').click();pc.keyboard.press('Escape');assert pc.locator('[data-action="invite-decline"]').is_visible();pc.locator('[data-action="invite-decline"]').click();assert not pc.locator('#dialog').is_visible();assert pc.evaluate('JSON.parse(localStorage.getItem("zhmi:state")).room')==original
 pc.goto(base+'#room='+code);pc.wait_for_load_state('networkidle');pc.locator('#join-form button.primary').click()
 for pg in [pa,pc]:
  pg.locator('.pack-welcome').wait_for(timeout=45000);pg.wait_for_timeout(550);pg.screenshot(path=str(out/('pack-a.png' if pg==pa else 'pack-b.png')));pg.locator('.pack-welcome').click()
  pg.wait_for_function('document.querySelector(".connection-compact").dataset.status==="online"')
 # Header text takes no space, details remain available on tap.
 assert pa.locator('#connection-text').bounding_box()['width']<=1
 pa.locator('[data-action="connection"]').click();assert 'На связи' in pa.locator('.connection-summary').inner_text();pa.locator('#dialog [data-action="close"]').click();pa.locator('.bottom-nav [data-page="room"]').click();assert pa.locator('[data-room-status]').get_attribute('data-status')=='online'
 # Heartbeats and a short disconnect do not repeat the full-screen intro.
 pa.wait_for_timeout(4000);assert pa.locator('.pack-welcome').count()==0
 c.set_offline(True);pa.wait_for_timeout(1200);c.set_offline(False);pc.reload();pc.wait_for_load_state('networkidle');pa.wait_for_timeout(4500);assert pa.locator('.pack-welcome').count()==0;assert pc.locator('.pack-welcome').count()==0
 assert not errors,errors
 print(json.dumps({'presence':'passed','inviteDeclineConfirmation':True,'escapeProtected':True,'welcomeBothDevices':True,'noRepeat':True,'compactHeader':True,'screenshots':str(out),'errors':errors}),flush=True);a.close();c.close();b.close()
