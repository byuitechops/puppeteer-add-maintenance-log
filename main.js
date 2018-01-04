const puppeteer = require('puppeteer');
const domain = 'byui';
const login = `https://${domain}.brightspace.com/d2l/login?noredirect=true`;
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(login);
  await browser.close();
})();