const fs = require('fs');
const _ = require('underscore');
const Helper = require('./helpers');
const {siteLink} = require('./config');
let browser;
let productsLinks = [];

module.exports.runBot = () => new Promise(async (resolve, reject) => {
  try {
    browser = await Helper.launchBrowser();

    // Fetch Products Links from site
    await fetchProductsLinks();
    console.log(`No of Products found on site: ${productsLinks.length}`);
    productsLinks = _.uniq(productsLinks);
    console.log(`No of Products found on site (after removing duplicates): ${productsLinks.length}`);
    fs.writeFileSync('productsLinks.json', JSON.stringify(productsLinks));

    await browser.close();
    resolve(true);
  } catch (error) {
    console.log(`runBot Error: ${error.message}`);
    reject(error);
  }
})

const fetchProductsLinks = () => new Promise(async (resolve, reject) => {
  try {
    const page = await Helper.launchPage(browser, true);
    await page.goto(`${siteLink}/products?limit=192`, {timeout: 0, waitUntil: 'load'});
    await page.waitForSelector('.pagination > button:nth-last-child(2)');
    const noOfPages = parseInt(await Helper.getTxt('.pagination > button:nth-last-child(2)', page));
    console.log(`No of Pages found on site: ${noOfPages}`);

    for (let i = 1; i <= noOfPages; i++) {
      console.log(`Fetching Products Links from page ${i}/${noOfPages}`);
      if (i > 1) {
        await page.goto(`${siteLink}/products?limit=192&page=${i}`, {timeout: 0, waitUntil: 'load'});
      }
      await page.waitForSelector('.products > .catalog-product a.item-figure-container');
      let pageLinks = await Helper.getAttrMultiple('.products > .catalog-product a.item-figure-container', 'href', page);
      pageLinks = pageLinks.map(pl => siteLink + pl);
      productsLinks.push(...pageLinks);
      console.log(productsLinks.length);
    }
    
    await page.close();
    resolve();
  } catch (error) {
    console.log(`fetchProductsLinks Error: ${error.message}`);
    reject(error);
  }
})

this.runBot();