const express = require('express');
const playwright = require('playwright');
const multer = require('multer');
const fs = require('fs');


const app = express();
const PORT = 3000;
const upload = multer({ dest: 'uploads/' }); // setting the directory for the uploaded files

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.render('index', { result: null });
});

app.post('/run-test', upload.single('csv'), async (req, res) => {
    const url = req.body.url;
    const file = req.file;

    function isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }    

    if (file) {
        // handle CSV file upload, parse and execute tests for each URL
        const csvContent = fs.readFileSync(file.path, 'utf-8');
        const urls = csvContent.split('\n').map(u => u.trim()).filter(u => u);  // Trim and filter out empty lines
    
        let results = [];
        for (let u of urls) {
            if (isValidUrl(u)) {  // Check if it's a valid URL
                results.push(`Results for ${u}:\n${await runPlaywrightTest(u)}`);
            } else {
                results.push(`Skipped invalid URL: ${u}`);
            }
        }
        return res.render('index', { result: results.join('\n\n') });  // Separate results for different URLs by two newlines
    } else if (url) {
        // handle single URL input
        const result = await runPlaywrightTest(url);
        res.render('index', { result });
    } else {
        res.render('index', { result: 'Please provide a URL or upload a CSV file.' });
    }
});

const runPlaywrightTest = async (url) => {

    try {
    const browser = await playwright.chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    // 1. Measure Page Load Time
    const startLoadTime = new Date();
    await page.goto(url);  // Make sure to use the provided URL here!
    const endLoadTime = new Date();
    const loadTime = endLoadTime - startLoadTime;

    // 2. Check Image URLs and their status codes
    const imageUrls = await page.$$eval('img', images => images.map(img => img.src));

    const imageStatuses = [];
    for (const imageUrl of imageUrls) {
        const response = await page.goto(imageUrl);
        if (response) {
            imageStatuses.push({
                imageUrl: imageUrl,
                statusCode: response.status(),
            });
        } else {
            imageStatuses.push({
                imageUrl: imageUrl,
                statusCode: "Error: No Response",
            });
        }
        await page.goBack();  // Return to the main page
    }
    

    // 3. Check for Broken Links
    const links = await page.$$eval('a', anchors => anchors.map(a => a.href));
const brokenLinks = [];
for (const link of links) {
    const response = await page.goto(link);
    if (response) {
        if (response.status() >= 400) {
            brokenLinks.push({
                link,
                statusCode: response.status(),
            });
        }
    } else {
        brokenLinks.push({
            link,
            statusCode: "Error: No Response",
        });
    }
    await page.goBack();  // Return to the main page
}

    // 4. Count All Elements on the Page
    const allElementsCount = await page.$$eval('*', elements => elements.length);

    // Pull elementsWithAttributes 
    const elementsWithAttributes = await page.evaluate(() => {
        return [...document.querySelectorAll('*')].map(el => {
            let attributes = {};
            for (let attr of el.attributes) {
                attributes[attr.name] = attr.value;
            }
            return {
                tagName: el.tagName,
                attributes: attributes
            };
        });
    });
    

    // Organize Data into JSON
    const resultJson = {
        loadTime: `${loadTime} ms`,
        allElementsCount: allElementsCount,
        elementsWithAttributes: elementsWithAttributes,
        imageStatuses: imageStatuses,
        brokenLinks: brokenLinks
    };

    await browser.close();
    console.log(resultJson);
    return JSON.stringify(resultJson, null, 2);
} catch (error) {
    console.error("An error occurred during the Playwright test:", error);
    return `Error: ${error.message}`; // You can return the error message to be displayed in the UI
}
};


app.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
});
