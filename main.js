//to set env vars use the pattern "set VARNAME=VALUE" in cmd before you run "node main.js" 
//then clear so its not there

/* in cmd */
//set PASS=password
//set NAME=username

/* in powershell */
//$env:NAME = "username"
//$env:PASS = "password"

/*eslint no-console:0, no-unused-vars:0 */

//Settings
const isBYUI = false;
const filePart = 'JuliesOuListPathway';


//Constants 
const subDomain = isBYUI ? 'byui' : 'pathway';
const password = process.env.PASS || '';
const userName = process.env.NAME || 'Set your user name as an environment variable';
const filenameIn = filePart + '.csv';
const filenameOut = `report_${filePart}_${Date.now()}.csv`;
const loginURL = `https://${subDomain}.brightspace.com/d2l/login?noredirect=true`;

//Libraries
const puppeteer = require('puppeteer');
const chalk = require('chalk');



//this function will tell the browser to wait until we get a url in the location that 
//contains the url parameter.
function waitURL(page, url) {
    return new Promise(async function(fullfil, reject) {
        try {

            await page.waitForFunction(function(url) {
                var regEx = new RegExp(url);
                return window.location.href.match(regEx);
            }, {}, url);


            fullfil();
        } catch (error) {
            reject(error);
        }
    });
}

//this logs in to the backdoor log in to D2L
async function logIn(page) {
    await page.goto(loginURL);
    await page.type('#userName', userName);
    await page.type('#password', password);
    await page.click('[primary=primary]');
    await waitURL(page, 'home');
}

//get list of courses
function getCourseList(fileName) {
    const fs = require('fs');
    const dsv = require('d3-dsv');
    return new Promise(function(f, r) {
        fs.readFile(fileName, 'utf8', function(error, file) {
            if (error) {
                r(error);
                return;
            }
            try {
                //parse the csv and send it back
                f(dsv.csvParse(file));
            } catch (e) {
                r(error);
            }
        });
    });
}

function writeReport(fileName, data) {
    const fs = require('fs');
    const dsv = require('d3-dsv');
    return new Promise(function(f, r) {
        try {
            data = dsv.csvFormat(data);
        } catch (e) {
            r(e);
        }

        fs.writeFile(fileName, data, 'utf8', function(error) {
            if (error) {
                r(error);
                return;
            }

            f(true);
        });
    });
}


//this queries the page to find an element that matches the selector parameter
//and returns the closest ancestor that has an id.
//it is meant to be ran on in the browser with page.evaluate
function findElementWithTextParentId(selector, text, message) {
    return new Promise(function(f, r) {
        try {
            var elements = Array.from(document.querySelectorAll(selector)),
                element = elements.find((e) => e.innerText === text);

            if (typeof element === 'undefined') {
                throw new Error('Did not find an element with the selector: ' + selector + ' while: ' + message);
            }
            //climb the tree until you find an id
            while (element.id === '') {
                element = element.parentElement;
            }

            //send back the id
            f(element.id);
        } catch (error) {
            r(error);
        }
    });
}


//it is meant to be ran on in the browser with page.evaluate
function getCourseCode(course) {
    return new Promise(function(f, r) {
        try {

            //get the course code from the link at the top of the page, name of the course
            var link = document.querySelector('.d2l-navigation-s-header .d2l-navigation-s-link');

            if (typeof link === 'undefined') {
                throw new Error(`Did not find the course code for course ${course.ou}`);
            }

            var code = link.getAttribute('title').match(/^[A-Z]+ +\d+\w?/);
            if (Array.isArray(code)) {
                code = code[0].replace(/\s+/, ' ');
            } else {
                throw new Error(`Could not parse the Course Code for course ${course.ou}`);
            }

            //send back the course code
            f(code);
        } catch (error) {
            r(error);
        }
    });
}

//find the id we need and then send click the element
//it is meant to be ran on in the browser with page.evaluate
//this works because puppeteer actually moves some kind of mouse and clicks the center of the thing we tell it
// that way we can usually just click on a parent and it will first click on a child.
function clickElementWithText(page, selector, text, message) {
    return new Promise(async function(f, r) {
        try {
            var id = await page.evaluate(findElementWithTextParentId, selector, text, message);

            await page.click(`#${id}`);
            //tell them we are done or had an error
            f();
        } catch (error) {
            r(error);
        }

    });
}



//Not used but nice to capture the html of the body at a given instant
function getHTML() {
    return Promise.resolve(document.querySelector('body').innerHTML);
}

function getAddItemsId(page) {
    return new Promise(async function(fullfil, reject) {
        try {
            var beforeLoadId = await page.evaluate(findElementWithTextParentId, 'span', 'Existing Activities', 'first click to Existing Activites');
            var afterLoadId = '';
            //loop every 100 milliseconds until the page changed the id - really dumb - have to do this because it some how loses focus and then can't keep going
            while (beforeLoadId === afterLoadId || afterLoadId === '') {
                afterLoadId = await page.evaluate(findElementWithTextParentId, 'span', 'Existing Activities', 'clinking Existing Activities in loop');
                await page.waitFor(100);
            }

            fullfil(afterLoadId);
        } catch (error) {
            reject(error);
        }

    });
}


function getPopUp(page) {
    return page.mainFrame().childFrames()[0];
}



//this function actually adds the log
async function makeLog(page, course) {
    //then click the add Items Button
    await page.click(`[title="Add activities to Instructor Resources"]`);

    //click on the External learning Tools item
    await clickElementWithText(page, 'span', 'External Learning Tools', 'clicking Ext Learning Tools Dropdown');


    //wait for the popup 
    var count = 0;
    var metMaxCount = false;
    do {
        var popUpFrame = getPopUp(page);
        count += 1;
        metMaxCount = count > 10;
        await page.waitFor(300);
    } while (typeof popUpFrame === 'undefined' && !metMaxCount);

    //throw if we ran out of tries
    if (metMaxCount) {
        throw new Error(`Could not find the popup after many tries for course ${course.ou}`);
    }

    //make sure there is a button there
    await popUpFrame.waitForSelector('.d2l-quicklinkselector-add button');

    // this keeps clicking the button until it works up to 10 tries
    var worked = false;
    var button;
    do {
        try {
            button = await popUpFrame.$('.d2l-quicklinkselector-add button');
            //seems to work but worried that ^^^ will use all the tries
            await button.click();
            //wait for the slide over to new form by waiting till there is only one button to click
            await popUpFrame.waitForFunction('document.querySelectorAll(\'button[primary=primary]\').length === 1', {
                timeout: 500
            });
            worked = true;
        } catch (error) {
            // console.log('cant click yet');
            // console.error(error);
            count += 1;
            if (count > 10) {
                throw new Error(`Tried ten times to click the .d2l-quicklinkselector-add button button for course ${course.ou}`);
            }
        }
    } while (!worked && count < 10);


    //get the tile field
    var title = await popUpFrame.$('#itemData\\$title');
    await title.type('Course Maintenance Log');


    //fill in the url
    var url = await popUpFrame.$('#itemData\\$url');
    var ltiUrl = `https://web.byui.edu/iLearn/LTI/TDReporting/Home/TDReport/?course=${course.code}` + isBYUI ? '' : ' Pathway';
    await url.type(ltiUrl);


    // click it
    var doneButton = await popUpFrame.$('button[primary=primary]');
    await doneButton.click();

    //check that it worked
    await page.waitForSelector('.d2l-flash-message-text[data-message-text="Topics saved successfully"]');
}


async function setUpCourse(page, course) {
    var moduleName = 'Instructor Resources',
        currentLogId = null;

    //go to the course content view
    await page.goto(`https://${subDomain}.brightspace.com/d2l/le/content/${course.ou}/Home`);

    //wait for the link on the top of the page
    // await page.waitForSelector('.d2l-navigation-s-header .d2l-navigation-s-link');

    //get the course code
    course.code = await page.evaluate(getCourseCode, course);


    //click the correct module and wait for page to change
    const [response] = await Promise.all([
        page.waitForSelector(`[title="Add activities to ${moduleName}"]`),
        clickElementWithText(page, '[id^="TreeItem"] div:first-child', moduleName, 'clicking module button')
    ]);

    //wait for load after click to module
    // var addItemsButtonId = await getAddItemsId(page);

    //add the log
    await makeLog(page, course);

    //pass that back it worked
    return true;
}

(async () => {
    try {

        //get the course list
        var courseList = await getCourseList(filenameIn),
            courseListOut = [],
            course, i;

        const browser = await puppeteer.launch({
            headless: false
        });
        const page = await browser.newPage();
        await page.setViewport({
            width: 1800,
            height: 900
        });

        //go log
        await logIn(page);

        console.log(page.url());

        //do all the courses
        for (i = 0; i < courseList.length; ++i) {
            course = courseList[i];
            try {
                console.log('Starting:', course.name, 'id:', course.ou, 'count:', i, 'percent:', ((i + 1) / courseList.length * 100).toFixed(2) + '%');
                //set up the course
                var itWorked = await setUpCourse(page, course);

                //tell the world
                console.log(chalk.green('worked!'));

                //record that this course wroked
                course.worked = true;

            } catch (e) {
                //tell the world
                console.log(chalk.red('Error:', e.message));
                //record the error
                course.error = e.message;
            }
        }


        console.log('courseList:', courseList);

        //write out the report
        await writeReport(filenameOut, courseList);


        await browser.close();

    } catch (e) {
        console.log('In outer catch.');
        console.error(e);
    }
    //await browser.close();
})();
