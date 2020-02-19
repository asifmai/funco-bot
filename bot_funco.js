const fs = require('fs');
const _ = require('underscore');
const pLimit = require('p-limit');
const Helper = require('./helpers');
const {siteLink} = require('./config');
let browser;
let productsLinks = [];
productsLinks = JSON.parse(fs.readFileSync('productsLinks.json', 'utf8'));

module.exports.runBot = () => new Promise(async (resolve, reject) => {
  try {
    browser = await Helper.launchBrowser();

    // Fetch Products Links from site
    // console.log(`Fetching Products Links from site...`);
    // await fetchProductsLinks();
    // console.log(`No of Products found on site: ${productsLinks.length}`);
    // productsLinks = _.uniq(productsLinks);
    // console.log(`No of Products found on site (after removing duplicates): ${productsLinks.length}`);
    // fs.writeFileSync('productsLinks.json', JSON.stringify(productsLinks));

    // Scrape Products Data
    console.log(`Fetching Products Data...`);
    await scrapeProducts();

    await browser.close();
    resolve(true);
  } catch (error) {
    await browser.close();
    console.log(`runBot Error: ${error.message}`);
    reject(error);
  }
})

const fetchProductsLinks = () => new Promise(async (resolve, reject) => {
  let page;
  try {
    page = await Helper.launchPage(browser, true);
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
    }
    
    await page.close();
    resolve();
  } catch (error) {
    await page.close();
    console.log(`fetchProductsLinks Error: ${error.message}`);
    reject(error);
  }
})

const scrapeProducts = () => new Promise(async (resolve, reject) => {
  try {
    const promises = [];
    const limit = pLimit(1);

    for (let i = 0; i < productsLinks.length; i++) {
      promises.push(limit(() => scrapeProduct(i)));
    }

    await Promise.all(promises);

    resolve(true);
  } catch (error) {
    console.log(`scrapeProducts Error: ${error.message}`);
    reject(error);
  }
});

const scrapeProduct = (prodIdx) => new Promise(async (resolve, reject) => {
  let page;
  try {
    console.log(`${prodIdx + 1}/${productsLinks.length} - Fetching product details for ${productsLinks[prodIdx]}`);
    
    page = await Helper.launchPage(browser, true);
    await page.goto(productsLinks[prodIdx], {timeout: 0, waitUntil: 'load'});
    await page.waitForSelector('.product-info h1');
    
    const product = {url: productsLinks[prodIdx]};
    product.title = await Helper.getTxt('.product-info h1', page);
    product.releaseDate = await getCellVal('val', 'release date:', page);
    product.status = await getCellVal('val', 'status:', page);
    product.itemNumber = await getCellVal('val', 'item number:', page);
    product.category = await getCellVal('val', 'category:', page);
    product.productType = await getCellVal('val', 'product type:', page);
    product.seeMore = await getCellVal('val', 'see more:', page);
    product.exclusivity = await getCellVal('val', 'exclusivity:', page);
    product.dateScraped = new Date();

    console.log(product);
    await page.close();
    resolve(true);
  } catch (error) {
    await page.close();
    console.log(`scrapeProduct [${productsLinks[prodIdx]}] Error: ${error.message}`);
    reject(error);
  }
})

const getCellVal = (valLink, label, page) => new Promise(async (resolve, reject) => {  
  try {
    let returnVal = '';
    await page.waitForSelector('.product-details');
    const props = await page.$$('.product-details > div');
    for (let i = 0; i < props.length; i++) {
      const propLabel = await props[i].$eval('strong', elm => elm.innerText.trim().toLowerCase());
      if (propLabel == label.toLowerCase()) {
        if (valLink == 'val') {
          let propVal = await page.evaluate(p => p.innerText.trim(), props[i]);
          returnVal = propVal.replace(/^.*\:/gi, '').trim();
        }
      }
    }
  
    resolve(returnVal);
  } catch (error) {
    console.log(`getCellVal [${label}] Error: ${error.message}`);
    reject(error);
  }
})

this.runBot();