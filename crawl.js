const playwright = require('playwright');

async function crawl(url) {
    const browser = await playwright.chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    const response = await page.goto(url);

    let metaDescription, metaKeywords;

    try {
        metaDescription = await page.$eval('meta[name="description"]', meta => meta.content);
    } catch {
        metaDescription = null;
    }

    try {
        metaKeywords = await page.$eval('meta[name="keywords"]', meta => meta.content);
    } catch {
        metaKeywords = null;
    }

    const data = {
        url: url,
        statusCode: response.status(),
        pageTitle: await page.title(),
        metaDescription: metaDescription,
        metaKeywords: metaKeywords,
        numberOfLinks: (await page.$$('a')).length,
        assets: {
            imagesCount: (await page.$$('img')).length,
            videosCount: (await page.$$('video')).length,
            stylesheetsCount: (await page.$$('link[rel="stylesheet"]')).length,
            scriptsCount: (await page.$$('script')).length
        }
    };

    await browser.close();
    return data;
}

async function main() {
    const urls = [
        'https://microsoft.com'
    ];

    const results = [];

    for (const url of urls) {
        const data = await crawl(url);
        results.push(data);
    }

    console.log(results);
}

main();
