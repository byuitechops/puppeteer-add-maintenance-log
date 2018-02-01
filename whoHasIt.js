/*eslint no-console:0, no-unused-vars:2 */


//Settings
const isBYUI = true;
const filePart = 'JuliesOuList';


//Constants 
const subDomain = isBYUI ? 'byui' : 'pathway';
const password = process.env.PASS || '';
const userName = process.env.NAME || 'Set your user name as an environment variable';
const filenameIn = filePart + '.csv';

const filenameOut = `whoHasIt_report_${filePart}_${Date.now()}.csv`;
const loginURL = `https://${subDomain}.brightspace.com/d2l/login?noredirect=true`;



//Libraries
const puppeteer = require('puppeteer');
const chalk = require('chalk');

//The folling function was found here https://github.com/GoogleChrome/puppeteer/issues/537#issuecomment-334918553 on 2/1/2018
async function xpath(page, path) {
    const resultsHandle = await page.evaluateHandle(path => {
        let results = [];
        let query = document.evaluate(path, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        for (let i = 0, length = query.snapshotLength; i < length; ++i) {
            results.push(query.snapshotItem(i));
        }
        return results;
    }, path);
    const properties = await resultsHandle.getProperties();
    const result = [];
    const releasePromises = [];
    for (const property of properties.values()) {
        const element = property.asElement();
        if (element)
            result.push(element);
        else
            releasePromises.push(property.dispose());
    }
    await Promise.all(releasePromises);
    return result;
}

async function getLTIurl(page) {
    var textHAll = await xpath(page, `//*[@title='Edit Course Maintenance Log']/../..//td/label/text()`);
    var textH0 = textHAll[0];
    var textH = await page.evaluateHandle(e => e.textContent, textH0);
    var text = await textH.jsonValue();
    await textH0.dispose();
    await textH.dispose();
    return text;
}

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


async function checkIfHaveLog(page, course) {
    var logElement;

    //go to the course content view
    await page.goto(`https://${subDomain}.brightspace.com/d2l/lms/lti/manage/list.d2l?ou=${course.ou}`);

    logElement = await page.$('[title="Edit Course Maintenance Log"]');

    return logElement !== null;
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
                var itHasALog = await checkIfHaveLog(page, course);
                
                //record that this course worked
                course.worked = true;
                course.hasLog = itHasALog;
                course.ltiLink = await getLTIurl(page);
                //tell the world
                if(itHasALog){
                    console.log(chalk.green('Has log!'));
                } else {
                    console.log(chalk.yellow('Missing log'));
                }


            } catch (e) {
                //tell the world
                console.log(chalk.red('Error:', e.message));
                //record the error
                course.error = e.message;
            }
        }

        //write out the report
        await writeReport(filenameOut, courseList);

        await browser.close();

    } catch (e) {
        console.log('In outer catch.');
        console.error(e);
    }
    //await browser.close();
})();