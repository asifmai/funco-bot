const fs = require('fs');
const _ = require('underscore');
const rimraf = require('rimraf');
const path = require('path');
const pLimit = require('p-limit');
const download = require('image-downloader');
const {zip} = require('zip-a-folder');
const Helper = require('./helpers');
const {siteLink} = require('./config');
let browser;
let productsLinks = [];
let products = [];

module.exports.runBot = () => new Promise(async (resolve, reject) => {
  try {
    browser = await Helper.launchBrowser();
    if (!fs.existsSync('pics')) fs.mkdirSync('pics');
    if (fs.existsSync('products.json')) products = JSON.parse(fs.readFileSync('products.json', 'utf8'));

    // Fetch Products Links from site
    console.log(`Fetching Products Links from site...`);
    await fetchProductsLinks();
    console.log(`No of Products found on site: ${productsLinks.length}`);
    productsLinks = _.uniq(productsLinks);
    console.log(`No of Products found on site (after removing duplicates): ${productsLinks.length}`);
    fs.writeFileSync('productsLinks.json', JSON.stringify(productsLinks));

    // Scrape Products Data
    console.log(`Fetching Products Data...`);
    await scrapeProducts();

    fs.writeFileSync('products.json', JSON.stringify(products));

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
    const limit = pLimit(20);

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
    product.pictures = await fetchPicturesUrls(page);
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

    writeToCsv('products.csv', product);
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
    // await downloadPictures(pictures);

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
      const imgPath = path.resolve(__dirname, `pics/${pictures[i].split('/').pop()}`);
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
    const csvHeader = '"Picture URL","Title","Release Date","Release Date URL","Status","Item Number","Category","Category URL","Product Type","Product Type URL","See More","See More URL","Exclusivity","Share URL","Date Scraped"\n';
    fs.writeFileSync(fileName, csvHeader);
  }
  const csvLine = `"${data.pictures}","${data.title}","${data.releaseDate}","${data.releaseDateUrl}","${data.status}","${data.itemNumber}","${data.category}","${data.categoryUrl}","${data.productType}","${data.productTypeUrl}","${data.seeMore}","${data.seeMoreUrl}","${data.exclusivity}","${data.shareUrl}","${data.dateScraped}"\n`;
  fs.appendFileSync(fileName, csvLine);
}

this.runBot();