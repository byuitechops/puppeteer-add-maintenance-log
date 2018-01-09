//to set env vars use the pattern "set VARNAME=VALUE" in cmd before you run "node main.js" 
//then clear so its not there
//set PASS=password in the cmd 
//set NAME=username in the cmd 

/*eslint no-console:0, no-unused-vars:0 */

const password = process.env.PASS;
const userName = process.env.NAME;

const puppeteer = require('puppeteer');
const fs = require('fs');
const domain = 'byui';
const login = `https://${domain}.brightspace.com/d2l/login?noredirect=true`;



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

function findElementWithTextParentId(selector, text) {
    return new Promise(function(f, r) {
        try {
            var elements = Array.from(document.querySelectorAll(selector)),
                element = elements.find((e) => e.innerText === text);

            console.log('elements:', elements);
            console.log('element:', element);

            if (typeof element === 'undefined') {
                throw new Error('did not find an element with the selector: ' + selector);
            }
            //climb the tree until you find an id
            while (element.id === '') {
                element = element.parentElement;
            }

            f(element.id);
        } catch (error) {
            r(error);
        }
    });
}




function clickElementWithText(page, selector, text) {
    return new Promise(async function(f, r) {
        try {
            var id = await page.evaluate(findElementWithTextParentId, selector, text);

            await page.click(`#${id}`);
            f();
        } catch (error) {
            r(error);
        }

    });
}

function logIn(page) {
    return new Promise(async function(fullfil, reject) {
        try {

            await page.goto(login);
            await page.type('#userName', userName);
            await page.type('#password', password);
            await page.click('[primary=primary]');
            await waitURL(page, 'home');

            fullfil();
        } catch (error) {
            reject(error);
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
            var beforeLoadId = await page.evaluate(findElementWithTextParentId, 'span', 'Existing Activities');
            var afterLoadId = '';
            //loop every 100 milliseconds until the page changed the id - really dumb - have to do this because it some how loses focus and then can't keep going
            while (beforeLoadId === afterLoadId || afterLoadId === '') {
                afterLoadId = await page.evaluate(findElementWithTextParentId, 'span', 'Existing Activities');
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


function setUpCourse(page) {
    var moduleName = 'log';
    var course = {
        id: 10011,
        code: 'FDAMF 101'
    }; 

    return new Promise(async function(fullfil, reject) {
        try {

            await page.goto(`https://byui.brightspace.com/d2l/le/content/${course.id}/Home`);
            //click the correct module
            await clickElementWithText(page, '[id^="TreeItem"] div:first-child', moduleName);

            //wait for load and then click the add Items Button
            var addItemsButtonId = await getAddItemsId(page);
            await page.click(`#${addItemsButtonId}`);

            //click on the External learning Tools item
            await clickElementWithText(page, 'span', 'External Learning Tools');


            //wait for the popup 
            var count = 0;
            var metMaxCount = false;
            do {
                var popUpFrame = getPopUp(page);
                count += 1;
                metMaxCount = count < 10;
                await page.waitFor(300);
            } while (typeof popUpFrame === 'undefined' && metMaxCount);

            //throw if we ran out of tries
            if (metMaxCount) {
                throw new Error(`Could not find the popup after many tries for course ${course.id}`);
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
                    console.log('cant click yet');
                    console.error(error);
                    count += 1;
                    if (count > 10) {
                        throw new Error(`Tried ten times to click the .d2l-quicklinkselector-add button button for course ${course.id}`);
                    }
                }
            } while (!worked && count < 10);


            //get the tile field
            var title = await popUpFrame.$('#itemData\\$title');
            await title.type('Course Maintenance Log');


            //fill in the url
            var url = await popUpFrame.$('#itemData\\$url');
            await url.type(`https://web.byui.edu/iLearn/LTI/TDReporting/Home/TDReport/?course=${course.code}`);


            // click it
            var doneButton = await popUpFrame.$('button[primary=primary]');
            await doneButton.click();



            fullfil();
        } catch (error) {
            reject(error);
        }
    });
}



(async() => {
    try {

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

        //go to course
        await setUpCourse(page);


    } catch (e) {
        console.error(e);
    }
    //await browser.close();
})();