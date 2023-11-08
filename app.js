const express = require('express');
const playwright = require('playwright');
const multer = require('multer');
const fs = require('fs');


const app = express();
const PORT = process.env.PORT || 8080;
const upload = multer({ dest: 'uploads/' }); // setting the directory for the uploaded files
const logdir = multer({ dest: 'applogs/' }); // setting the directory for the uploaded files


app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.render('index', { result: null });
});

app.post('/run-test', upload.single('csv'), async (req, res) => {
    const url = req.body.url;
    const file = req.file;


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


function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}    

function extractActivityNames(input) {
    const regex = /"activity\.name":"(.*?)"/g;
    let match;
    const results = [];

    while ((match = regex.exec(input)) !== null) {
        results.push(match[1]);
    }

    return results;
}


// Function to save data to a file
function saveToFileSync(filename, data) {
    try {
        fs.writeFileSync(filename, data);
        console.log(`Data was saved to ${filename}`);
    } catch (err) {
        console.error('An error occurred while writing to the file:', err);
    }
}


const runPlaywrightTest = async (initialUrl) => {

    try {
    const browser = await playwright.chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    // 1. Measure Page Load Time
    const startLoadTime = new Date();


    console.log("URL before calling goto:", initialUrl);
    if (!initialUrl) {
        console.error("URL is empty or not defined!");
        return;
    }
    await page.goto(initialUrl);
    const finalUrl = page.url();
    console.log("URL after calling goto:", finalUrl);

    //await page.goto(initialUrl, { waitUntil: 'domcontentloaded' });
    //await page.goto(url);  // Make sure to use the provided URL here!
    //await page.waitForSelector('script, link', { visible: false});

    const endLoadTime = new Date();
    const loadTime = endLoadTime - startLoadTime;

    // Extract activity names
    const pageContent = await page.content();
    console.log(pageContent);
    const activityNames = extractActivityNames(pageContent);
    saveToFileSync('activityNames.txt', activityNames);

    // 2. Check Image URLs and their status codes
    console.log("Check Image URLs and their status codes");

    const imageUrls = await page.$$eval('img', images => images.map(img => img.src));

    const imageStatuses = [];
    for (const imageUrl of imageUrls) {
        // Skip empty image URLs
        if (!imageUrl) {
            continue; // Skip this iteration and move to the next URL
        }
    
        if (isValidUrl(imageUrl)) {
            try {
                // "page.goto" should be replaced with a fetch request, as explained earlier.
                const response = await page.goto(imageUrl, { waitUntil: 'load' });
                imageStatuses.push({
                    imageUrl: imageUrl,
                    statusCode: response.status(),
                });
            } catch (error) {
                imageStatuses.push({
                    imageUrl: imageUrl,
                    statusCode: "Error: " + error.message,
                });
            }
        } else {
            imageStatuses.push({
                imageUrl: imageUrl,
                statusCode: "Error: Invalid URL"
            });
        }
    }
    
    

    // 3. Check for Broken Links
    console.log("Check for Broken Links");

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
    console.log("Counting All Elements on the Page");

    const allElementsCount = await page.$$eval('*', elements => elements.length);

    // Pull elementsWithAttributes 
    console.log("Pull elementsWithAttributes");

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
    console.log(elementsWithAttributes);

    console.log("Organize Data into JSON");

    // Organize Data into JSON
    const resultJson = {
        loadTime: `${loadTime} ms`,
        allElementsCount: allElementsCount,
        imageStatuses: imageStatuses,
        brokenLinks: brokenLinks,
        activityNames: activityNames,
        elementsWithAttributes: elementsWithAttributes

    };
    console.log("Closing Browser");

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
