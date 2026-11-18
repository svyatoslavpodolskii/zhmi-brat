import sys
from playwright.sync_api import sync_playwright

base = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4186'
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 320, 'height': 700})
    # Keep the real loading screen visible without delaying real visitors.
    page.route('**/app.js', lambda route: route.fulfill(body='', content_type='text/javascript'))
    page.goto(base)
    line = page.locator('[data-loading-line]')
    first = line.inner_text()
    page.wait_for_function('(old) => document.querySelector("[data-loading-line]").textContent !== old', arg=first)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.reload()
    assert line.inner_text() != first
    print('Loading quotes rotate, vary between visits, and fit a 320px phone')
    browser.close()
