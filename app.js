const express = require('express');
const app = express();
const fs = require('fs');
const {port, botName} = require('./config');
const {botSettingsSet, botSettingsGet} = require('./helpers');
const {runBot} = require('./bot')
const {updateProducts} = require('./update')
const {scrapeCategories} = require('./categories')

app.get('/', (req, res) => {
    res.status(200).json({botName});
});

app.get('/first-run', async (req, res) => {
    await botSettingsSet('status', 'RUNNING');
    runBot();
    return res.status(200).send('Scraping Products Started');
});

app.get('/update/:batchName', async (req, res) => {
    await botSettingsSet('status', 'RUNNING');
    updateProducts(req.params.batchName);
    return res.status(200).send('Updating Products Started');
});

app.get('/categories/:batchName', async (req, res) => {
    await botSettingsSet('status', 'RUNNING');
    scrapeCategories(req.params.batchName);
    return res.status(200).send('Scrape Categories Started');
});

app.get('/status', async (req, res) => {
    let botSettings = {};
    if (fs.existsSync('botSettings.json')) botSettings = JSON.parse(fs.readFileSync('botSettings.json', 'utf8'))
    res.status(200).json(botSettings);
});

app.listen(port, () => {
    console.log(`${botName} Bot is running on port: ${port}`);
})