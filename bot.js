const fs = require('fs');
const path = require('path');
const _ = require('underscore');
const Helper = require('./helpers');
const {siteLink} = require('./config');
let browser;
let productsLinks = [];
let batchName = 'base';
let newProducts = 0;

module.exports.runBot = () => new Promise(async (resolve, reject) => {
  try {
    browser = await Helper.launchBrowser();

    // Create new Folders Based on Batch Name
    if (!fs.existsSync(batchName)) fs.mkdirSync(batchName);
    if (!fs.existsSync(`${batchName}/pics`)) fs.mkdirSync(`${batchName}/pics`);
    if (!fs.existsSync(`${batchName}/products`)) fs.mkdirSync(`${batchName}/products`);
    
    // Fetch Products Links from site
    console.log(`Fetching Products Links from site...`);
    await fetchProductsLinks();
    productsLinks = _.uniq(productsLinks);
    console.log(`No of Products found on site (after removing duplicates): ${productsLinks.length}`);
    
    // Compare Products Links with already scraped products
    if (fs.existsSync('allproducts.csv')) {
      const storedProducts = JSON.parse(`[${fs.readFileSync('allproducts.csv')}]`);
      productsLinks = productsLinks.filter(pl => !storedProducts.includes(pl));
      console.log(`No of Products found on site (after comparing with saved products): ${productsLinks.length}`);
    }

    // Scrape Products Data
    console.log(`Fetching Products Data...`);
    await scrapeProducts();

    console.log(`Scraped ${newProducts} new Products...`);
    await Helper.botSettingsSet('currentStatus', `Scraping Products Finished, Found ${newProducts} New Products`);
    await Helper.botSettingsSet('status', 'IDLE');

    await browser.close();
    resolve(true);
  } catch (error) {
    await Helper.botSettingsSet('status', 'IDLE');
    await Helper.botSettingsSet('currentStatus', `Error: ${error.message}, Scraped ${newProducts} new Products`);
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
      const statusLine = `Fetching Products Links from page ${i}/${noOfPages}`;
      console.log(statusLine);
      Helper.botSettingsSet('currentStatus', statusLine);
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
    for (let i = 0; i < productsLinks.length; i++) {
      await scrapeProduct(i);
    }

    resolve(true);
  } catch (error) {
    console.log(`scrapeProducts Error: ${error.message}`);
    reject(error);
  }
});

const scrapeProduct = (prodIdx) => new Promise(async (resolve, reject) => {
  let page;
  try {
    const statusLine = `${prodIdx + 1}/${productsLinks.length} - Fetching product details for ${productsLinks[prodIdx]}`;
    console.log(statusLine);
    Helper.botSettingsSet('currentStatus', statusLine);
    
    page = await Helper.launchPage(browser, true);
    const response = await page.goto(productsLinks[prodIdx], {timeout: 0, waitUntil: 'load'});
    
    if (response.status() == 200) {
      await page.waitForSelector('.product-info h1');
      
      const product = {url: productsLinks[prodIdx]};
      product.title = await Helper.getTxt('.product-info h1', page);
      product.releaseDate = await getCellVal('val', 'release date:', page);
      product.releaseDateUrl = await getCellVal('url', 'release date:', page);
      product.status = await getCellVal('val', 'status:', page);
      product.itemNumber = await getCellVal('val', 'item number:', page);
      product.category = await getCellVal('val', 'category:', page);
      product.categoryUrl = await getCellVal('url', 'category:', page);
      product.productType = await getCellVal('val', 'product type:', page);
      product.productTypeUrl = await getCellVal('url', 'product type:', page);
      product.seeMore = await getCellVal('val', 'see more:', page);
      product.seeMoreUrl = await getCellVal('url', 'see more:', page);
      product.exclusivity = await getCellVal('val', 'exclusivity:', page);
      product.shareUrl = await Helper.getAttr('.share-url input', 'value', page);
      product.dateScraped = new Date();
      product.pictures = await fetchPicturesUrls(page);
      
      const productFileName = `${batchName}/products/${product.itemNumber}.json`;
      fs.writeFileSync(productFileName, JSON.stringify(product));
      await writeToCsv('allproducts.csv', product.url);
  
      newProducts++;
    } else {
      console.log(`The page could not be loaded, response status: ${response.status()}`);
    }
    
    await page.close();
    resolve(true);
  } catch (error) {
    await page.close();
    console.log(`scrapeProduct [${productsLinks[prodIdx]}] Error: ${error.message}`);
    resolve(error);
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
        } else if (valLink == 'url') {
          returnVal = await props[i].$eval('a', (elm, siteLink) => siteLink + elm.getAttribute('href').trim(), siteLink)
        }
      }
    }
  
    resolve(returnVal);
  } catch (error) {
    console.log(`getCellVal [${label}] Error: ${error.message}`);
    reject(error);
  }
})

const fetchPicturesUrls = (page) => new Promise(async (resolve, reject) => {
  try {
    let pictures = [];
    const morePictures = await page.$('.image-sidebar img');
    if (morePictures) {
      await page.waitForSelector('.image-sidebar img');
      pictures = await Helper.getAttrMultiple('.image-sidebar img', 'src', page);
    } else {
      const picture = await Helper.getAttr('.image-container > img', 'src', page);
      pictures.push(picture);
    }
    pictures = pictures.map(pic => siteLink + pic);
    await downloadPictures(pictures);

    resolve(pictures.join(','));
  } catch (error) {
    console.log(`fetchPicturesUrls Error: ${error.message}`);
    reject(error);
  }
})

const downloadPictures = (pictures) => new Promise(async (resolve, reject) => {
  let page;
  try {
    page = await Helper.launchPage(browser);
    await page._client.send('Network.enable', {
      maxResourceBufferSize: 1024 * 1204 * 100,
      maxTotalBufferSize: 1024 * 1204 * 200,
    })
    for (let i = 0; i < pictures.length; i++) {
      const viewSource = await page.goto(pictures[i], {timeout: 0, waitUntil: 'load'});
      const imgPath = path.resolve(__dirname, `${batchName}/pics/${pictures[i].split('/').pop()}`);
      fs.writeFileSync(imgPath, await viewSource.buffer());
    }
    
    await page.close();
    resolve();
  } catch (error) {
    await page.close();
    console.log(`downloadPictures Error: ${error.message}`);
    reject(error);
  }
});


const writeToCsv = (fileName, data) => {
  if (!fs.existsSync(fileName)) {
    fs.writeFileSync(fileName, `"${data}"`);
  } else {
    fs.appendFileSync(fileName, `,"${data}"`);
  }
}