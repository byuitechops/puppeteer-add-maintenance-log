//to set env vars use the pattern "set VARNAME=VALUE" in cmd before you run "node main.js" 
//then clear so its not there
//set PASS=password in the cmd 
//set NAME=username in the cmd 

const password = process.env.PASS;
const userName = process.env.NAME;

const puppeteer = require('puppeteer');
const fs = require('fs');
const domain = 'byui';
const login = `https://${domain}.brightspace.com/d2l/login?noredirect=true`;



function waitURL(page, url) {
  return new Promise(async function (fullfil, reject) {
    try {

      await page.waitForFunction(function (url) {
        var regEx = new RegExp(url);
        return window.location.href.match(regEx);
      }, {}, url);


      fullfil();
    } catch (error) {
      reject(error);
    }
  });
}

function waitPageTitle(page, title) {
  return new Promise(async function (fullfil, reject) {
    try {

      await page.waitForFunction(function (title) {
        var regEx = new RegExp(title);
        // return document.querySelector('title').innerText.match(regEx);
        return false;
      }, {}, title);


      fullfil();
    } catch (error) {
      reject(error);
    }
  });
}

function click(selector) {
  return new Promise(function (fullfil, reject) {
    console.log("in click|" + selector);
    try {

      var event = new MouseEvent('click');
      var ele = document.querySelector(selector)
      ele.dispatchEvent(event);
      fullfil();
    } catch (error) {
      reject(error);
    }
  })
}

function clickIt(ele) {
  var event = new MouseEvent('click');
  ele.dispatchEvent(event);
}

function findElementWithTextParentId(selector, text) {
  return new Promise(function (f, r) {
    try {
      var elements = Array.from(document.querySelectorAll(selector)),
        element = elements.find((e) => e.innerText === text)

      console.log("elements:", elements);
      console.log("element:", element);

      if (typeof element === 'undefined') {
        throw new Error('did not find an element with the selector: ' + selector);
      }
      //climb the tree until you find an id
      while (element.id === '') {
        element = element.parentElement
      }

      f(element.id);
    } catch (error) {
      r(error);
    }
  })
}




function clickElementWithText(page, selector, text) {
  return new Promise(async function (f, r) {
    try {
      var id = await page.evaluate(findElementWithTextParentId, selector, text);

      await page.click(`#${id}`);
      f()
    } catch (error) {
      r(error)
    }

  })
}

function clickElementWithTextFrame(page, selector, text) {
  return new Promise(async function (f, r) {
    try {
      var id = await page.evaluate(findElementWithTextParentId, selector, text);
      await page.click(`#${id}`);
      f()
    } catch (error) {
      r(error)
    }

  })
}

function logIn(page) {
  return new Promise(async function (fullfil, reject) {
    try {

      await page.goto(login);
      await page.type('#userName', userName)
      await page.type('#password', password)
      await page.click('[primary=primary]');
      await waitURL(page, 'home');

      fullfil();
    } catch (error) {
      reject(error);
    }
  });
}

function findModuleId(moduleTile) {
  return Promise.resolve(Array.from(document.querySelectorAll(`[id^="TreeItem"] div:first-child`)).find((e) => e.innerText === moduleTile).parentElement.id);
}


function getHTML() {
  return Promise.resolve(document.querySelector('body').innerHTML);
}

function getAddItemsId(page) {
  return new Promise(async function (fullfil, reject) {
    try {
      var beforeLoadId = await page.evaluate(findElementWithTextParentId, 'span', 'Existing Activities');
      var afterLoadId = "";
      //loop every 100 milliseconds until the page changed the id - really dumb - have to do this because it some how loses focus and then can't keep going
      while (beforeLoadId === afterLoadId || afterLoadId === '') {
        afterLoadId = await page.evaluate(findElementWithTextParentId, 'span', 'Existing Activities');
        await page.waitFor(100);
      }


      fullfil(afterLoadId);
    } catch (error) {
      reject(error)
    }

  })
}

function getAddLTIsButtonId(popUp) {

  return new Promise(async function (fullfil, reject) {
    try {
      var selector = 'button',
        text = 'Create New LTI Link';
      console.log('hi');
      var beforeLoadId = await popUp.evaluate(findElementWithTextParentId, selector, text);
      var afterLoadId = "";
      console.log(beforeLoadId);
      //loop every 100 milliseconds until the page changed the id - really dumb - have to do this because it some how loses focus and then can't keep going
      while (beforeLoadId === afterLoadId || afterLoadId === '') {
        afterLoadId = await popUp.evaluate(findElementWithTextParentId, selector, text);
        await popUp.waitFor(100);
      }
      console.log(afterLoadId);


      fullfil(afterLoadId);
    } catch (error) {
      reject(error)
    }

  })
}

function buttonLoaded() {

  var frame = document.querySelector('iframe');
  //iframe might not be up
  if (!frame) {
    return false;
  }
  var button = frame.contentDocument.querySelector('.d2l-quicklinkselector-add button');
  console.log(frame);
  console.log(button);
  return button !== null;

}

function getPopUp(page) {
  return page.mainFrame().childFrames()[0];
}

function getId(frame, selector) {
  return new Promise(async function (f, r) {
    try {

      await frame.waitForSelector(selector);
      var button = await frame.$(selector);
      var property = await button.getProperty('id')
      var val = await property.jsonValue();
      f(val);
    } catch (error) {
      r(error)
    }

  });

}


function setUpCourse(page) {
  var moduleName = 'log';
  return new Promise(async function (fullfil, reject) {
    try {

      await page.goto('https://byui.brightspace.com/d2l/le/content/10011/Home');
      //click the correct module
      await clickElementWithText(page, '[id^="TreeItem"] div:first-child', moduleName)

      //wait for load and then click the add Items Button
      var addItemsButtonId = await getAddItemsId(page);
      await page.click(`#${addItemsButtonId}`);

      //click on the External learning Tools item
      await clickElementWithText(page, 'span', 'External Learning Tools')


      //wait for the popup 
      var count = 0;
      do {
        var popUpFrame = getPopUp(page);
        await page.waitFor(300);
      } while (typeof popUpFrame === 'undefined' || count)

      //make sure there is a button there
      
      await popUpFrame.waitForSelector('.d2l-quicklinkselector-add button')
      
      var worked = false;
      var button;
      do{
       
        try {
          button = await popUpFrame.$('.d2l-quicklinkselector-add button');
          //seems to work but worried that ^^^ will use all the tries
          await button.click();
          await popUpFrame.waitForFunction(`document.querySelectorAll('button[primary=primary]').length === 1`, {timeout : 500});
          worked = true;
        } catch (error) {
          console.log('cant click yet');
          console.error(error);
          count += 1;
          if(count > 10){
            throw new Error('tried ten times to click the .d2l-quicklinkselector-add button button');
          }
        }
      } while(!worked && count < 10);

      console.log('clicked it');
      //wait for the slide over to new form by waiting till there is only one button to click

      //get the tile field
      var title = await popUpFrame.$('#itemData\\$title');
      await title.type('Course Maintenance Log');

      var courseCode = 'FDAMF 101';
      //fill in the url
      var url = await popUpFrame.$('#itemData\\$url');
      await url.type(`https://web.byui.edu/iLearn/LTI/TDReporting/Home/TDReport/?course=${courseCode}`);


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
    await setUpCourse(page)


  } catch (e) {
    console.error(e);
  }
  //await browser.close();
})();