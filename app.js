const express = require('express');
const app = express();
const fs = require('fs');
const {port, botName} = require('./config');
const {botSettingsSet, botSettingsGet} = require('./helpers');
const {runBot} = require('./bot')

app.get('/', (req, res) => {
    res.status(200).json({botName});
});

app.get('/update-products', async (req, res) => {
    const botStatus = await botSettingsGet('status');
    if (botStatus == 'RUNNING') {
        return res.status(200).send('Bot is already running');
    } else {
        await botSettingsSet('status', 'RUNNING');
        runBot();
        return res.status(200).send('Scraping Products Started');
    }
});

app.get('/status', async (req, res) => {
    let botSettings = {};
    if (fs.existsSync('botSettings.json')) botSettings = JSON.parse(fs.readFileSync('botSettings.json', 'utf8'))
    res.status(200).json(botSettings);
});

app.get('/scrape-categories', async (req, res) => {
    // await botSettingsSet('status', 'RUNNING');
    res.status(200).send('This function is not ready yet');
});

app.listen(port, () => {
    console.log(`Funcobot is running on port: ${port}`);
})